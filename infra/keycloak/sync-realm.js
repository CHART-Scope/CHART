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

  await syncRealmSettings(token, realmSeed, process.env.CHART_WEB_ORIGIN);
  await syncClientSettings(token, realmSeed.clients ?? []);
  await ensureClientRoles(token, realmSeed.roles?.client ?? {});
  await ensureClientProtocolMappers(token, realmSeed.clients ?? []);
  await ensureWebClientSettings(
    token,
    realmSeed.clients ?? [],
    process.env.CHART_WEB_ORIGIN,
  );
  await ensureIdentityProvider(token, buildScopeGoogleIdentityProvider(process.env));
  await ensureGroups(token, realmSeed.groups ?? []);
  await importUsers(token, realmSeed.users ?? []);

  console.log(`Synced Keycloak realm '${targetRealm}' from ${realmFile}`);
}

async function syncClientSettings(token, clients) {
  for (const clientSeed of clients) {
    const clientSummary = await getClient(token, clientSeed.clientId);
    const clientUrl = `${keycloakUrl}/admin/realms/${targetRealm}/clients/${clientSummary.id}`;
    const client = await fetchJson(clientUrl, { headers: authHeaders(token) });

    await fetchOk(clientUrl, {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        ...client,
        redirectUris: clientSeed.redirectUris ?? client.redirectUris,
        webOrigins: clientSeed.webOrigins ?? client.webOrigins,
        attributes: {
          ...(client.attributes ?? {}),
          ...(clientSeed.attributes ?? {}),
        },
      }),
    });
  }
}

async function syncRealmSettings(token, realmSeed, configuredOrigin) {
  await fetchOk(`${keycloakUrl}/admin/realms/${targetRealm}`, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify(buildRealmSettings(realmSeed, configuredOrigin)),
  });
}

