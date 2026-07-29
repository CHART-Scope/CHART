const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildScopeGoogleIdentityProvider,
  buildWebClientSettings,
  normalizePublicOrigin,
} = require("./sync-realm.js");

test("Google SSO stays untouched when credentials are not configured", () => {
  assert.equal(buildScopeGoogleIdentityProvider({}), null);
});

test("Google SSO requires the client credentials as a pair", () => {
  assert.throws(
    () =>
      buildScopeGoogleIdentityProvider({
        KEYCLOAK_GOOGLE_CLIENT_ID: "client-id",
      }),
    /Configure KEYCLOAK_GOOGLE_CLIENT_ID and KEYCLOAK_GOOGLE_CLIENT_SECRET together/,
  );
});

test("Google SSO restricts brokered identities to the Scope Impact domain", () => {
  const provider = buildScopeGoogleIdentityProvider({
    KEYCLOAK_GOOGLE_CLIENT_ID: "client-id",
    KEYCLOAK_GOOGLE_CLIENT_SECRET: "client-secret",
  });

  assert.equal(provider.alias, "scope-google");
  assert.equal(provider.providerId, "google");
  assert.equal(provider.trustEmail, true);
  assert.equal(provider.storeToken, false);
  assert.equal(provider.config.hostedDomain, "scopeimpact.fi");
  assert.equal(provider.config.defaultScope, "openid profile email");
});

test("web client settings use exact callback origins", () => {
  assert.deepEqual(buildWebClientSettings("https://chart.scopeimpact.fi"), {
    redirectUris: [
      "https://chart.scopeimpact.fi/auth/callback",
      "http://localhost:3100/auth/callback",
      "http://127.0.0.1:3100/auth/callback",
    ],
    webOrigins: [
      "https://chart.scopeimpact.fi",
      "http://localhost:3100",
      "http://127.0.0.1:3100",
    ],
    attributes: {
      "post.logout.redirect.uris":
        "https://chart.scopeimpact.fi##https://chart.scopeimpact.fi/*##" +
        "http://localhost:3100##http://localhost:3100/*##" +
        "http://127.0.0.1:3100##http://127.0.0.1:3100/*",
    },
  });
});

test("public origin validation rejects IP fallbacks with paths or credentials", () => {
  assert.equal(
    normalizePublicOrigin("https://chart.scopeimpact.fi"),
    "https://chart.scopeimpact.fi",
  );
  assert.throws(
    () => normalizePublicOrigin("https://user@example.org/chart"),
    /CHART_WEB_ORIGIN/,
  );
});
