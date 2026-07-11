import { z } from "zod";
import { morphemeSchema, userSchema, isReviewPolicyAssignableRole, noteSystemActorIds } from "./schemaDomains.js";

export function duplicatePersistedValue<T>(items: T[], valueForItem: (item: T) => string): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    const value = valueForItem(item);
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

export function normalizePersistedText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizePersistedSurfaceKey(input: string): string {
  return normalizePersistedText(input).replace(/-/g, "");
}

export function duplicateNormalizedPersistedValue(items: string[]): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = normalizePersistedText(item);
    if (seen.has(normalized)) return normalized;
    seen.add(normalized);
  }
  return undefined;
}

export function isBlankPersistedValue(item: string): boolean {
  return normalizePersistedText(item).length === 0;
}

export function isSafePersistedLanguageId(item: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(item);
}

export function corpusTargetContainsSurface(textTarget: string, surface: string): boolean {
  const normalizedSurface = normalizePersistedSurfaceKey(surface);
  return normalizePersistedText(textTarget)
    .split(/\s+/)
    .some((token) => {
      const normalizedToken = token.replace(/-/g, "");
      return normalizedToken === normalizedSurface || normalizedToken.includes(normalizedSurface);
    });
}

export function hasContiguousMorphemeCoverage(
  targetToken: string,
  morphemes: Array<Pick<z.infer<typeof morphemeSchema>, "surface">>
): boolean {
  const targetKey = normalizePersistedSurfaceKey(targetToken);
  const surfaceKeys = morphemes.map((morpheme) => normalizePersistedSurfaceKey(morpheme.surface));

  for (let start = 0; start < surfaceKeys.length; start += 1) {
    let candidate = "";
    for (let end = start; end < surfaceKeys.length; end += 1) {
      candidate += surfaceKeys[end];
      if (candidate === targetKey) return true;
      if (!targetKey.startsWith(candidate)) break;
    }
  }

  return false;
}

export function findUncoveredPersistedCorpusTargetTokens(
  textTarget: string,
  morphemes: Array<Pick<z.infer<typeof morphemeSchema>, "surface">>
): string[] {
  return normalizePersistedText(textTarget)
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !hasContiguousMorphemeCoverage(token, morphemes));
}

export function addCorpusTextIntegrityIssues(
  context: z.RefinementCtx,
  collectionPath: "corpus" | "corpusAnswerKeys",
  passageId: string,
  label: "Corpus" | "Corpus answer key",
  textTarget: string,
  textTranslation: string,
  morphologicalSegmentation: Array<z.infer<typeof morphemeSchema>>
) {
  if (isBlankPersistedValue(textTarget)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} target text must not be blank for passage ${passageId}`,
      path: [collectionPath, passageId]
    });
  }

  if (isBlankPersistedValue(textTranslation)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} translation must not be blank for passage ${passageId}`,
      path: [collectionPath, passageId]
    });
  }

  for (const morpheme of morphologicalSegmentation) {
    if (isBlankPersistedValue(morpheme.surface)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme surface must not be blank for passage ${passageId}`,
        path: [collectionPath, passageId]
      });
    }

    if (isBlankPersistedValue(morpheme.lemma)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme lemma must not be blank for passage ${passageId} surface ${morpheme.surface}`,
        path: [collectionPath, passageId]
      });
    }

    if (isBlankPersistedValue(morpheme.gloss)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme gloss must not be blank for passage ${passageId} surface ${morpheme.surface}`,
        path: [collectionPath, passageId]
      });
    }

    if (!corpusTargetContainsSurface(textTarget, morpheme.surface)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} segmentation surface is not present in target text for passage ${passageId}: ${morpheme.surface}`,
        path: [collectionPath, passageId]
      });
    }

    for (const feature of morpheme.features) {
      if (isBlankPersistedValue(feature)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} morpheme feature must not be blank for passage ${passageId} surface ${morpheme.surface}`,
          path: [collectionPath, passageId]
        });
      }
    }

    const duplicateFeature = duplicateNormalizedPersistedValue(morpheme.features);
    if (duplicateFeature) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme feature is duplicated for passage ${passageId} surface ${morpheme.surface}: ${duplicateFeature}`,
        path: [collectionPath, passageId]
      });
    }
  }

  for (const token of findUncoveredPersistedCorpusTargetTokens(textTarget, morphologicalSegmentation)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} segmentation does not cover target token for passage ${passageId}: ${token}`,
      path: [collectionPath, passageId]
    });
  }
}

export function addDuplicatePersistedValueIssue<T>(
  context: z.RefinementCtx,
  path: string,
  label: string,
  items: T[],
  valueForItem: (item: T) => string
) {
  const duplicate = duplicatePersistedValue(items, valueForItem);
  if (duplicate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate persisted ${label} in ${path}: ${duplicate}`,
      path: [path]
    });
  }
}

export function addBlankPersistedValueIssue<T>(
  context: z.RefinementCtx,
  path: string,
  label: string,
  items: T[],
  valueForItem: (item: T) => string
) {
  for (const item of items) {
    if (isBlankPersistedValue(valueForItem(item))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Persisted ${label} must not be blank in ${path}`,
        path: [path]
      });
    }
  }
}

export function addParseablePersistedDateIssue(
  context: z.RefinementCtx,
  path: string,
  recordId: string,
  label: string,
  value: string | null
) {
  if (value !== null && Number.isNaN(Date.parse(value))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} must be parseable: ${value}`,
      path: [path, recordId]
    });
  }
}

export function isAllowedPersistedNoteActor(
  usersById: Map<string, z.infer<typeof userSchema>>,
  actorId: string
): boolean {
  const actor = usersById.get(actorId);
  return noteSystemActorIds.has(actorId) || (actor !== undefined && isReviewPolicyAssignableRole(actor.role));
}
