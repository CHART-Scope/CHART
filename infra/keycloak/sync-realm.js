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

// People sign in with their email address and a code sent to it
// (docs/sign-in.md). The code step comes from the email-otp-form provider in
// infra/keycloak/providers.
const signInFlow = "chart email code";
const signInFormsFlow = "chart email code forms";
const signInRealmSettings = {
  loginWithEmailAllowed: true,
  duplicateEmailsAllowed: false,
  registrationAllowed: false,
  resetPasswordAllowed: false,
};

async function main() {
  const realmSeed = JSON.parse(fs.readFileSync(realmFile, "utf8"));
  // Checked before any change: without mail, nobody could receive a code.
  const smtpServer = buildSmtpServer(process.env);
  const codeSettings = buildEmailCodeSettings(process.env);
  const token = await getAdminToken();

  await syncRealmSettings(token, realmSeed, process.env.CHART_WEB_ORIGIN, smtpServer);
  await ensureEmailCodeSignIn(token, codeSettings);
  await makeLastNameOptional(token);
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
    // A realm that has never seen this client — a fresh install, or a client
    // that was renamed in the seed — must be created rather than failing the
    // whole deploy. Without this, renaming a client ships a realm export that
    // can never be applied.
    let clientSummary = await findClient(token, clientSeed.clientId);

    if (!clientSummary) {
      await fetchOk(`${keycloakUrl}/admin/realms/${targetRealm}/clients`, {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(clientSeed),
      });
      console.log(`Created Keycloak client '${clientSeed.clientId}'.`);
      clientSummary = await getClient(token, clientSeed.clientId);
    }

    const clientUrl = `${keycloakUrl}/admin/realms/${targetRealm}/clients/${clientSummary.id}`;
    const client = await fetchJson(clientUrl, { headers: authHeaders(token) });

    await fetchOk(clientUrl, {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        ...client,
        // Flow switches follow the seed so a realm created before a flow was
        // turned off (e.g. the password grant on chart-web) loses it on deploy.
        ...pickDefined(clientSeed, clientFlowSettings),
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

const clientFlowSettings = [
  "standardFlowEnabled",
  "implicitFlowEnabled",
  "directAccessGrantsEnabled",
  "serviceAccountsEnabled",
];

function pickDefined(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

async function syncRealmSettings(token, realmSeed, configuredOrigin, smtpServer) {
  await fetchOk(`${keycloakUrl}/admin/realms/${targetRealm}`, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      ...buildRealmSettings(realmSeed, configuredOrigin),
      ...signInRealmSettings,
      smtpServer,
    }),
  });
}

function buildSmtpServer(env) {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) {
    throw new Error(
      "Set SMTP_HOST and SMTP_FROM: CHART emails a sign-in code (docs/sign-in.md).",
    );
  }
  const port = env.SMTP_PORT?.trim() || "587";
  if (!/^\d{1,5}$/.test(port)) {
    throw new Error("SMTP_PORT must be a port number.");
  }
  const security = (env.SMTP_SECURITY?.trim() || "starttls").toLowerCase();
  if (!["starttls", "ssl", "none"].includes(security)) {
    throw new Error("SMTP_SECURITY must be starttls, ssl or none.");
  }
  const user = env.SMTP_USERNAME?.trim() ?? "";
  const password = env.SMTP_PASSWORD ?? "";
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("Set SMTP_USERNAME and SMTP_PASSWORD together.");
  }

  return {
    host,
    port,
    from,
    fromDisplayName: env.SMTP_FROM_NAME?.trim() || "CHART",
    replyTo: env.SMTP_REPLY_TO?.trim() ?? "",
    starttls: String(security === "starttls"),
    ssl: String(security === "ssl"),
    auth: String(Boolean(user)),
    ...(user ? { user, password } : {}),
  };
}

function buildEmailCodeSettings(env) {
  const limit = env.SIGN_IN_CODE_LIMIT?.trim() || "5";
  if (!/^\d+$/.test(limit) || Number(limit) > 100) {
    throw new Error("SIGN_IN_CODE_LIMIT must be a whole number from 0 to 100.");
  }
  return {
    "code-length": "6",
    "code-lifetime": "600",
    "resend-cooldown": "60",
    "issuance-limit": limit,
    "issuance-limit-window": "900",
  };
}

