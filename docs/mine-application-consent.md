# Mine × Engineer Match application consent

Engineer Match's 応募する now starts a ten-minute Mine consent request. The linked Mine account reviews frozen résumé content, explicitly selects either, both, or neither document, and completes the application. Nothing is submitted when a link opens. The applicant and hiring company can read the selected snapshots on their existing application detail pages.

Snapshots contain résumé text, education, qualifications, work history, and for the career document skills and occupations. Photos, uploaded PDFs, and assessment results are excluded. Selections start unchecked. Content freezes at the first successful preview; edit the Mine profile and start a new request to change it.

The database binds a request to its linked accounts and opportunity, requires an active engineer and published engineer opportunity, rejects direct engineer application inserts, and preserves the instructor/training path. Completion is atomic and retry-safe. Pending snapshots have no browser table access; unselected content is discarded on completion.

## Copy into the existing branches

The guarded script verifies both branches and clean destinations before copying. It does not commit, push, deploy, or copy unrelated Mine changes.

```powershell
Set-Location 'C:\Users\Owner\.codex\worktrees\23c6\engineer-match'
.\scripts\copy-mine-application-consent.ps1
.\scripts\copy-mine-application-consent.ps1 -Apply
```

It copies the Engineer Match changes into `feat/mine-application-sharing` and Mine changes into `feat/engineer-application-consent`. Set Engineer Match `NEXT_PUBLIC_MINE_APP_URL` to Mine's origin; both apps must use the same Supabase project and linked accounts.

## Apply the shared migration

Apply `supabase/migrations/099_mine_engineer_application_document_sharing.sql` once to the shared project, after Mine migration 098. It also adds optional résumé fields already used by Mine’s UI but absent from its prior checked-in migrations. Existing data is preserved.

Use the Supabase SQL editor, or with `SHARED_DATABASE_URL` set securely:

```powershell
psql "$env:SHARED_DATABASE_URL" -v ON_ERROR_STOP=1 -f 'C:\Users\Owner\.codex\worktrees\23c6\engineer-match\supabase\migrations\099_mine_engineer_application_document_sharing.sql'
```

Deploy Mine’s consent route before switching Engineer Match to this flow. No live migration or deployment was performed here. If an earlier unshipped version of migration 099 was applied, reconcile its schema first rather than rerunning this version.

## Verification

- 27 PGlite assertions passed against real application migrations 011/068 and Mine migrations 083/086/087/088/092/093/098/099. They cover account binding, all four selection combinations, frozen snapshots, expiry, replacement, retry, recipient access, mutation denial, opportunity closure, and instructor submission.
- TypeScript and lint passed for both apps’ changed files.
- Mine production build passed with Next 16.3.3.
- Engineer Match production build passed with `next build --webpack`. Its default Turbopack build rejects the local linked `node_modules` folder, while Webpack compiles successfully.

Run the database suite again from Engineer Match:

```powershell
npm install --prefix .consent-tests --cache .consent-tests/cache --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.8
$env:MINE_SOURCE = 'C:\Users\Owner\.codex\worktrees\1eba\Mine'
node scripts/test-mine-application-consent.mjs
```

Before release, smoke test a linked account pair against staging: select each document combination, use a logged-out or different Mine account, expire a link, and confirm later profile edits do not change an existing application snapshot.
