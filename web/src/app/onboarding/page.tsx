"use client";

import { useRouter } from "next/navigation";

import { OnboardingFlow } from "@/features/onboarding";

export default function OnboardingPage() {
  const router = useRouter();
  return <OnboardingFlow onLaunch={() => router.push("/plan")} />;
}
