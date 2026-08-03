import { createPersistedStore } from "@/lib/store/createPersistedStore";

import type { AuditEvent, AuditEventInput } from "./types";

const MAX_BUFFERED_EVENTS = 500;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type State = {
  sessionId: string;
  nextSeq: number;
  pending: AuditEvent[];
};

type Actions = {
  record: (event: AuditEventInput) => void;
  takeBatch: (limit: number) => AuditEvent[];
  ackFlush: (uptoClientSeq: number) => void;
};

export const useAuditStore = createPersistedStore<State & Actions, State>(
  (set, get) => ({
    sessionId: newId(),
    nextSeq: 0,
    pending: [],
    record: (event) => {
      const seq = get().nextSeq;
      const stamped: AuditEvent = {
        ...event,
        client_seq: seq,
        occurred_at: new Date().toISOString(),
      };
      set((state) => {
        const next = [...state.pending, stamped];
        // Ring behaviour: if we somehow exceed the cap (server offline
        // for a long time), drop the oldest — those are the least useful
        // to the user's Activity view and would otherwise block newer
        // events from ever flushing.
        const trimmed =
          next.length > MAX_BUFFERED_EVENTS
            ? next.slice(next.length - MAX_BUFFERED_EVENTS)
            : next;
        return { pending: trimmed, nextSeq: seq + 1 };
      });
    },
    takeBatch: (limit) => get().pending.slice(0, limit),
    ackFlush: (uptoClientSeq) =>
      set((state) => ({
        pending: state.pending.filter((event) => event.client_seq > uptoClientSeq),
      })),
  }),
  {
    name: "chart:audit",
    version: 1,
    storage: "session",
    partialize: (state) => ({
      sessionId: state.sessionId,
      nextSeq: state.nextSeq,
      pending: state.pending,
    }),
  },
);

export function recordAuditEvent(event: AuditEventInput): void {
  useAuditStore.getState().record(event);
}
