# AssiniLang bulk source-processing fixture

Tiny synthetic-language multi-source pack for deterministic corpus intake tests. Sources use Velmari-style delimited lines so offline heuristic extraction produces stable lexeme and corpus-passage drafts without a model.

## Contents

| File | Kind | Expected heuristic drafts |
| --- | --- | --- |
| `sources/01-wordlist.txt` | wordlist | 4 lexemes (`vel`, `mir`, `saku`, `tora`) |
| `sources/02-passages.txt` | text | 2 corpus passages |
| `sources/03-mixed.txt` | text | 1 lexeme (`nala`) + 1 corpus passage |

`manifest.json` lists titles, kinds, relative file paths, and expected draft outcomes for automation.

## Use

Register each source with `POST /languages/:languageId/sources`, then process with `POST /sources/:sourceId/process` (sync). Automated coverage lives in `apps/api/src/bulkSourceProcessingFixture.test.ts`.
