import type { DiscoveredLlmModel } from "../api";

export function compactMiddle(value: string, maxLength = 96): string {
  if (value.length <= maxLength) return value;
  const sideLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, sideLength)}...${value.slice(value.length - sideLength)}`;
}

export function modelDisplayName(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;

  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.at(-1) ?? trimmed;
  const repoSegment = parts.find((part) => part.startsWith("models--"));
  if (repoSegment) {
    const repoName = repoSegment.replace(/^models--/, "").replace(/--/g, "/");
    return compactMiddle(`${repoName} / ${fileName}`);
  }

  if (parts.length > 1) {
    return compactMiddle(fileName);
  }

  return compactMiddle(trimmed);
}

export function discoveredModelLabel(candidate: Pick<DiscoveredLlmModel, "model" | "providerLabel">): string {
  return `${compactMiddle(modelDisplayName(candidate.model), 52)} | ${candidate.providerLabel}`;
}

export function normalizeModelBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function sameModelBaseUrl(left: string, right: string): boolean {
  return normalizeModelBaseUrl(left) === normalizeModelBaseUrl(right);
}
