import { readFile } from "node:fs/promises";

export const API = process.env.ASSINI_API_URL ?? "http://127.0.0.1:4321";
export const DEV_TOKEN = process.env.ASSINI_DEV_AUTH_TOKEN ?? "dev-local";
export const LANGUAGE_NAME = process.env.ASSINI_VERIFY_LANGUAGE ?? "Veridspark";
export const PREFERRED_MODEL = process.env.ASSINI_VERIFY_MODEL ?? "Irene";
export const PREFERRED_MODEL_BASE_URL = process.env.ASSINI_VERIFY_MODEL_BASE_URL;
export const VERIFY_MAX_TOKENS = Number.parseInt(process.env.ASSINI_VERIFY_MAX_TOKENS ?? "8192", 10);
export const SOURCE_TITLE = "Veridspark local model verification pack";
export const ADVANCED_SOURCE_TITLE = "Veridspark interaction and aspect expansion pack";
export const DISCOURSE_SOURCE_TITLE = "Veridspark discourse and habitual expansion pack";
export const DISCOURSE_GROUNDING_SOURCE_TITLE = "Veridspark discourse answer lexeme grounding patch";
export const COMMAND_SOURCE_TITLE = "Veridspark command and evidential expansion pack";
export const COMMAND_GROUNDING_SOURCE_TITLE = "Veridspark reported evidential grounding patch";
export const RELATIONAL_SOURCE_TITLE = "Veridspark relational possession and quotation expansion pack v2";
export const UPLOADED_NOTEBOOK_SOURCE_TITLE = "Veridspark uploaded field notebook expansion pack v1";
export const GOVERNANCE_POLICY_CONTENT =
  "Synthetic Veridspark local model verification policy: generated outputs must cite public notes or corpus and must not expose hidden answer keys.";
export const ELDER_WORKFLOW_RATIONALE = "Local verifier elder workflow for reported evidential coverage.";
export const ELDER_VERIFIED_CLARIFICATION =
  "Elder-verified clarification: -ne marks reported evidential meaning after the whole finite verb complex.";
export const REVIEW_DISPOSITION_REASON =
  "Local verifier escalated this synthetic note to prove review disposition routing.";
export const REVIEW_DISPOSITION_RESOLUTION =
  "Local verifier resolved the synthetic escalation after confirming public evidence and elder workflow coverage.";
export const REVIEW_DISPOSITION_STATUSES = new Set(["contested", "rejected", "deferred", "escalated"]);

export const META = {
  author: "AssiniLang local model verifier",
  year: 2026,
  license: "synthetic-test-data",
  consentRecord: "synthetic-veridspark-local-model-verification-v1"
};

export const CONSENT = {
  use: "community-approved",
  restrictions: ["synthetic-test-fixture"]
};

export const VERIDSPARK_PHONOLOGY = {
  consonants: ["p", "t", "k", "m", "n", "s", "l", "r", "v", "f"],
  vowels: ["a", "e", "i", "o", "u"],
  syllableTemplate: "(C)V(C)",
  stress: "penultimate",
  notes: ["Synthetic test language; not tied to a real community.", "f is present in the future suffix -fu."]
};

export const results = [];

export function auth(userId) {
  return {
    "content-type": "application/json",
    "x-assini-user-id": userId,
    "x-assini-dev-token": DEV_TOKEN
  };
}

export function authMultipart(userId) {
  return {
    "x-assini-user-id": userId,
    "x-assini-dev-token": DEV_TOKEN
  };
}

export function ok(label, detail = "") {
  results.push({ ok: true, label, detail });
  console.log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
}

export function fail(label, detail = "") {
  results.push({ ok: false, label, detail });
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
}

export function skip(label, detail = "") {
  results.push({ ok: true, label, detail, skipped: true });
  console.log(`SKIP ${label}${detail ? `: ${detail}` : ""}`);
}

export function summaryAndExit() {
  const passed = results.filter((item) => item.ok && !item.skipped).length;
  const skipped = results.filter((item) => item.skipped).length;
  const failed = results.filter((item) => !item.ok).length;
  console.log(`\n=== ${passed} passed, ${skipped} skipped, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

export async function api(method, path, body, userId = "reviewer-1") {
  const init = {
    method,
    headers: auth(userId)
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json, text };
}

export async function apiForm(method, path, form, userId = "reviewer-1") {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: authMultipart(userId),
    body: form
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json, text };
}

export async function directJson(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "cache-control": "no-cache" },
      signal: controller.signal
    });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function readDotEnv() {
  try {
    const text = await readFile(".env", "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}
