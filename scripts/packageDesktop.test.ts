import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertRuntimeManifestsMatchLock,
  createDesktopChecksumManifest,
  createDesktopRuntimeMetadata,
  formatSha256Manifest,
  publishStagedDirectory,
  sha256File
} from "./lib/desktopPackageIntegrity.mjs";
import { createIExpressSed, setupExtractorPowerShell } from "./lib/desktopSetup.mjs";

function runtimeLockFixture(reversePackageOrder = false) {
  const packages = {
    "": {
      name: "fixture-root",
      version: "1.0.0",
      dependencies: {
        zeta: "^2.0.0",
        alpha: "^1.0.0"
      }
    },
    "packages/db": {
      name: "@assini/db",
      version: "1.0.0",
      dependencies: {
        gamma: "^3.0.0",
        "better-sqlite3": "^12.0.0"
      }
    },
    "node_modules/alpha": {
      version: "1.2.3",
      dependencies: { shared: "^1.0.0" }
    },
    "node_modules/better-sqlite3": { version: "12.10.0" },
    "node_modules/gamma": { version: "3.4.5" },
    "node_modules/shared": { version: "1.0.1" },
    "node_modules/unrelated-dev-package": { version: "9.0.0", dev: true },
    "node_modules/zeta": { version: "2.1.0" }
  };

  return {
    name: "fixture-root",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: reversePackageOrder ? Object.fromEntries(Object.entries(packages).reverse()) : packages
  };
}

describe("desktop package helper scripts", () => {
  it("generates a top-level launcher that opens the packaged app", async () => {
    const { outputRootLauncherScript } = await import("./packageDesktop.mjs");
    const script = outputRootLauncherScript();

    expect(script).toContain("AssiniLang-win32-x64\\AssiniLang.exe");
    expect(script).toContain("start \"\" \"%APP_EXE%\"");
    expect(script).toContain("Run npm.cmd run desktop:package first.");
  });

  it("generates an in-package launcher for extracted zip users", async () => {
    const { packageRootLauncherScript } = await import("./packageDesktop.mjs");
    const script = packageRootLauncherScript();

    expect(script).toContain("AssiniLang.exe");
    expect(script).toContain("start \"\" \"%APP_EXE%\"");
    expect(script).toContain("was not found next to this launcher");
  });

  it("generates a top-level installer handoff to the package installer", async () => {
    const { outputRootInstallScript } = await import("./packageDesktop.mjs");
    const script = outputRootInstallScript();

    expect(script).toContain("AssiniLang-win32-x64\\Install AssiniLang.cmd");
    expect(script).toContain("call \"%INSTALLER%\"");
    expect(script).toContain("Run npm.cmd run desktop:package first.");
  });

  it("explains the output folder click targets", async () => {
    const { outputRootReadme } = await import("./packageDesktop.mjs");
    const readme = outputRootReadme();

    expect(readme).toContain("Open AssiniLang.cmd");
    expect(readme).toContain("Install AssiniLang.cmd");
    expect(readme).toContain("AssiniLang-win32-x64.zip");
    expect(readme).toContain("AssiniLang-Setup-x64.exe");
    expect(readme).toContain("SHA256SUMS.txt");
    expect(readme).toContain("Windows x64");
    expect(readme).toContain("may not be byte-reproducible");
  });
});

