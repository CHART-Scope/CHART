"use client";

import { useState } from "react";

import { InvitationEmail } from "./InvitationEmail";
import { Login } from "./Login";
import { OnboardingWizard } from "./OnboardingWizard";

type Screen = "email" | "login" | "wizard";

type Props = {
  initial?: Screen;
  onLaunch?: () => void;
};

export function OnboardingFlow({ initial = "email", onLaunch }: Props) {
  const [screen, setScreen] = useState<Screen>(initial);

  if (screen === "email") {
    return <InvitationEmail onActivate={() => setScreen("login")} />;
  }
  if (screen === "login") {
    return <Login onSubmit={() => setScreen("wizard")} />;
  }
  return <OnboardingWizard onLaunch={onLaunch} />;
}
