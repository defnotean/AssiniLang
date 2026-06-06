import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: resolveApiProxyTarget(),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
