import styles from "./ExplainerVideo.module.css";
import { EXPLAINER_POSTER, EXPLAINER_VIDEO_URL } from "./source";

export function ExplainerVideo({ className }: { className?: string }) {
  return (
    <video
      className={[styles.video, className].filter(Boolean).join(" ")}
      controls
      playsInline
      preload="none"
      poster={EXPLAINER_POSTER}
      aria-label="CHART explainer video"
    >
      <source src={EXPLAINER_VIDEO_URL} type="video/mp4" />
      <a href={EXPLAINER_VIDEO_URL}>Watch the CHART explainer</a>
    </video>
  );
}
