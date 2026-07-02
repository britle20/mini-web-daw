import type { SampleMeta } from "../model";
import {
  createPersistedProjectDocument,
  createProjectId,
  migratePersistedProjectDocument,
  type PersistedProjectDocument,
  type ProjectSummary,
} from "./project-store";
import {
  createStoreOnlyZipBlob,
  readStoreOnlyZipBlob,
  type StoreOnlyZipEntry,
} from "./store-only-zip";

export const PROJECT_BUNDLE_JSON_PATH = "project.json";
export const PROJECT_BUNDLE_IMPORTED_SAMPLE_DIRECTORY = "samples/imported";

export interface ImportedProjectBundle {
  missingSampleIds: string[];
  project: PersistedProjectDocument;
  sampleBlobs: Map<string, Blob>;
  mismatchedSampleIds: string[];
}

export interface ImportedSampleFileIdentity {
  byteLength: number;
  contentHashSha256: string;
  fileName?: string;
  mimeType?: string;
}

export function createProjectJsonFileName(projectName: string): string {
  return `${createSafeFileName(projectName)}.mini-daw-project.json`;
}

export function createProjectBundleFileName(projectName: string): string {
  return `${createSafeFileName(projectName)}.mini-daw-bundle.zip`;
}

export function serializeProjectDocument(
  project: PersistedProjectDocument,
): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function createProjectJsonBlob(project: PersistedProjectDocument): Blob {
  return new Blob([serializeProjectDocument(project)], {
    type: "application/json",
  });
}

export async function parseProjectJsonBlob(
  blob: Blob,
): Promise<PersistedProjectDocument> {
  return parseProjectDocumentJson(await blob.text());
}

export function parseProjectDocumentJson(
  jsonText: string,
): PersistedProjectDocument {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(jsonText);
  } catch {
    throw new Error("Project JSON could not be parsed.");
  }

  const project = migratePersistedProjectDocument(parsedValue);

  if (!project) {
    throw new Error("Project JSON is not a supported mini DAW project file.");
  }

  return project;
}

export function createImportedProjectDocument({
  existingProjects,
  now = Date.now(),
  project,
}: {
  existingProjects: readonly ProjectSummary[];
  now?: number;
  project: PersistedProjectDocument;
}): PersistedProjectDocument {
  const existingProjectIds = existingProjects.map((summary) => summary.id);
  const nextProjectId = existingProjectIds.includes(project.id)
    ? createProjectId(existingProjectIds)
    : project.id;
  const nextProjectName = createImportedProjectName({
    existingProjectNames: existingProjects.map((summary) => summary.name),
    projectName: project.name,
  });

  return createPersistedProjectDocument({
    arrangementLengthBars: project.arrangementLengthBars,
    arrangementLoopRange: project.arrangementLoopRange,
    arrangementTracks: project.arrangementTracks,
    clipInstances: project.clipInstances,
    clips: project.clips,
    createdAt: now,
    id: nextProjectId,
    masterMixerState: project.masterMixerState,
    name: nextProjectName,
    sampleMetas: project.sampleMetas,
    savedAt: now,
    tempoBpm: project.tempoBpm,
    trackMixerStates: project.trackMixerStates,
  });
}

export function getImportedSampleMetas(
  sampleMetas: readonly SampleMeta[],
): SampleMeta[] {
  return sampleMetas.filter(
    (sampleMeta) => sampleMeta.source.kind === "imported",
  );
}

export function getMissingImportedSampleMetas({
  availableSampleIds,
  sampleMetas,
}: {
  availableSampleIds: ReadonlySet<string>;
  sampleMetas: readonly SampleMeta[];
}): SampleMeta[] {
  return getImportedSampleMetas(sampleMetas).filter(
    (sampleMeta) => !availableSampleIds.has(sampleMeta.id),
  );
}

export async function createProjectBundleBlob({
  importedSampleBlobs,
  project,
}: {
  importedSampleBlobs: ReadonlyMap<string, Blob>;
  project: PersistedProjectDocument;
}): Promise<Blob> {
  const entries: StoreOnlyZipEntry[] = [
    {
      data: encodeText(serializeProjectDocument(project)),
      path: PROJECT_BUNDLE_JSON_PATH,
    },
  ];

  for (const sampleMeta of getImportedSampleMetas(project.sampleMetas)) {
    const blob = importedSampleBlobs.get(sampleMeta.id);

    if (!blob) {
      continue;
    }

    entries.push({
      data: new Uint8Array(await blob.arrayBuffer()),
      path: createImportedSampleBundlePath(sampleMeta.id),
    });
  }

  return createStoreOnlyZipBlob(entries);
}

