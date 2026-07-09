# AssiniLang documentation

This folder is the detailed handbook for AssiniLang. The root README stays short on purpose; use these docs when you need the deeper system picture.

## Reading paths

Pick the path that matches what you are doing:

- Using the app: [Product Guide](product-guide.md), then the "Building a language from raw sources" walkthrough in the [Development Guide](development.md), with the [Ingestion Deep Dive](ingestion.md) when a source, Obsidian vault import, or corpus graph looks wrong.
- Configuring models: [Configuration Reference](configuration.md) for variables, saved model profiles, discovery URLs, and recipes; [Troubleshooting](troubleshooting.md) when readiness warnings appear; [Ingestion Deep Dive](ingestion.md) for which model each source kind needs.
- Developing: [Development Guide](development.md) for setup and the quality gate, [Architecture And Data](architecture.md) for how the pieces fit, [API Reference](api.md) for route behavior.
- Maintaining and extending: [Maintenance Guide](maintenance.md) for change recipes and documentation conventions, [Operator Recovery Runbook](operator-recovery.md) for local backup/restore and stuck-processing drills, plus [Architecture And Data](architecture.md) for the data model you are changing.

## Doc index

| Doc | One line |
| --- | --- |
| [Product Guide](product-guide.md) | What the prototype does and how each workspace is meant to be used. |
| [Configuration Reference](configuration.md) | Every environment variable, defaults, accepted values, and setup recipes. |
| [Ingestion Deep Dive](ingestion.md) | Source kinds, processing flow, chunking, SSRF guard, OCR, transcription, duplicate flags, error catalogue. |
| [API Reference](api.md) | Full route index, auth model, mutation rules, payload shapes. |
| [Architecture And Data](architecture.md) | Component diagram, data model, persistence, validation, projection, evaluation. |
| [Development Guide](development.md) | Setup, commands, quality gate, browser verification, and the build-a-language walkthrough. |
| [Maintenance Guide](maintenance.md) | Recipes for adding routes, views, source kinds, schema changes, and keeping docs honest. |
| [Operator Recovery Runbook](operator-recovery.md) | Local data paths, backup/restore, interrupted processing, corrupt DB handling, diagnostics, and reset steps. |
| [Troubleshooting](troubleshooting.md) | Symptom-cause-fix tables for ports, models, sources, and data problems. |
| [UI Design Guide](ui-design.md) | How the `AssiniLang.html` design handoff maps to the real React app. |
| [Roadmap](roadmap.md) | What must happen before real community language material can be used. |

## Historical design docs

Dated history, kept as-is and not updated (these predate the raw-data milestone and use the project's earlier "synthetic language" framing):

- [Synthetic Language Evaluation Platform Spec](specs/2026-06-03-synthetic-language-evaluation-platform-design.md)
- [Implementation Plan](plans/2026-06-03-synthetic-language-evaluation-platform.md)

## Project principle

AssiniLang works only on data its users create and ingest themselves, with consent and provenance tracked per passage. Do not connect real First Nations, Indigenous, or community language material until governance, consent, access control, review, and production security are ready. Treat the current system as a research console and quality gate, not as a live community-language platform.