function buildRealmSettings(realmSeed, configuredOrigin) {
  const sslRequired = configuredOrigin
    ? new URL(normalizePublicOrigin(configuredOrigin)).protocol === "http:"
      ? "none"
      : "external"
    : realmSeed.sslRequired;
  if (!["all", "external", "none"].includes(sslRequired)) {
    throw new Error("The realm seed has an invalid sslRequired value.");
  }

  return {
    displayName: realmSeed.displayName,
    enabled: realmSeed.enabled,
    loginTheme: realmSeed.loginTheme,
    sslRequired,
  };
}

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: adminUsername,
    password: adminPassword,
  });
  let response;
  try {
    response = await fetchJson(
      `${keycloakUrl}/realms/${adminRealm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      throw new Error(
        "Local Keycloak rejected the configured admin credentials. " +
          "If this is disposable development data, run: make identity-reset CONFIRM=1",
      );
    }
    throw error;
  }

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

async function ensureClientProtocolMappers(token, clients) {
  for (const clientSeed of clients) {
    const mappers = clientSeed.protocolMappers ?? [];
    if (mappers.length === 0) {
      continue;
    }

    const client = await getClient(token, clientSeed.clientId);
    const mapperUrl = `${keycloakUrl}/admin/realms/${targetRealm}/clients/${client.id}/protocol-mappers/models`;
    const existingMappers = await fetchJson(mapperUrl, {
      headers: authHeaders(token),
    });

    for (const mapper of mappers) {
      const existing = existingMappers.find(
        (candidate) => candidate.name === mapper.name,
      );

      if (!existing) {
        await fetchOk(mapperUrl, {
          method: "POST",
          headers: jsonHeaders(token),
          body: JSON.stringify(mapper),
        });
        continue;
      }

      await fetchOk(`${mapperUrl}/${existing.id}`, {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify({ ...mapper, id: existing.id }),
      });
    }
  }
}

async function ensureWebClientSettings(token, clients, configuredOrigin) {
  if (!configuredOrigin) {
    return;
  }

  const clientSeed = clients.find((client) => client.clientId === "chart-web");
  if (!clientSeed) {
    throw new Error("Keycloak realm seed does not define the 'chart-web' client.");
  }

  const publicOrigin = normalizePublicOrigin(configuredOrigin);
  const client = await getClient(token, clientSeed.clientId);
  const clientUrl = `${keycloakUrl}/admin/realms/${targetRealm}/clients/${client.id}`;
  const existing = await fetchJson(clientUrl, {
    headers: authHeaders(token),
  });
  const settings = buildWebClientSettings(publicOrigin);

  await fetchOk(clientUrl, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      ...existing,
      ...settings,
      attributes: {
        ...(existing.attributes ?? {}),
        ...(settings.attributes ?? {}),
      },
    }),
  });
}

function buildWebClientSettings(configuredOrigin) {
  const publicOrigin = normalizePublicOrigin(configuredOrigin);
  const origins = unique([
    publicOrigin,
    "http://localhost:3100",
    "http://127.0.0.1:3100",
  ]);

  return {
    redirectUris: origins.map((origin) => `${origin}/auth/callback`),
    webOrigins: origins,
    attributes: {
      "post.logout.redirect.uris": origins
        .flatMap((origin) => [origin, `${origin}/*`])
        .join("##"),
    },
  };
}

async function ensureIdentityProvider(token, provider) {
  if (!provider) {
    return;
  }

  const collectionUrl = `${keycloakUrl}/admin/realms/${targetRealm}/identity-provider/instances`;
  const providerUrl = `${collectionUrl}/${encodeURIComponent(provider.alias)}`;
  const response = await fetch(providerUrl, {
    headers: authHeaders(token),
  });

  if (response.status === 404) {
    await fetchOk(collectionUrl, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(provider),
    });
    return;
  }

  if (!response.ok) {
    throw new Error(
      `Could not read Keycloak identity provider '${provider.alias}': ${response.status}`,
    );
  }

  const existing = await response.json();
  await fetchOk(providerUrl, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      ...existing,
      ...provider,
      config: {
        ...(existing.config ?? {}),
        ...provider.config,
      },
    }),
  });
}

function buildScopeGoogleIdentityProvider(env) {
  const clientId = env.KEYCLOAK_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.KEYCLOAK_GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId && !clientSecret) {
    return null;
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      "Configure KEYCLOAK_GOOGLE_CLIENT_ID and KEYCLOAK_GOOGLE_CLIENT_SECRET together.",
    );
  }

  const hostedDomains = (env.KEYCLOAK_GOOGLE_HOSTED_DOMAIN ?? "scopeimpact.fi")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (
    hostedDomains.length === 0 ||
    hostedDomains.some(
      (domain) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain),
    )
  ) {
    throw new Error("KEYCLOAK_GOOGLE_HOSTED_DOMAIN must contain valid email domains.");
  }

  return {
    alias: env.KEYCLOAK_GOOGLE_ALIAS?.trim() || "scope-google",
    displayName: env.KEYCLOAK_GOOGLE_DISPLAY_NAME?.trim() || "Scope Impact Google",
    providerId: "google",
    enabled: googleIdentityProviderEnabled(env.CHART_WEB_ORIGIN),
    updateProfileFirstLoginMode: "missing",
    trustEmail: true,
    storeToken: false,
    addReadTokenRoleOnCreate: false,
    authenticateByDefault: false,
    linkOnly: false,
    firstBrokerLoginFlowAlias: "first broker login",
    config: {
      clientId,
      clientSecret,
      defaultScope: "openid profile email",
      hostedDomain: hostedDomains.join(","),
      syncMode: "IMPORT",
      useJwksUrl: "true",
    },
  };
}

function googleIdentityProviderEnabled(configuredOrigin) {
  if (!configuredOrigin) return true;
  const origin = new URL(normalizePublicOrigin(configuredOrigin));
  return (
    origin.protocol === "https:" ||
    origin.hostname === "localhost" ||
    origin.hostname === "127.0.0.1" ||
    origin.hostname === "::1"
  );
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

function normalizePublicOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CHART_WEB_ORIGIN must be an absolute http or https origin.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("CHART_WEB_ORIGIN must be an absolute http or https origin.");
  }
  return url.origin;
}

function unique(values) {
  return [...new Set(values)];
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  buildRealmSettings,
  buildScopeGoogleIdentityProvider,
  buildWebClientSettings,
  normalizePublicOrigin,
};
