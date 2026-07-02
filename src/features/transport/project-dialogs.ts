export interface ProjectNameValidationOptions {
  currentProjectName?: string;
  existingProjectNames: readonly string[];
  name: string;
}

export function trimProjectName(name: string): string {
  return name.trim();
}

export function createSuggestedProjectName(
  existingProjectNames: readonly string[],
): string {
  const nextProjectNumber =
    existingProjectNames.reduce((highestProjectNumber, projectName) => {
      const match = /^Project (\d+)$/u.exec(projectName);
      const projectNumber = match ? Number.parseInt(match[1] ?? "", 10) : 0;

      return Math.max(
        highestProjectNumber,
        Number.isNaN(projectNumber) ? 0 : projectNumber,
      );
    }, 0) + 1;

  return `Project ${nextProjectNumber}`;
}

export function validateProjectName({
  currentProjectName,
  existingProjectNames,
  name,
}: ProjectNameValidationOptions): string | null {
  const trimmedName = trimProjectName(name);

  if (!trimmedName) {
    return "Project name is required.";
  }

  const normalizedName = normalizeProjectName(trimmedName);
  const normalizedCurrentName =
    currentProjectName === undefined
      ? null
      : normalizeProjectName(currentProjectName);
  const hasDuplicate = existingProjectNames.some((existingProjectName) => {
    const normalizedExistingName = normalizeProjectName(existingProjectName);

    return (
      normalizedExistingName === normalizedName &&
      normalizedExistingName !== normalizedCurrentName
    );
  });

  return hasDuplicate ? "A project with this name already exists." : null;
}

function normalizeProjectName(name: string): string {
  return trimProjectName(name).toLowerCase();
}
