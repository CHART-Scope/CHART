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
  const response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    keepalive: init.keepalive ?? false,
    signal: init.signal,
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new AuditFlushError(response.status, err?.error ?? "AUDIT_FLUSH_FAILED");
  }
  return (await response.json()) as { inserted: number };
}

export async function getAuditEvents(
  accessToken: string,
  params: { limit?: number; before?: string } = {},
): Promise<AuditListResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.before) query.set("before", params.before);
  const suffix = query.toString();
  const response = await fetch(`${ENDPOINT}${suffix ? `?${suffix}` : ""}`, {
    method: "GET",
    cache: "no-store",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new AuditFlushError(response.status, err?.error ?? "AUDIT_FETCH_FAILED");
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
