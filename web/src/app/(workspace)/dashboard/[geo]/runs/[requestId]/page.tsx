"use client";

import { use } from "react";

import { useSession } from "@/features/auth/WorkspaceSession";
import { RunDetail } from "@/features/dashboard";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string; requestId: string }>;
};

/** Accounts without a planning area are sent to /access-pending by the
 * workspace layout before this renders. */
export default function RunDetailPage(props: PageProps) {
  const params = use(props.params);
  const requestId = Number.parseInt(params.requestId, 10);
  const session = useSession();
  const backHref = `/dashboard/${encodeURIComponent(params.geo)}`;

  return (
    <main className={styles.page}>
      {Number.isFinite(requestId) ? (
        <RunDetail
          requestId={requestId}
          accessToken={session.accessToken}
          backHref={backHref}
        />
      ) : (
        <p className={styles.empty}>
          That run identifier is not valid. <a href={backHref}>Back to dashboard</a>
        </p>
      )}
    </main>
  );
}
