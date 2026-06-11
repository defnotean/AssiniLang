import { languageTypologySchema, type Language, type SourceAssetKind } from "@assini/db";

export type PrototypeSessionBody = {
  userId: string;
};

export type LanguageCreateBody = {
  name: string;
  description: string;
  orthography: string;
  typology: Language["typology"];
  phonology?: Language["phonology"];
};

export type LanguagePatchBody = Partial<LanguageCreateBody>;

export type SourceRegistrationBody = {
  kind: Extract<SourceAssetKind, "text" | "wordlist" | "url">;
  title: string;
  rawText?: string;
  url?: string;
};

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  return values.every((item) => item.length > 0) ? values : undefined;
}

function parseLanguagePhonology(value: unknown): Language["phonology"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const consonants = parseStringArray(record.consonants);
  const vowels = parseStringArray(record.vowels);
  const notes = parseStringArray(record.notes);
  if (!consonants || !vowels || !notes) return undefined;
  const syllableTemplate = typeof record.syllableTemplate === "string" ? record.syllableTemplate.trim() : undefined;
  const stress = typeof record.stress === "string" ? record.stress.trim() : undefined;
  return {
    consonants,
    vowels,
    notes,
    syllableTemplate: syllableTemplate || undefined,
    stress: stress || undefined
  };
}

export function parsePrototypeSessionBody(input: unknown): PrototypeSessionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.userId !== "string") {
    return undefined;
  }

  const userId = body.userId.trim();
  return userId.length > 0 ? { userId } : undefined;
}

export function parseLanguageCreateBody(input: unknown): LanguageCreateBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const body = input as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const orthography = typeof body.orthography === "string" ? body.orthography.trim() : "";
  const typologyResult = languageTypologySchema.safeParse(body.typology ?? "unknown");
  const phonologyProvided = body.phonology !== undefined && body.phonology !== null;
  const phonology = parseLanguagePhonology(body.phonology);

  if (!name || !description || !orthography || !typologyResult.success) return undefined;
  if (phonologyProvided && !phonology) return undefined;

  return { name, description, orthography, typology: typologyResult.data, phonology };
}

export function parseLanguagePatchBody(input: unknown): LanguagePatchBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const body = input as Record<string, unknown>;
  const patch: LanguagePatchBody = {};
  let hasField = false;

  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) return undefined;
    patch.name = body.name.trim();
    hasField = true;
  }
  if ("description" in body) {
    if (typeof body.description !== "string" || body.description.trim().length === 0) return undefined;
    patch.description = body.description.trim();
    hasField = true;
  }
  if ("orthography" in body) {
    if (typeof body.orthography !== "string" || body.orthography.trim().length === 0) return undefined;
    patch.orthography = body.orthography.trim();
    hasField = true;
  }
  if ("typology" in body) {
    const typologyResult = languageTypologySchema.safeParse(body.typology);
    if (!typologyResult.success) return undefined;
    patch.typology = typologyResult.data;
    hasField = true;
  }
  if ("phonology" in body) {
    const phonology = parseLanguagePhonology(body.phonology);
    if (body.phonology !== null && body.phonology !== undefined && !phonology) return undefined;
    patch.phonology = phonology;
    hasField = true;
  }

  return hasField ? patch : undefined;
}

export function parseSourceRegistrationBody(input: unknown): SourceRegistrationBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const body = input as Record<string, unknown>;
  const kind = body.kind === "text" || body.kind === "wordlist" || body.kind === "url" ? body.kind : undefined;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const rawText = typeof body.rawText === "string" ? body.rawText : undefined;
  const url = typeof body.url === "string" ? body.url.trim() : undefined;

  if (!kind || !title) return undefined;
  if (kind === "url") {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    } catch {
      return undefined;
    }
    return { kind, title, url };
  }

  if (rawText === undefined || rawText.trim().length === 0) return undefined;
  return { kind, title, rawText };
}
