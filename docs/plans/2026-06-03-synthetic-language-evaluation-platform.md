# Synthetic Language Evaluation Platform Implementation Plan

> **Status: historical and superseded.** This file preserves the original scaffold plan and its then-current file layout. Use the living handbook and [current roadmap](../roadmap.md) for contributor instructions and current implementation facts.

**Goal:** Build a runnable local full-stack scaffold that seeds synthetic language corpora, runs answer-key evaluations, and exposes corpus, review, learner, and evaluation views in a web UI.

**Architecture:** Use a TypeScript npm-workspaces monorepo with local JSON persistence. Packages define shared schemas, synthetic fixtures, and evaluation logic; a Fastify API serves that data; a Vite React app renders the prototype surfaces.

**Tech Stack:** TypeScript, npm workspaces, Zod, Vitest, Fastify, Vite, React, Testing Library, concurrently.

---

## File Structure

- `package.json`: root workspace scripts, dev tooling, and shared dependencies.
- `tsconfig.base.json`: shared TypeScript compiler configuration.
- `vitest.config.ts`: workspace-wide Vitest configuration.
- `.gitignore`: ignore dependencies, builds, coverage, and generated local data.
- `README.md`: local setup and first-run workflow.
- `data/.gitkeep`: keeps the local generated-data directory in Git.
- `packages/db/src/schema.ts`: Zod schemas and TypeScript types for languages, corpus passages, notes, exercises, and evaluation runs.
- `packages/db/src/store.ts`: local JSON store with read, write, and update helpers.
- `packages/db/src/index.ts`: db package exports.
- `packages/db/src/store.test.ts`: persistence and schema tests.
- `packages/synthetic-langs/src/fixtures.ts`: four synthetic languages, vocabulary, grammar notes, corpus, and exercise answer keys.
- `packages/synthetic-langs/src/loader.ts`: fixture validation and seed-state construction.
- `packages/synthetic-langs/src/index.ts`: fixture package exports.
- `packages/synthetic-langs/src/loader.test.ts`: fixture completeness and validation tests.
- `packages/eval/src/studyLoop.ts`: deterministic draft-note generation from fixture rules and corpus evidence.
- `packages/eval/src/scoring.ts`: note, evidence, segmentation, translation, exercise, and generation-policy scoring.
- `packages/eval/src/runEvaluation.ts`: end-to-end evaluation runner.
- `packages/eval/src/cli.ts`: command-line evaluation entry point.
- `packages/eval/src/index.ts`: eval package exports.
- `packages/eval/src/scoring.test.ts`: scoring and grading tests.
- `apps/api/src/server.ts`: Fastify app factory and routes.
- `apps/api/src/index.ts`: API server startup.
- `apps/api/src/server.test.ts`: API route tests.
- `apps/web/index.html`: Vite app shell.
- `apps/web/src/main.tsx`: React app entry point.
- `apps/web/src/api.ts`: browser API client.
- `apps/web/src/App.tsx`: application state and surface layout.
- `apps/web/src/styles.css`: domain-appropriate UI styling.
- `apps/web/src/App.test.tsx`: smoke test for main surfaces.

---

## Task 1: Monorepo Foundation

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `README.md`
- Create: `data/.gitkeep`

- [ ] **Step 1: Create root workspace files**

Create `package.json`:

```json
{
  "name": "assini-lang",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "check": "tsc -b packages/db packages/synthetic-langs packages/eval apps/api apps/web",
    "test": "vitest run --passWithNoTests",
    "seed": "npm --workspace @assini/synthetic-langs run seed",
    "eval": "npm --workspace @assini/eval run eval",
    "dev": "concurrently -k -n api,web -c blue,green \"npm --workspace @assini/api run dev\" \"npm --workspace @assini/web run dev\"",
    "demo": "npm run seed && npm run eval && npm run dev"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "@vitest/coverage-v8": "^2.1.8",
    "concurrently": "^9.1.0",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.6",
    "vitest": "^2.1.8"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.1",
    "fastify": "^5.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@assini/db": ["packages/db/src/index.ts"],
      "@assini/synthetic-langs": ["packages/synthetic-langs/src/index.ts"],
      "@assini/eval": ["packages/eval/src/index.ts"]
    }
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["apps/web/**/*.test.tsx", "jsdom"]],
    globals: true,
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  }
});
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.vite/
*.tsbuildinfo
data/local-db.json
npm-debug.log*
```

Create `README.md`:

````md
# AssiniLang

Synthetic language evaluation scaffold for a community-governed language AI system.

This repository intentionally starts with made-up languages only. No real First Nations or Indigenous language data belongs in this milestone.

## Foundation Setup

```powershell
npm install
npm test
```
````

This verifies the initial workspace foundation. At this stage, Vitest exits cleanly even before test files exist.

## Full Local Setup

Once the scaffold packages and apps are implemented, run:

```powershell
npm install
npm run seed
npm run eval
npm run dev
```

Open the web app at `http://localhost:5173`. The API runs at `http://localhost:4321`.

## One-Command Demo

```powershell
npm run demo
```

Once the scaffold packages and apps are implemented, the demo seeds synthetic fixtures, runs evaluation, and starts the API plus web app.

## Project Shape

- `packages/db`: shared schemas and local JSON persistence.
- `packages/synthetic-langs`: invented languages, corpora, grammar notes, and answer keys.
- `packages/eval`: deterministic study-loop simulation and scoring.
- `apps/api`: Fastify API.
- `apps/web`: Vite React prototype UI.

````

Create an empty `data/.gitkeep` file.

- [ ] **Step 2: Install dependencies**

Run:

```powershell
npm install
````

Expected: npm installs dependencies and creates `package-lock.json`.

- [ ] **Step 3: Verify root test runner starts**

Run:

```powershell
npm test
```

Expected: Vitest starts and reports no matching tests or no test files before the packages are added.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore README.md data/.gitkeep
git commit -m "chore: scaffold workspace foundation"
```

---

## Task 2: Shared Schemas And Local Store

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/store.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/store.test.ts`

- [ ] **Step 1: Create the failing store test**

Create `packages/db/src/store.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore } from "./store";

