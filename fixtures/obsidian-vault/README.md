# AssiniLang Obsidian vault fixture

Tiny synthetic-language vault for deterministic corpus intake tests and local smoke checks.

## Use with `ASSINI_OBSIDIAN_VAULT_ROOTS`

Point the allowlist at this vault's parent directory (recommended) or at the vault root itself:

```powershell
$env:ASSINI_OBSIDIAN_VAULT_ROOTS = "C:\path\to\AssiniLang\fixtures"
```

Then import the vault folder in Build → Obsidian vault, or call:

```http
POST /languages/:languageId/sources/obsidian-vault
{ "vaultPath": "C:\\path\\to\\AssiniLang\\fixtures\\obsidian-vault", "includeSubfolders": true, "maxFiles": 100 }
```

Expected intake: `Language Notes/lexicon.md` and `Language Notes/grammar.md` import as pending text sources; `Language Notes/empty.md` is skipped (no importable text); `.obsidian/` is never traversed.

Automated coverage lives in `apps/api/src/obsidianVaultFixture.test.ts`.
