import { describe, expect, it } from "vitest";

import {
  createStoreOnlyZipBlob,
  readStoreOnlyZipBlob,
} from "../../../src/persistence";

describe("store-only ZIP helpers", () => {
  it("round-trips app-owned store-only ZIP entries", async () => {
    const zipBlob = await createStoreOnlyZipBlob([
      {
        data: new TextEncoder().encode("hello"),
        path: "project.json",
      },
      {
        data: new Uint8Array([1, 2, 3]),
        path: "samples/imported/imported-audio-loop.wav",
      },
    ]);
    const entries = await readStoreOnlyZipBlob(zipBlob);

    expect(new TextDecoder().decode(entries.get("project.json"))).toBe("hello");
    expect(
      Array.from(entries.get("samples/imported/imported-audio-loop.wav") ?? []),
    ).toEqual([1, 2, 3]);
  });
});
