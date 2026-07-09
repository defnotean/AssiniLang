import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, rename, rm } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve } from "node:path";

const DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies"];
const OMITTED_DESKTOP_DEPENDENCIES = new Set(["better-sqlite3"]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dependencyMap(value, label) {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function sortedJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, sortedJsonValue(value[key])])
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortedJsonValue(value), null, 2)}\n`;
}

function lockPackages(repositoryLockfile) {
  if (!isRecord(repositoryLockfile)) throw new Error("package-lock.json must contain a JSON object.");
  if (!Number.isInteger(repositoryLockfile.lockfileVersion) || repositoryLockfile.lockfileVersion < 2) {
    throw new Error("Desktop packaging requires package-lock.json lockfileVersion 2 or newer.");
  }
  if (!isRecord(repositoryLockfile.packages)) {
    throw new Error("package-lock.json does not contain a packages map.");
  }
  return repositoryLockfile.packages;
}

function dependencyCandidate(packagePath, dependencyName) {
  return packagePath
    ? posix.join(packagePath, "node_modules", dependencyName)
    : posix.join("node_modules", dependencyName);
}

function resolveLockedDependencyPath(packages, packagePath, dependencyName) {
  let currentPath = packagePath;

  while (true) {
    if (!currentPath || posix.basename(currentPath) !== "node_modules") {
      const candidate = dependencyCandidate(currentPath, dependencyName);
      if (packages[candidate]) return candidate;
    }

    if (!currentPath) return undefined;
    const parentPath = posix.dirname(currentPath);
    currentPath = parentPath === "." ? "" : parentPath;
  }
}

function isDesktopExternalDependency(dependencyName) {
  return !dependencyName.startsWith("@assini/") && !OMITTED_DESKTOP_DEPENDENCIES.has(dependencyName);
}

function addDirectDependencies(entry, requiredNames, optionalNames) {
  for (const dependencyName of Object.keys(dependencyMap(entry.optionalDependencies, "optionalDependencies"))) {
    if (isDesktopExternalDependency(dependencyName) && !requiredNames.has(dependencyName)) {
      optionalNames.add(dependencyName);
    }
  }

  for (const dependencyName of Object.keys(dependencyMap(entry.dependencies, "dependencies"))) {
    if (!isDesktopExternalDependency(dependencyName)) continue;
    requiredNames.add(dependencyName);
    optionalNames.delete(dependencyName);
  }
}

function assertDirectDependenciesAreHoisted(packages, packagePath, entry) {
  for (const field of DEPENDENCY_FIELDS) {
    for (const dependencyName of Object.keys(dependencyMap(entry[field], `${packagePath} ${field}`))) {
      if (!isDesktopExternalDependency(dependencyName)) continue;
      const resolvedPath = resolveLockedDependencyPath(packages, packagePath, dependencyName);
      const rootPath = resolveLockedDependencyPath(packages, "", dependencyName);
      if (!resolvedPath || resolvedPath !== rootPath) {
        throw new Error(
          `Desktop runtime dependency ${dependencyName} from ${packagePath || "the root package"} is not pinned at the lockfile root.`
        );
      }
    }
  }
}

function enqueueDependency(packages, queue, sourcePath, dependencyName, optional) {
  if (dependencyName.startsWith("@assini/")) {
    if (optional) return;
    throw new Error(`Locked runtime package ${sourcePath} depends on unsupported workspace link ${dependencyName}.`);
  }

  if (OMITTED_DESKTOP_DEPENDENCIES.has(dependencyName)) {
    if (optional) return;
    throw new Error(`Locked runtime package ${sourcePath} requires omitted desktop dependency ${dependencyName}.`);
  }

  const dependencyPath = resolveLockedDependencyPath(packages, sourcePath, dependencyName);
  if (!dependencyPath) {
    if (optional) return;
    throw new Error(`package-lock.json cannot resolve ${dependencyName} from ${sourcePath || "the root package"}.`);
  }
  if (!dependencyPath.startsWith("node_modules/")) {
    throw new Error(`Desktop runtime dependency ${dependencyName} is not hoisted into node_modules in package-lock.json.`);
  }

  queue.push(dependencyPath);
}

function collectRuntimePackageEntries(packages, directDependencyNames) {
  const selectedEntries = new Map();
  const queue = [];

  for (const dependencyName of directDependencyNames) {
    enqueueDependency(packages, queue, "", dependencyName, false);
  }

  while (queue.length > 0) {
    queue.sort(compareText);
    const packagePath = queue.shift();
    if (selectedEntries.has(packagePath)) continue;

    const entry = packages[packagePath];
    if (!isRecord(entry) || entry.link) {
      throw new Error(`Desktop runtime entry ${packagePath} is not a locked registry package.`);
    }
    if (entry.dev === true) {
      throw new Error(`Desktop runtime dependency ${packagePath} is marked dev-only in package-lock.json.`);
    }
    if (typeof entry.version !== "string" || entry.version.length === 0) {
      throw new Error(`Desktop runtime entry ${packagePath} does not have an exact locked version.`);
    }

    selectedEntries.set(packagePath, entry);

    const optionalDependencies = dependencyMap(
      entry.optionalDependencies,
      `${packagePath} optionalDependencies`
    );
    const requiredDependencyNames = new Set(
      Object.keys(dependencyMap(entry.dependencies, `${packagePath} dependencies`)).filter(
        (dependencyName) => !(dependencyName in optionalDependencies)
      )
    );
    const optionalDependencyNames = new Set(Object.keys(optionalDependencies));
    const peerDependencies = dependencyMap(entry.peerDependencies, `${packagePath} peerDependencies`);
    const peerDependenciesMeta = dependencyMap(
      entry.peerDependenciesMeta,
      `${packagePath} peerDependenciesMeta`
    );

    for (const dependencyName of Object.keys(peerDependencies)) {
      if (requiredDependencyNames.has(dependencyName) || optionalDependencyNames.has(dependencyName)) continue;
      if (peerDependenciesMeta[dependencyName]?.optional === true) continue;
      requiredDependencyNames.add(dependencyName);
    }

    for (const dependencyName of [...requiredDependencyNames].sort(compareText)) {
      enqueueDependency(packages, queue, packagePath, dependencyName, false);
    }
    for (const dependencyName of [...optionalDependencyNames].sort(compareText)) {
      enqueueDependency(packages, queue, packagePath, dependencyName, true);
    }
  }

  return Object.fromEntries([...selectedEntries].sort(([left], [right]) => compareText(left, right)));
}

function exactRootDependencies(packages, dependencyNames) {
  return Object.fromEntries(
    [...dependencyNames].sort(compareText).map((dependencyName) => {
      const packagePath = resolveLockedDependencyPath(packages, "", dependencyName);
      const entry = packagePath ? packages[packagePath] : undefined;
      if (!entry || typeof entry.version !== "string" || entry.version.length === 0) {
        throw new Error(`package-lock.json does not pin an exact root version for ${dependencyName}.`);
      }
      return [dependencyName, entry.version];
    })
  );
}

export function createDesktopRuntimeMetadata(repositoryLockfile, options) {
  const packages = lockPackages(repositoryLockfile);
  const runtimePackagePaths = [...new Set(options.runtimePackagePaths ?? [])].sort(compareText);
  if (runtimePackagePaths.length === 0) {
    throw new Error("At least one runtime package path is required.");
  }

  const requiredNames = new Set();
  const optionalNames = new Set();
  for (const packagePath of runtimePackagePaths) {
    const entry = packages[packagePath];
    if (!isRecord(entry)) {
      throw new Error(`package-lock.json does not contain runtime package ${packagePath || "<root>"}.`);
    }
    assertDirectDependenciesAreHoisted(packages, packagePath, entry);
    addDirectDependencies(entry, requiredNames, optionalNames);
  }

  const dependencies = exactRootDependencies(packages, requiredNames);
  const optionalDependencies = exactRootDependencies(packages, optionalNames);
  const directDependencyNames = [...requiredNames, ...optionalNames].sort(compareText);
  const runtimeEntries = collectRuntimePackageEntries(packages, directDependencyNames);
  const name = options.name ?? "assini-lang-desktop";
  const version = options.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("A desktop package version is required.");
  }

  const packageJson = {
    name,
    productName: options.productName ?? "AssiniLang",
    version,
    private: true,
    main: options.main ?? "apps/desktop/main.cjs",
    dependencies
  };
  if (Object.keys(optionalDependencies).length > 0) packageJson.optionalDependencies = optionalDependencies;

  const rootLockEntry = { name, version, dependencies };
  if (Object.keys(optionalDependencies).length > 0) {
    rootLockEntry.optionalDependencies = optionalDependencies;
  }

  const packageLock = {
    name,
    version,
    lockfileVersion: repositoryLockfile.lockfileVersion,
    requires: true,
    packages: {
      "": rootLockEntry,
      ...runtimeEntries
    }
  };

  return {
    packageJson,
    packageJsonText: canonicalJson(packageJson),
    packageLock,
    packageLockText: canonicalJson(packageLock)
  };
}

function comparableDependencyMap(value, label) {
  return canonicalJson(dependencyMap(value, label));
}

export function assertRuntimeManifestsMatchLock(repositoryLockfile, runtimeManifests) {
  const packages = lockPackages(repositoryLockfile);

  for (const packagePath of Object.keys(runtimeManifests).sort(compareText)) {
    const manifest = runtimeManifests[packagePath];
    const lockEntry = packages[packagePath];
    const displayPath = packagePath ? `${packagePath}/package.json` : "package.json";
    if (!isRecord(manifest) || !isRecord(lockEntry)) {
      throw new Error(`${displayPath} is not represented in package-lock.json.`);
    }

    for (const field of ["name", "version"]) {
      if (manifest[field] !== lockEntry[field]) {
        throw new Error(`${displayPath} ${field} does not match package-lock.json.`);
      }
    }

    for (const field of DEPENDENCY_FIELDS) {
      const manifestValue = comparableDependencyMap(manifest[field], `${displayPath} ${field}`);
      const lockValue = comparableDependencyMap(lockEntry[field], `package-lock.json ${packagePath} ${field}`);
      if (manifestValue !== lockValue) {
        throw new Error(`${displayPath} ${field} does not match package-lock.json. Refresh the npm lockfile before packaging.`);
      }
    }
  }
}

export function assertInstalledPackageMatchesLock(repositoryLockfile, packageName, installedManifest) {
  const packages = lockPackages(repositoryLockfile);
  const packagePath = posix.join("node_modules", packageName);
  const lockEntry = packages[packagePath];
  const lockedVersion = lockEntry?.version;
  const installedVersion = installedManifest?.version;

  if (typeof lockedVersion !== "string") {
    throw new Error(`package-lock.json does not contain ${packageName}.`);
  }
  if (installedVersion !== lockedVersion) {
    throw new Error(
      `Installed ${packageName} ${installedVersion ?? "<missing>"} does not match package-lock.json ${lockedVersion}. Run npm.cmd ci before packaging.`
    );
  }

  return lockedVersion;
}

function normalizedArtifactPath(value) {
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) {
    throw new Error("Checksum artifact paths must be non-empty single-line strings.");
  }

  const slashPath = value.replace(/\\/g, "/");
  if (slashPath.startsWith("/") || /^[A-Za-z]:\//.test(slashPath)) {
    throw new Error(`Checksum artifact path must be relative: ${value}`);
  }

  const normalized = posix.normalize(slashPath);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Checksum artifact path escapes the release directory: ${value}`);
  }
  return normalized;
}

