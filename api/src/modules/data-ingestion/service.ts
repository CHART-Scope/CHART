import type {
  Dhis2AuthMode,
  Dhis2ConnectionTestResult,
  Dhis2PublicConfig,
  SourceMetadata,
  SourceSyncResult,
} from "./types.js";

const dhis2SourceId = "health-dhis2" as const;

const sources: SourceMetadata[] = [
  {
    id: "climate-era5",
    kind: "climate",
    name: "ERA5 climate data",
    provider: "Copernicus",
    refreshMode: "external",
  },
  {
    id: dhis2SourceId,
    kind: "health",
    name: "DHIS2 health data",
    provider: "DHIS2",
    refreshMode: "sync",
  },
  {
    id: "population-seed",
    kind: "population",
    name: "Seed population indicators",
    provider: "CHART",
    refreshMode: "seed",
  },
  {
    id: "geography-seed",
    kind: "geography",
    name: "Seed geography scopes",
    provider: "CHART",
    refreshMode: "seed",
  },
  {
    id: "solution-repository",
    kind: "solutions",
    name: "CHART solution repository",
    provider: "CHART",
    refreshMode: "external",
  },
];

export function listSources(): SourceMetadata[] {
  const dhis2Config = getDhis2PublicConfig();

  return sources.map((source) =>
    source.id === dhis2SourceId
      ? {
          ...source,
          configurationStatus: dhis2Config.configured
            ? "configured"
            : "missing_configuration",
        }
      : source,
  );
}

export function getSourceById(sourceId: string): SourceMetadata | undefined {
  return listSources().find((source) => source.id === sourceId);
}

export function queueSourceSync(sourceId: string): SourceSyncResult {
  return {
    sourceId,
    status: "queued",
  };
}

export function getDhis2PublicConfig(
  env: NodeJS.ProcessEnv = process.env,
): Dhis2PublicConfig {
  const baseUrl = normalizeBaseUrl(env.DHIS2_BASE_URL);
  const apiVersion = env.DHIS2_API_VERSION?.trim() || "41";
  const authMode = readDhis2AuthMode(env);
  const credentialConfigured = hasDhis2Credential(authMode, env);

  return {
    sourceId: dhis2SourceId,
    baseUrl,
    apiVersion,
    authMode,
    credentialConfigured,
    configured: Boolean(baseUrl && credentialConfigured),
    meUrl: baseUrl ? `${baseUrl}/api/${apiVersion}/me` : undefined,
  };
}

export async function testDhis2Connection(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Dhis2ConnectionTestResult> {
  const config = getDhis2PublicConfig(env);
  const authorization = buildDhis2AuthorizationHeader(config.authMode, env);

  if (!config.baseUrl || !config.meUrl || !authorization) {
    return {
      sourceId: dhis2SourceId,
      status: "missing_configuration",
      message:
        "Set DHIS2_BASE_URL and the credential variables for the selected DHIS2 auth mode.",
    };
  }

  try {
    const response = await fetchImpl(config.meUrl, {
      headers: {
        accept: "application/json",
        authorization,
      },
    });

    if (!response.ok) {
      return {
        sourceId: dhis2SourceId,
        status: "failed",
        meUrl: config.meUrl,
        httpStatus: response.status,
        message: "DHIS2 rejected the configured credentials.",
      };
    }

    const body = (await response.json()) as { username?: string; displayName?: string };

    return {
      sourceId: dhis2SourceId,
      status: "connected",
      meUrl: config.meUrl,
      httpStatus: response.status,
      username: body.username ?? body.displayName,
    };
  } catch (error) {
    return {
      sourceId: dhis2SourceId,
      status: "failed",
      meUrl: config.meUrl,
      message: error instanceof Error ? error.message : "Could not connect to DHIS2.",
    };
  }
}

function readDhis2AuthMode(env: NodeJS.ProcessEnv): Dhis2AuthMode {
  const configuredMode = env.DHIS2_AUTH_MODE?.trim().toLowerCase();

  if (
    configuredMode === "pat" ||
    configuredMode === "basic" ||
    configuredMode === "oauth2"
  ) {
    return configuredMode;
  }

  if (env.DHIS2_USERNAME || env.DHIS2_PASSWORD) {
    return "basic";
  }

  if (env.DHIS2_BEARER_TOKEN) {
    return "oauth2";
  }

  return "pat";
}

function hasDhis2Credential(authMode: Dhis2AuthMode, env: NodeJS.ProcessEnv) {
  if (authMode === "pat") {
    return Boolean(env.DHIS2_API_TOKEN);
  }

  if (authMode === "basic") {
    return Boolean(env.DHIS2_USERNAME && env.DHIS2_PASSWORD);
  }

  return Boolean(env.DHIS2_BEARER_TOKEN);
}

function buildDhis2AuthorizationHeader(
  authMode: Dhis2AuthMode,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (authMode === "pat" && env.DHIS2_API_TOKEN) {
    return `ApiToken ${env.DHIS2_API_TOKEN}`;
  }

  if (authMode === "basic" && env.DHIS2_USERNAME && env.DHIS2_PASSWORD) {
    const credentials = Buffer.from(
      `${env.DHIS2_USERNAME}:${env.DHIS2_PASSWORD}`,
      "utf8",
    ).toString("base64");

    return `Basic ${credentials}`;
  }

  if (authMode === "oauth2" && env.DHIS2_BEARER_TOKEN) {
    return `Bearer ${env.DHIS2_BEARER_TOKEN}`;
  }

  return undefined;
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}
