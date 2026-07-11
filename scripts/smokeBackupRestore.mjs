/**
 * CI / local smoke: JsonStore backup → corrupt live → restore round-trip,
 * plus CLI refusal modes, a SQLite force-overwrite path, and a timed
 * backup/restore drill log for the operator recovery acceptance pack.
 *
 * Complements unit tests in packages/db by exercising the operator path
 * (write fixture, backupTo, restoreFrom, runBackupCli) as a short standalone gate.
 *
 * Usage: npm run smoke:backup
 */
import { link, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { JsonStore, buildTestWorkspaceState, pathsReferToSameFile } from "@assini/db";
import { runBackupCli } from "../packages/db/src/backupCli.ts";

const linkAsync = promisify(link);
const root = mkdtempSync(join(tmpdir(), "assini-smoke-backup-"));

function fail(message) {
  console.error(`[smokeBackupRestore] ${message}`);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
}

async function expectReject(label, fn, pattern) {
  try {
    await fn();
    fail(`${label}: expected rejection matching ${pattern}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      fail(`${label}: expected ${pattern}, got: ${message}`);
    }
    console.log(`${label}: refused as expected`);
  }
}

async function smokeJsonRoundTrip() {
  const dir = await mkdtemp(join(root, "json-"));
  const dbPath = join(dir, "local-db.json");
  const backupPath = join(dir, "backup.json");
  const store = new JsonStore(dbPath);
  const fixture = buildTestWorkspaceState();
  await store.write(fixture);
  const before = await store.read();
  console.log("wrote fixture workspace");

  await store.backupTo(backupPath);
  console.log("backupTo OK:", backupPath);

  writeFileSync(dbPath, "this is not a valid database", "utf8");
  try {
    await store.read();
    fail("expected corrupt live database to fail read()");
  } catch {
    console.log("live database corrupted as expected");
  }

  const restored = await store.restoreFrom(backupPath);
  if (JSON.stringify(restored) !== JSON.stringify(before)) {
    fail("restored workspace does not match pre-backup state");
  }
  const after = await store.read();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail("post-restore read() does not match pre-backup state");
  }
  console.log("restoreFrom OK — backup → corrupt → restore round-trip passed");
}

async function smokeCliRefusalsAndForce() {
  const dir = await mkdtemp(join(root, "cli-"));
  const dbPath = join(dir, "local-db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  const env = { ASSINI_DB_PATH: dbPath };

  const destinationDir = join(dir, "backups-dir");
  await mkdir(destinationDir, { recursive: true });
  await expectReject(
    "CLI directory destination",
    () => runBackupCli({ argv: [destinationDir], env, stdout: () => undefined }),
    /is a directory/
  );

  await expectReject(
    "CLI same-path destination",
    () => runBackupCli({ argv: [dbPath], env, stdout: () => undefined }),
    /same as the live database/
  );

  const existing = join(dir, "existing-backup.json");
  await writeFile(existing, '{"stale":true}', "utf8");
  await expectReject(
    "CLI existing destination without --force",
    () => runBackupCli({ argv: [existing], env, stdout: () => undefined }),
    /already exists/
  );

  const dryRunOk = await runBackupCli({
    argv: ["--dry-run", join(dir, "dry-run-ok.json")],
    env,
    stdout: () => undefined
  });
  if (!dryRunOk.dryRun) {
    fail("CLI --dry-run on a valid workspace should report dryRun without writing");
  }
  try {
    await readFile(join(dir, "dry-run-ok.json"), "utf8");
    fail("CLI --dry-run on a valid workspace wrote a destination file");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
      throw error;
    }
  }
  console.log("CLI --dry-run valid workspace: no write");

  const forced = await runBackupCli({
    argv: ["--force", existing],
    env,
    stdout: () => undefined
  });
  if (forced.written !== resolve(existing)) {
    fail(`CLI --force wrote unexpected path: ${forced.written}`);
  }
  const liveBytes = await readFile(dbPath, "utf8");
  const forcedBytes = await readFile(forced.written, "utf8");
  if (forcedBytes !== liveBytes) {
    fail("CLI --force overwrite did not replace the existing backup with live bytes");
  }
  console.log("CLI --force overwrite OK");

  // Windows case-fold + \\?\ extended-prefix identity.
  if (process.platform === "win32") {
    const caseAlias = join(dir, "LOCAL-DB.JSON");
    if (!pathsReferToSameFile(dbPath, caseAlias)) {
      fail("pathsReferToSameFile should treat case-only aliases as the same file on Windows");
    }
    await expectReject(
      "CLI Windows case-fold same-path",
      () => runBackupCli({ argv: [caseAlias], env, stdout: () => undefined }),
      /same as the live database/
    );
    await expectReject(
      "CLI Windows case-fold same-path with --force",
      () => runBackupCli({ argv: ["--force", caseAlias], env, stdout: () => undefined }),
      /same as the live database/
    );
    const extendedAlias = `\\\\?\\${resolve(dbPath)}`;
    if (!pathsReferToSameFile(dbPath, extendedAlias)) {
      fail("pathsReferToSameFile should treat \\\\?\\ extended-prefix aliases as the same file");
    }
    await expectReject(
      "CLI Windows extended-prefix same-path",
      () => runBackupCli({ argv: [extendedAlias], env, stdout: () => undefined }),
      /same as the live database/
    );
  } else {
    // Hard-link alias covers POSIX same-inode identity in CI.
    const hardLinkPath = join(dir, "hardlink-backup.json");
    await linkAsync(dbPath, hardLinkPath);
    await expectReject(
      "CLI hard-link same-path",
      () => runBackupCli({ argv: [hardLinkPath], env, stdout: () => undefined }),
      /same as the live database/
    );
  }
}

async function smokeSqliteForceOverwrite() {
  const dir = await mkdtemp(join(root, "sqlite-"));
  const dbPath = join(dir, "local-db.sqlite");
  const backupPath = join(dir, "backup.sqlite");
  const store = new JsonStore(dbPath);
  const fixture = buildTestWorkspaceState();
  await store.write(fixture);
  const before = await store.read();

  await store.backupTo(backupPath);
  await writeFile(backupPath, "stale-sqlite-bytes", "utf8");
  await store.backupTo(backupPath, { force: true });
  console.log("SQLite backupTo force overwrite OK");

  writeFileSync(dbPath, "not-a-sqlite-database", "utf8");
  const restored = await store.restoreFrom(backupPath);
  if (JSON.stringify(restored.languages) !== JSON.stringify(before.languages)) {
    fail("SQLite force-overwrite backup did not restore languages");
  }
  console.log("SQLite backup → corrupt → restore round-trip passed");
}

async function smokeCliDryRunInvalidWorkspace() {
  const dir = await mkdtemp(join(root, "dry-run-bad-"));
  const dbPath = join(dir, "local-db.json");
  const destination = join(dir, "should-not-write.json");
  await writeFile(dbPath, '{"languages":[],"users":[]}', "utf8");
  await expectReject(
    "CLI dry-run invalid workspace",
    () =>
      runBackupCli({
        argv: ["--dry-run", destination],
        env: { ASSINI_DB_PATH: dbPath },
        stdout: () => undefined
      }),
    /not a valid workspace/
  );
  try {
    await readFile(destination, "utf8");
    fail("CLI dry-run invalid workspace wrote a destination file");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
      throw error;
    }
  }
  console.log("CLI dry-run invalid workspace: no write");
}

/**
 * Timed backup → corrupt → restore drill for the operator recovery pack.
 * Prints a pasteable JSON drill log (elapsedMs per step + total) and fails
 * if the tiny fixture round-trip exceeds the CI soft bound.
 */
async function smokeTimedBackupRestoreDrill() {
  const dir = await mkdtemp(join(root, "timed-drill-"));
  const dbPath = join(dir, "local-db.json");
  const backupPath = join(dir, "timed-backup.json");
  const store = new JsonStore(dbPath);
  const fixture = buildTestWorkspaceState();
  await store.write(fixture);
  const before = await store.read();

  /** Soft bound for a tiny fixture workspace in CI (not a production SLA). */
  const MAX_TOTAL_MS = 30_000;
  const drillStartedAt = new Date().toISOString();
  const t0 = performance.now();

  const backupStarted = performance.now();
  await store.backupTo(backupPath);
  const backupMs = Math.round(performance.now() - backupStarted);

  const corruptStarted = performance.now();
  writeFileSync(dbPath, "timed-drill-corrupt-payload", "utf8");
  try {
    await store.read();
    fail("timed drill: expected corrupt live database to fail read()");
  } catch {
    // expected loud failure before restore
  }
  const corruptMs = Math.round(performance.now() - corruptStarted);

  const restoreStarted = performance.now();
  const restored = await store.restoreFrom(backupPath);
  const restoreMs = Math.round(performance.now() - restoreStarted);
  const totalMs = Math.round(performance.now() - t0);

  if (JSON.stringify(restored) !== JSON.stringify(before)) {
    fail("timed drill: restored workspace does not match pre-backup state");
  }
  const after = await store.read();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail("timed drill: post-restore read() does not match pre-backup state");
  }
  if (totalMs > MAX_TOTAL_MS) {
    fail(`timed drill: backup→corrupt→restore took ${totalMs}ms (soft bound ${MAX_TOTAL_MS}ms)`);
  }

  const drillLog = {
    drill: "timed-backup-restore",
    pack: "operator-recovery",
    startedAt: drillStartedAt,
    finishedAt: new Date().toISOString(),
    backend: "json",
    steps: [
      { name: "backupTo", elapsedMs: backupMs, ok: true },
      { name: "corruptLiveReadFails", elapsedMs: corruptMs, ok: true },
      { name: "restoreFrom", elapsedMs: restoreMs, ok: true }
    ],
    totalElapsedMs: totalMs,
    softBoundMs: MAX_TOTAL_MS,
    outcome: "pass",
    notes: "Automated acceptance drill via npm run smoke:backup; times are for a tiny fixture, not a production SLA."
  };
  console.log(`timed backup/restore drill log: ${JSON.stringify(drillLog)}`);
  console.log(
    `timed backup/restore drill OK — backup ${backupMs}ms, corrupt ${corruptMs}ms, restore ${restoreMs}ms, total ${totalMs}ms`
  );
}

try {
  await smokeJsonRoundTrip();
  await smokeCliRefusalsAndForce();
  await smokeSqliteForceOverwrite();
  await smokeCliDryRunInvalidWorkspace();
  await smokeTimedBackupRestoreDrill();
  console.log(
    "smoke:backup passed (JSON round-trip, CLI refusals, dry-run valid, SQLite force, dry-run invalid, timed drill)"
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
}
