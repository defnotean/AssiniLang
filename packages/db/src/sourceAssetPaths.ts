import { isAbsolute, relative, resolve } from "node:path";
import { sourceAssetFilePathIssue, unsafeSourceAssetPathMessage } from "./sourceAssetPathValidation.js";

export function resolveSourceAssetFilePath(dataDir: string, filePath: string, languageId: string): string {
  const issue = sourceAssetFilePathIssue(filePath, languageId);
  if (issue) {
    throw new Error(`Unsafe source asset file path: ${issue}`);
  }

  const baseDir = resolve(dataDir, "assets", languageId);
  const absolutePath = resolve(dataDir, filePath);
  const relativeToBase = relative(baseDir, absolutePath);
  if (relativeToBase.length === 0 || relativeToBase.startsWith("..") || isAbsolute(relativeToBase)) {
    throw new Error(`Unsafe source asset file path: ${unsafeSourceAssetPathMessage(languageId)}`);
  }

  return absolutePath;
}
