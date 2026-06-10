# UI design guide

This guide documents how the `AssiniLang.html` design handoff maps into the real AssiniLang React app. Keep detailed UI notes here so the root README can stay concise.

## Source handoff

The implemented direction is the final `AssiniLang.html` handoff from the design bundle. The design exploration settled on a dark, language-first research console, not a marketing page or generic dashboard.

The chosen design is the `Atlas layout`:

- A language-first left sidebar.
- Per-language section navigation for profile, intake, corpus, notes, learner practice, evaluation, governance, and model setup.
- Dense but readable work surfaces for repeated research and review tasks.
- A dark night-sky visual system with warm gold accents.
- Subtle geometric dividers and glyphs used as interface texture, not decoration-heavy branding.

The design remains local-first. It should communicate care, preservation, and review discipline, and make clear that every ingested source carries provenance and consent records and is processed on the user's machine.

## Visual system

The web app implements the design through `apps/web/src/styles.css` and reusable JSX primitives in `apps/web/src/App.tsx`.

Key tokens and motifs:

- `--bg`, `--sidebar`, `--panel`, and `--card` create the night-sky shell.
- `--accent` and `--accent-bg` provide warm gold focus, active states, dividers, and score highlights.
- `--font-serif` is used for product marks, section titles, translations, note topics, and exercise prompts.
- `--font-body` is used for controls, labels, dense metadata, and tables.
- `--font-mono` is used for target-language forms, morphemes, IDs, and command-like values.
- `CompassMark`, `TypologyMark`, and `DiamondBand` carry the design identity without needing raster assets.

Use cultural visual cues cautiously. The current motifs are broad placeholder cues inspired by night sky, four-direction geometry, bead-like rhythm, and woven diamond dividers. They are not nation-specific and must be reviewed with community partners before real data or public launch.

## Application shell

The main shell should preserve the Atlas structure:

- Sidebar first: the language is the primary context, with the New language creation form at the bottom of the sidebar so a workspace can be started without leaving the console.
- Section nav second: each workspace belongs to the selected language. The order is profile, Sources & intake, corpus, review, learner, evaluation, governance, model setup.
- Local-prototype notice always visible near the top.
- Header shows the selected language, current workspace, metadata chips, and primary actions.
- Stat strip summarizes corpus, notes, exercises, and latest score for the active language.

Avoid landing-page patterns inside the app. The first screen should stay the usable research console.

## Workspaces

### Language profile

The profile view should make each documented language inspectable:

- Keep phonology, vocabulary, the derived morpheme inventory, and grammar rules as separate scan-friendly regions.
- Show vocabulary entries with form, gloss, part of speech, tags, and source-asset traceability.
- Show morpheme-inventory entries with occurrence counts, passage chips, glosses, features, and linked lexeme metadata.
- Keep the stat counts (corpus, notes, exercises, source assets, pending drafts) near the top so reviewers can see data depth before reading detailed panels.
- An empty language shows empty regions; there are no fixture minimums to satisfy.

### Sources & intake

The intake workspace is the front door for raw materials:

- Registration and upload controls stay compact; the source list with status chips (`pending`, `processing`, `processed`, `failed`) is the main surface.
- Background processing keeps the view responsive: a processing source shows its in-flight state and the list polls until it settles.
- Failed sources surface their sanitized error inline so the fix is obvious before retrying.
- Processed sources surface their persisted processing warnings under the source (for example "used offline heuristic parsing" or "fell back to offline heuristics"), so a reviewer can see when processing fell back to a heuristic or OCR.
- Proposed drafts render with kind, payload, confidence, rationale, and duplicate badges ("Duplicate of existing entry", "Same form, different gloss", "Duplicate topic", "Duplicates another pending draft"). Badges warn; they never disable the accept/reject actions.
- Accept/reject actions stay adjacent to each draft for high-volume triage.

### Corpus browser

The corpus view should make source material scannable:

- Target text in monospace accent styling.
- English translation in serif italic styling.
- Morpheme chips with surface and gloss stacked together.
- Tags, source, and consent labels visible but secondary.
- Import controls compact enough that the passage list remains the main surface.

### Note review queue

The review queue should support high-volume triage:

- Keep the note table dense.
- Show topic, status, confidence, evidence count, and action buttons without forcing navigation away.
- Keep selected-note detail alongside the table on desktop.
- Require clear comments for contested, rejected, deferred, and escalated states through API validation.
- A "Draft notes with model" action generates grounded draft notes into the queue. Keep it secondary to the review controls and frame its output as drafts: the generated notes enter the queue as ordinary `draft` notes for review, never auto-approved. Surface dropped/ungrounded-note warnings so reviewers see what the grounding rejected. The action is model-only and should report a clear error when no model is configured.

### Learning lab

Learner exercises are functional previews, not answer-key displays:

- Public exercise data must omit expected answers, adversarial probes, and grading explanations.
- The browser submits answers to the API for grading.
- Submission history stays sanitized and must not reveal learner answers.
- Authoring controls belong in this workspace but should stay visually secondary to exercise preview and grading.
- A "Generate with model" action pre-fills the authoring form with a grounded draft exercise for the author to review and edit before saving. Frame it as a preview, not a saved exercise: the draft only populates the existing authoring fields, the author still saves through the normal authoring flow, and answer keys stay human-controlled. The action is model-only and should report a clear error when no model is configured.

### Evaluation dashboard

The evaluation view should make quality obvious at a glance:

- Score rings summarize latest language-level runs.
- Category bars expose the underlying evaluation dimensions.
- Trend cards call out regression, improvement, or stable state.
- Failure lines should be visible and concrete enough to guide the next fix.

### Governance and model setup

Governance and model setup are operational surfaces:

- Keep policy records, dispositions, audit events, and exports data-forward.
- Do not over-style these views; reliability and scanability matter most.
- Snapshot export summaries should surface the profile-derived counts (vocabulary, morphemes, grammar rules, corpus, source assets, pending drafts) so reviewers can identify gaps before opening JSON artifacts.
- Model setup reports provider readiness, transcription readiness, and observability without exposing secrets.
- The provider smoke test flags its result as an "offline placeholder" when no real model is configured, so a deterministic canned reply is never read as a model response.
- A Test connection button actively probes the configured provider endpoint and reports reachable, unreachable, or not-configured, distinct from the static config-shape readiness report.
- Never expose provider keys, answer keys, learner answers, hidden model traces, or local user internals.

## Responsiveness

The desktop layout is primary, but mobile must remain usable:

- At medium widths, evaluation cards wrap before text compresses.
- At tablet widths, sidebar, review, profile, governance, model, and exercise grids collapse to one column.
- At phone widths, dense table rows become stacked rows and headers hide where labels are implied.
- Text should wrap inside its container instead of overlapping adjacent controls.

When changing layout CSS, smoke test at desktop, tablet, and narrow mobile widths.

## Maintenance checklist

For future UI changes:

- Keep the root README short; add detailed notes here or in topic-specific docs.
- Preserve local-first, consent-aware messaging.
- Keep API-backed workflows functional rather than replacing them with static mock data.
- Add or update React tests for navigation, mutation flows, redaction expectations, and error states.
- Run `npm.cmd run verify` before committing.
- Browser-smoke frontend changes after automated tests pass.
- Follow the view-addition recipe in the [Maintenance Guide](maintenance.md) when adding a workspace.