export async function parseProjectBundleBlob(
  blob: Blob,
): Promise<ImportedProjectBundle> {
  const entries = await readStoreOnlyZipBlob(blob);
  const projectBytes = entries.get(PROJECT_BUNDLE_JSON_PATH);

  if (!projectBytes) {
    throw new Error("Project bundle is missing project.json.");
  }

  const project = parseProjectDocumentJson(decodeText(projectBytes));
  const sampleBlobs = new Map<string, Blob>();
  const missingSampleIds: string[] = [];
  const mismatchedSampleIds: string[] = [];

  for (const sampleMeta of getImportedSampleMetas(project.sampleMetas)) {
    const sampleBytes = entries.get(createImportedSampleBundlePath(sampleMeta.id));

    if (!sampleBytes) {
      missingSampleIds.push(sampleMeta.id);
      continue;
    }

    const sampleBlob = new Blob([toArrayBuffer(sampleBytes)], {
      type: sampleMeta.source.mimeType || "audio/wav",
    });
    const expectedHash = sampleMeta.source.contentHashSha256;

    if (expectedHash) {
      const actualHash = await computeBlobSha256(sampleBlob);

      if (actualHash !== expectedHash) {
        mismatchedSampleIds.push(sampleMeta.id);
        continue;
      }
    }

    sampleBlobs.set(sampleMeta.id, sampleBlob);
  }

  return {
    missingSampleIds,
    mismatchedSampleIds,
    project,
    sampleBlobs,
  };
}

export async function computeBlobSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createImportedSampleFileIdentity({
  fileName,
  mimeType,
  sampleBlob,
}: {
  fileName?: string;
  mimeType?: string;
  sampleBlob: Blob;
}): Promise<ImportedSampleFileIdentity> {
  return {
    byteLength: sampleBlob.size,
    contentHashSha256: await computeBlobSha256(sampleBlob),
    fileName,
    mimeType,
  };
}

export function assertImportedSampleRelinkMatches({
  identity,
  sampleMeta,
}: {
  identity: ImportedSampleFileIdentity;
  sampleMeta: SampleMeta;
}): void {
  if (sampleMeta.source.kind !== "imported") {
    throw new Error("Only imported samples can be relinked.");
  }

  if (
    sampleMeta.source.contentHashSha256 &&
    sampleMeta.source.contentHashSha256 !== identity.contentHashSha256
  ) {
    throw new Error(
      `Selected WAV does not match ${sampleMeta.name}. Hash mismatch.`,
    );
  }

  if (
    !sampleMeta.source.contentHashSha256 &&
    typeof sampleMeta.source.byteLength === "number" &&
    sampleMeta.source.byteLength !== identity.byteLength
  ) {
    throw new Error(
      `Selected WAV does not match ${sampleMeta.name}. File size mismatch.`,
    );
  }
}

export function updateImportedSampleMetaIdentity({
  durationSeconds,
  identity,
  sampleMeta,
}: {
  durationSeconds?: number;
  identity: ImportedSampleFileIdentity;
  sampleMeta: SampleMeta;
}): SampleMeta {
  return {
    ...sampleMeta,
    durationSeconds: durationSeconds ?? sampleMeta.durationSeconds,
    source: {
      ...sampleMeta.source,
      byteLength: identity.byteLength,
      contentHashSha256: identity.contentHashSha256,
      fileName: identity.fileName ?? sampleMeta.source.fileName,
      mimeType: identity.mimeType || sampleMeta.source.mimeType,
    },
  };
}

export function createImportedSampleBundlePath(sampleId: string): string {
  return `${PROJECT_BUNDLE_IMPORTED_SAMPLE_DIRECTORY}/${encodeURIComponent(
    sampleId,
  )}.wav`;
}

function createImportedProjectName({
  existingProjectNames,
  projectName,
}: {
  existingProjectNames: readonly string[];
  projectName: string;
}): string {
  const existingNames = new Set(existingProjectNames);

  if (!existingNames.has(projectName)) {
    return projectName;
  }

  let suffix = 2;
  let candidate = `${projectName} (${suffix})`;

  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${projectName} (${suffix})`;
  }

  return candidate;
}

function createSafeFileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "mini-daw-project"
  );
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeText(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);
  return copy.buffer;
}
