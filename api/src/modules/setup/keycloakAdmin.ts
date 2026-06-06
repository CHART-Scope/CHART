import { SetupError } from "./errors.js";
import type { SetupErrorCode } from "./types.js";

type KeycloakAdminConfig = {
  adminUrl: string;
  adminRealm: string;
  targetRealm: string;
  adminUsername: string;
  adminPassword: string;
  clientId: string;
};

type KeycloakUserInput = {
  name: string;
  email: string;
  username: string;
  password: string;
  groupPath: string;
  countryCode: string;
  countryName: string;
};

type KeycloakUser = {
  id: string;
  username?: string;
  email?: string;
};

type KeycloakGroup = {
  id: string;
  name: string;
  path?: string;
};

type KeycloakClient = {
  id: string;
  clientId: string;
};

type KeycloakRole = {
  id: string;
  name: string;
};

type TokenResponse = {
  access_token?: string;
};

export type CreatedAdminUser = {
  userId: string;
  username: string;
  email: string;
};

export async function createBootstrapAdminUser(input: KeycloakUserInput) {
  const config = readKeycloakAdminConfig();
  const token = await getAdminToken(config);
  const group = await ensureCountryGroup(token, config, input);
  const user = await upsertUser(token, config, input);

  await replaceUserGroups(token, config, user.id, group.id);
  await setPassword(token, config, user.id, input.password);
  await assignClientRoles(token, config, user.id, ["chart_admin", "content_editor"]);

  return {
    userId: user.id,
    username: input.username,
    email: input.email,
  };
}

function readKeycloakAdminConfig(): KeycloakAdminConfig {
  const adminUrl = trimTrailingSlash(
    process.env.KEYCLOAK_ADMIN_URL ??
      process.env.KEYCLOAK_SERVER_URL ??
      "http://127.0.0.1:8080",
  );
  const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";

  if (!adminUrl || !adminUsername || !adminPassword) {
    throw new SetupError("SETUP_IDENTITY_CONFIG_INVALID", 500);
  }

  return {
    adminUrl,
    adminRealm: process.env.KEYCLOAK_ADMIN_REALM ?? "master",
    targetRealm: process.env.KEYCLOAK_REALM ?? "chart",
    adminUsername,
    adminPassword,
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? "chart-api",
  };
}

