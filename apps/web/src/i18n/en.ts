// English message catalog. This remains the public source of truth for MessageKey.
// Values live in bounded domain fragments and must remain exact UI compatibility strings.
import { assertUniqueEnglishMessageKeys } from "./catalogComposition";
import { enFoundation } from "./enFoundation";
import { enModel } from "./enModel";
import { enWorkflows } from "./enWorkflows";

assertUniqueEnglishMessageKeys([enFoundation, enWorkflows, enModel]);

export const en = {
  ...enFoundation,
  ...enWorkflows,
  ...enModel
} as const;

export type MessageKey = keyof typeof en;
