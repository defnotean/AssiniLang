# UI Design Guide

This guide documents how the Claude Design handoff for `AssiniLang.html` maps into the real AssiniLang React app. Keep detailed UI notes here so the root README can stay concise.

## Source Handoff

The implemented direction is the final `AssiniLang.html` handoff from the design bundle. The chat transcript settled on a dark, language-first research console, not a marketing page or generic dashboard.

The chosen design is the `Atlas layout`:

- A language-first left sidebar.
- Per-language section navigation for profile, corpus, notes, learner practice, evaluation, governance, and model setup.
- Dense but readable work surfaces for repeated research and review tasks.
- A dark night-sky visual system with warm gold accents.
- Subtle geometric dividers and glyphs used as interface texture, not decoration-heavy branding.

The design remains `synthetic-only`. It should communicate care, preservation, and review discipline while making clear that no real community language data belongs in the app yet.

## Visual System

The web app implements the design through `apps/web/src/styles.css` and reusable JSX primitives in `apps/web/src/App.tsx`.

Key tokens and motifs:

- `--bg`, `--sidebar`, `--panel`, and `--card` create the night-sky shell.
- `--accent` and `--accent-bg` provide warm gold focus, active states, dividers, and score highlights.
- `--font-serif` is used for product marks, section titles, translations, note topics, and exercise prompts.
- `--font-body` is used for controls, labels, dense metadata, and tables.
- `--font-mono` is used for target-language forms, morphemes, IDs, and command-like values.
- `CompassMark`, `TypologyMark`, and `DiamondBand` carry the design identity without needing raster assets.

Use cultural visual cues cautiously. The current motifs are broad placeholder cues inspired by night sky, four-direction geometry, bead-like rhythm, and woven diamond dividers. They are not nation-specific and must be reviewed with community partners before real data or public launch.

## Application Shell

The main shell should preserve the Atlas structure:

- Sidebar first: the language is the primary context.
- Section nav second: each workspace belongs to the selected language.
- Synthetic notice always visible near the top.
- Header shows the selected language, current workspace, metadata chips, and primary actions.
- Stat strip summarizes corpus, notes, exercises, and latest score for the active language.

Avoid landing-page patterns inside the app. The first screen should stay the usable research console.

## Workspaces

### Corpus Browser

The corpus view should make source material scannable:

- Target text in monospace accent styling.
- English translation in serif italic styling.
- Morpheme chips with surface and gloss stacked together.
- Tags, source, and consent labels visible but secondary.
- Import controls compact enough that the passage list remains the main surface.

### Note Review Queue

The review queue should support high-volume triage:

- Keep the note table dense.
- Show topic, status, confidence, evidence count, and action buttons without forcing navigation away.
- Keep selected-note detail alongside the table on desktop.
- Require clear comments for contested, rejected, deferred, and escalated states through API validation.

### Learning Lab

Learner exercises are functional previews, not answer-key displays:

- Public exercise data must omit expected answers, adversarial probes, and grading explanations.
- The browser submits answers to the API for grading.
- Submission history stays sanitized and must not reveal learner answers.
- Authoring controls belong in this workspace but should stay visually secondary to exercise preview and grading.

### Evaluation Dashboard

The evaluation view should make quality obvious at a glance:

- Score rings summarize latest language-level runs.
- Category bars expose the underlying evaluation dimensions.
- Trend cards call out regression, improvement, or stable state.
- Failure lines should be visible and concrete enough to guide the next fix.

### Governance And Model Setup

Governance and model setup are operational surfaces:

- Keep policy records, dispositions, audit events, and exports data-forward.
- Do not over-style these views; reliability and scanability matter most.
- Snapshot export summaries should include fixture-quality pass counts so reviewers can identify baseline gaps before opening JSON artifacts.
- Never expose provider keys, answer keys, learner answers, hidden model traces, or local user internals.

## Responsiveness

The desktop layout is primary, but mobile must remain usable:

- At medium widths, evaluation cards wrap before text compresses.
- At tablet widths, sidebar, review, profile, governance, model, and exercise grids collapse to one column.
- At phone widths, dense table rows become stacked rows and headers hide where labels are implied.
- Text should wrap inside its container instead of overlapping adjacent controls.

When changing layout CSS, smoke test at desktop, tablet, and narrow mobile widths.

## Maintenance Checklist

For future UI changes:

- Keep the root README short; add detailed notes here or in topic-specific docs.
- Preserve synthetic-only messaging.
- Keep API-backed workflows functional rather than replacing them with static mock data.
- Add or update React tests for navigation, mutation flows, redaction expectations, and error states.
- Run `npm.cmd run verify` before committing.
- Browser-smoke frontend changes after automated tests pass.
