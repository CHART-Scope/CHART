"use client";

import { useState } from "react";

import { InvitationEmail } from "./InvitationEmail";
import { Login } from "./Login";

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
  return <Login setupMode="configured" onSignIn={onLaunch} />;
}
