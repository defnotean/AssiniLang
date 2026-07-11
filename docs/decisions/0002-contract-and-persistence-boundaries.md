# ADR 0002: Contract and persistence boundaries

- Status: accepted
- Date: 2026-07-11

## Context

The original prototype reused database schemas and inferred persistence types
across API and browser boundaries. That reduced duplication but coupled public
payloads to storage and made persistence refactors or redaction mistakes harder
to reason about.

## Decision

`@assini/api-contract` owns transport schemas and public DTOs and must not depend
on `@assini/db`. `@assini/db` owns persisted records, migrations, and integrity
rules. API routes explicitly parse transport input and project private domain or
persistence state into public responses. Browser production code may depend on
the contract package but must not import runtime values from the database
package.

Architectural tests enforce these dependency directions. Type-only transitional
imports are acceptable only while a tracked migration remains; they are not a
substitute for an independent public contract.

## Consequences

- Public response changes become deliberate contract changes.
- Database migrations can evolve without automatically changing browser DTOs.
- Private answer keys, traces, secrets, and persistence-only metadata remain
  server-side unless an explicit, tested projection includes them.
- Some structurally similar schemas may exist in both layers; boundary clarity
  takes priority over avoiding all duplication.