export function formatSha256Manifest(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("At least one checksum entry is required.");
  }

  const normalizedEntries = entries.map(({ path, sha256 }) => {
    if (typeof sha256 !== "string" || !/^[a-f\d]{64}$/i.test(sha256)) {
      throw new Error(`Invalid SHA-256 digest for ${path ?? "<unknown>"}.`);
    }
    return { path: normalizedArtifactPath(path), sha256: sha256.toLowerCase() };
  });
  normalizedEntries.sort((left, right) => compareText(left.path, right.path));

  for (let index = 1; index < normalizedEntries.length; index += 1) {
    if (normalizedEntries[index - 1].path === normalizedEntries[index].path) {
      throw new Error(`Duplicate checksum artifact path: ${normalizedEntries[index].path}`);
    }
  }

  return `${normalizedEntries.map(({ path, sha256 }) => `${sha256}  ${path}`).join("\n")}\n`;
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export function desktopReleaseArtifactPaths(paths) {
  const artifactPaths = [paths.archivePath, paths.executablePath, paths.setupPath];
  if (artifactPaths.some((artifactPath) => typeof artifactPath !== "string" || artifactPath.length === 0)) {
    throw new Error("Desktop release paths must include the archive, executable, and setup executable.");
  }
  return artifactPaths;
}

