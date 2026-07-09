function unsafeSourceAssetPathMessage(languageId: string): string {
  return `Source asset filePath must stay under assets/${languageId}/`;
}

function pathHasUnsafeControlChars(pathValue: string): boolean {
  // Reject NUL and other C0 controls / DEL so persisted paths cannot truncate
  // or confuse OS APIs (Node and Windows both treat `\0` specially).
  return /[\u0000-\u001f\u007f]/.test(pathValue);
}

export function sourceAssetFilePathIssue(filePath: string, languageId: string): string | undefined {
  const trimmed = filePath.trim();
  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/");

  if (
    trimmed.length === 0
    || trimmed !== filePath
    || normalized !== trimmed
    || pathHasUnsafeControlChars(filePath)
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
