import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

type ApiProxyEnv = Partial<Record<"ASSINI_API_HOST" | "ASSINI_API_PORT", string>>;

export function resolveApiProxyTarget(env: ApiProxyEnv = process.env): string {
  const host = readString(env.ASSINI_API_HOST, "127.0.0.1");
  const port = readString(env.ASSINI_API_PORT, "4321");
  return `http://${host}:${port}`;
}

function apiProxy() {
  return {
    target: resolveApiProxyTarget(),
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, "")
  };
}

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@assini/api-contract/llm": `${repoRoot}/packages/api-contract/src/llmContract.ts`,
      "@assini/api-contract/sourceProcessingErrors": `${repoRoot}/packages/api-contract/src/sourceProcessingErrors.ts`,
      "@assini/db/schema": `${repoRoot}/packages/db/src/schema.ts`
    }
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"]
  },
  server: {
    proxy: {
      "/api": apiProxy()
    }
  },
  preview: {
    proxy: {
      "/api": apiProxy()
    }
  }
});
