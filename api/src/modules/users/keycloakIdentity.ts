import { chartRoles, type ChartRole } from "../auth/types.js";
import { UserError } from "./errors.js";
import type { UserErrorCode } from "./types.js";

type KeycloakAdminConfig = {
  adminUrl: string;
  adminRealm: string;
  targetRealm: string;
  adminUsername: string;
  adminPassword: string;
  clientId: string;
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
  subGroups?: KeycloakGroup[];
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

export type IdentityUserInput = {
  name: string;
  email: string;
  username: string;
  password: string;
  roles: ChartRole[];
  groupPaths: string[];
};

export type IdentityUser = {
  userId: string;
  username: string;
  email: string;
};

export async function upsertKeycloakUser(input: IdentityUserInput) {
  const config = readKeycloakAdminConfig();
  const token = await getAdminToken(config);
  const groups = await Promise.all(
    input.groupPaths.map((groupPath) => ensureGroupPath(token, config, groupPath)),
  );
  const user = await upsertUser(token, config, input);

  await replaceUserGroups(
    token,
    config,
    user.id,
    groups.map((group) => group.id),
  );
  await setPassword(token, config, user.id, input.password);
  await replaceClientRoles(token, config, user.id, input.roles);

  return {
    userId: user.id,
    username: input.username,
    email: input.email,
  } satisfies IdentityUser;
}

export async function disableKeycloakUser(userId: string) {
  const config = readKeycloakAdminConfig();
  const token = await getAdminToken(config);

  await fetchOk(
    `${realmAdminUrl(config)}/users/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({ enabled: false }),
    },
    "USER_IDENTITY_DISABLE_FAILED",
  );
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
    throw new UserError("USER_IDENTITY_CONFIG_INVALID", 500);
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
    "USER_IDENTITY_ADMIN_AUTH_FAILED",
  );

  if (!response.access_token) {
    throw new UserError("USER_IDENTITY_ADMIN_AUTH_FAILED", 502);
  }

  return response.access_token;
}

async function ensureGroupPath(
  token: string,
  config: KeycloakAdminConfig,
  groupPath: string,
) {
  const pathParts = groupPath.split("/").filter(Boolean);

  if (pathParts.length === 0) {
    throw new UserError("USER_GEOGRAPHY_INVALID", 400);
  }

  let groups = await listRootGroups(token, config);
  let parent: KeycloakGroup | undefined;

  for (const name of pathParts) {
    const existing = groups.find((group) => group.name === name);

    if (existing) {
      parent = existing;
      groups = existing.subGroups ?? [];
      continue;
    }

    const created = await createGroup(token, config, name, parent?.id);
    parent = created;
    groups = [];
  }

  if (!parent) {
    throw new UserError("USER_IDENTITY_GROUP_FAILED", 502);
  }

  return parent;
}

async function listRootGroups(token: string, config: KeycloakAdminConfig) {
  return fetchJson<KeycloakGroup[]>(
    `${realmAdminUrl(config)}/groups?briefRepresentation=false`,
    { headers: authHeaders(token) },
    "USER_IDENTITY_GROUP_FAILED",
  );
}

async function createGroup(
  token: string,
  config: KeycloakAdminConfig,
  name: string,
  parentGroupId: string | undefined,
) {
  const url = parentGroupId
    ? `${realmAdminUrl(config)}/groups/${parentGroupId}/children`
    : `${realmAdminUrl(config)}/groups`;

  await fetchOk(
    url,
    {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ name }),
    },
    "USER_IDENTITY_GROUP_FAILED",
  );

  const groups = await listRootGroups(token, config);
  const created = findGroupByPath(groups, parentGroupId, name);

  if (!created) {
    throw new UserError("USER_IDENTITY_GROUP_FAILED", 502);
  }

  return created;
}

function findGroupByPath(
  groups: KeycloakGroup[],
  parentGroupId: string | undefined,
  name: string,
): KeycloakGroup | undefined {
  if (!parentGroupId) {
    return groups.find((group) => group.name === name);
  }

  for (const group of groups) {
    if (group.id === parentGroupId) {
      return group.subGroups?.find((candidate) => candidate.name === name);
    }

    const found = findGroupByPath(group.subGroups ?? [], parentGroupId, name);

    if (found) {
      return found;
    }
  }

  return undefined;
}

async function upsertUser(
  token: string,
  config: KeycloakAdminConfig,
  input: IdentityUserInput,
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
      "USER_IDENTITY_USER_CREATE_FAILED",
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

    throw new UserError("USER_IDENTITY_USER_CONFLICT", 409);
  }

  if (!response.ok) {
    throwIdentityResponseError(
      response.status,
      await response.text(),
      "USER_IDENTITY_USER_CREATE_FAILED",
    );
  }

  const createdUser = await findUser(token, config, input.username, input.email);

  if (!createdUser) {
    throw new UserError("USER_IDENTITY_USER_CREATE_FAILED", 502);
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
    "USER_IDENTITY_USER_CREATE_FAILED",
  );
}

async function replaceUserGroups(
  token: string,
  config: KeycloakAdminConfig,
  userId: string,
  nextGroupIds: string[],
) {
  const groups = await fetchJson<KeycloakGroup[]>(
    `${realmAdminUrl(config)}/users/${userId}/groups`,
    { headers: authHeaders(token) },
    "USER_IDENTITY_GROUP_FAILED",
  );

  for (const group of groups) {
    await fetchOk(
      `${realmAdminUrl(config)}/users/${userId}/groups/${group.id}`,
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
      "USER_IDENTITY_GROUP_FAILED",
    );
  }

  for (const groupId of nextGroupIds) {
    await fetchOk(
      `${realmAdminUrl(config)}/users/${userId}/groups/${groupId}`,
      {
        method: "PUT",
        headers: authHeaders(token),
      },
      "USER_IDENTITY_GROUP_FAILED",
    );
  }
}

async function replaceClientRoles(
  token: string,
  config: KeycloakAdminConfig,
  userId: string,
  roleNames: ChartRole[],
) {
  const client = await getClient(token, config);
  const currentRoles = await fetchJson<KeycloakRole[]>(
    `${realmAdminUrl(config)}/users/${userId}/role-mappings/clients/${client.id}`,
    { headers: authHeaders(token) },
    "USER_IDENTITY_ROLE_MISSING",
  );
  const currentChartRoles = currentRoles.filter((role) =>
    chartRoles.includes(role.name as ChartRole),
  );

  if (currentChartRoles.length > 0) {
    await fetchOk(
      `${realmAdminUrl(config)}/users/${userId}/role-mappings/clients/${client.id}`,
      {
        method: "DELETE",
        headers: jsonHeaders(token),
        body: JSON.stringify(currentChartRoles),
      },
      "USER_IDENTITY_ROLE_MISSING",
    );
  }

  const nextRoles = await Promise.all(
    roleNames.map((roleName) => getClientRole(token, config, client.id, roleName)),
  );

  await fetchOk(
    `${realmAdminUrl(config)}/users/${userId}/role-mappings/clients/${client.id}`,
    {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(nextRoles),
    },
    "USER_IDENTITY_ROLE_MISSING",
  );
}

async function getClient(token: string, config: KeycloakAdminConfig) {
  const clients = await fetchJson<KeycloakClient[]>(
    `${realmAdminUrl(config)}/clients?clientId=${encodeURIComponent(config.clientId)}`,
    { headers: authHeaders(token) },
    "USER_IDENTITY_CLIENT_MISSING",
  );
  const client = clients.find((candidate) => candidate.clientId === config.clientId);

  if (!client) {
    throw new UserError("USER_IDENTITY_CLIENT_MISSING", 502);
  }

  return client;
}

async function getClientRole(
  token: string,
  config: KeycloakAdminConfig,
  clientUuid: string,
  roleName: ChartRole,
) {
  return fetchJson<KeycloakRole>(
    `${realmAdminUrl(config)}/clients/${clientUuid}/roles/${encodeURIComponent(roleName)}`,
    { headers: authHeaders(token) },
    "USER_IDENTITY_ROLE_MISSING",
  );
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
    "USER_IDENTITY_USER_CREATE_FAILED",
  );
  const userByUsername = users.find((user) => user.username === username);

  const emailUsers = await fetchJson<KeycloakUser[]>(
    `${realmAdminUrl(config)}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers: authHeaders(token) },
    "USER_IDENTITY_USER_CREATE_FAILED",
  );
  const userByEmail = emailUsers.find((user) => user.email === email);

  if (userByUsername && userByEmail && userByUsername.id !== userByEmail.id) {
    throw new UserError("USER_IDENTITY_USER_CONFLICT", 409);
  }

  return userByUsername ?? userByEmail;
}

