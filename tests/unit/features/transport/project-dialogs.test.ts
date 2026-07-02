import { describe, expect, it } from "vitest";

import {
  createSuggestedProjectName,
  trimProjectName,
  validateProjectName,
} from "../../../../src/features/transport/project-dialogs";

describe("project dialog helpers", () => {
  it("trims submitted project names", () => {
    expect(trimProjectName("  Project Alpha  ")).toBe("Project Alpha");
  });

  it("suggests the next numbered project name", () => {
    expect(createSuggestedProjectName([])).toBe("Project 1");
    expect(
      createSuggestedProjectName(["Project 1", "Sketch", "Project 4"]),
    ).toBe("Project 5");
  });

  it("rejects empty project names after trimming whitespace", () => {
    expect(
      validateProjectName({
        existingProjectNames: [],
        name: "   ",
      }),
    ).toBe("Project name is required.");
  });

  it("rejects duplicate project names case-insensitively", () => {
    expect(
      validateProjectName({
        existingProjectNames: ["Project 1"],
        name: " project 1 ",
      }),
    ).toBe("A project with this name already exists.");
  });

  it("allows the current project name during rename validation", () => {
    expect(
      validateProjectName({
        currentProjectName: "Project 1",
        existingProjectNames: ["Project 1", "Project 2"],
        name: " project 1 ",
      }),
    ).toBeNull();
  });
});
