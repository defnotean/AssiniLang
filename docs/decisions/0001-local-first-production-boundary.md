# ADR 0001: Local-first production boundary

- Status: accepted
- Date: 2026-07-11

## Context

AssiniLang is a Windows-first desktop workbench whose strongest current safety
property is that the API, data, uploaded assets, model settings, and operator UI
can remain on one machine. The repository also contains prototype browser
sessions for exercising role-sensitive workflows. Those sessions do not prove
identity or community membership and are not production authentication.

## Decision

The repository-local production target is an offline-capable, single-device
desktop application with an API bound to loopback. Network exposure stays
disabled by default. The desktop may contact explicitly configured model,
transcription, OCR, embedding, MCP, or source endpoints only through the shared
outbound security boundary and explicit private-network opt-in.

Prototype sessions remain clearly labeled and must not be treated as an
authorization system. Non-loopback deployment, multi-user identity, community
membership, enforceable consent policy, or cloud storage require a separate
accepted decision with the relevant product and community owners. No real
Indigenous or community language data may be introduced before those external
decisions and their security controls exist.

## Consequences

- CI and desktop smoke tests must prove loopback startup and offline behavior.
- Production code must not silently enable non-loopback listeners.
- Outbound destinations require validation, connection-time enforcement,
  bounded responses, timeouts, redaction, and explicit private-network policy.
- Cloud deployment and real-data readiness remain external blockers rather than
  assumptions hidden in code.
