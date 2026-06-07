# Development Guide

This guide covers local setup, verification, browser checks, and synthetic-language authoring.

## Requirements

- Node.js compatible with the repository lockfile.
- npm.
- PowerShell on Windows, or any shell that can run the equivalent npm commands.

## Install

```powershell
npm.cmd install
```

On macOS, Linux, or shells where the normal npm shim is available, use `npm` instead of `npm.cmd`.

## Local Quality Gate

Use the full verifier before committing meaningful changes:

```powershell
npm.cmd run verify
```

The verifier runs:

1. Vitest.
2. TypeScript project checks.
3. Synthetic seed generation.
4. Deterministic evaluation.
5. Workspace builds.

For narrower loops:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run seed
npm.cmd run eval
npm.cmd run build
```

## Start The App

```powershell
npm.cmd run dev
```

Default URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:4321`

If those ports are occupied:

```powershell
$env:ASSINI_DEV_API_PORT="44321"
$env:ASSINI_DEV_WEB_PORT="55173"
npm.cmd run dev
```

## Demo Mode

```powershell
npm.cmd run demo
```

This seeds synthetic data, runs evaluation, and starts both local services.

## Browser Verification

For frontend changes, verify the user workflow in a browser in addition to automated tests.

Useful smoke checks:

- Page title loads as `AssiniLang`.
- Four language buttons are visible.
- Corpus Browser shows target text, translations, segmentation, and import controls.
- Corpus import can create a validated synthetic passage and refresh the visible passage count.
- Note Review Queue shows statuses and evidence counts.
- Learning Lab grades a correct answer.
- Evaluation Dashboard can run a system eval.
- Governance view can load policy, audit, disposition, and export controls.

## Adding A Synthetic Language

Add fixture data in `packages/synthetic-langs/src/fixtures.ts`.

The authoritative richness floor is `SYNTHETIC_FIXTURE_MINIMUMS` in `packages/synthetic-langs/src/validation.ts`. Update that exported contract first when raising fixture depth, then update docs and tests to match. Use `buildSyntheticFixtureQualityActuals` and `summarizeSyntheticFixtureQuality` from the same package for any actual-vs-minimum reporting instead of recreating quality-check labels or ordering in API or UI code.

Each language should include:

- Language metadata.
- Structured phonology and phonotactic notes that cover public vocabulary, corpus, and paradigm forms.
- At least two paradigm tables with vocabulary-backed morphemes.
- At least two public dialect variants with phonology, lexical, grammar, and example-phrase notes.
- At least 24 public vocabulary items, including enough roots, particles, affixes, endings, or prefixes to support the language typology. Vocabulary IDs, normalized forms, and per-item tags must be unique.
- At least six grammar rules.
- At least 12 corpus passages.
- Morphological segmentation.
- Six note answer keys derived from those grammar rules.
- At least six learner exercise answer keys.
- Every grammar rule should be covered by a note answer key and by at least one learner exercise allow-list.
- At least two exercise types.
- Two curated adversarial probes per exercise.
- At least three discourse examples.
- At least two teaching sequences that cite existing grammar rules, corpus passages, and learner exercises, with intro/practice/review levels and nonblank ordered steps.

After adding or editing fixtures:

```powershell
npm.cmd run verify
```

## Editing API Public Shapes

When changing public responses:

- Keep redaction/projection logic in `apps/api/src/publicLanguageViews.ts`.
- Add tests that assert private fields are omitted.
- Check snapshot and evaluation export integrity fields.
- Avoid logging or returning answer keys, learner answers, provider prompts, API keys, or hidden model traces.

## Editing Mutations

When adding a mutation route:

- Validate before mutation.
- Role-gate the route.
- Preserve state on validation failure.
- Add an audit event after successful mutation.
- Keep audit metadata minimal and non-private.
- Add red/green tests for success, invalid body, unknown language or entity, and forbidden role cases.

## Editing The Web App

When adding a workflow:

- Add API client tests for route construction, auth session behavior, and payload shape.
- Add app tests for the user workflow.
- Keep local form validation focused on obvious missing fields.
- Treat the API as the source of truth for domain validation.
- Extract reusable form parsing and payload-building logic into focused helper modules with direct tests.
- Run a browser smoke check after automated tests pass.

## Generated Files

Generated local data and build output are ignored by Git. Regenerate local state with:

```powershell
npm.cmd run seed
```
