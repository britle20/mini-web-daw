import type { AudioClip, SampleMeta } from "../../model";
import styles from "./AudioClipDetails.module.css";

interface AudioClipDetailsProps {
  clip: AudioClip;
  errorMessage?: string | null;
  isPreviewPlaying?: boolean;
  onPreviewPlay: () => void;
  onPreviewStop: () => void;
  sampleMeta?: SampleMeta;
}

export function AudioClipDetails({
  clip,
  errorMessage = null,
  isPreviewPlaying = false,
  onPreviewPlay,
  onPreviewStop,
  sampleMeta,
}: AudioClipDetailsProps) {
  return (
    <section className={styles.panel} aria-label={`${clip.name} audio clip details`}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>Imported WAV Clip</p>
        <h2 className={styles.title}>{clip.name}</h2>
      </div>

      <div className={styles.previewControls}>
        <button
          className={styles.previewButton}
          disabled={isPreviewPlaying}
          onClick={onPreviewPlay}
          type="button"
        >
          Loop Preview
        </button>
        <button
          className={styles.previewButtonSecondary}
          disabled={!isPreviewPlaying}
          onClick={onPreviewStop}
          type="button"
        >
          Stop Preview
        </button>
      </div>

      <dl className={styles.detailsGrid}>
        <div className={styles.detailItem}>
          <dt>Source file</dt>
          <dd>{clip.sourceFileName}</dd>
        </div>
        <div className={styles.detailItem}>
          <dt>Duration</dt>
          <dd>{formatDuration(clip.durationSeconds)}</dd>
        </div>
        <div className={styles.detailItem}>
          <dt>File type</dt>
          <dd>{clip.mimeType || sampleMeta?.source.mimeType || "audio/wav"}</dd>
        </div>
        <div className={styles.detailItem}>
          <dt>Sample ID</dt>
          <dd>{clip.sampleId}</dd>
        </div>
        <div className={styles.detailItem}>
          <dt>Source size</dt>
          <dd>{formatByteLength(sampleMeta?.source.byteLength)}</dd>
        </div>
      </dl>

      <div className={styles.notice}>
        <strong>Browser-local source</strong>
        <span>
          Imported WAV bytes are stored outside project JSON. JSON-only imports may
          need relinking; project bundles include available source WAV files.
        </span>
      </div>

      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
    </section>
  );
}

function formatDuration(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return "Unknown";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds - minutes * 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }

  return `${seconds.toFixed(2)} sec`;
}

function formatByteLength(byteLength: number | undefined): string {
  if (typeof byteLength !== "number" || byteLength < 0) {
    return "Unknown";
  }

  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`;
  }

  return `${(byteLength / 1024 / 1024).toFixed(2)} MB`;
}
