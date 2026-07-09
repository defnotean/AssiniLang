import type { Language, LanguagePhonology } from "@assini/db";

export type PhonologyInventoryKind = "consonants" | "vowels";

export type PhonologyInventoryDraft = {
  consonants: string[];
  vowels: string[];
};

export type PhonologyInventoryValidation =
  | { ok: true; symbol: string }
  | { ok: false; reason: "blank" | "duplicate" | "whitespace" };

/** Normalize a typed inventory symbol the same way the API trims payloads. */
export function normalizeInventorySymbol(raw: string): string {
  return raw.trim();
}

/**
 * Validate a candidate symbol before adding it to consonants or vowels.
 * Rejects blanks, internal whitespace, and case-sensitive duplicates in the
 * target list (API allows any non-empty trimmed string; this keeps the UI tidy).
 */
export function validateInventorySymbol(
  raw: string,
  existing: readonly string[]
): PhonologyInventoryValidation {
  const symbol = normalizeInventorySymbol(raw);
  if (!symbol) {
    return { ok: false, reason: "blank" };
  }
  if (/\s/.test(symbol)) {
    return { ok: false, reason: "whitespace" };
  }
  if (existing.includes(symbol)) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, symbol };
}

export function draftFromLanguage(language: Pick<Language, "phonology"> | null | undefined): PhonologyInventoryDraft {
  const phonology = language?.phonology;
  return {
    consonants: phonology?.consonants ? [...phonology.consonants] : [],
    vowels: phonology?.vowels ? [...phonology.vowels] : []
  };
}

export function inventoriesEqual(a: PhonologyInventoryDraft, b: PhonologyInventoryDraft): boolean {
  return (
    a.consonants.length === b.consonants.length
    && a.vowels.length === b.vowels.length
    && a.consonants.every((symbol, index) => symbol === b.consonants[index])
    && a.vowels.every((symbol, index) => symbol === b.vowels[index])
  );
}

/** Build a PATCH phonology payload that preserves non-inventory fields. */
export function buildPhonologyPatch(
  language: Pick<Language, "phonology">,
  draft: PhonologyInventoryDraft
): LanguagePhonology {
  const current = language.phonology;
  return {
    consonants: [...draft.consonants],
    vowels: [...draft.vowels],
    ...(current?.syllableTemplate ? { syllableTemplate: current.syllableTemplate } : {}),
    ...(current?.stress ? { stress: current.stress } : {}),
    notes: current?.notes ? [...current.notes] : []
  };
}

export function hasDeclaredInventory(draft: PhonologyInventoryDraft): boolean {
  return draft.consonants.length > 0 || draft.vowels.length > 0;
}
