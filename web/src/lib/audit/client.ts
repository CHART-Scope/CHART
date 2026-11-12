import { authFetch, readErrorCode } from "@/lib/authFetch";

import type { AuditEvent, AuditListResponse } from "./types";

const ENDPOINT = "/api/chart/audit/events";

type PostBody = {
  session_id: string;
  flush_id: string;
  events: AuditEvent[];
};

export async function postAuditBatch(
  body: PostBody,
  accessToken: string,
  init: { keepalive?: boolean; signal?: AbortSignal } = {},
): Promise<{ inserted: number }> {
  const response = await authFetch(ENDPOINT, {
    method: "POST",
    accessToken,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: init.keepalive ?? false,
    signal: init.signal,
    timeoutMs: 15_000,
  });
  if (!response.ok) {
    throw new AuditFlushError(
      response.status,
      (await readErrorCode(response)) ?? "AUDIT_FLUSH_FAILED",
    );
  }
  return (await response.json()) as { inserted: number };
}

export async function getAuditEvents(
  accessToken: string | null | undefined,
  params: { limit?: number; before?: string } = {},
): Promise<AuditListResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.before) query.set("before", params.before);
  const suffix = query.toString();
  const response = await authFetch(`${ENDPOINT}${suffix ? `?${suffix}` : ""}`, {
    accessToken,
  });
  if (!response.ok) {
    throw new AuditFlushError(
      response.status,
      (await readErrorCode(response)) ?? "AUDIT_FETCH_FAILED",
    );
  }
  return (await response.json()) as AuditListResponse;
}

export class AuditFlushError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = "AuditFlushError";
    this.status = status;
    this.code = code;
  }
}
