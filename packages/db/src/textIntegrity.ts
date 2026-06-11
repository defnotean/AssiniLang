import type { LanguagePhonology, Morpheme } from "./schema.js";

function normalizedText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedSurfaceKey(input: string): string {
  return normalizedText(input).replace(/-/g, "");
}

/**
 * Scans target-language text against a declared phonology inventory.
 * Returns the distinct symbols that are not part of the inventory.
 * Whitespace and morpheme-boundary hyphens are always allowed.
 * Languages without a declared inventory should skip this check entirely.
 */
export function findInvalidOrthographySymbols(
  value: string,
  phonology: Pick<LanguagePhonology, "consonants" | "vowels">
): string[] {
  const allowedSymbols = [...phonology.consonants, ...phonology.vowels]
    .filter((symbol) => symbol.length > 0)
    .sort((left, right) => right.length - left.length);
  const invalid = new Set<string>();

  for (let index = 0; index < value.length;) {
    const symbol = value[index];
    if (!symbol) break;

    if (/\s/.test(symbol) || symbol === "-") {
      index += 1;
      continue;
    }

    const matched = allowedSymbols.find((allowed) => value.startsWith(allowed, index));
    if (matched) {
      index += matched.length;
      continue;
    }

    invalid.add(symbol);
    index += 1;
  }

  return [...invalid];
}

function hasContiguousMorphemeCoverage(targetToken: string, morphemes: Array<Pick<Morpheme, "surface">>): boolean {
  const targetKey = normalizedSurfaceKey(targetToken);
  const surfaceKeys = morphemes.map((morpheme) => normalizedSurfaceKey(morpheme.surface));

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

/**
 * Returns target-text tokens that are not covered by one or more
 * contiguous segmentation surfaces. An empty result means the
 * segmentation fully accounts for the passage text.
 */
export function findUncoveredCorpusTargetTokens(
  textTarget: string,
  morphologicalSegmentation: Array<Pick<Morpheme, "surface">>
): string[] {
  return normalizedText(textTarget)
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !hasContiguousMorphemeCoverage(token, morphologicalSegmentation));
}
