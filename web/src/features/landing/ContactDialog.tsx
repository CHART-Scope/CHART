"use client";

import { useEffect, useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/Button";
import { Modal } from "@/components/Modal";
import styles from "./Landing.module.css";

export type ContactReason = "demo" | "partner" | "notify" | "other";

const CONTACT = "info@scopeimpact.fi";

const REASONS: readonly [ContactReason, string][] = [
  ["demo", "Requesting a demo"],
  ["partner", "Becoming a co-creator partner"],
  ["notify", "Hearing when VRAs and the Action repository launch"],
  ["other", "Something else"],
];

/** The address, subject and body a visitor's email app opens with. CHART has
 * no contact backend, so the message is sent from their own mailbox. */
function contactMailto(form: {
  reason: ContactReason;
  name: string;
  email: string;
  organisation: string;
  message: string;
}) {
  const label = REASONS.find(([id]) => id === form.reason)?.[1] ?? "CHART";
  const body = [
    `Name: ${form.name}`,
    `Work email: ${form.email}`,
    `Organisation / department: ${form.organisation}`,
    "",
    form.message,
  ].join("\n");
  return `mailto:${CONTACT}?subject=${encodeURIComponent(`CHART: ${label}`)}&body=${encodeURIComponent(body)}`;
}

export function ContactDialog({
  reason,
  onClose,
}: {
  reason: ContactReason | null;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<ContactReason>("demo");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (reason) {
      setPicked(reason);
      setSent(false);
    }
  }, [reason]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "").trim();
    window.open(
      contactMailto({
        reason: picked,
        name: field("name"),
        email: field("email"),
        organisation: field("organisation"),
        message: field("message"),
      }),
      "_self",
    );
    setSent(true);
  }

  return (
    <Modal
      open={reason !== null}
      size="md"
      onClose={onClose}
      title={sent ? "Almost there" : "Contact us"}
      description={
        sent
          ? `Your email app opened with the message to ${CONTACT}. Send it from there and we'll reply to your work email.`
          : "Tell us a little about you and we'll get back to you."
      }
    >
      {sent ? (
        <div className={styles.formActions}>
          <button type="button" className={buttonClassName()} onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <label>
            Name
            <input name="name" type="text" autoComplete="name" required />
          </label>
          <label>
            Work email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Organisation / department
            <input name="organisation" type="text" autoComplete="organization" />
          </label>
          <fieldset>
            <legend>I&rsquo;m interested in</legend>
            {REASONS.map(([id, label]) => (
              <label key={id} className={styles.reason}>
                <input
                  type="radio"
                  name="reason"
                  value={id}
                  checked={picked === id}
                  onChange={() => setPicked(id)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            Message (optional)
            <textarea name="message" rows={3} />
          </label>
          <div className={styles.formActions}>
            <button
              type="button"
              className={buttonClassName({ variant: "secondary" })}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={buttonClassName()}>
              Send
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
