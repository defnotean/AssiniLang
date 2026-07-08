import {
  findInvalidOrthographySymbols,
  type AppState,
  type CorpusPassage
} from "@assini/db";

export function normalizeAuthoredAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function firstDuplicateNormalizedValue(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    const normalizedValue = normalizeAuthoredAnswer(value);
    if (seen.has(normalizedValue)) {
      return normalizedValue;
    }
    seen.add(normalizedValue);
  }
  return undefined;
}

export function corpusTargetContainsSurface(textTarget: string, surface: string): boolean {
  const normalizedSurface = normalizeAuthoredAnswer(surface).toLowerCase().replace(/-/g, "");
  return normalizeAuthoredAnswer(textTarget)
    .toLowerCase()
    .split(/\s+/)
    .some((token) => {
      const normalizedToken = token.replace(/-/g, "");
      return normalizedToken === normalizedSurface || normalizedToken.includes(normalizedSurface);
    });
}

export function corpusPhonologyValidationError(
  state: AppState,
  languageId: string,
  body: Pick<CorpusPassage, "textTarget">
): string | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) {
    return `Corpus import language not found: ${languageId}`;
  }

  const phonology = language.phonology;
  if (!phonology || (phonology.consonants.length === 0 && phonology.vowels.length === 0)) {
    // The language has not declared a phonology inventory, so the
    // orthography scan is skipped instead of rejecting unknown symbols.
    return undefined;
  }

  const invalidTargetSymbols = findInvalidOrthographySymbols(body.textTarget, phonology);
  if (invalidTargetSymbols.length > 0) {
    return `Corpus target text uses ${invalidTargetSymbols.join(", ")} outside ${language.name} phonology inventory: ${body.textTarget}`;
  }

  return undefined;
}
