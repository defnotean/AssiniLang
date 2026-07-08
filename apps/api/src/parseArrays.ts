export function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  return values.every((item) => item.length > 0) ? values : undefined;
}
