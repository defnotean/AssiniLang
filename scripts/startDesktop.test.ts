import { mkdtemp, mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

async function touch(path: string, timestampMs: number) {
  const date = new Date(timestampMs);
  await utimes(path, date, date);
}

async function createBuildFixture() {
  const root = await mkdtemp(join(tmpdir(), "assini-desktop-build-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });
  const source = join(root, "src", "index.ts");
  const output = join(root, "dist", "index.js");
  await writeFile(source, "export const value = 1;\n", "utf8");
  await writeFile(output, "export const value = 1;\n", "utf8");
  return { output, root, source };
}

describe("desktop smart launcher build status", () => {
  it("requires a build when an output is missing", async () => {
    const { desktopBuildStatus } = await import("./startDesktop.mjs");
    const root = await mkdtemp(join(tmpdir(), "assini-desktop-missing-"));

    const status = await desktopBuildStatus({
      outputs: ["dist/index.js"],
      root,
      sources: []
    });

    expect(status.needsBuild).toBe(true);
    expect(status.reason).toMatch(/missing 1 build output/);
  });

  it("skips the build when outputs are newer than sources", async () => {
    const { desktopBuildStatus } = await import("./startDesktop.mjs");
    const { root, source, output } = await createBuildFixture();
    await touch(source, 1_700_000_000_000);
    await touch(output, 1_700_000_100_000);

    const status = await desktopBuildStatus({
      outputs: ["dist/index.js"],
      root,
      sources: ["src"]
    });

    expect(status.needsBuild).toBe(false);
    expect(status.reason).toBe("existing build is current");
  });

  it("requires a build when sources are newer than outputs", async () => {
    const { desktopBuildStatus } = await import("./startDesktop.mjs");
    const { root, source, output } = await createBuildFixture();
    await touch(output, 1_700_000_000_000);
    await touch(source, 1_700_000_100_000);

    const status = await desktopBuildStatus({
      outputs: ["dist/index.js"],
      root,
      sources: ["src"]
    });

    expect(status.needsBuild).toBe(true);
    expect(status.reason).toBe("source files changed since the last build");
  });
});