describe("desktop package release integrity", () => {
  it("creates canonical exact runtime metadata from the lockfile closure", () => {
    const first = createDesktopRuntimeMetadata(runtimeLockFixture(), {
      runtimePackagePaths: ["packages/db", ""],
      version: "1.0.0"
    });
    const second = createDesktopRuntimeMetadata(runtimeLockFixture(true), {
      runtimePackagePaths: ["", "packages/db"],
      version: "1.0.0"
    });

    expect(first.packageJsonText).toBe(second.packageJsonText);
    expect(first.packageLockText).toBe(second.packageLockText);
    expect(first.packageJson.dependencies).toEqual({
      alpha: "1.2.3",
      gamma: "3.4.5",
      zeta: "2.1.0"
    });
    expect(Object.keys(first.packageLock.packages)).toEqual([
      "",
      "node_modules/alpha",
      "node_modules/gamma",
      "node_modules/shared",
      "node_modules/zeta"
    ]);
    expect(first.packageLockText).not.toContain("better-sqlite3");
    expect(first.packageLockText).not.toContain("unrelated-dev-package");
  });

  it("rejects source dependency manifests that have drifted from the lockfile", () => {
    const lockfile = runtimeLockFixture();
    const currentManifests = {
      "": lockfile.packages[""],
      "packages/db": lockfile.packages["packages/db"]
    };

    expect(() => assertRuntimeManifestsMatchLock(lockfile, currentManifests)).not.toThrow();
    expect(() =>
      assertRuntimeManifestsMatchLock(lockfile, {
        ...currentManifests,
        "packages/db": {
          ...currentManifests["packages/db"],
          dependencies: { gamma: "^4.0.0", "better-sqlite3": "^12.0.0" }
        }
      })
    ).toThrow(/does not match package-lock\.json/);
  });

  it("hashes files and formats checksum entries in stable path order", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "assini-checksum-"));
    try {
      const artifactPath = join(temporaryRoot, "artifact.bin");
      await writeFile(artifactPath, "abc", "utf8");
      const artifactSha256 = await sha256File(artifactPath);

      expect(artifactSha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      expect(
        formatSha256Manifest([
          { path: "release.zip", sha256: "F".repeat(64) },
          { path: "folder\\artifact.bin", sha256: artifactSha256 }
        ])
      ).toBe(`${artifactSha256}  folder/artifact.bin\n${"f".repeat(64)}  release.zip\n`);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("includes the setup executable in the release checksum manifest", async () => {
    const releaseRoot = join(tmpdir(), "assini-release-checksum");
    const paths = {
      archivePath: join(releaseRoot, "AssiniLang-win32-x64.zip"),
      executablePath: join(releaseRoot, "AssiniLang-win32-x64", "AssiniLang.exe"),
      outputRoot: releaseRoot,
      setupPath: join(releaseRoot, "AssiniLang-Setup-x64.exe")
    };
    const hashes = new Map([
      [paths.archivePath, "a".repeat(64)],
      [paths.executablePath, "b".repeat(64)],
      [paths.setupPath, "c".repeat(64)]
    ]);

    const manifest = await createDesktopChecksumManifest(paths, {
      hashFile: async (filePath: string) => hashes.get(filePath) ?? ""
    });

    expect(manifest).toContain(`${"c".repeat(64)}  AssiniLang-Setup-x64.exe`);
    expect(manifest).toContain(`${"a".repeat(64)}  AssiniLang-win32-x64.zip`);
    expect(manifest).toContain(`${"b".repeat(64)}  AssiniLang-win32-x64/AssiniLang.exe`);
  });

  it("publishes a completed sibling directory over an existing release", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "assini-publish-"));
    const stagedPath = join(temporaryRoot, "dist-desktop-next");
    const targetPath = join(temporaryRoot, "dist-desktop");
    try {
      await mkdir(stagedPath);
      await mkdir(targetPath);
      await writeFile(join(stagedPath, "marker.txt"), "new", "utf8");
      await writeFile(join(targetPath, "marker.txt"), "old", "utf8");

      await publishStagedDirectory(stagedPath, targetPath);

      await expect(readFile(join(targetPath, "marker.txt"), "utf8")).resolves.toBe("new");
      await expect(access(stagedPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe("IExpress setup helpers", () => {
  const sedOptions = {
    launcherFileName: "AssiniLangSetup.ps1",
    payloadFileNames: ["AssiniLangSetup.ps1", "AssiniLang-win32-x64.zip"],
    sourceDirectory: "C:\\Release Build\\Payload Files",
    targetPath: "C:\\Release Build\\AssiniLang-Setup-x64.exe"
  };

  it("quotes paths and emits payloads in deterministic ordinal order", () => {
    const first = createIExpressSed(sedOptions);
    const second = createIExpressSed({
      ...sedOptions,
      payloadFileNames: [...sedOptions.payloadFileNames].reverse()
    });

    expect(first).toBe(second);
    expect(first).toContain('TargetName="C:\\Release Build\\AssiniLang-Setup-x64.exe"');
    expect(first).toContain('SourceFiles0="C:\\Release Build\\Payload Files"');
    expect(first).toContain('AppLaunched=powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "AssiniLangSetup.ps1"');
    expect(first.indexOf('FILE0="AssiniLang-win32-x64.zip"')).toBeLessThan(
      first.indexOf('FILE1="AssiniLangSetup.ps1"')
    );
    expect(first).toContain("%FILE0%=\r\n%FILE1%=");
  });

  it("rejects traversal, absolute payload names, and unsafe SED paths", () => {
    expect(() =>
      createIExpressSed({ ...sedOptions, payloadFileNames: ["..\\escape.ps1", "AssiniLangSetup.ps1"] })
    ).toThrow(/conservative Windows file name/);
    expect(() =>
      createIExpressSed({ ...sedOptions, payloadFileNames: ["C:\\escape.ps1", "AssiniLangSetup.ps1"] })
    ).toThrow(/conservative Windows file name/);
    expect(() => createIExpressSed({ ...sedOptions, targetPath: "relative\\setup.exe" })).toThrow(
      /safe absolute Windows path/
    );
  });

  it("generates an ordinal, traversal-safe extractor for the packaged installer", () => {
    const script = setupExtractorPowerShell({
      archiveName: "AssiniLang-win32-x64.zip",
      packageDirectoryName: "AssiniLang-win32-x64"
    });

    expect(script).toContain("$entries.Sort($comparison)");
    expect(script).toContain("[System.IO.Path]::GetFullPath");
    expect(script).toContain("[System.IO.Path]::IsPathRooted");
    expect(script).toContain("escapes the setup directory");
    expect(script).toContain("[System.IO.FileMode]::CreateNew");
    expect(script).toContain("AssiniLang-win32-x64\\Install AssiniLang.ps1");
  });
});
