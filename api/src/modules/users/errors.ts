import type { UserErrorCode } from "./types.js";

export class UserError extends Error {
  constructor(
    public readonly code: UserErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}
