import { type NextRequest, NextResponse } from "next/server";

import {
  buildKeycloakTokenUrl,
  getKeycloakClientId,
  pkceCookieName,
} from "@/lib/keycloak";
import { getRequestOrigin } from "@/lib/httpRequest";

export const runtime = "nodejs";

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
};

export async function POST(request: NextRequest) {
  const body = await readRequestBody(request);
  const savedPkce = readPkceCookie(request.cookies.get(pkceCookieName)?.value);

  if (!body?.code || !body.state || !savedPkce || savedPkce.state !== body.state) {
    return NextResponse.json({ error: "AUTH_CALLBACK_INVALID" }, { status: 400 });
  }

  const tokenResponse = await fetch(buildKeycloakTokenUrl(request), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getKeycloakClientId(),
      code: body.code,
      redirect_uri: `${getRequestOrigin(request)}/auth/callback`,
      code_verifier: savedPkce.verifier,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "TOKEN_EXCHANGE_FAILED" }, { status: 401 });
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;
  const response = NextResponse.json(tokens, {
    headers: {
      "Cache-Control": "no-store",
    },
  });

  response.cookies.delete(pkceCookieName);

  return response;
}

async function readRequestBody(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: unknown; state?: unknown };

    if (typeof body.code !== "string" || typeof body.state !== "string") {
      return null;
    }

    return { code: body.code, state: body.state };
  } catch {
    return null;
  }
}

function readPkceCookie(value?: string) {
  if (!value) {
    return null;
  }

  const [state, verifier] = value.split(".");

  if (!state || !verifier) {
    return null;
  }

  return { state, verifier };
}
