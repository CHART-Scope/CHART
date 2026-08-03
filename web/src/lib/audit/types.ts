export type AuditEventType =
  | "signin"
  | "signout"
  | "page_view"
  | "district_switch"
  | "whatif_tick"
  | "whatif_settled"
  | "prediction_submitted"
  | "prediction_completed"
  | "prediction_failed";

export type AuditEventInput = {
  event_type: AuditEventType;
  geography_id?: string | null;
  admin_unit_id?: number | null;
  prediction_request_id?: number | null;
  payload?: Record<string, unknown>;
};

export type AuditEvent = AuditEventInput & {
  client_seq: number;
  occurred_at: string;
};

export type AuditRunSummary = {
  request_id: number;
  status: string;
  planning_date: string | null;
  admin_unit_name: string | null;
};

export type AuditEventOut = {
  id: number;
  session_id: string;
  flush_id: string;
  client_seq: number;
  event_type: AuditEventType;
  occurred_at: string;
  received_at: string;
  geography_id: string | null;
  admin_unit_id: number | null;
  prediction_request_id: number | null;
  payload: Record<string, unknown>;
  run_summary: AuditRunSummary | null;
};

export type AuditListResponse = {
  items: AuditEventOut[];
  next_before: string | null;
};