async function getAdminToken(config: KeycloakAdminConfig) {
  const response = await fetchJson<TokenResponse>(
    `${config.adminUrl}/realms/${config.adminRealm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: config.adminUsername,
        password: config.adminPassword,
      }),
    },
    "SETUP_IDENTITY_ADMIN_AUTH_FAILED",
  );

  if (!response.access_token) {
    throw new SetupError("SETUP_IDENTITY_ADMIN_AUTH_FAILED", 502);
  }

  return response.access_token;
}

async function ensureCountryGroup(
  token: string,
  config: KeycloakAdminConfig,
  input: KeycloakUserInput,
) {
  const groupName = input.groupPath.split("/").filter(Boolean)[0];

  if (!groupName) {
    throw new SetupError("SETUP_COUNTRY_REQUIRED", 400);
  }

  const existingGroup = await findGroupByName(token, config, groupName);

  if (existingGroup) {
    return existingGroup;
  }

  await fetchOk(
    `${realmAdminUrl(config)}/groups`,
    {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        name: groupName,
        attributes: {
          country_code: [input.countryCode],
          country_name: [input.countryName],
          geo_level: ["country"],
        },
      }),
    },
    "SETUP_IDENTITY_GROUP_FAILED",
  );

  const createdGroup = await findGroupByName(token, config, groupName);

  if (!createdGroup) {
    throw new SetupError("SETUP_IDENTITY_GROUP_FAILED", 502);
  }

  return createdGroup;
}

async function upsertUser(
  token: string,
  config: KeycloakAdminConfig,
  input: KeycloakUserInput,
) {
  const existingUser = await findUser(token, config, input.username, input.email);

  if (existingUser) {
    await fetchOk(
      `${realmAdminUrl(config)}/users/${existingUser.id}`,
      {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify(toUserRepresentation(input)),
      },
      "SETUP_IDENTITY_USER_CREATE_FAILED",
    );

    return existingUser;
  }

  const response = await fetch(`${realmAdminUrl(config)}/users`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(toUserRepresentation(input)),
  });

  if (response.status === 409) {
    const conflictedUser = await findUser(token, config, input.username, input.email);

    if (conflictedUser) {
      return conflictedUser;
    }

    throw new SetupError("SETUP_IDENTITY_USER_CONFLICT", 409);
  }

  if (!response.ok) {
    throwIdentityResponseError(
      response.status,
      await response.text(),
      "SETUP_IDENTITY_USER_CREATE_FAILED",
    );
  }

  const createdUser = await findUser(token, config, input.username, input.email);

  if (!createdUser) {
    throw new SetupError("SETUP_IDENTITY_USER_CREATE_FAILED", 502);
  }

  return createdUser;
}

async function setPassword(
  token: string,
  config: KeycloakAdminConfig,
  userId: string,
  password: string,
) {
  await fetchOk(
    `${realmAdminUrl(config)}/users/${userId}/reset-password`,
    {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary: false,
      }),
    },
    "SETUP_IDENTITY_PASSWORD_REJECTED",
  );
}

async function replaceUserGroups(
  token: string,
  config: KeycloakAdminConfig,
  userId: string,
  groupId: string,
) {
  const groups = await fetchJson<KeycloakGroup[]>(
    `${realmAdminUrl(config)}/users/${userId}/groups`,
    { headers: authHeaders(token) },
    "SETUP_IDENTITY_GROUP_FAILED",
  );

  for (const group of groups) {
    await fetchOk(
      `${realmAdminUrl(config)}/users/${userId}/groups/${group.id}`,
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
      "SETUP_IDENTITY_GROUP_FAILED",
    );
  }

  await fetchOk(
    `${realmAdminUrl(config)}/users/${userId}/groups/${groupId}`,
    {
      method: "PUT",
      headers: authHeaders(token),
    },
    "SETUP_IDENTITY_GROUP_FAILED",
  );
}

async function assignClientRoles(
  token: string,
  config: KeycloakAdminConfig,
  userId: string,
  roleNames: string[],
) {
  const client = await getClient(token, config);
  const roles = await Promise.all(
    roleNames.map((roleName) => getClientRole(token, config, client.id, roleName)),
  );

  await fetchOk(
    `${realmAdminUrl(config)}/users/${userId}/role-mappings/clients/${client.id}`,
    {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(roles),
    },
    "SETUP_IDENTITY_ROLE_MISSING",
  );
}

async function getClient(token: string, config: KeycloakAdminConfig) {
  const clients = await fetchJson<KeycloakClient[]>(
    `${realmAdminUrl(config)}/clients?clientId=${encodeURIComponent(config.clientId)}`,
    { headers: authHeaders(token) },
    "SETUP_IDENTITY_CLIENT_MISSING",
  );
  const client = clients.find((candidate) => candidate.clientId === config.clientId);

  if (!client) {
    throw new SetupError("SETUP_IDENTITY_CLIENT_MISSING", 502);
  }

  return client;
}

async function getClientRole(
  token: string,
  config: KeycloakAdminConfig,
  clientUuid: string,
  roleName: string,
) {
  return fetchJson<KeycloakRole>(
    `${realmAdminUrl(config)}/clients/${clientUuid}/roles/${encodeURIComponent(roleName)}`,
    { headers: authHeaders(token) },
    "SETUP_IDENTITY_ROLE_MISSING",
  );
}

async function findGroupByName(
  token: string,
  config: KeycloakAdminConfig,
  name: string,
) {
  const groups = await fetchJson<KeycloakGroup[]>(
    `${realmAdminUrl(config)}/groups?search=${encodeURIComponent(name)}&briefRepresentation=false`,
    { headers: authHeaders(token) },
    "SETUP_IDENTITY_GROUP_FAILED",
  );

  return groups.find((group) => group.name === name);
}

async function findUser(
  token: string,
  config: KeycloakAdminConfig,
  username: string,
  email: string,
) {
  const users = await fetchJson<KeycloakUser[]>(
    `${realmAdminUrl(config)}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: authHeaders(token) },
    "SETUP_IDENTITY_USER_CREATE_FAILED",
  );
  const userByUsername = users.find((user) => user.username === username);

  const emailUsers = await fetchJson<KeycloakUser[]>(
    `${realmAdminUrl(config)}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers: authHeaders(token) },
    "SETUP_IDENTITY_USER_CREATE_FAILED",
  );
  const userByEmail = emailUsers.find((user) => user.email === email);

  if (userByUsername && userByEmail && userByUsername.id !== userByEmail.id) {
    throw new SetupError("SETUP_IDENTITY_USER_CONFLICT", 409);
  }

  return userByUsername ?? userByEmail;
}

function toUserRepresentation(input: KeycloakUserInput) {
  const [firstName, ...lastNameParts] = input.name.trim().split(/\s+/);

  return {
    username: input.username,
    email: input.email,
    firstName: firstName || input.name,
    lastName: lastNameParts.join(" "),
    enabled: true,
    emailVerified: true,
  };
}

function realmAdminUrl(config: KeycloakAdminConfig) {
  return `${config.adminUrl}/admin/realms/${config.targetRealm}`;
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string) {
  return {
    ...authHeaders(token),
    "content-type": "application/json",
  };
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fallbackCode: SetupErrorCode,
): Promise<T> {
  const response = await fetchIdentity(url, init);
  const text = await response.text();

  if (!response.ok) {
    throwIdentityResponseError(response.status, text, fallbackCode);
  }

  return text ? (JSON.parse(text) as T) : ([] as T);
}

async function fetchOk(url: string, init: RequestInit, fallbackCode: SetupErrorCode) {
  const response = await fetchIdentity(url, init);

  if (!response.ok) {
    throwIdentityResponseError(response.status, await response.text(), fallbackCode);
  }
}

async function fetchIdentity(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new SetupError("SETUP_IDENTITY_UNAVAILABLE", 502);
  }
}

function throwIdentityResponseError(
  status: number,
  body: string,
  fallbackCode: SetupErrorCode,
): never {
  if (status === 409) {
    throw new SetupError("SETUP_IDENTITY_USER_CONFLICT", 409);
  }

  if (fallbackCode === "SETUP_IDENTITY_PASSWORD_REJECTED" && status === 400) {
    throw new SetupError("SETUP_IDENTITY_PASSWORD_REJECTED", 400);
  }

  const statusCode = statusForSetupError(fallbackCode);

  throw new SetupError(fallbackCode, statusCode, body || fallbackCode);
}

function statusForSetupError(code: SetupErrorCode) {
  if (code === "SETUP_IDENTITY_USER_CONFLICT") {
    return 409;
  }

  if (code === "SETUP_IDENTITY_PASSWORD_REJECTED") {
    return 400;
  }

  if (code === "SETUP_IDENTITY_CONFIG_INVALID") {
    return 500;
  }

  return 502;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}