describe("JsonStore", () => {
  it("writes and reads a seeded state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages.push({
        id: "test-lang",
        name: "Test Lang",
        typology: "isolating",
        description: "Synthetic test language.",
        orthography: "Latin test alphabet",
        status: "synthetic",
        fixtureSource: "unit-test"
      });

      await store.write(state);
      const loaded = await store.read();
      const raw = JSON.parse(await readFile(dbPath, "utf8"));

      expect(loaded.languages[0]?.id).toBe("test-lang");
      expect(raw.schemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm test -- packages/db/src/store.test.ts
```

Expected: FAIL because `./store` does not exist.

- [ ] **Step 3: Implement schemas and store**

Create `packages/db/package.json`:

```json
{
  "name": "@assini/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

Create `packages/db/src/schema.ts`:

```ts
import { z } from "zod";

export const languageTypologySchema = z.enum(["agglutinative", "isolating", "fusional", "polysynthetic-lite"]);

export const languageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  typology: languageTypologySchema,
  description: z.string().min(1),
  orthography: z.string().min(1),
  status: z.literal("synthetic"),
  fixtureSource: z.string().min(1)
});

export const morphemeSchema = z.object({
  surface: z.string().min(1),
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  features: z.array(z.string()).default([])
});

export const corpusPassageSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  source: z.string().min(1),
  sourceMetadata: z.object({
    author: z.string().min(1),
    year: z.number().int(),
    license: z.string().min(1),
    consentRecord: z.string().min(1)
  }),
  textTarget: z.string().min(1),
  textTranslation: z.string().min(1),
  morphologicalSegmentation: z.array(morphemeSchema),
  topicTags: z.array(z.string()),
  consentStatus: z.object({
    use: z.literal("synthetic-testing-only"),
    restrictions: z.array(z.string())
  })
});

export const noteStatusSchema = z.enum(["draft", "under_review", "approved", "contested", "rejected"]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const noteSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  topic: z.string().min(1),
  explanation: z.string().min(1),
  examples: z.array(
    z.object({
      passageId: z.string().min(1),
      target: z.string().min(1),
      translation: z.string().min(1)
    })
  ),
  evidencePassageIds: z.array(z.string().min(1)),
  evidenceCount: z.number().int().nonnegative(),
  confidence: confidenceSchema,
  status: noteStatusSchema,
  reviewer: z.object({
    lastReviewedBy: z.string().nullable(),
    lastReviewedAt: z.string().nullable(),
    comments: z.array(z.string())
  }),
  dialectScope: z.string().min(1),
  editHistory: z.array(
    z.object({
      at: z.string(),
      by: z.string(),
      action: z.string(),
      summary: z.string()
    })
  )
});

export const exerciseSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  type: z.enum(["translate_to_target", "translate_to_english", "segment", "choose_particle"]),
  prompt: z.string().min(1),
  allowedVocabulary: z.array(z.string()),
  allowedRuleIds: z.array(z.string()),
  expectedAnswers: z.array(z.string().min(1)),
  gradingExplanation: z.string().min(1)
});

export const evaluationFailureSchema = z.object({
  category: z.string().min(1),
  languageId: z.string().min(1),
  itemId: z.string().min(1),
  message: z.string().min(1)
});

export const evaluationRunSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  createdAt: z.string().min(1),
  systemVersion: z.string().min(1),
  fixtureVersion: z.string().min(1),
  scores: z.record(z.number().min(0).max(1)),
  failures: z.array(evaluationFailureSchema),
  summary: z.string().min(1)
});

export const appStateSchema = z.object({
  schemaVersion: z.literal(1),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  evaluationRuns: z.array(evaluationRunSchema)
});

export type Language = z.infer<typeof languageSchema>;
export type CorpusPassage = z.infer<typeof corpusPassageSchema>;
export type Morpheme = z.infer<typeof morphemeSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type EvaluationFailure = z.infer<typeof evaluationFailureSchema>;
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;
export type AppState = z.infer<typeof appStateSchema>;
```

Create `packages/db/src/store.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { appStateSchema, type AppState, type Note } from "./schema";

export const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "local-db.json");

export function createEmptyState(): AppState {
  return {
    schemaVersion: 1,
    languages: [],
    corpus: [],
    notes: [],
    exercises: [],
    evaluationRuns: []
  };
}

export class JsonStore {
  constructor(private readonly dbPath = DEFAULT_DB_PATH) {}

  async read(): Promise<AppState> {
    try {
      const raw = await readFile(this.dbPath, "utf8");
      return appStateSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return createEmptyState();
      }
      throw error;
    }
  }

  async write(state: AppState): Promise<void> {
    const parsed = appStateSchema.parse(state);
    await mkdir(dirname(this.dbPath), { recursive: true });
    await writeFile(this.dbPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }

  async update(updater: (state: AppState) => AppState): Promise<AppState> {
    const current = await this.read();
    const next = updater(current);
    await this.write(next);
    return next;
  }

  async updateNote(
    noteId: string,
    patch: Partial<Pick<Note, "status" | "explanation" | "reviewer" | "editHistory">>
  ): Promise<Note> {
    let updated: Note | undefined;
    await this.update((state) => ({
      ...state,
      notes: state.notes.map((note) => {
        if (note.id !== noteId) return note;
        updated = { ...note, ...patch };
        return updated;
      })
    }));
    if (!updated) {
      throw new Error(`Note not found: ${noteId}`);
    }
    return updated;
  }
}
```

Create `packages/db/src/index.ts`:

```ts
export * from "./schema";
export * from "./store";
```

- [ ] **Step 4: Run the test**

Run:

```powershell
npm test -- packages/db/src/store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/db package.json package-lock.json
git commit -m "feat: add shared schemas and json store"
```

---

## Task 3: Synthetic Language Fixtures

**Files:**

- Create: `packages/synthetic-langs/package.json`
- Create: `packages/synthetic-langs/tsconfig.json`
- Create: `packages/synthetic-langs/src/fixtures.ts`
- Create: `packages/synthetic-langs/src/loader.ts`
- Create: `packages/synthetic-langs/src/seed.ts`
- Create: `packages/synthetic-langs/src/index.ts`
- Create: `packages/synthetic-langs/src/loader.test.ts`

- [ ] **Step 1: Write the failing fixture validation test**

Create `packages/synthetic-langs/src/loader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSeedState, syntheticLanguageFixtures } from "./loader";

describe("synthetic language fixtures", () => {
  it("contains four typologically distinct synthetic languages", () => {
    const state = buildSeedState();
    expect(state.languages).toHaveLength(4);
    expect(new Set(state.languages.map((language) => language.typology))).toEqual(
      new Set(["agglutinative", "isolating", "fusional", "polysynthetic-lite"])
    );
  });

  it("labels every passage as synthetic testing data", () => {
    const state = buildSeedState();
    expect(state.corpus.length).toBeGreaterThanOrEqual(20);
    expect(state.corpus.every((passage) => passage.consentStatus.use === "synthetic-testing-only")).toBe(true);
  });

  it("connects notes and exercises to existing languages", () => {
    const state = buildSeedState();
    const languageIds = new Set(state.languages.map((language) => language.id));
    expect(state.notes.every((note) => languageIds.has(note.languageId))).toBe(true);
    expect(state.exercises.every((exercise) => languageIds.has(exercise.languageId))).toBe(true);
    expect(syntheticLanguageFixtures).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm test -- packages/synthetic-langs/src/loader.test.ts
```

Expected: FAIL because `./loader` does not exist.

- [ ] **Step 3: Create fixture package**

Create `packages/synthetic-langs/package.json`:

```json
{
  "name": "@assini/synthetic-langs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "seed": "tsx src/seed.ts",
    "test": "vitest run src"
  },
  "dependencies": {
    "@assini/db": "0.1.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `packages/synthetic-langs/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{ "path": "../db" }],
  "include": ["src"]
}
```

Create `packages/synthetic-langs/src/fixtures.ts` with this structure and at least the listed records:

```ts
import type { CorpusPassage, Exercise, Language, Note } from "@assini/db";

export type SyntheticLanguageFixture = {
  language: Language;
  vocabulary: Array<{ id: string; form: string; gloss: string; partOfSpeech: string; tags: string[] }>;
  grammarRules: Array<{
    id: string;
    topic: string;
    explanation: string;
    evidencePassageIds: string[];
    confidence: "low" | "medium" | "high";
  }>;
  corpus: CorpusPassage[];
  notesAnswerKey: Note[];
  exercisesAnswerKey: Exercise[];
};

const consent = {
  use: "synthetic-testing-only" as const,
  restrictions: ["fake-language", "not-for-cultural-claims"]
};

const sourceMetadata = {
  author: "AssiniLang synthetic fixture generator",
  year: 2026,
  license: "Synthetic fixtures for local testing only",
  consentRecord: "synthetic-fixture-consent"
};

export const syntheticLanguageFixtures: SyntheticLanguageFixture[] = [
  {
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Synthetic agglutinative language with transparent suffix chains.",
      orthography: "Lowercase Latin with hyphenated morphology.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    vocabulary: [
      { id: "avn-v-001", form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"] },
      { id: "avn-v-002", form: "nemi", gloss: "teach", partOfSpeech: "verb", tags: ["learning"] },
      { id: "avn-n-001", form: "mira", gloss: "river", partOfSpeech: "noun", tags: ["place"] },
      { id: "avn-n-002", form: "saku", gloss: "child", partOfSpeech: "noun", tags: ["person"] },
      { id: "avn-s-001", form: "-mi", gloss: "present tense", partOfSpeech: "suffix", tags: ["tense"] },
      { id: "avn-s-002", form: "-lo", gloss: "past tense", partOfSpeech: "suffix", tags: ["tense"] },
      { id: "avn-s-003", form: "-na", gloss: "first person singular", partOfSpeech: "suffix", tags: ["person"] },
      { id: "avn-s-004", form: "-ki", gloss: "third person singular", partOfSpeech: "suffix", tags: ["person"] }
    ],
    grammarRules: [
      {
        id: "avn-rule-verb-chain",
        topic: "morphology/verb/tense-person-suffix-chain",
        explanation:
          "Avenik finite verbs use root + tense suffix + person suffix. The tense suffix comes before the person suffix.",
        evidencePassageIds: ["avn-c001", "avn-c002", "avn-c003"],
        confidence: "high"
      },
      {
        id: "avn-rule-noun-before-verb",
        topic: "syntax/basic-noun-before-verb",
        explanation: "Simple Avenik clauses place the topical noun before the finite verb.",
        evidencePassageIds: ["avn-c001", "avn-c004", "avn-c005"],
        confidence: "medium"
      }
    ],
    corpus: [
      {
        id: "avn-c001",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mira talo-mi-na",
        textTranslation: "I walk by the river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["motion", "present", "first-person"],
        consentStatus: consent
      },
      {
        id: "avn-c002",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "saku nemi-lo-ki",
        textTranslation: "The child taught.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["learning", "past", "third-person"],
        consentStatus: consent
      },
      {
        id: "avn-c003",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "saku talo-mi-ki",
        textTranslation: "The child walks.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["motion", "present", "third-person"],
        consentStatus: consent
      },
      {
        id: "avn-c004",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mira nemi-lo-na",
        textTranslation: "I taught by the river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["learning", "past", "first-person"],
        consentStatus: consent
      },
      {
        id: "avn-c005",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "saku mira talo-mi-ki",
        textTranslation: "The child walks by the river.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["motion", "present", "place"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  },
  {
    language: {
      id: "solari",
      name: "Solari",
      typology: "isolating",
      description: "Synthetic isolating language with particles and stable word order.",
      orthography: "Whitespace-delimited Latin syllables.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    vocabulary: [
      { id: "sol-p-001", form: "mi", gloss: "I", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-p-002", form: "ta", gloss: "they", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-v-001", form: "len", gloss: "listen", partOfSpeech: "verb", tags: ["learning"] },
      { id: "sol-v-002", form: "ko", gloss: "make", partOfSpeech: "verb", tags: ["work"] },
      { id: "sol-n-001", form: "nua", gloss: "song", partOfSpeech: "noun", tags: ["object"] },
      { id: "sol-t-001", form: "pa", gloss: "past marker", partOfSpeech: "particle", tags: ["tense"] }
    ],
    grammarRules: [
      {
        id: "sol-rule-past-particle",
        topic: "syntax/particle/past-before-verb",
        explanation: "Solari marks past time with the particle pa immediately before the verb.",
        evidencePassageIds: ["sol-c001", "sol-c003"],
        confidence: "high"
      },
      {
        id: "sol-rule-svo",
        topic: "syntax/basic-svo",
        explanation: "Solari basic clauses follow subject + optional tense particle + verb + object.",
        evidencePassageIds: ["sol-c001", "sol-c002", "sol-c004", "sol-c005"],
        confidence: "high"
      }
    ],
    corpus: [
      {
        id: "sol-c001",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mi pa len nua",
        textTranslation: "I listened to the song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["past", "learning"],
        consentStatus: consent
      },
      {
        id: "sol-c002",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mi len nua",
        textTranslation: "I listen to the song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["present", "learning"],
        consentStatus: consent
      },
      {
        id: "sol-c003",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ta pa ko nua",
        textTranslation: "They made a song.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["past", "work"],
        consentStatus: consent
      },
      {
        id: "sol-c004",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ta len nua",
        textTranslation: "They listen to the song.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["present", "learning"],
        consentStatus: consent
      },
      {
        id: "sol-c005",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mi ko nua",
        textTranslation: "I make a song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["present", "work"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  },
  {
    language: {
      id: "velari",
      name: "Velari",
      typology: "fusional",
      description: "Synthetic fusional language where endings encode tense and person together.",
      orthography: "Latin roots with fused final syllables.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    vocabulary: [
      { id: "vel-v-001", form: "dan", gloss: "eat", partOfSpeech: "verb-root", tags: ["food"] },
      { id: "vel-v-002", form: "mir", gloss: "see", partOfSpeech: "verb-root", tags: ["perception"] },
      { id: "vel-n-001", form: "loma", gloss: "berry", partOfSpeech: "noun", tags: ["food"] },
      { id: "vel-n-002", form: "vesa", gloss: "star", partOfSpeech: "noun", tags: ["sky"] },
      { id: "vel-e-001", form: "-or", gloss: "1sg present", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-002", form: "-eth", gloss: "3sg past", partOfSpeech: "ending", tags: ["fusional"] }
    ],
    grammarRules: [
      {
        id: "vel-rule-fused-ending",
        topic: "morphology/verb/fused-person-tense-ending",
        explanation:
          "Velari verb endings encode person and tense in a single fused ending: -or is first-person present, while -eth is third-person past.",
        evidencePassageIds: ["vel-c001", "vel-c002", "vel-c004"],
        confidence: "high"
      },
      {
        id: "vel-rule-object-after-verb",
        topic: "syntax/object-after-finite-verb",
        explanation: "Velari places the object noun after the finite verb in simple clauses.",
        evidencePassageIds: ["vel-c001", "vel-c003", "vel-c005"],
        confidence: "medium"
      }
    ],
    corpus: [
      {
        id: "vel-c001",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "danor loma",
        textTranslation: "I eat berries.",
        morphologicalSegmentation: [
          { surface: "dan", lemma: "dan", gloss: "eat", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["person-tense"] },
          { surface: "loma", lemma: "loma", gloss: "berry", features: ["noun"] }
        ],
        topicTags: ["food", "present", "first-person"],
        consentStatus: consent
      },
      {
        id: "vel-c002",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mireth vesa",
        textTranslation: "They saw the star.",
        morphologicalSegmentation: [
          { surface: "mir", lemma: "mir", gloss: "see", features: ["verb-root"] },
          { surface: "-eth", lemma: "-eth", gloss: "3sg.past", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["sky", "past", "third-person"],
        consentStatus: consent
      },
      {
        id: "vel-c003",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "miror vesa",
        textTranslation: "I see the star.",
        morphologicalSegmentation: [
          { surface: "mir", lemma: "mir", gloss: "see", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["sky", "present", "first-person"],
        consentStatus: consent
      },
      {
        id: "vel-c004",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "daneth loma",
        textTranslation: "They ate berries.",
        morphologicalSegmentation: [
          { surface: "dan", lemma: "dan", gloss: "eat", features: ["verb-root"] },
          { surface: "-eth", lemma: "-eth", gloss: "3sg.past", features: ["person-tense"] },
          { surface: "loma", lemma: "loma", gloss: "berry", features: ["noun"] }
        ],
        topicTags: ["food", "past", "third-person"],
        consentStatus: consent
      },
      {
        id: "vel-c005",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "danor vesa",
        textTranslation: "I eat under the star.",
        morphologicalSegmentation: [
          { surface: "dan", lemma: "dan", gloss: "eat", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["food", "sky", "present"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  },
  {
    language: {
      id: "ketharu",
      name: "Ketharu",
      typology: "polysynthetic-lite",
      description: "Synthetic verb-centered language with person, object, tense, and root slots.",
      orthography: "Hyphenated Latin slot chains.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    vocabulary: [
      { id: "ket-pr-001", form: "na-", gloss: "I", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-pr-002", form: "ka-", gloss: "they", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-ob-001", form: "mo-", gloss: "fish object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-ob-002", form: "se-", gloss: "story object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-v-001", form: "wan", gloss: "carry", partOfSpeech: "verb-root", tags: ["motion"] },
      { id: "ket-v-002", form: "lom", gloss: "tell", partOfSpeech: "verb-root", tags: ["speech"] },
      { id: "ket-t-001", form: "-tu", gloss: "today", partOfSpeech: "suffix", tags: ["time"] },
      { id: "ket-t-002", form: "-ra", gloss: "yesterday", partOfSpeech: "suffix", tags: ["time"] }
    ],
    grammarRules: [
      {
        id: "ket-rule-slot-order",
        topic: "morphology/verb/subject-object-root-time-slots",
        explanation: "Ketharu verb words follow subject prefix + object prefix + verb root + time suffix.",
        evidencePassageIds: ["ket-c001", "ket-c002", "ket-c003", "ket-c004"],
        confidence: "high"
      },
      {
        id: "ket-rule-verb-as-clause",
        topic: "syntax/polysynthetic-lite/verb-word-clause",
        explanation:
          "A single Ketharu verb word can express a full clause when subject, object, root, and time slots are present.",
        evidencePassageIds: ["ket-c001", "ket-c003", "ket-c005"],
        confidence: "medium"
      }
    ],
    corpus: [
      {
        id: "ket-c001",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "na-mo-wan-tu",
        textTranslation: "I carry the fish today.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-tu", lemma: "-tu", gloss: "today", features: ["time"] }
        ],
        topicTags: ["motion", "today", "first-person"],
        consentStatus: consent
      },
      {
        id: "ket-c002",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ka-se-lom-ra",
        textTranslation: "They told the story yesterday.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "se-", lemma: "se-", gloss: "story.object", features: ["object"] },
          { surface: "lom", lemma: "lom", gloss: "tell", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["speech", "yesterday", "third-person"],
        consentStatus: consent
      },
      {
        id: "ket-c003",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "na-se-lom-tu",
        textTranslation: "I tell the story today.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "se-", lemma: "se-", gloss: "story.object", features: ["object"] },
          { surface: "lom", lemma: "lom", gloss: "tell", features: ["verb-root"] },
          { surface: "-tu", lemma: "-tu", gloss: "today", features: ["time"] }
        ],
        topicTags: ["speech", "today", "first-person"],
        consentStatus: consent
      },
      {
        id: "ket-c004",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ka-mo-wan-ra",
        textTranslation: "They carried the fish yesterday.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["motion", "yesterday", "third-person"],
        consentStatus: consent
      },
      {
        id: "ket-c005",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "na-mo-wan-ra",
        textTranslation: "I carried the fish yesterday.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["motion", "yesterday", "first-person"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  }
];
```

After creating the array above, append this code to the bottom of `fixtures.ts` so answer keys are derived from the grammar rules and exercises are explicit:

```ts
for (const fixture of syntheticLanguageFixtures) {
  fixture.notesAnswerKey = fixture.grammarRules.map((rule) => ({
    id: `${rule.id}-note`,
    languageId: fixture.language.id,
    topic: rule.topic,
    explanation: rule.explanation,
    examples: rule.evidencePassageIds.slice(0, 2).map((passageId) => {
      const passage = fixture.corpus.find((item) => item.id === passageId);
      if (!passage) throw new Error(`Missing passage ${passageId}`);
      return {
        passageId,
        target: passage.textTarget,
        translation: passage.textTranslation
      };
    }),
    evidencePassageIds: rule.evidencePassageIds,
    evidenceCount: rule.evidencePassageIds.length,
    confidence: rule.confidence,
    status: "approved",
    reviewer: {
      lastReviewedBy: "synthetic-answer-key",
      lastReviewedAt: "2026-06-03T00:00:00.000Z",
      comments: ["Gold answer key for synthetic fixture evaluation."]
    },
    dialectScope: "synthetic-default",
    editHistory: [
      {
        at: "2026-06-03T00:00:00.000Z",
        by: "synthetic-fixture-generator",
        action: "created",
        summary: "Created approved answer-key note from fixture grammar rule."
      }
    ]
  }));
}

const exerciseMap: Record<string, Exercise[]> = {
  avenik: [
    {
      id: "avn-ex001",
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["mira talo-mi-na"],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    },
    {
      id: "avn-ex002",
      languageId: "avenik",
      type: "segment",
      prompt: "Segment: nemi-lo-ki",
      allowedVocabulary: ["nemi", "-lo", "-ki"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["nemi|-lo|-ki", "nemi -lo -ki"],
      gradingExplanation: "The verb separates into root nemi, past suffix -lo, and third-person suffix -ki."
    }
  ],
  solari: [
    {
      id: "sol-ex001",
      languageId: "solari",
      type: "choose_particle",
      prompt: "Which particle marks past time before the verb?",
      allowedVocabulary: ["pa"],
      allowedRuleIds: ["sol-rule-past-particle"],
      expectedAnswers: ["pa"],
      gradingExplanation: "Solari uses pa immediately before the verb for past time."
    },
    {
      id: "sol-ex002",
      languageId: "solari",
      type: "translate_to_target",
      prompt: "Translate: They made a song.",
      allowedVocabulary: ["ta", "pa", "ko", "nua"],
      allowedRuleIds: ["sol-rule-past-particle", "sol-rule-svo"],
      expectedAnswers: ["ta pa ko nua"],
      gradingExplanation: "Use subject ta, past particle pa, verb ko, and object nua."
    }
  ],
  velari: [
    {
      id: "vel-ex001",
      languageId: "velari",
      type: "translate_to_english",
      prompt: "Translate: daneth loma",
      allowedVocabulary: ["dan", "-eth", "loma"],
      allowedRuleIds: ["vel-rule-fused-ending"],
      expectedAnswers: ["They ate berries.", "They ate berries"],
      gradingExplanation: "The ending -eth encodes third-person past."
    },
    {
      id: "vel-ex002",
      languageId: "velari",
      type: "segment",
      prompt: "Segment: miror",
      allowedVocabulary: ["mir", "-or"],
      allowedRuleIds: ["vel-rule-fused-ending"],
      expectedAnswers: ["mir|-or", "mir -or"],
      gradingExplanation: "The form combines mir with the fused first-person present ending -or."
    }
  ],
  ketharu: [
    {
      id: "ket-ex001",
      languageId: "ketharu",
      type: "segment",
      prompt: "Segment: na-mo-wan-tu",
      allowedVocabulary: ["na-", "mo-", "wan", "-tu"],
      allowedRuleIds: ["ket-rule-slot-order"],
      expectedAnswers: ["na-|mo-|wan|-tu", "na- mo- wan -tu"],
      gradingExplanation: "The slots are subject prefix, object prefix, verb root, and time suffix."
    },
    {
      id: "ket-ex002",
      languageId: "ketharu",
      type: "translate_to_target",
      prompt: "Translate: They told the story yesterday.",
      allowedVocabulary: ["ka-", "se-", "lom", "-ra"],
      allowedRuleIds: ["ket-rule-slot-order"],
      expectedAnswers: ["ka-se-lom-ra"],
      gradingExplanation: "Use ka- for they, se- for story object, lom for tell, and -ra for yesterday."
    }
  ]
};

for (const fixture of syntheticLanguageFixtures) {
  fixture.exercisesAnswerKey = exerciseMap[fixture.language.id] ?? [];
}
```

Create `packages/synthetic-langs/src/loader.ts`:

```ts
import { appStateSchema, createEmptyState, type AppState } from "@assini/db";
import { syntheticLanguageFixtures } from "./fixtures";

export { syntheticLanguageFixtures };

export function buildSeedState(): AppState {
  const state = createEmptyState();
  for (const fixture of syntheticLanguageFixtures) {
    state.languages.push(fixture.language);
    state.corpus.push(...fixture.corpus);
    state.notes.push(...fixture.notesAnswerKey.map((note) => ({ ...note, status: "draft" as const })));
    state.exercises.push(...fixture.exercisesAnswerKey);
  }
  return appStateSchema.parse(state);
}
```

Create `packages/synthetic-langs/src/index.ts`:

```ts
export * from "./fixtures";
export * from "./loader";
```

Create `packages/synthetic-langs/src/seed.ts`:

```ts
import { JsonStore } from "@assini/db";
import { buildSeedState } from "./loader";

const store = new JsonStore();
const state = buildSeedState();
await store.write(state);

console.log(`Seeded ${state.languages.length} synthetic languages`);
console.log(`Seeded ${state.corpus.length} corpus passages`);
console.log(`Seeded ${state.notes.length} draft notes`);
console.log(`Seeded ${state.exercises.length} exercises`);
```

- [ ] **Step 4: Run fixture tests and seed command**

Run:

```powershell
npm test -- packages/synthetic-langs/src/loader.test.ts
npm run seed
```

Expected: tests PASS, then seed prints four languages, forty corpus passages, twenty draft notes, and twenty exercises.

- [ ] **Step 5: Commit**

```powershell
git add packages/synthetic-langs packages/db package.json package-lock.json data/.gitkeep
git commit -m "feat: add synthetic language fixtures"
```

---

## Task 4: Evaluation Harness

**Files:**

- Create: `packages/eval/package.json`
- Create: `packages/eval/tsconfig.json`
- Create: `packages/eval/src/studyLoop.ts`
- Create: `packages/eval/src/scoring.ts`
- Create: `packages/eval/src/runEvaluation.ts`
- Create: `packages/eval/src/cli.ts`
- Create: `packages/eval/src/index.ts`
- Create: `packages/eval/src/scoring.test.ts`

- [ ] **Step 1: Write the failing scoring test**

Create `packages/eval/src/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSeedState } from "@assini/synthetic-langs";
import { gradeExerciseAnswer, scoreLanguageEvaluation } from "./scoring";
import { draftNotesForLanguage } from "./studyLoop";

describe("evaluation scoring", () => {
  it("grades accepted and rejected exercise answers", () => {
    const state = buildSeedState();
    const exercise = state.exercises.find((item) => item.id === "avn-ex001");
    if (!exercise) throw new Error("Missing avn-ex001");

    expect(gradeExerciseAnswer(exercise, "mira talo-mi-na").accepted).toBe(true);
    expect(gradeExerciseAnswer(exercise, "talo mira").accepted).toBe(false);
  });

  it("scores a synthetic language against the gold answer key", () => {
    const state = buildSeedState();
    const language = state.languages.find((item) => item.id === "avenik");
    if (!language) throw new Error("Missing Avenik");

    const drafted = draftNotesForLanguage(language.id, state);
    const result = scoreLanguageEvaluation(language.id, state, drafted);

    expect(result.scores.noteCoverage).toBe(1);
    expect(result.scores.evidenceAccuracy).toBe(1);
    expect(result.failures).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the failing scoring test**

Run:

```powershell
npm test -- packages/eval/src/scoring.test.ts
```

Expected: FAIL because `./scoring` and `./studyLoop` do not exist.

- [ ] **Step 3: Implement evaluation package**

Create `packages/eval/package.json`:

```json
{
  "name": "@assini/eval",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "eval": "tsx src/cli.ts",
    "test": "vitest run src"
  },
  "dependencies": {
    "@assini/db": "0.1.0",
    "@assini/synthetic-langs": "0.1.0"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `packages/eval/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{ "path": "../db" }, { "path": "../synthetic-langs" }],
  "include": ["src"]
}
```

Create `packages/eval/src/studyLoop.ts`:

```ts
import type { AppState, Note } from "@assini/db";

export function draftNotesForLanguage(languageId: string, state: AppState): Note[] {
  const languageNotes = state.notes.filter((note) => note.languageId === languageId);
  return languageNotes.map((note) => ({
    ...note,
    id: note.id.replace("-note", "-draft"),
    status: "draft",
    reviewer: {
      lastReviewedBy: null,
      lastReviewedAt: null,
      comments: ["Deterministic draft generated from synthetic fixture evidence."]
    },
    editHistory: [
      ...note.editHistory,
      {
        at: new Date(0).toISOString(),
        by: "deterministic-study-loop",
        action: "drafted",
        summary: "Created draft note from answer-key fixture for baseline evaluation."
      }
    ]
  }));
}
```

Create `packages/eval/src/scoring.ts`:

```ts
import type { AppState, EvaluationFailure, Exercise, Note } from "@assini/db";

type LanguageScoreResult = {
  scores: Record<string, number>;
  failures: EvaluationFailure[];
};

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreRatio(pass: number, total: number): number {
  return total === 0 ? 1 : Number((pass / total).toFixed(4));
}

function answerKeyTopicMap(languageId: string, state: AppState): Map<string, Note> {
  return new Map(state.notes.filter((note) => note.languageId === languageId).map((note) => [note.topic, note]));
}

export function gradeExerciseAnswer(exercise: Exercise, answer: string): { accepted: boolean; explanation: string } {
  const normalizedAnswer = normalize(answer);
  const accepted = exercise.expectedAnswers.some((expected) => normalize(expected) === normalizedAnswer);
  return {
    accepted,
    explanation: accepted ? exercise.gradingExplanation : `Expected one of: ${exercise.expectedAnswers.join(" | ")}`
  };
}

export function scoreLanguageEvaluation(
  languageId: string,
  state: AppState,
  draftedNotes: Note[]
): LanguageScoreResult {
  const failures: EvaluationFailure[] = [];
  const expectedByTopic = answerKeyTopicMap(languageId, state);
  const draftedByTopic = new Map(draftedNotes.map((note) => [note.topic, note]));

  let coveragePass = 0;
  let contentPass = 0;
  let evidencePass = 0;

  for (const [topic, expected] of expectedByTopic) {
    const drafted = draftedByTopic.get(topic);
    if (!drafted) {
      failures.push({
        category: "noteCoverage",
        languageId,
        itemId: expected.id,
        message: `Missing note topic ${topic}`
      });
      continue;
    }

    coveragePass += 1;

    if (normalize(drafted.explanation) === normalize(expected.explanation)) {
      contentPass += 1;
    } else {
      failures.push({
        category: "noteAccuracy",
        languageId,
        itemId: expected.id,
        message: `Explanation mismatch for ${topic}`
      });
    }

    const expectedEvidence = expected.evidencePassageIds.slice().sort().join("|");
    const draftedEvidence = drafted.evidencePassageIds.slice().sort().join("|");
    if (expectedEvidence === draftedEvidence) {
      evidencePass += 1;
    } else {
      failures.push({
        category: "evidenceAccuracy",
        languageId,
        itemId: expected.id,
        message: `Evidence mismatch for ${topic}`
      });
    }
  }

  const languageCorpus = state.corpus.filter((passage) => passage.languageId === languageId);
  const segmentationPass = languageCorpus.filter((passage) => passage.morphologicalSegmentation.length > 0).length;
  const translationPass = languageCorpus.filter(
    (passage) => passage.textTranslation.length > 0 && passage.textTarget.length > 0
  ).length;

  const languageExercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
  const exercisePass = languageExercises.filter((exercise) =>
    exercise.expectedAnswers.every((answer) => gradeExerciseAnswer(exercise, answer).accepted)
  ).length;

  const generationCheckedExercises = languageExercises.filter(
    (exercise) =>
      exercise.type === "translate_to_target" || exercise.type === "segment" || exercise.type === "choose_particle"
  );
  const allowedForms = new Set(generationCheckedExercises.flatMap((exercise) => exercise.allowedVocabulary));
  const generationPolicyPass = generationCheckedExercises.filter((exercise) =>
    exercise.expectedAnswers.every((answer) => {
      const compactAnswer = answer.replace(/\|/g, " ");
      return compactAnswer
        .split(/\s+/)
        .filter(Boolean)
        .every((part) => allowedForms.has(part) || part.includes("-"));
    })
  ).length;

  return {
    scores: {
      noteCoverage: scoreRatio(coveragePass, expectedByTopic.size),
      noteAccuracy: scoreRatio(contentPass, expectedByTopic.size),
      evidenceAccuracy: scoreRatio(evidencePass, expectedByTopic.size),
      segmentationAccuracy: scoreRatio(segmentationPass, languageCorpus.length),
      translationAccuracy: scoreRatio(translationPass, languageCorpus.length),
      exerciseGrading: scoreRatio(exercisePass, languageExercises.length),
      generationPolicy: scoreRatio(generationPolicyPass, generationCheckedExercises.length)
    },
    failures
  };
}
```

Create `packages/eval/src/runEvaluation.ts`:

```ts
import type { AppState, EvaluationRun } from "@assini/db";
import { draftNotesForLanguage } from "./studyLoop";
import { scoreLanguageEvaluation } from "./scoring";

export function runEvaluationForState(state: AppState): EvaluationRun[] {
  return state.languages.map((language) => {
    const drafted = draftNotesForLanguage(language.id, state);
    const result = scoreLanguageEvaluation(language.id, state, drafted);
    const average =
      Object.values(result.scores).reduce((sum, score) => sum + score, 0) / Object.values(result.scores).length;

    return {
      id: `eval-${language.id}-${Date.now()}`,
      languageId: language.id,
      createdAt: new Date().toISOString(),
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "synthetic-fixtures-2026-06-03",
      scores: result.scores,
      failures: result.failures,
      summary: `${language.name}: ${(average * 100).toFixed(1)}% average score across ${Object.keys(result.scores).length} categories.`
    };
  });
}
```

Create `packages/eval/src/cli.ts`:

```ts
import { JsonStore } from "@assini/db";
import { runEvaluationForState } from "./runEvaluation";

const store = new JsonStore();
const state = await store.read();

if (state.languages.length === 0) {
  throw new Error("No languages found. Run npm run seed first.");
}

const runs = runEvaluationForState(state);
await store.write({
  ...state,
  evaluationRuns: [...state.evaluationRuns, ...runs]
});

for (const run of runs) {
  console.log(run.summary);
}
```

Create `packages/eval/src/index.ts`:

```ts
export * from "./studyLoop";
export * from "./scoring";
export * from "./runEvaluation";
```

- [ ] **Step 4: Run scoring tests and CLI**

Run:

```powershell
npm test -- packages/eval/src/scoring.test.ts
npm run seed
npm run eval
```

Expected: tests PASS, seed succeeds, eval prints one summary for each of the four languages.

- [ ] **Step 5: Commit**

```powershell
git add packages/eval packages/db packages/synthetic-langs package.json package-lock.json
git commit -m "feat: add synthetic evaluation harness"
```

---

## Task 5: API Service

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/server.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `apps/api/src/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSeedState } from "@assini/synthetic-langs";
import { createServer } from "./server";

describe("api server", () => {
  it("returns languages and corpus", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(4);

    const corpus = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()[0].languageId).toBe("avenik");
  });

  it("runs evaluations", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({ method: "POST", url: "/evaluations/run" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run failing API tests**

Run:

```powershell
npm test -- apps/api/src/server.test.ts
```

Expected: FAIL because `./server` does not exist.

- [ ] **Step 3: Implement Fastify API**

Create `apps/api/package.json`:

```json
{
  "name": "@assini/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run src"
  },
  "dependencies": {
    "@assini/db": "0.1.0",
    "@assini/eval": "0.1.0",
    "@fastify/cors": "^10.0.1",
    "fastify": "^5.1.0"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{ "path": "../../packages/db" }, { "path": "../../packages/eval" }],
  "include": ["src"]
}
```

Create `apps/api/src/server.ts`:

```ts
import cors from "@fastify/cors";
import Fastify from "fastify";
import { createEmptyState, JsonStore, type AppState, type Note } from "@assini/db";
import { runEvaluationForState } from "@assini/eval";

type ServerOptions = {
  store?: JsonStore;
  initialState?: AppState;
};

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  const store = options.store ?? new JsonStore();
  let memoryState = options.initialState;

  const readState = async () => memoryState ?? store.read();
  const writeState = async (state: AppState) => {
    if (memoryState) {
      memoryState = state;
    } else {
      await store.write(state);
    }
  };

  app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  app.get("/languages", async () => {
    const state = await readState();
    return state.languages;
  });

  app.get("/languages/:languageId/corpus", async (request) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    return state.corpus.filter((passage) => passage.languageId === languageId);
  });

  app.get("/languages/:languageId/notes", async (request) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    return state.notes.filter((note) => note.languageId === languageId);
  });

  app.get("/languages/:languageId/exercises", async (request) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    return state.exercises.filter((exercise) => exercise.languageId === languageId);
  });

  app.get("/evaluations", async () => {
    const state = await readState();
    return state.evaluationRuns;
  });

  app.post("/evaluations/run", async () => {
    const current = await readState();
    const base = current.languages.length > 0 ? current : createEmptyState();
    const runs = runEvaluationForState(base);
    await writeState({ ...base, evaluationRuns: [...base.evaluationRuns, ...runs] });
    return runs;
  });

  app.patch("/notes/:noteId/review", async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const body = request.body as Partial<Pick<Note, "status" | "explanation">> & { reviewerComment?: string };
    const state = await readState();
    const existing = state.notes.find((note) => note.id === noteId);

    if (!existing) {
      reply.code(404);
      return { error: `Note not found: ${noteId}` };
    }

    const nextNote: Note = {
      ...existing,
      status: body.status ?? existing.status,
      explanation: body.explanation ?? existing.explanation,
      reviewer: {
        lastReviewedBy: "local-reviewer",
        lastReviewedAt: new Date().toISOString(),
        comments: body.reviewerComment
          ? [...existing.reviewer.comments, body.reviewerComment]
          : existing.reviewer.comments
      },
      editHistory: [
        ...existing.editHistory,
        {
          at: new Date().toISOString(),
          by: "local-reviewer",
          action: "reviewed",
          summary: body.reviewerComment ?? `Status set to ${body.status ?? existing.status}`
        }
      ]
    };

    const nextState = {
      ...state,
      notes: state.notes.map((note) => (note.id === noteId ? nextNote : note))
    };

    await writeState(nextState);
    return nextNote;
  });

  return app;
}
```

Create `apps/api/src/index.ts`:

```ts
import { createServer } from "./server";

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "127.0.0.1";

const app = createServer();
await app.listen({ port, host });

console.log(`AssiniLang API listening at http://${host}:${port}`);
```

- [ ] **Step 4: Run API tests**

Run:

```powershell
npm test -- apps/api/src/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api package.json package-lock.json
git commit -m "feat: add api service"
```

---

## Task 6: Web Prototype

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write failing UI smoke test**

Create `apps/web/src/App.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./api", () => ({
  fetchDashboardData: async () => ({
    languages: [
      {
        id: "avenik",
        name: "Avenik",
        typology: "agglutinative",
        description: "Synthetic agglutinative language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      }
    ],
    corpus: [],
    notes: [],
    exercises: [],
    evaluations: []
  }),
  runEvaluation: async () => []
}));

describe("App", () => {
  it("renders the main synthetic data surfaces", async () => {
    render(<App />);
    expect(await screen.findByText("Synthetic Language Evaluation")).toBeInTheDocument();
    expect(await screen.findByText("Corpus Browser")).toBeInTheDocument();
    expect(await screen.findByText("Note Review Queue")).toBeInTheDocument();
    expect(await screen.findByText("Evaluation Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Learner Exercise Preview")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing UI test**

Run:

```powershell
npm test -- apps/web/src/App.test.tsx --environment jsdom
```

Expected: FAIL because `./App` does not exist.

- [ ] **Step 3: Implement Vite React app**

Create `apps/web/package.json`:

```json
{
  "name": "@assini/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite --host 127.0.0.1 --port 5173",
    "preview": "vite preview",
    "test": "vitest run src --environment jsdom"
  },
  "dependencies": {
    "@assini/db": "0.1.0",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "rootDir": ".",
    "outDir": "dist"
  },
  "references": [{ "path": "../../packages/db" }],
  "include": ["src", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4321",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AssiniLang Synthetic Evaluation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/src/api.ts`:

```ts
import type { CorpusPassage, EvaluationRun, Exercise, Language, Note } from "@assini/db";

export type DashboardData = {
  languages: Language[];
  corpus: CorpusPassage[];
  notes: Note[];
  exercises: Exercise[];
  evaluations: EvaluationRun[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchDashboardData(languageId = "avenik"): Promise<DashboardData> {
  const [languages, corpus, notes, exercises, evaluations] = await Promise.all([
    getJson<Language[]>("/languages"),
    getJson<CorpusPassage[]>(`/languages/${languageId}/corpus`),
    getJson<Note[]>(`/languages/${languageId}/notes`),
    getJson<Exercise[]>(`/languages/${languageId}/exercises`),
    getJson<EvaluationRun[]>("/evaluations")
  ]);

  return { languages, corpus, notes, exercises, evaluations };
}

export async function runEvaluation(): Promise<EvaluationRun[]> {
  const response = await fetch("/api/evaluations/run", { method: "POST" });
  if (!response.ok) {
    throw new Error("Evaluation run failed");
  }
  return response.json() as Promise<EvaluationRun[]>;
}
```

Create `apps/web/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "./api";
import { fetchDashboardData, runEvaluation } from "./api";
import "./styles.css";

type LoadState =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: DashboardData };

export function App() {
  const [selectedLanguageId, setSelectedLanguageId] = useState("avenik");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [answer, setAnswer] = useState("");
  const [exerciseResult, setExerciseResult] = useState<string | null>(null);

  useEffect(() => {
    setLoadState({ status: "loading" });
    fetchDashboardData(selectedLanguageId)
      .then((data) => setLoadState({ status: "ready", data }))
      .catch((error: Error) => setLoadState({ status: "error", message: error.message }));
  }, [selectedLanguageId]);

  const data = loadState.status === "ready" ? loadState.data : null;
  const selectedLanguage = data?.languages.find((language) => language.id === selectedLanguageId);
  const latestEvaluations = useMemo(() => data?.evaluations.slice(-4).reverse() ?? [], [data]);
  const firstExercise = data?.exercises[0];

  async function handleRunEvaluation() {
    await runEvaluation();
    const refreshed = await fetchDashboardData(selectedLanguageId);
    setLoadState({ status: "ready", data: refreshed });
  }

  function handleGradeExercise() {
    if (!firstExercise) return;
    const accepted = firstExercise.expectedAnswers.some(
      (expected) => expected.trim().toLowerCase() === answer.trim().toLowerCase()
    );
    setExerciseResult(
      accepted ? firstExercise.gradingExplanation : `Try again. Expected: ${firstExercise.expectedAnswers.join(" | ")}`
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Synthetic fixtures only</p>
          <h1>Synthetic Language Evaluation</h1>
        </div>
        <button type="button" onClick={handleRunEvaluation}>
          Run Evaluation
        </button>
      </header>

      {loadState.status === "loading" && <p className="status">Loading synthetic data...</p>}
      {loadState.status === "error" && <p className="status error">{loadState.message}</p>}

      {data && (
        <>
          <section className="language-strip" aria-label="Language selector">
            {data.languages.map((language) => (
              <button
                type="button"
                key={language.id}
                className={language.id === selectedLanguageId ? "selected" : ""}
                onClick={() => setSelectedLanguageId(language.id)}
              >
                <span>{language.name}</span>
                <small>{language.typology}</small>
              </button>
            ))}
          </section>

          <section className="summary-band">
            <h2>{selectedLanguage?.name ?? "Language"}</h2>
            <p>{selectedLanguage?.description}</p>
            <strong>Fake test data. Do not treat as a real language.</strong>
          </section>

          <div className="surface-grid">
            <section>
              <h2>Corpus Browser</h2>
              <div className="item-list">
                {data.corpus.slice(0, 5).map((passage) => (
                  <article key={passage.id} className="record">
                    <h3>{passage.textTarget}</h3>
                    <p>{passage.textTranslation}</p>
                    <code>
                      {passage.morphologicalSegmentation.map((part) => `${part.surface}:${part.gloss}`).join(" ")}
                    </code>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <h2>Note Review Queue</h2>
              <div className="item-list">
                {data.notes.map((note) => (
                  <article key={note.id} className="record">
                    <h3>{note.topic}</h3>
                    <p>{note.explanation}</p>
                    <span className="pill">{note.status}</span>
                    <span className="pill">{note.confidence}</span>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <h2>Evaluation Dashboard</h2>
              <div className="item-list">
                {latestEvaluations.length === 0 && <p>No evaluation runs yet.</p>}
                {latestEvaluations.map((run) => (
                  <article key={run.id} className="record">
                    <h3>{run.languageId}</h3>
                    <p>{run.summary}</p>
                    <code>
                      {Object.entries(run.scores)
                        .map(([key, value]) => `${key}: ${Math.round(value * 100)}%`)
                        .join(" | ")}
                    </code>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <h2>Learner Exercise Preview</h2>
              {firstExercise ? (
                <article className="record">
                  <h3>{firstExercise.prompt}</h3>
                  <input
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    aria-label="Exercise answer"
                  />
                  <button type="button" onClick={handleGradeExercise}>
                    Grade
                  </button>
                  {exerciseResult && <p>{exerciseResult}</p>}
                </article>
              ) : (
                <p>No exercise available.</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
```

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `apps/web/src/styles.css`:

```css
:root {
  color: #172026;
  background: #f4f6f2;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input {
  font: inherit;
}

button {
  border: 1px solid #2f5d62;
  background: #2f5d62;
  color: white;
  border-radius: 6px;
  padding: 0.65rem 0.85rem;
  cursor: pointer;
}

input {
  width: 100%;
  border: 1px solid #aab6a2;
  border-radius: 6px;
  padding: 0.65rem;
  margin: 0.5rem 0;
}

.app-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #cfd8cb;
  padding-bottom: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #6b5b2f;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: 2rem;
}

h2 {
  font-size: 1.1rem;
}

h3 {
  font-size: 1rem;
}

.status {
  margin: 24px 0;
  font-weight: 700;
}

.error {
  color: #9f2d2d;
}

.language-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin: 20px 0;
}

.language-strip button {
  text-align: left;
  background: #fff;
  color: #172026;
  border-color: #cfd8cb;
}

.language-strip button.selected {
  border-color: #2f5d62;
  box-shadow: inset 0 0 0 2px #2f5d62;
}

.language-strip span,
.language-strip small {
  display: block;
}

.language-strip small {
  color: #54615f;
}

.summary-band {
  padding: 18px 0;
  border-top: 1px solid #cfd8cb;
  border-bottom: 1px solid #cfd8cb;
}

.summary-band strong {
  color: #6b5b2f;
}

.surface-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}

.surface-grid section {
  min-width: 0;
}

.item-list {
  display: grid;
  gap: 10px;
}

.record {
  background: #fff;
  border: 1px solid #d8ded4;
  border-radius: 8px;
  padding: 14px;
}

.record code {
  display: block;
  white-space: normal;
  color: #3f4a4d;
}

.pill {
  display: inline-block;
  margin-right: 6px;
  border-radius: 999px;
  background: #e9eee6;
  color: #2f5d62;
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
}

@media (max-width: 760px) {
  .top-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .surface-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run UI tests**

Run:

```powershell
npm test -- apps/web/src/App.test.tsx --environment jsdom
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web package.json package-lock.json
git commit -m "feat: add web prototype surfaces"
```

---

## Task 7: End-To-End Verification And Docs

**Files:**

- Modify: `README.md`
- Modify: package files only if scripts need adjustment after verification.

- [ ] **Step 1: Run full test suite**

Run:

```powershell
npm test
```

Expected: all package, API, and web tests PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```powershell
npm run check
```

Expected: TypeScript project references build without errors.

- [ ] **Step 3: Run seed and evaluation commands**

Run:

```powershell
npm run seed
npm run eval
```

Expected: seed reports four languages and forty corpus passages; eval reports four language summaries.

- [ ] **Step 4: Start the app**

Run:

```powershell
npm run dev
```

Expected: API starts on `http://127.0.0.1:4321` and web app starts on `http://127.0.0.1:5173`.

- [ ] **Step 5: Verify browser behavior**

Open `http://127.0.0.1:5173` and verify:

- The page title reads `Synthetic Language Evaluation`.
- Four language buttons are visible.
- Corpus Browser shows target text, translations, segmentation, and a validated synthetic passage import flow.
- Note Review Queue shows notes with status and confidence.
- Evaluation Dashboard updates after pressing `Run Evaluation`.
- Learner Exercise Preview grades a correct answer.

- [ ] **Step 6: Update README with verified command output**

Append this section to `README.md` after the local setup section:

````md
## Verification

The baseline synthetic testbed is healthy when these commands succeed:

```powershell
npm test
npm run check
npm run seed
npm run eval
```
````

The web prototype should then run with:

```powershell
npm run dev
```

````

- [ ] **Step 7: Commit**

```powershell
git add README.md package.json package-lock.json apps packages
git commit -m "docs: document verification workflow"
````

---

## Self-Review

**Spec coverage:** The plan creates the full-stack scaffold, four synthetic languages, local persistence, evaluation harness, API, web UI, tests, and one-command demo script described in the spec.

**Marker scan:** The plan avoids unresolved markers and does not defer implementation details to later tasks.

**Type consistency:** `Language`, `CorpusPassage`, `Note`, `Exercise`, `EvaluationRun`, and `AppState` originate in `packages/db/src/schema.ts` and are reused across fixtures, eval, API, and web.

**Risk note:** The fixture task intentionally uses compact synthetic corpora for the first milestone. Corpus size can scale by adding more passages to the existing fixture structure without changing app architecture.
