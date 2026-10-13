"use client";

import { useRouter } from "next/navigation";

import { useOptionalSession } from "@/features/auth/WorkspaceSession";
import { LearningLibrary } from "@/features/learning";

/**
 * Public: a guest reads it under the public header, a signed-in user inside
 * the workspace shell (both drawn by the workspace layout). The session only
 * adds personal progress.
 */
export default function LearningPage() {
  const router = useRouter();
  const session = useOptionalSession();
  return (
    <main>
      <LearningLibrary
        accessToken={session?.accessToken}
        onStartPlanning={() => router.push("/plan")}
      />
    </main>
  );
}
