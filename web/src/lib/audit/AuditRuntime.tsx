"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { getStoredAuthSession } from "@/lib/authClient";

import { recordAuditEvent } from "./store";
import { startAuditFlush, stopAuditFlush } from "./flush";

/**
 * Mounts the audit-log flush loop and records a ``page_view`` on each Next.js
 * route change. Kept at the root layout so the loop exists everywhere,
 * including unauthenticated pages (the flush is a no-op until there is a
 * stored session).
 */
export function AuditRuntime() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    startAuditFlush(() => getStoredAuthSession()?.accessToken ?? null);
    return () => stopAuditFlush();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    recordAuditEvent({
      event_type: "page_view",
      payload: { pathname },
    });
  }, [pathname]);

  return null;
}
