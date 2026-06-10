# AssiniLang Documentation

This folder is the detailed handbook for AssiniLang. The root README stays short on purpose; use these docs when you need the deeper system picture.

## Reading Path

1. [Product Guide](product-guide.md): what the prototype does and how each workspace is meant to be used.
2. [UI Design Guide](ui-design.md): how the `AssiniLang.html` design handoff maps to the real React app.
3. [Architecture And Data](architecture.md): how the apps, packages, ingestion pipeline, persistence, validation, and redaction layers fit together.
4. [API Reference](api.md): route behavior, auth expectations, mutation rules, and important payload shapes.
5. [Development Guide](development.md): setup, commands, testing, browser verification, and model/transcription configuration.
6. [Roadmap](roadmap.md): what must happen before real community language material can be used.

## Historical Design Docs

- [Synthetic Language Evaluation Platform Spec](specs/2026-06-03-synthetic-language-evaluation-platform-design.md)
- [Implementation Plan](plans/2026-06-03-synthetic-language-evaluation-platform.md)

## Project Principle

AssiniLang works only on data its users create and ingest themselves, with consent and provenance tracked per passage. Do not connect real First Nations, Indigenous, or community language material until governance, consent, access control, review, and production security are ready. Treat the current system as a research console and quality gate, not as a live community-language platform.
