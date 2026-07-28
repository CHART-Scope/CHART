"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { TextInput } from "@/components/TextInput";
import styles from "./Login.module.css";

type Props = {
  defaultEmail?: string;
  onSubmit?: (email: string, password: string) => void;
};

export function Login({
  defaultEmail = "grace.lemaiyan@kajiado.co.ke",
  onSubmit,
}: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.(email, password);
  };

  return (
    <div className={styles.frame}>
      <div className={styles.wrap}>
        <div className={styles.logo}>CHART</div>
        <form className={styles.card} onSubmit={submit}>
          <div className={styles.heading}>Log in to your account</div>
          <p className={styles.sub}>
            Enter your details to activate your CHART account and begin onboarding.
          </p>
          <div className={styles.stack}>
            <TextInput
              id="email"
              label="Email address"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <TextInput
              id="password"
              label="Password"
              type="password"
              value={password}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </div>
          <div className={styles.forgot}>
            <a href="#">Forgot password?</a>
          </div>
          <Button type="submit" block>
            Log in
          </Button>
          <p className={styles.help}>
            Trouble logging in? Contact your CHART programme coordinator.
          </p>
        </form>
      </div>
    </div>
  );
}
