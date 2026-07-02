import { duplicateHybridClip } from "./drum-clip";
import { isAudioClip, type Clip } from "./audio-clip";

export interface DuplicateClipOptions {
  clip: Clip;
  existingClipIds: readonly string[];
  existingClipNames: readonly string[];
}

export function duplicateClip({
  clip,
  existingClipIds,
  existingClipNames,
}: DuplicateClipOptions): Clip {
  const id = createDuplicatedClipId({
    existingClipIds,
    sourceClipId: clip.id,
  });
  const name = createDuplicatedClipName({
    existingClipNames,
    sourceClipName: clip.name,
  });

  if (isAudioClip(clip)) {
    return {
      ...clip,
      id,
      name,
    };
  }

  return duplicateHybridClip({
    clip,
    id,
    name,
  });
}

export function createDuplicatedClipId({
  existingClipIds,
  sourceClipId,
}: {
  existingClipIds: readonly string[];
  sourceClipId: string;
}): string {
  const copyIdBase = `${sourceClipId.replace(/-copy(?:-\d+)?$/u, "")}-copy`;

  return createUniqueCopyValue(copyIdBase, existingClipIds, {
    caseSensitive: true,
    separator: "-",
  });
}

export function createDuplicatedClipName({
  existingClipNames,
  sourceClipName,
}: {
  existingClipNames: readonly string[];
  sourceClipName: string;
}): string {
  const copyNameBase = `${sourceClipName.replace(/ copy(?: \d+)?$/iu, "")} Copy`;

  return createUniqueCopyValue(copyNameBase, existingClipNames, {
    caseSensitive: false,
    separator: " ",
  });
}

function createUniqueCopyValue(
  baseValue: string,
  existingValues: readonly string[],
  {
    caseSensitive,
    separator,
  }: {
    caseSensitive: boolean;
    separator: string;
  },
): string {
  const normalizedExistingValues = new Set(
    existingValues.map((value) => normalizeValue(value, caseSensitive)),
  );

  if (!normalizedExistingValues.has(normalizeValue(baseValue, caseSensitive))) {
    return baseValue;
  }

  let suffix = 2;
  let candidate = `${baseValue}${separator}${suffix}`;

  while (normalizedExistingValues.has(normalizeValue(candidate, caseSensitive))) {
    suffix += 1;
    candidate = `${baseValue}${separator}${suffix}`;
  }

  return candidate;
}

function normalizeValue(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}
