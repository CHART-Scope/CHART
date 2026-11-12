"use client";

import { useState } from "react";

import { InvitationEmail } from "./InvitationEmail";
import { Landing } from "@/features/landing";

type Screen = "email" | "login";

type Props = {
  initial?: Screen;
  onLaunch?: () => void;
};

export function OnboardingFlow({ initial = "email", onLaunch }: Props) {
  const [screen, setScreen] = useState<Screen>(initial);

  if (screen === "email") {
    return <InvitationEmail onActivate={() => setScreen("login")} />;
  }
  return <Landing setupMode="configured" onSignIn={onLaunch} />;
}