export async function createDesktopChecksumManifest(paths, { hashFile = sha256File } = {}) {
  if (typeof paths.outputRoot !== "string" || paths.outputRoot.length === 0) {
    throw new Error("Desktop release paths must include an output root.");
  }
  if (typeof hashFile !== "function") throw new Error("A checksum file hasher is required.");

  const entries = await Promise.all(
    desktopReleaseArtifactPaths(paths).map(async (artifactPath) => ({
      path: relative(paths.outputRoot, artifactPath),
      sha256: await hashFile(artifactPath)
    }))
  );
  return formatSha256Manifest(entries);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function comparablePath(path) {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
}

export async function publishStagedDirectory(stagedPath, targetPath) {
  const absoluteStagedPath = resolve(stagedPath);
  const absoluteTargetPath = resolve(targetPath);
  if (comparablePath(absoluteStagedPath) === comparablePath(absoluteTargetPath)) {
    throw new Error("Staged and target release directories must be different.");
  }
  if (comparablePath(dirname(absoluteStagedPath)) !== comparablePath(dirname(absoluteTargetPath))) {
    throw new Error("Staged and target release directories must be siblings for a same-volume release swap.");
  }

  const backupPath = join(
    dirname(absoluteTargetPath),
    `.${basename(absoluteTargetPath)}.previous-${randomUUID()}`
  );
  const hadExistingTarget = await pathExists(absoluteTargetPath);
  if (hadExistingTarget) await rename(absoluteTargetPath, backupPath);

  try {
    await rename(absoluteStagedPath, absoluteTargetPath);
  } catch (publishError) {
    if (hadExistingTarget) {
      try {
        await rename(backupPath, absoluteTargetPath);
      } catch (restoreError) {
        throw new AggregateError(
          [publishError, restoreError],
          `Could not publish ${absoluteTargetPath} or restore its previous contents.`
        );
      }
    }
    throw publishError;
  }

  if (hadExistingTarget) {
    await rm(backupPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