async function ensureEmailCodeSignIn(token, codeSettings) {
  const realmUrl = `${keycloakUrl}/admin/realms/${targetRealm}`;
  let executions = await findFlowExecutions(token, signInFlow);
  const complete = ["auth-cookie", "auth-username-form", "email-otp-form"].every(
    (provider) => executions?.some((execution) => execution.providerId === provider),
  );

  if (!complete) {
    // A missing or half-created flow is rebuilt; the realm keeps Keycloak's
    // built-in browser flow until the new one is whole.
    if (executions) {
      await fetchOk(realmUrl, {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify({ browserFlow: "browser" }),
      });
      const flows = await fetchJson(`${realmUrl}/authentication/flows`, {
        headers: authHeaders(token),
      });
      const stale = flows.find((flow) => flow.alias === signInFlow);
      await fetchOk(`${realmUrl}/authentication/flows/${stale.id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
    }
    await fetchOk(`${realmUrl}/authentication/flows`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({
        alias: signInFlow,
        description: "Email address, then a code sent to it",
        providerId: "basic-flow",
        topLevel: true,
        builtIn: false,
      }),
    });
    await addExecution(token, signInFlow, { provider: "auth-cookie" }, "ALTERNATIVE");
    await addExecution(
      token,
      signInFlow,
      {
        alias: signInFormsFlow,
        type: "basic-flow",
        provider: "registration-page-form",
      },
      "ALTERNATIVE",
    );
    await addExecution(
      token,
      signInFormsFlow,
      { provider: "auth-username-form" },
      "REQUIRED",
    );
    await addExecution(
      token,
      signInFormsFlow,
      { provider: "email-otp-form" },
      "REQUIRED",
    );
    executions = await findFlowExecutions(token, signInFlow);
  }

  // Code settings are re-applied on every sync so changes reach the realm.
  const codeStep = executions.find(
    (execution) => execution.providerId === "email-otp-form",
  );
  const config = { alias: "chart email code settings", config: codeSettings };
  if (codeStep.authenticationConfig) {
    await fetchOk(
      `${realmUrl}/authentication/config/${codeStep.authenticationConfig}`,
      {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify({ ...config, id: codeStep.authenticationConfig }),
      },
    );
  } else {
    await fetchOk(`${realmUrl}/authentication/executions/${codeStep.id}/config`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(config),
    });
  }

  await fetchOk(realmUrl, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({ browserFlow: signInFlow }),
  });
}

// CHART keeps a person's whole name in firstName. A required last name would
// stop every account an administrator or setup creates at a profile form on
// its first sign-in.
async function makeLastNameOptional(token) {
  const profileUrl = `${keycloakUrl}/admin/realms/${targetRealm}/users/profile`;
  const profile = await fetchJson(profileUrl, { headers: authHeaders(token) });
  const lastName = profile.attributes?.find(
    (attribute) => attribute.name === "lastName",
  );
  if (!lastName?.required) return;
  delete lastName.required;
  await fetchOk(profileUrl, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify(profile),
  });
}

async function findFlowExecutions(token, alias) {
  const response = await fetch(
    `${keycloakUrl}/admin/realms/${targetRealm}/authentication/flows/${encodeURIComponent(
      alias,
    )}/executions`,
    { headers: authHeaders(token) },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not read Keycloak flow '${alias}': ${response.status}`);
  }
  return response.json();
}

async function addExecution(token, parentAlias, execution, requirement) {
  const executionsUrl = `${keycloakUrl}/admin/realms/${targetRealm}/authentication/flows/${encodeURIComponent(
    parentAlias,
  )}/executions`;
  await fetchOk(`${executionsUrl}/${execution.alias ? "flow" : "execution"}`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(execution),
  });
  // Keycloak adds every step disabled; the new step is the parent's last one.
  const added = (await findFlowExecutions(token, parentAlias))
    .filter((candidate) => candidate.level === 0)
    .at(-1);
  await fetchOk(executionsUrl, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({ ...added, requirement }),
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

async function findClient(token, clientId) {
  const clients = await fetchJson(
    `${keycloakUrl}/admin/realms/${targetRealm}/clients?clientId=${encodeURIComponent(
      clientId,
    )}`,
    { headers: authHeaders(token) },
  );

  return clients.find((candidate) => candidate.clientId === clientId) ?? null;
}

async function getClient(token, clientId) {
  const client = await findClient(token, clientId);

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
      // The sign-in page's "Back to CHART" link.
      baseUrl: publicOrigin,
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
  syncClientSettings,
  buildScopeGoogleIdentityProvider,
  buildWebClientSettings,
  normalizePublicOrigin,
};
