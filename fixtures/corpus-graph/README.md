# AssiniLang corpus graph-rendering fixture

Tiny synthetic-language seed for deterministic corpus visualization coverage. The pack seeds a language, one processed source asset, two glossed passages, and one evidence-linked note so `buildNeuralMap` / `GET /observability/neural-map` produce a stable node/edge graph that the Examples browser Graph mode can render.

## Contents

| File | Role |
| --- | --- |
| `seed.json` | Workspace fragments (language, source asset, corpus, note) |
| `expected-neural-map.json` | Exact nodes/edges `buildNeuralMap` must emit for the seed |
| `manifest.json` | Fixture version, language id, and high-level expected counts |

Vocabulary matches the Velmari-style forms used by `fixtures/bulk-sources/` (`saku`, `vel`, `mir`, `tora`).

## Use

1. Load `seed.json` into an empty workspace (plus prototype users for HTTP auth).
2. Call `buildNeuralMap(state, languageId)` or `GET /observability/neural-map?languageId=…` as a programmer.
3. Assert the response matches `expected-neural-map.json`.
4. Feed the same map to the web Graph mode and assert SVG nodes/edges render.

Automated coverage:

- `apps/api/src/corpusGraphRenderingFixture.test.ts` — build + HTTP assertions
- `apps/web/src/corpusGraphRenderingFixture.test.tsx` — Graph mode SVG render assertions
