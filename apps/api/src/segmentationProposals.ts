import type { Lexeme, Morpheme } from "@assini/db";

export type LexemeSegmentationHint = Pick<Lexeme, "form" | "gloss" | "partOfSpeech" | "tags">;

type KnownForm = LexemeSegmentationHint & { key: string };

function normalizeSegmentationKey(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "");
}

function normalizeTargetText(textTarget: string): string {
  return textTarget.trim().replace(/\s+/g, " ");
}

function lexemeFeatures(lexeme: LexemeSegmentationHint): string[] {
  if (lexeme.tags.length > 0) return [...lexeme.tags];
  const partOfSpeech = lexeme.partOfSpeech?.trim();
  if (partOfSpeech && partOfSpeech !== "unknown") return [partOfSpeech];
  return [];
}

function unanalyzedMorpheme(surface: string): Morpheme {
  return {
    surface,
    lemma: surface,
    gloss: "unanalyzed",
    features: ["unanalyzed"]
  };
}

function matchedMorpheme(surface: string, lexeme: LexemeSegmentationHint): Morpheme {
  return {
    surface,
    lemma: lexeme.form.trim(),
    gloss: lexeme.gloss.trim(),
    features: lexemeFeatures(lexeme)
  };
}

function buildKnownForms(lexemes: LexemeSegmentationHint[]): KnownForm[] {
  const seen = new Set<string>();
  const forms: KnownForm[] = [];

  for (const lexeme of lexemes) {
    const form = lexeme.form.trim();
    const key = normalizeSegmentationKey(form);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    forms.push({ ...lexeme, form, key });
  }

  return forms.sort((left, right) =>
    right.key.length - left.key.length || left.key.localeCompare(right.key)
  );
}

/**
 * Matches a normalized lexeme key at `start` in `token`, skipping hyphens in
 * the token while comparing. Returns the exclusive end index in `token`.
 */
function matchFormAt(token: string, start: number, formKey: string): number | undefined {
  let tokenIndex = start;
  let keyIndex = 0;

  while (keyIndex < formKey.length) {
    if (tokenIndex >= token.length) return undefined;
    const tokenChar = token[tokenIndex]!;
    if (tokenChar === "-") {
      tokenIndex += 1;
      continue;
    }
    if (tokenChar.toLowerCase() !== formKey[keyIndex]!) return undefined;
    tokenIndex += 1;
    keyIndex += 1;
  }

  return tokenIndex;
}

function segmentToken(token: string, knownForms: KnownForm[]): Morpheme[] {
  if (token.length === 0) return [];

  const morphemes: Morpheme[] = [];
  let position = 0;
  let pendingUnanalyzed = "";

  const flushUnanalyzed = () => {
    if (pendingUnanalyzed.length === 0) return;
    morphemes.push(unanalyzedMorpheme(pendingUnanalyzed));
    pendingUnanalyzed = "";
  };

  while (position < token.length) {
    let matched: { form: KnownForm; end: number } | undefined;

    for (const form of knownForms) {
      const end = matchFormAt(token, position, form.key);
      if (end !== undefined) {
        matched = { form, end };
        break;
      }
    }

    if (matched) {
      flushUnanalyzed();
      morphemes.push(matchedMorpheme(token.slice(position, matched.end), matched.form));
      position = matched.end;
      continue;
    }

    pendingUnanalyzed += token[position]!;
    position += 1;
  }

  flushUnanalyzed();
  return morphemes;
}

/**
 * Returns true when segmentation is absent or every morpheme is an honest
 * token-level fallback with gloss "unanalyzed".
 */
export function isSegmentationEmptyOrAllUnanalyzed(
  morphologicalSegmentation: Array<Pick<Morpheme, "gloss">>
): boolean {
  if (morphologicalSegmentation.length === 0) return true;
  return morphologicalSegmentation.every((morpheme) =>
    morpheme.gloss.trim().toLowerCase() === "unanalyzed"
  );
}

/**
 * Greedy longest-match segmentation of `textTarget` against known lexeme forms.
 * Whitespace separates tokens; hyphens inside a token are boundary markers.
 * Unmatched spans become `unanalyzed` morphemes.
 */
export function proposeLexiconSegmentation(
  textTarget: string,
  lexemes: LexemeSegmentationHint[]
): Morpheme[] {
  const knownForms = buildKnownForms(lexemes);
  if (knownForms.length === 0) return [];

  const tokens = normalizeTargetText(textTarget).split(/\s+/).filter((token) => token.length > 0);
  return tokens.flatMap((token) => segmentToken(token, knownForms));
}

/**
 * Keeps a usable proposed segmentation unless it is empty or entirely
 * unanalyzed, in which case lexicon-based segmentation is attempted.
 */
export function enrichSegmentationFromLexicon(
  textTarget: string,
  proposed: Morpheme[],
  lexemes: LexemeSegmentationHint[]
): Morpheme[] {
  const usable = proposed.filter((morpheme) =>
    morpheme.surface.trim().length > 0
    && morpheme.lemma.trim().length > 0
    && morpheme.gloss.trim().length > 0
  );

  if (!isSegmentationEmptyOrAllUnanalyzed(usable)) {
    return usable;
  }

  if (lexemes.length === 0) {
    return usable;
  }

  return proposeLexiconSegmentation(textTarget, lexemes);
}
