import { z } from "zod";

export const LLM_PROVIDERS = [
  "deterministic",
  "off",
  "mock",
  "openai-compatible",
  "local",
  "ollama",
  "lm-studio",
  "openai",
  "remote"
] as const;

export type LlmProviderName = typeof LLM_PROVIDERS[number];

export const llmProviderModeSchema = z.enum([
  "deterministic",
  "local-openai-compatible",
  "remote-api",
  "invalid"
]);

export const llmStatusSchema = z.object({
  provider: z.string(),
  mode: llmProviderModeSchema,
  configured: z.boolean(),
  activeProviderName: z.string(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  timeoutMs: z.number(),
  apiKey: z.object({
    required: z.boolean(),
    configured: z.boolean(),
    acceptedVariables: z.array(z.string())
  }),
  environment: z.object({
    providerVariable: z.string(),
    baseUrlVariable: z.string(),
    modelVariable: z.string(),
    apiKeyVariables: z.array(z.string()),
    timeoutVariable: z.string()
  }),
  transcription: z.object({
    configured: z.boolean(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    baseUrlVariable: z.string(),
    modelVariable: z.string()
  }),
  ocr: z.object({
    configured: z.boolean(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    baseUrlVariable: z.string(),
    modelVariable: z.string()
  }),
  setup: z.object({
    localExamples: z.array(z.string()),
    remoteExamples: z.array(z.string())
  }),
  warnings: z.array(z.string())
});

export type LlmStatus = z.infer<typeof llmStatusSchema>;
export type LlmProviderReadiness = LlmStatus;

export const llmReachabilitySchema = z.object({
  reachable: z.boolean(),
  checked: z.boolean(),
  mode: z.string(),
  status: z.number().optional(),
  detail: z.string().optional(),
  latencyMs: z.number().optional()
});

export type LlmReachability = z.infer<typeof llmReachabilitySchema>;

export const runtimeSettingsSchema = z.object({
  provider: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  apiKeyConfigured: z.boolean(),
  timeoutMs: z.number(),
  maxTokens: z.number(),
  jsonMode: z.boolean(),
  transcriptionBaseUrl: z.string(),
  transcriptionModel: z.string(),
  transcriptionApiKeyConfigured: z.boolean(),
  ocrBaseUrl: z.string(),
  ocrModel: z.string(),
  ocrApiKeyConfigured: z.boolean(),
  ocrLang: z.string(),
  allowPrivateUrls: z.boolean()
});

export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

export const runtimeSettingsPatchSchema = z.object({
  provider: z.enum(LLM_PROVIDERS).optional(),
  baseUrl: z.string().trim().max(2048).optional(),
  model: z.string().trim().max(256).optional(),
  apiKey: z.string().max(4096).optional(),
  clearApiKey: z.boolean().optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
  jsonMode: z.boolean().optional(),
  transcriptionBaseUrl: z.string().trim().max(2048).optional(),
  transcriptionModel: z.string().trim().max(256).optional(),
  transcriptionApiKey: z.string().max(4096).optional(),
  clearTranscriptionApiKey: z.boolean().optional(),
  ocrBaseUrl: z.string().trim().max(2048).optional(),
  ocrModel: z.string().trim().max(256).optional(),
  ocrApiKey: z.string().max(4096).optional(),
  clearOcrApiKey: z.boolean().optional(),
  ocrLang: z.string().trim().min(1).max(32).optional(),
  allowPrivateUrls: z.boolean().optional()
}).strict();

export type RuntimeSettingsPatch = z.infer<typeof runtimeSettingsPatchSchema>;

export const llmModelProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(LLM_PROVIDERS),
  baseUrl: z.string(),
  model: z.string(),
  apiKeyConfigured: z.boolean(),
  timeoutMs: z.number(),
  maxTokens: z.number(),
  jsonMode: z.boolean(),
  transcriptionBaseUrl: z.string(),
  transcriptionModel: z.string(),
  transcriptionApiKeyConfigured: z.boolean(),
  ocrBaseUrl: z.string(),
  ocrModel: z.string(),
  ocrApiKeyConfigured: z.boolean(),
  ocrLang: z.string(),
  allowPrivateUrls: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type LlmModelProfile = z.infer<typeof llmModelProfileSchema>;

export const modelProfileSavePayloadSchema = runtimeSettingsPatchSchema.extend({
  id: z.string().trim().min(1).max(96).optional(),
  name: z.string().trim().min(1).max(80),
  activate: z.boolean().optional()
}).strict();

export type ModelProfileSavePayload = z.infer<typeof modelProfileSavePayloadSchema>;

export const runtimeSettingsResponseSchema = z.object({
  settings: runtimeSettingsSchema,
  status: llmStatusSchema,
  persisted: z.boolean(),
  profiles: z.array(llmModelProfileSchema).default([]),
  activeProfileId: z.string().min(1).optional()
});

export type RuntimeSettingsResponse = z.infer<typeof runtimeSettingsResponseSchema>;

export const discoveryProviderSchema = z.enum(["openai-compatible", "ollama", "lm-studio", "openai"]);

export const discoveredLlmModelSchema = z.object({
  id: z.string(),
  provider: discoveryProviderSchema,
  providerLabel: z.string(),
  source: z.string(),
  baseUrl: z.string(),
  model: z.string(),
  requiresApiKey: z.boolean()
});

export type DiscoveredLlmModel = z.infer<typeof discoveredLlmModelSchema>;

export const llmModelDiscoveryEndpointSchema = z.object({
  source: z.string(),
  baseUrl: z.string(),
  provider: discoveryProviderSchema,
  providerLabel: z.string(),
  connected: z.boolean(),
  modelCount: z.number(),
  status: z.number().optional(),
  detail: z.string().optional()
});

export const llmModelDiscoveryErrorSchema = z.object({
  source: z.string(),
  baseUrl: z.string(),
  detail: z.string()
});

export type LlmModelDiscoveryEndpoint = z.infer<typeof llmModelDiscoveryEndpointSchema>;
export type LlmModelDiscoveryError = z.infer<typeof llmModelDiscoveryErrorSchema>;

export const llmModelDiscoveryResponseSchema = z.object({
  scannedAt: z.string(),
  models: z.array(discoveredLlmModelSchema),
  endpoints: z.array(llmModelDiscoveryEndpointSchema),
  errors: z.array(llmModelDiscoveryErrorSchema)
});

export type LlmModelDiscoveryResponse = z.infer<typeof llmModelDiscoveryResponseSchema>;

export const LLM_PROVIDER_OPTIONS: Array<{ value: LlmProviderName; label: string }> = [
  { value: "deterministic", label: "Deterministic" },
  { value: "off", label: "Off" },
  { value: "mock", label: "Mock" },
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "local", label: "Local" },
  { value: "ollama", label: "Ollama" },
  { value: "lm-studio", label: "LM Studio" },
  { value: "openai", label: "Remote OpenAI" },
  { value: "remote", label: "Remote" }
];
