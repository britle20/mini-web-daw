import type { HybridClip } from "./drum-clip";

export interface SampleMeta {
  id: string;
  name: string;
  durationSeconds?: number;
  source: {
    byteLength?: number;
    contentHashSha256?: string;
    kind: "bundled" | "imported";
    fileName?: string;
    mimeType?: string;
    path?: string;
    sourceBpm?: number;
  };
}

export interface AudioClip {
  durationSeconds: number;
  id: string;
  kind: "audio";
  mimeType: string;
  name: string;
  sampleId: string;
  sourceFileName: string;
}

export type Clip = HybridClip | AudioClip;

export interface ImportedAudioFileLike {
  name: string;
  size?: number;
  type?: string;
}

export interface ImportedAudioClipDraft {
  clip: AudioClip;
  sampleMeta: SampleMeta;
}

export interface ClipDeleteConfirmationOptions {
  arrangementInstanceCount?: number;
  clip: Clip;
}

const WAV_MIME_TYPES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
]);
export const DEFAULT_IMPORTED_AUDIO_SOURCE_BPM = 120;
export const MIN_IMPORTED_AUDIO_SOURCE_BPM = 40;
export const MAX_IMPORTED_AUDIO_SOURCE_BPM = 250;

export function isAudioClip(clip: { kind?: string }): clip is AudioClip {
  return clip.kind === "audio";
}

export function isHybridClip<TClip extends { kind?: string }>(
  clip: TClip,
): clip is TClip & { kind: "hybrid" } {
  return clip.kind === "hybrid";
}

export function getClipDeleteConfirmationMessage({
  arrangementInstanceCount = 0,
  clip,
}: ClipDeleteConfirmationOptions): string | null {
  const hasArrangementInstances = arrangementInstanceCount > 0;
  const arrangementMessage = hasArrangementInstances
    ? `${arrangementInstanceCount} arrangement ${arrangementInstanceCount === 1 ? "placement" : "placements"} will also be removed.`
    : "";

  if (isAudioClip(clip)) {
    return joinConfirmationParts([
      `Delete imported audio clip ${clip.name}?`,
      arrangementMessage,
    ]);
  }

  const hasMusicalEvents =
    clip.drumEvents.length > 0 || clip.noteEvents.length > 0;

  if (!hasMusicalEvents && !hasArrangementInstances) {
    return null;
  }

  if (hasMusicalEvents) {
    return joinConfirmationParts([
      `Delete ${clip.name} and its musical events?`,
      arrangementMessage,
    ]);
  }

  return `Delete ${clip.name}? ${arrangementMessage}`;
}

export function validateImportedWavFile(file: ImportedAudioFileLike): void {
  const hasWavExtension = /\.wav$/i.test(file.name);
  const hasWavMimeType = file.type ? WAV_MIME_TYPES.has(file.type) : false;

  if (!hasWavExtension && !hasWavMimeType) {
    throw new Error("Only WAV files can be imported.");
  }

  if (typeof file.size === "number" && file.size <= 0) {
    throw new Error("The selected WAV file is empty.");
  }
}

export function validateImportedAudioSourceBpm(sourceBpm: number): void {
  if (
    !Number.isFinite(sourceBpm) ||
    sourceBpm < MIN_IMPORTED_AUDIO_SOURCE_BPM ||
    sourceBpm > MAX_IMPORTED_AUDIO_SOURCE_BPM
  ) {
    throw new Error(
      `Source BPM must be between ${MIN_IMPORTED_AUDIO_SOURCE_BPM} and ${MAX_IMPORTED_AUDIO_SOURCE_BPM}.`,
    );
  }
}

export function isValidImportedAudioSourceBpm(
  sourceBpm: number | undefined,
): sourceBpm is number {
  return (
    typeof sourceBpm === "number" &&
    Number.isFinite(sourceBpm) &&
    sourceBpm >= MIN_IMPORTED_AUDIO_SOURCE_BPM &&
    sourceBpm <= MAX_IMPORTED_AUDIO_SOURCE_BPM
  );
}

export function getImportedAudioStretchRate({
  projectBpm,
  sourceBpm,
}: {
  projectBpm: number;
  sourceBpm: number;
}): number {
  validateImportedAudioSourceBpm(sourceBpm);

  if (!Number.isFinite(projectBpm) || projectBpm <= 0) {
    throw new Error(
      `projectBpm must be a positive finite number. Received ${projectBpm}.`,
    );
  }

  return projectBpm / sourceBpm;
}

export function createImportedAudioDisplayName(fileName: string): string {
  const baseName = getBaseFileName(fileName);
  const withoutExtension = baseName.replace(/\.[^.]+$/u, "");
  const displayName = withoutExtension.replace(/[_-]+/gu, " ").trim();

  return displayName || "Imported Audio";
}

export function createImportedAudioIds({
  existingClipIds,
  existingSampleIds,
  fileName,
}: {
  existingClipIds: readonly string[];
  existingSampleIds: readonly string[];
  fileName: string;
}): {
  clipId: string;
  sampleId: string;
} {
  const slug = slugify(createImportedAudioDisplayName(fileName));

  return {
    clipId: createUniqueId(`audio-clip-${slug}`, existingClipIds),
    sampleId: createUniqueId(`imported-audio-${slug}`, existingSampleIds),
  };
}

export function createImportedAudioClipDraft({
  byteLength,
  clipId,
  contentHashSha256,
  durationSeconds,
  fileName,
  mimeType,
  sampleId,
  sourceBpm,
}: {
  byteLength?: number;
  clipId: string;
  contentHashSha256?: string;
  durationSeconds: number;
  fileName: string;
  mimeType: string;
  sampleId: string;
  sourceBpm?: number;
}): ImportedAudioClipDraft {
  const name = createImportedAudioDisplayName(fileName);
  const normalizedMimeType = mimeType || "audio/wav";
  const source: SampleMeta["source"] = {
    fileName,
    kind: "imported",
    mimeType: normalizedMimeType,
  };

  if (typeof byteLength === "number") {
    source.byteLength = byteLength;
  }

  if (contentHashSha256) {
    source.contentHashSha256 = contentHashSha256;
  }

  if (typeof sourceBpm === "number") {
    validateImportedAudioSourceBpm(sourceBpm);
    source.sourceBpm = sourceBpm;
  }

  return {
    clip: {
      durationSeconds,
      id: clipId,
      kind: "audio",
      mimeType: normalizedMimeType,
      name,
      sampleId,
      sourceFileName: fileName,
    },
    sampleMeta: {
      durationSeconds,
      id: sampleId,
      name,
      source,
    },
  };
}

function getBaseFileName(fileName: string): string {
  return fileName.split(/[\\/]/u).pop() ?? fileName;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug || "audio";
}

function createUniqueId(baseId: string, existingIds: readonly string[]): string {
  const existingIdSet = new Set(existingIds);

  if (!existingIdSet.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;

  while (existingIdSet.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }

  return candidate;
}

function joinConfirmationParts(parts: readonly string[]): string {
  return parts.filter(Boolean).join(" ");
}
