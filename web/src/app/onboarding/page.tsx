"use client";

import { useRouter } from "next/navigation";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { OnboardingWizard } from "@/features/onboarding";

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <RequireAuth>
      {() => <OnboardingWizard onLaunch={() => router.push("/plan")} />}
    </RequireAuth>
  );
}
