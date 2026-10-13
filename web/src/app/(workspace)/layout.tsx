import type { ReactNode } from "react";

import { WorkspaceLayout } from "@/features/chrome/WorkspaceLayout";

/** Signed-in routes share one shell; see WorkspaceLayout. A route group adds
 * no path segment, so the URLs are unchanged. */
export default function Layout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
