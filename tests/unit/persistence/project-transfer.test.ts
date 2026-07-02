import { describe, expect, it } from "vitest";

import {
  createDefaultArrangementLoopRange,
  createDefaultMasterMixerState,
  createImportedAudioClipDraft,
  type SampleMeta,
} from "../../../src/model";
import {
  assertImportedSampleRelinkMatches,
  computeBlobSha256,
  createImportedProjectDocument,
  createImportedSampleFileIdentity,
  createProjectBundleBlob,
  createProjectJsonBlob,
  createPersistedProjectDocument,
  getMissingImportedSampleMetas,
  parseProjectBundleBlob,
  parseProjectJsonBlob,
  updateImportedSampleMetaIdentity,
  type PersistedProjectDocument,
} from "../../../src/persistence";

describe("project transfer helpers", () => {
  it("computes stable SHA-256 hashes for imported blobs", async () => {
    await expect(computeBlobSha256(new Blob(["abc"]))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("imports project JSON as a separate local document on collisions", () => {
    const project = createProjectDocument({
      id: "project-1",
      name: "Project 1",
      sampleMetas: [],
    });
    const importedProject = createImportedProjectDocument({
      existingProjects: [
        {
          createdAt: 1,
          id: "project-1",
          name: "Project 1",
          updatedAt: 2,
        },
      ],
      now: 100,
      project,
    });

    expect(importedProject).toMatchObject({
      createdAt: 100,
      id: "project-2",
      name: "Project 1 (2)",
      savedAt: 100,
    });
  });

  it("round-trips a project JSON blob", async () => {
    const project = createProjectDocument({
      id: "project-1",
      name: "Project 1",
      sampleMetas: [],
    });

    await expect(parseProjectJsonBlob(createProjectJsonBlob(project))).resolves.toEqual(
      project,
    );
  });

  it("detects missing imported samples from available sample IDs", () => {
    const sampleMeta = createImportedSampleMeta({
      contentHashSha256: "hash",
      sampleId: "imported-audio-loop",
    });

    expect(
      getMissingImportedSampleMetas({
        availableSampleIds: new Set(),
        sampleMetas: [sampleMeta],
      }),
    ).toEqual([sampleMeta]);
    expect(
      getMissingImportedSampleMetas({
        availableSampleIds: new Set(["imported-audio-loop"]),
        sampleMetas: [sampleMeta],
      }),
    ).toEqual([]);
  });

  it("parses app-created bundles and validates imported sample hashes", async () => {
    const sampleBlob = new Blob(["sample"], { type: "audio/wav" });
    const identity = await createImportedSampleFileIdentity({
      fileName: "Loop.wav",
      mimeType: "audio/wav",
      sampleBlob,
    });
    const sampleMeta = updateImportedSampleMetaIdentity({
      identity,
      sampleMeta: createImportedSampleMeta({
        sampleId: "imported-audio-loop",
      }),
    });
    const project = createProjectDocument({
      id: "project-1",
      name: "Project 1",
      sampleMetas: [sampleMeta],
    });
    const bundleBlob = await createProjectBundleBlob({
      importedSampleBlobs: new Map([["imported-audio-loop", sampleBlob]]),
      project,
    });
    const importedBundle = await parseProjectBundleBlob(bundleBlob);

    expect(importedBundle.project).toEqual(project);
    expect(importedBundle.missingSampleIds).toEqual([]);
    expect(importedBundle.mismatchedSampleIds).toEqual([]);
    await expect(
      importedBundle.sampleBlobs.get("imported-audio-loop")?.text(),
    ).resolves.toBe("sample");
  });

  it("marks missing and mismatched bundle samples without accepting bad blobs", async () => {
    const expectedHash = await computeBlobSha256(new Blob(["expected"]));
    const missingSampleMeta = createImportedSampleMeta({
      contentHashSha256: expectedHash,
      sampleId: "missing-sample",
    });
    const mismatchedSampleMeta = createImportedSampleMeta({
      contentHashSha256: expectedHash,
      sampleId: "mismatched-sample",
    });
    const project = createProjectDocument({
      id: "project-1",
      name: "Project 1",
      sampleMetas: [missingSampleMeta, mismatchedSampleMeta],
    });
    const bundleBlob = await createProjectBundleBlob({
      importedSampleBlobs: new Map([
        ["mismatched-sample", new Blob(["wrong"], { type: "audio/wav" })],
      ]),
      project,
    });
    const importedBundle = await parseProjectBundleBlob(bundleBlob);

    expect(importedBundle.missingSampleIds).toEqual(["missing-sample"]);
    expect(importedBundle.mismatchedSampleIds).toEqual(["mismatched-sample"]);
    expect(importedBundle.sampleBlobs.size).toBe(0);
  });

  it("rejects relinked WAV blobs when the stored hash does not match", async () => {
    const sampleMeta = createImportedSampleMeta({
      contentHashSha256: await computeBlobSha256(new Blob(["expected"])),
      sampleId: "imported-audio-loop",
    });
    const identity = await createImportedSampleFileIdentity({
      sampleBlob: new Blob(["wrong"], { type: "audio/wav" }),
    });

    expect(() =>
      assertImportedSampleRelinkMatches({ identity, sampleMeta }),
    ).toThrow("Hash mismatch.");
  });
});

function createImportedSampleMeta({
  contentHashSha256,
  sampleId,
}: {
  contentHashSha256?: string;
  sampleId: string;
}): SampleMeta {
  const { sampleMeta } = createImportedAudioClipDraft({
    byteLength: 6,
    clipId: `audio-clip-${sampleId}`,
    contentHashSha256,
    durationSeconds: 1,
    fileName: "Loop.wav",
    mimeType: "audio/wav",
    sampleId,
  });

  return sampleMeta;
}

function createProjectDocument({
  id,
  name,
  sampleMetas,
}: {
  id: string;
  name: string;
  sampleMetas: readonly SampleMeta[];
}): PersistedProjectDocument {
  return createPersistedProjectDocument({
    arrangementLengthBars: 16,
    arrangementLoopRange: createDefaultArrangementLoopRange(),
    arrangementTracks: [],
    clipInstances: [],
    clips: [],
    createdAt: 1,
    id,
    masterMixerState: createDefaultMasterMixerState(),
    name,
    sampleMetas,
    savedAt: 2,
    tempoBpm: 128,
    trackMixerStates: [],
  });
}
