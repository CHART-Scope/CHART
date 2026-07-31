"use client";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import styles from "./InvitationEmailTemplate.module.css";

export type InvitationEmailContent = {
  recipientName: string;
  inviterName: string;
  geographyName: string;
  roleName: string;
  startDate: string;
  endDate: string;
};

export const exampleInvitation: InvitationEmailContent = {
  recipientName: "Grace Lemayian",
  inviterName: "Ministry of Health, Government of Kenya",
  geographyName: "Kajiado County",
  roleName: "County planning lead",
  startDate: "1 January 2026",
  endDate: "31 December 2026",
};

type Props = {
  invitation?: InvitationEmailContent;
  onActivate?: () => void;
};

export function InvitationEmailTemplate({
  invitation = exampleInvitation,
  onActivate,
}: Props) {
  return (
    <article className={styles.template}>
      <div className={styles.mark}>CHART</div>
      <p>Hello {invitation.recipientName},</p>
      <p>
        You&apos;ve been invited by <strong>{invitation.inviterName}</strong> to join
        CHART—the Climate &amp; Health Adaptation and Resilience Tool—and support
        climate and health planning in <strong>{invitation.geographyName}</strong>.
      </p>

      <dl className={styles.details}>
        <div>
          <dt>Your role</dt>
          <dd>{invitation.roleName}</dd>
        </div>
        <div>
          <dt>Engagement period</dt>
          <dd>
            {invitation.startDate} — {invitation.endDate}
          </dd>
        </div>
      </dl>

      <h3>Plan with your cross-sector team</h3>
      <p>
        CHART gives your team a shared place to review climate evidence, understand
        health risks and coordinate action across departments.
      </p>

      <div className={styles.action}>
        <Button
          onClick={onActivate}
          trailingIcon={<Icon name="arrow-right" size={13} />}
        >
          Activate your account
        </Button>
      </div>

      <p className={styles.help}>
        The activation link opens CHART&apos;s secure sign-in. Use the organisational
        account associated with this invitation.
      </p>
      <p className={styles.signoff}>
        Welcome aboard,
        <br />
        The CHART team
      </p>
    </article>
  );
}
