import type { AppState, ExtractionDraft, Lexeme } from "@assini/db";

/**
 * Read-time grounding flag for an extraction draft. Computed against the
 * accepted lexicon of the draft's language at listing time; never persisted
 * and never blocks accept/reject — purely advisory for reviewers.
 *
 * - `gloss_conflict`: a lexeme draft reuses an accepted form but proposes a
 *   meaningfully different gloss.
 * - `decomposable_form`: a lexeme draft's form is fully covered by a
 *   concatenation of 2–3 accepted lexeme forms, so the model may have
 *   glossed a multi-morpheme word as a single new lexeme.
 * - `segmentation_conflict`: a corpus-passage draft's segmentation glosses a
 *   surface differently from the accepted lexeme with the same form.
 */
export type DraftGroundingFlag = {
  kind: "gloss_conflict" | "decomposable_form" | "segmentation_conflict";
  message: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Greedy longest-prefix segmentation with backtracking: splits `form` into
 * 2..3 segments drawn from `candidateForms` (normalized) covering the whole
 * form. Returns the first (deterministic: longest-prefix-first) full cover,
 * or undefined when none exists.
 */
function decomposeForm(form: string, candidateForms: string[]): string[] | undefined {
  const sortedCandidates = [...new Set(candidateForms)]
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));

  function search(rest: string, segments: string[]): string[] | undefined {
    if (rest.length === 0) {
      return segments.length >= 2 && segments.length <= 3 ? segments : undefined;
    }
    if (segments.length >= 3) return undefined;
    for (const candidate of sortedCandidates) {
      if (rest.startsWith(candidate)) {
        const found = search(rest.slice(candidate.length), [...segments, candidate]);
        if (found) return found;
      }
    }
    return undefined;
  }

  return search(form, []);
}

/**
 * Computes advisory grounding flags for one extraction draft against the
 * accepted lexicon. Pure and deterministic; scoped to the draft's language;
 * conservative — an empty lexicon yields no flags.
 */
export function computeDraftGroundingFlags(draft: ExtractionDraft, state: AppState): DraftGroundingFlag[] {
  const lexicon = state.lexemes.filter((lexeme) => lexeme.languageId === draft.languageId);
  if (lexicon.length === 0) return [];

  const byForm = new Map<string, Lexeme>();
  for (const lexeme of lexicon) {
    const key = normalize(lexeme.form);
    if (key.length > 0 && !byForm.has(key)) {
      byForm.set(key, lexeme);
    }
  }

  const flags: DraftGroundingFlag[] = [];

  if (draft.kind === "lexeme") {
    const form = normalize(draft.payload.form ?? "");
    const gloss = normalize(draft.payload.gloss ?? "");
    if (!form || !gloss) return [];

    const accepted = byForm.get(form);
    if (accepted && normalize(accepted.gloss) !== gloss) {
      flags.push({
        kind: "gloss_conflict",
        message: `Accepted lexeme "${accepted.form}" is glossed "${accepted.gloss}", but this draft glosses it "${draft.payload.gloss?.trim()}".`
      });
    }

    const segments = decomposeForm(form, [...byForm.keys()]);
    if (segments && segments.some((segment) => segment.length >= 3)) {
      const described = segments
        .map((segment) => {
          const lexeme = byForm.get(segment);
          return lexeme ? `${lexeme.form} ("${lexeme.gloss}")` : segment;
        })
        .join(" + ");
      flags.push({
        kind: "decomposable_form",
        message: `Form decomposes into accepted lexemes ${described}; the draft gloss may belong to a different word.`
      });
    }

    return flags;
  }

  if (draft.kind === "corpus_passage") {
    const seenSurfaces = new Set<string>();
    for (const morpheme of draft.payload.morphologicalSegmentation) {
      const surface = normalize(morpheme.surface);
      if (!surface || seenSurfaces.has(surface)) continue;
      seenSurfaces.add(surface);
      const accepted = byForm.get(surface);
      if (accepted && normalize(accepted.gloss) !== normalize(morpheme.gloss)) {
        flags.push({
          kind: "segmentation_conflict",
          message: `Segment "${morpheme.surface}" is glossed "${morpheme.gloss}" in this draft, but the accepted lexeme "${accepted.form}" is glossed "${accepted.gloss}".`
        });
      }
    }
    return flags;
  }

  return flags;
}
