import { type NextRequest, NextResponse } from "next/server";

import { getChartApiBaseUrl } from "@/lib/chartApi";
import { buildKeycloakTokenUrl, getKeycloakClientId } from "@/lib/keycloak";

export const runtime = "nodejs";

type BootstrapSetupRequest = {
  countryCode?: string;
  countryName?: string;
  geographyLevelLabel?: string;
  hazardIds?: string[];
  admin?: {
    username?: string;
    password?: string;
  };
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as BootstrapSetupRequest;
  const setupResponse = await fetchSetupBootstrap(request, body);
  const setupText = await setupResponse.text();

  if (!setupResponse.ok) {
    return new NextResponse(setupText, {
      status: setupResponse.status,
      headers: {
        "content-type": setupResponse.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const tokenResponse = await fetchBootstrapToken(request, body);

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "SETUP_SIGN_IN_FAILED" }, { status: 401 });
  }

  const setupResult = JSON.parse(setupText) as {
    setup: unknown;
    admin: unknown;
  };

  return NextResponse.json({
    setup: setupResult.setup,
    admin: setupResult.admin,
    tokens: await tokenResponse.json(),
  });
}

async function fetchSetupBootstrap(request: NextRequest, body: BootstrapSetupRequest) {
  try {
    return await fetch(`${getChartApiBaseUrl(request)}/setup/bootstrap`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: "CHART_API_UNAVAILABLE" }, { status: 502 });
  }
}

async function fetchBootstrapToken(request: NextRequest, body: BootstrapSetupRequest) {
  try {
    return await fetch(buildKeycloakTokenUrl(request), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: getKeycloakClientId(),
        username: body.admin?.username ?? "",
        password: body.admin?.password ?? "",
        scope: "openid profile email",
      }),
    });
  } catch {
    return NextResponse.json({ error: "SETUP_IDENTITY_UNAVAILABLE" }, { status: 502 });
  }
}
