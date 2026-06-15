import { type NextRequest, NextResponse } from "next/server";

import { getChartApiBaseUrl } from "./chartApi";
import { corsJson } from "./cors";

type CurrentUserContext = {
  userId: string;
  roles?: unknown;
};

type ContentEditorAccess =
  | {
      canEditContent: boolean;
      user?: CurrentUserContext;
    }
  | {
      response: NextResponse;
    };

type CurrentUserResult =
  | {
      user: CurrentUserContext;
    }
  | {
      response: NextResponse;
    };

const contentEditorRoles = new Set(["chart_admin", "content_editor"]);

export async function getContentEditorAccess(
  request: NextRequest,
): Promise<ContentEditorAccess> {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return { canEditContent: false };
  }

  const user = await resolveCurrentUser(request, authorization);

  if ("response" in user) {
    return user;
  }

  return {
    user: user.user,
    canEditContent: hasContentEditorRole(user.user),
  };
}

export async function requireContentEditor(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return {
      response: corsJson(request, { error: "AUTH_TOKEN_REQUIRED" }, { status: 401 }),
    };
  }

  const access = await getContentEditorAccess(request);

  if ("response" in access) {
    return access;
  }

  if (!access.canEditContent) {
    return {
      response: corsJson(request, { error: "CONTENT_EDIT_FORBIDDEN" }, { status: 403 }),
    };
  }

  return { user: access.user };
}

async function resolveCurrentUser(
  request: NextRequest,
  authorization: string,
): Promise<CurrentUserResult> {
  const userResponse = await fetch(`${getChartApiBaseUrl(request)}/auth/me`, {
    cache: "no-store",
    headers: { authorization },
  });

  if (!userResponse.ok) {
    return {
      response: new NextResponse(await userResponse.text(), {
        status: userResponse.status,
        headers: {
          "content-type":
            userResponse.headers.get("content-type") ?? "application/json",
        },
      }),
    };
  }

  const user = (await userResponse.json()) as CurrentUserContext;
  return { user };
}

function hasContentEditorRole(user: CurrentUserContext) {
  const roles = Array.isArray(user.roles) ? user.roles : [];

  return roles.some((role) => {
    return typeof role === "string" && contentEditorRoles.has(role);
  });
}
