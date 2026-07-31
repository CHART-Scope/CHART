"use client";

import { IconSprite } from "@/components/Icon";
import { exampleInvitation, InvitationEmailTemplate } from "./InvitationEmailTemplate";
import styles from "./InvitationEmail.module.css";

type Props = {
  onActivate?: () => void;
};

export function InvitationEmail({ onActivate }: Props) {
  return (
    <>
      <IconSprite />
      <div className={styles.frame}>
        <div className={styles.topbar}>
          <div className={styles.grid}>
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className={styles.brand}>Outlook</div>
          <div className={styles.search}>Search</div>
          <div className={styles.avatar} />
        </div>
        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <div className={styles.newmail}>New email</div>
            <div className={styles.navlabel}>Favourites</div>
            <div className={`${styles.navitem} ${styles.selected}`}>
              Inbox <span className={styles.count}>1</span>
            </div>
            <div className={styles.navitem}>Sent items</div>
            <div className={styles.navitem}>
              Drafts <span className={styles.count}>2</span>
            </div>
            <div className={styles.navlabel}>Folders</div>
            <div className={styles.navitem}>Inbox</div>
            <div className={styles.navitem}>Junk email</div>
            <div className={styles.navitem}>Sent items</div>
            <div className={styles.navitem}>Deleted items</div>
            <div className={styles.navitem}>Archive</div>
          </aside>
          <div className={styles.main}>
            <div className={styles.toolbar}>
              <span className={styles.new}>New email</span>
              <span>Delete</span>
              <span>Archive</span>
              <span>Report</span>
              <span>Move to</span>
              <span>Reply</span>
            </div>
            <div className={styles.subbar}>
              <span>Close</span>
              <span>Previous</span>
              <span>Next</span>
            </div>
            <div className={styles.mailbody}>
              <div className={styles.subject}>
                You&apos;ve been invited to CHART by Kenya Ministry of Health
              </div>
              <div className={styles.fromrow}>
                <div className={styles.avatarLg}>C</div>
                <div>
                  <div className={styles.fromname}>
                    CHART &lt;notifications@chart.scopeimpact.fi&gt;
                  </div>
                  <div className={styles.fromto}>To: You</div>
                </div>
                <div className={styles.date}>Thu 26/01/2026 05:26</div>
              </div>
              <InvitationEmailTemplate
                invitation={exampleInvitation}
                onActivate={onActivate}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
