function unsafeSourceAssetPathMessage(languageId: string): string {
  return `Source asset filePath must stay under assets/${languageId}/`;
}

export function sourceAssetFilePathIssue(filePath: string, languageId: string): string | undefined {
  const trimmed = filePath.trim();
  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/");

  if (
    trimmed.length === 0
    || trimmed !== filePath
    || normalized !== trimmed
    || normalized.startsWith("/")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)
    || parts.length < 3
    || parts.some((part) => part.length === 0 || part === "." || part === ".." || part.includes(":"))
    || parts[0] !== "assets"
    || parts[1] !== languageId
  ) {
    return unsafeSourceAssetPathMessage(languageId);
  }

  return undefined;
}

export { unsafeSourceAssetPathMessage };