function toUserRepresentation(input: IdentityUserInput) {
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
  fallbackCode: UserErrorCode,
): Promise<T> {
  const response = await fetchIdentity(url, init);
  const text = await response.text();

  if (!response.ok) {
    throwIdentityResponseError(response.status, text, fallbackCode);
  }

  return text ? (JSON.parse(text) as T) : ([] as T);
}

async function fetchOk(url: string, init: RequestInit, fallbackCode: UserErrorCode) {
  const response = await fetchIdentity(url, init);

  if (!response.ok) {
    throwIdentityResponseError(response.status, await response.text(), fallbackCode);
  }
}

async function fetchIdentity(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new UserError("USER_IDENTITY_UNAVAILABLE", 502);
  }
}

function throwIdentityResponseError(
  status: number,
  body: string,
  fallbackCode: UserErrorCode,
): never {
  if (status === 409) {
    throw new UserError("USER_IDENTITY_USER_CONFLICT", 409);
  }

  const statusCode = statusForUserError(fallbackCode);

  throw new UserError(fallbackCode, statusCode, body || fallbackCode);
}

function statusForUserError(code: UserErrorCode) {
  if (code === "USER_IDENTITY_USER_CONFLICT") {
    return 409;
  }

  if (code === "USER_IDENTITY_CONFIG_INVALID") {
    return 500;
  }

  return 502;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}
