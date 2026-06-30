import { describe, expect, it } from "vitest";

import { createDistortionCurve } from "../../../src/audio";

describe("mixer effect helpers", () => {
  it("creates a stable symmetric distortion curve", () => {
    const curve = createDistortionCurve(4, 9);

    expect(curve).toHaveLength(9);
    expect(curve[0]).toBeLessThan(0);
    expect(curve[4]).toBeCloseTo(0);
    expect(curve[8]).toBeGreaterThan(0);
    expect(curve[0]).toBeCloseTo(-curve[8]!, 5);
    expect(curve[1]).toBeCloseTo(-curve[7]!, 5);
  });
});
