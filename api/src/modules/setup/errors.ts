import type { SetupErrorCode } from "./types.js";

export class SetupError extends Error {
  constructor(
    public readonly code: SetupErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}
