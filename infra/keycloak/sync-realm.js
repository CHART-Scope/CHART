#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const keycloakUrl = trimTrailingSlash(
  process.env.KEYCLOAK_ADMIN_URL ?? process.env.KEYCLOAK_URL ?? "http://127.0.0.1:8080",
);
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM ?? "master";
const targetRealm = process.env.KEYCLOAK_REALM ?? "chart";
const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";
const realmFile =
  process.env.KEYCLOAK_REALM_FILE ?? path.resolve(__dirname, "chart-realm.json");

async function main() {
  const realmSeed = JSON.parse(fs.readFileSync(realmFile, "utf8"));
  const token = await getAdminToken();

  await syncRealmSettings(token, realmSeed);
  await ensureClientRoles(token, realmSeed.roles?.client ?? {});
  await ensureGroups(token, realmSeed.groups ?? []);
  await importUsers(token, realmSeed.users ?? []);

  console.log(`Synced Keycloak realm '${targetRealm}' from ${realmFile}`);
}

async function syncRealmSettings(token, realmSeed) {
  await fetchOk(`${keycloakUrl}/admin/realms/${targetRealm}`, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      displayName: realmSeed.displayName,
      enabled: realmSeed.enabled,
      loginTheme: realmSeed.loginTheme,
      sslRequired: realmSeed.sslRequired,
    }),
  });
}

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: adminUsername,
    password: adminPassword,
  });
  const response = await fetchJson(
    `${keycloakUrl}/realms/${adminRealm}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!response.access_token) {
    throw new Error("Keycloak admin token response did not include an access token.");
  }

  return response.access_token;
}

async function ensureClientRoles(token, rolesByClientId) {
  for (const [clientId, roles] of Object.entries(rolesByClientId)) {
    const client = await getClient(token, clientId);

    for (const role of roles) {
      await upsertClientRole(token, client.id, role);
    }
  }
}

async function getClient(token, clientId) {
  const clients = await fetchJson(
    `${keycloakUrl}/admin/realms/${targetRealm}/clients?clientId=${encodeURIComponent(
      clientId,
    )}`,
    { headers: authHeaders(token) },
  );
  const client = clients.find((candidate) => candidate.clientId === clientId);

  if (!client) {
    throw new Error(
      `Keycloak client '${clientId}' does not exist in realm '${targetRealm}'.`,
    );
  }

  return client;
}

async function upsertClientRole(token, clientUuid, role) {
  const roleUrl = `${keycloakUrl}/admin/realms/${targetRealm}/clients/${clientUuid}/roles/${encodeURIComponent(
    role.name,
  )}`;
  const existing = await fetch(roleUrl, { headers: authHeaders(token) });

  if (existing.status === 404) {
    await fetchOk(
      `${keycloakUrl}/admin/realms/${targetRealm}/clients/${clientUuid}/roles`,
      {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(role),
      },
    );
    return;
  }

  if (!existing.ok) {
    throw new Error(
      `Could not read Keycloak client role '${role.name}': ${existing.status}`,
    );
  }

  await fetchOk(roleUrl, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({ ...role, name: role.name }),
  });
}

async function ensureGroups(token, groups, parentId) {
  for (const group of groups) {
    const existing = await findGroup(token, group.name, parentId);
    const groupId =
      existing?.id ?? (await createGroup(token, stripSubGroups(group), parentId));

    await ensureGroups(token, group.subGroups ?? [], groupId);
  }
}

async function findGroup(token, name, parentId) {
  const url = parentId
    ? `${keycloakUrl}/admin/realms/${targetRealm}/groups/${parentId}/children`
    : `${keycloakUrl}/admin/realms/${targetRealm}/groups?briefRepresentation=false`;
  const groups = await fetchJson(url, { headers: authHeaders(token) });

  return groups.find((group) => group.name === name);
}

async function createGroup(token, group, parentId) {
  const url = parentId
    ? `${keycloakUrl}/admin/realms/${targetRealm}/groups/${parentId}/children`
    : `${keycloakUrl}/admin/realms/${targetRealm}/groups`;
  const response = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(group),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Could not create Keycloak group '${group.name}': ${response.status}`,
    );
  }

  const created = await findGroup(token, group.name, parentId);
  if (!created) {
    throw new Error(`Keycloak group '${group.name}' was not found after creation.`);
  }

  return created.id;
}

async function importUsers(token, users) {
  if (users.length === 0) {
    return;
  }

  await fetchOk(`${keycloakUrl}/admin/realms/${targetRealm}/partialImport`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      ifResourceExists: "OVERWRITE",
      users,
    }),
  });
}

function stripSubGroups(group) {
  const { subGroups, ...groupFields } = group;
  return groupFields;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token) {
  return {
    ...authHeaders(token),
    "content-type": "application/json",
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function fetchOk(url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
