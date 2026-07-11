import { z } from "zod";
import { sourceAssetSchema } from "./publicModels.js";

const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
const resourceUriSchema = nonEmptyTrimmedStringSchema.max(4096);

export const obsidianMcpSettingsSchema = z.object({
  endpointUrl: z.string(),
  tokenConfigured: z.boolean(),
  timeoutMs: z.number().int().positive()
});

export const obsidianMcpSettingsPatchSchema = z
  .object({
    endpointUrl: z.string().trim().max(2048).optional(),
    token: z.string().trim().min(1).max(4096).optional(),
    clearToken: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.token !== undefined && value.clearToken) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "token and clearToken cannot be supplied together",
        path: ["clearToken"]
      });
    }
  });

export const obsidianMcpConnectionStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  serverName: z.string().optional(),
  serverVersion: z.string().optional(),
  resourceCount: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  detail: z.string().optional()
});

export const obsidianMcpResourceSchema = z.object({
  uri: resourceUriSchema,
  name: nonEmptyTrimmedStringSchema,
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  lastModified: z.string().optional()
});

export const obsidianMcpResourceListSchema = z.object({
  resources: z.array(obsidianMcpResourceSchema),
  nextCursor: z.string().optional(),
  serverName: z.string().optional()
});

export const obsidianMcpResourceListQuerySchema = z
  .object({
    cursor: nonEmptyTrimmedStringSchema.max(4096).optional()
  })
  .strict();

export const obsidianMcpImportPayloadSchema = z
  .object({
    uris: z.array(resourceUriSchema).min(1).max(50)
  })
  .strict()
  .transform((data) => ({
    uris: [...new Set(data.uris)]
  }));

export const obsidianMcpImportResponseSchema = z.object({
  imported: z.array(sourceAssetSchema),
  skipped: z.array(
    z.object({
      uri: z.string(),
      reason: z.string()
    })
  ),
  summary: z.object({
    requested: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative()
  })
});

export type ObsidianMcpSettings = z.infer<typeof obsidianMcpSettingsSchema>;
export type ObsidianMcpSettingsPatch = z.infer<typeof obsidianMcpSettingsPatchSchema>;
export type ObsidianMcpConnectionStatus = z.infer<typeof obsidianMcpConnectionStatusSchema>;
export type ObsidianMcpResource = z.infer<typeof obsidianMcpResourceSchema>;
export type ObsidianMcpResourceList = z.infer<typeof obsidianMcpResourceListSchema>;
export type ObsidianMcpResourceListQuery = z.infer<typeof obsidianMcpResourceListQuerySchema>;
export type ObsidianMcpImportPayload = z.infer<typeof obsidianMcpImportPayloadSchema>;
export type ObsidianMcpImportResponse = z.infer<typeof obsidianMcpImportResponseSchema>;
