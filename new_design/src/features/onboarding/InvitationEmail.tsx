"use client";

import { Button } from "@/components/Button";
import { Icon, IconSprite } from "@/components/Icon";
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
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} />
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
            <div className={styles.navitem}>
              Drafts <span className={styles.count}>2</span>
            </div>
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
              <span>Sweep</span>
              <span>Move to</span>
              <span>Reply</span>
              <span>Read / Unread</span>
            </div>
            <div className={styles.subbar}>
              <span>Close</span>
              <span>Previous</span>
              <span>Next</span>
            </div>
            <div className={styles.mailbody}>
              <div className={styles.subject}>
                You've been invited to CHART by Kenya Ministry of Health
              </div>
              <div className={styles.fromrow}>
                <div className={styles.avatarLg}>S</div>
                <div>
                  <div className={styles.fromname}>Sender &lt;invite@chart.com&gt;</div>
                  <div className={styles.fromto}>To: You</div>
                </div>
                <div className={styles.date}>Thu 26/01/2026 05:26</div>
              </div>
              <div className={styles.content}>
                <p>Hello Grace Lemayian,</p>
                <p>
                  You've been invited by the{" "}
                  <strong>Ministry of Health, Government of Kenya</strong> to join CHART
                  (Climate x Health Adaptation and Resilience Tool) platform to support
                  the climate and health planning process in{" "}
                  <strong>Kajiado County</strong>.
                </p>
                <h4>Your role</h4>
                <p>
                  You've been assigned the following role on CHART:
                  <br />
                  County lead role (for more information on your role click{" "}
                  <a href="#">here</a>)
                </p>
                <h4>Engagement period</h4>
                <p>
                  Start date: 1 January 2026
                  <br />
                  End date: 31 December 2026
                </p>
                <h4>Kick-off and collaboration meetings</h4>
                <p>
                  A kick-off session along with recurring monthly calendar invites have
                  been sent to your inbox for cross-sectoral technical working group
                  (TWG) meetings. These sessions are key to working collaboratively
                  across departments and districts on Kajiado's climate and health
                  planning efforts.
                </p>
                <h4>Get started</h4>
                <div style={{ margin: "4px 0 14px" }}>
                  <Button
                    onClick={onActivate}
                    trailingIcon={<Icon name="arrow-right" size={13} />}
                  >
                    Activate your account
                  </Button>
                </div>
                <p>
                  Need help getting started with CHART?{" "}
                  <a href="#">Watch this short video</a>
                </p>
                <p className={styles.sign}>
                  Welcome aboard,
                  <br />
                  The CHART Team
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
