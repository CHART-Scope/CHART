import { UserError } from "../users/errors.js";
import { upsertKeycloakUser } from "../users/keycloakIdentity.js";
import { SetupError } from "./errors.js";
import type { SetupErrorCode } from "./types.js";

type KeycloakUserInput = {
  name: string;
  email: string;
  username: string;
  password: string;
  groupPath: string;
};

export type CreatedAdminUser = {
  userId: string;
  username: string;
  email: string;
};

export async function createBootstrapAdminUser(input: KeycloakUserInput) {
  try {
    return await upsertKeycloakUser({
      name: input.name,
      email: input.email,
      username: input.username,
      password: input.password,
      groupPaths: [input.groupPath],
      roles: ["chart_admin", "content_editor"],
    });
  } catch (error) {
    if (error instanceof UserError) {
      throw new SetupError(toSetupIdentityError(error.code), error.statusCode);
    }

    throw error;
  }
}

function toSetupIdentityError(code: string): SetupErrorCode {
  switch (code) {
    case "USER_IDENTITY_ADMIN_AUTH_FAILED":
      return "SETUP_IDENTITY_ADMIN_AUTH_FAILED";
    case "USER_IDENTITY_CLIENT_MISSING":
      return "SETUP_IDENTITY_CLIENT_MISSING";
    case "USER_IDENTITY_CONFIG_INVALID":
      return "SETUP_IDENTITY_CONFIG_INVALID";
    case "USER_IDENTITY_GROUP_FAILED":
      return "SETUP_IDENTITY_GROUP_FAILED";
    case "USER_IDENTITY_ROLE_MISSING":
      return "SETUP_IDENTITY_ROLE_MISSING";
    case "USER_IDENTITY_UNAVAILABLE":
      return "SETUP_IDENTITY_UNAVAILABLE";
    case "USER_IDENTITY_USER_CONFLICT":
      return "SETUP_IDENTITY_USER_CONFLICT";
    default:
      return "SETUP_IDENTITY_USER_CREATE_FAILED";
  }
}
