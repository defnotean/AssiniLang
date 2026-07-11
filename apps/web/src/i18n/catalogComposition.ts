export function assertUniqueEnglishMessageKeys(catalogs: ReadonlyArray<Readonly<Record<string, string>>>): void {
  const seen = new Set<string>();
  for (const catalog of catalogs) {
    for (const key of Object.keys(catalog)) {
      if (seen.has(key)) {
        throw new Error(`Duplicate English message key across catalog modules: ${key}`);
      }
      seen.add(key);
    }
  }
}
