# Professionalization implementation status

This is an implementation ledger, not a claim that every item in the earlier 1,200 suggestions or the latest 700-item design/product prompt has passed. It records inspected scope and distinguishes code changes from external setup and remaining audit work.

## Status key

- **Mevcut** — implementation was found in the repository; not automatically a claim of full end-to-end verification.
- **Düzeltildi** — code was changed in this pass and the listed automated checks must pass before release.
- **Eklendi** — new implementation was added in this pass.
- **Dış ayar bekliyor** — requires a real provider credential, project setting, migration, or deployment verification.
- **Denetim gerekli** — not yet individually verified against its acceptance criterion.

## Audited areas

| Prompt items | Status | Evidence / scope |
| --- | --- | --- |
| General safeguards 1–10 | Mevcut / Denetim gerekli | TanStack Start/Router, Supabase, migrations, RLS and encrypted local bank vault are present. Full RLS and deployment review remains open. No user data was reset or migration added in this pass. |
| FX 11–20 | Düzeltildi / Dış ayar bekliyor | FXAPI credentials stay server-side. The server reads its plan status and respects provider intervals. UI identifies source, reference type, provider timestamp, fetch time, request duration and stale/offline state. FXAPI subscription and data display/redistribution terms must be confirmed for the account. |
| FX 21–30 | Düzeltildi / Denetim gerekli | Only currency pairs backed by provider rates are offered; unbacked gold pseudo-pair removed. Daily fallback is labeled daily reference blend; chart is labeled daily, not intraday. Historical report valuation and all requested finance cases still need item-by-item audit. |
| Bank/vault 21–31 | Mevcut / Düzeltildi / Denetim gerekli | Existing local encrypted vault retained. Bank account, movement and document React Query entries and transient import state are now cleared on lock/auto-lock/owner change. Configurable 1/5/10-minute lock timeout added. Full privacy/display settings remain to audit. |
| Remaining functional items 1–200 | Denetim gerekli | Not individually verified in this pass. Existing feature pages are preserved. |
| Remaining design/accessibility items 201–400 | Denetim gerekli | Not individually verified in this pass. Currency status copy and timestamps were adjusted; all screen sizes and routes still need visual review. |

## Latest improvement list (400 items)

| Prompt items | Status | Evidence / scope |
| --- | --- | --- |
| Priority stage 1, dashboard finance summary 1–30 | Düzeltildi / Denetim gerekli | Added a period picker (today/week/month/year/custom), gross accrued debt, collected payments, expenses, earned payroll, advances/payments, clearly defined recorded net cash flow, period debt difference, USD/EUR/GBP reference conversions, source/time/staleness labels, empty/loading states, and a monthly report link. It explicitly excludes bank vault activity and does not claim a bank balance or full accounting profit. Net-cash period helper is shared with monthly PDF/CSV report totals. Existing cancellation/refund modeling remains a known limitation. |
| Latest finance/profitability 1–40 | Partly addressed / Denetim gerekli | Shared summary distinguishes accrued debt, collected cash, expense, earned wage, and payroll cash outflow. Budgets, forecasts, quote simulation, direct-cost reconciliation, invoice aging, and linked refunds still require implementation. |
| Latest currency 41–70 | Mevcut / Düzeltildi / Dış ayar bekliyor | Provider-plan-aware rate updates and truthful reference-data labels from earlier passes remain. No favorite pair preferences, user alerts, manual rate override, or account-specific redistribution licensing was added here. |
| Latest work/site operations 71–100 | Mevcut / Denetim gerekli | Existing jobs, timers, checklists, media, offline and PDF capabilities remain. Full same-time timer locking, atomic stock use, EXIF cleanup, bulk PDF, status history and conflict resolution remain to audit. |
| Latest customer/current accounts 101–120 | Mevcut / Denetim gerekli | Existing customer/cari functionality remains. Duplicate phone, profile archive/restore, merge preview and linked expense profitability remain to audit. |
| Latest payroll/equipment 121–140 | Mevcut / Denetim gerekli | Existing payroll, maintenance, stock and role features remain. RLS verification, item-by-item audit and remaining workflows are pending. |
| Latest appointment/debt/installments 141–160 | Mevcut / Denetim gerekli | Existing calendar and debt/installment features remain. Full conflict resolution and duplicate-payment reconciliation need review. |
| Latest PDF/CSV 161–180 | Düzeltildi / Denetim gerekli | Dashboard and monthly report use the same recorded TRY net-cash calculation. CSV export now neutralizes spreadsheet formula prefixes and uses a Turkish locale delimiter. PDF output and all exports still need visual and sensitive-field QA. |
| Latest UI/accessibility/animation 181–350 | Denetim gerekli | The new finance summary is responsive and has semantic period controls, descriptive explanations, empty/loading/error states, and text-based negative values. No full 320px/tablet/desktop, screen-reader, reduced-motion or route-by-route visual QA is claimed. |
| Latest extra product/privacy 351–400 | Düzeltildi / Dış ayar bekliyor / Denetim gerekli | In-memory React Query data now clears on sign-out or account identity switch. Existing user-local settings and integrations remain. Session-device management, OAuth revoke UI, profile data export, deployment metadata and production verification remain to audit or require external credentials. |

## Additional suggestion list (items 1–400)

| Prompt items | Status | Evidence / scope |
| --- | --- | --- |
| Additional finance planning 1–40 | Denetim gerekli | No forecasts, budgets, scenarios or cash reserve controls were added in this pass; must not be inferred from existing actuals dashboard. |
| Additional currency 41–80 | Düzeltildi / Dış ayar bekliyor | Source times, source labels, stale handling, plan-limited refresh and unsupported gold pseudo-rate were addressed. Historical valuation selection, multi-provider comparison, target alerts, quota telemetry and account-specific license review remain open. |
| Additional bank vault 81–120 | Mevcut / Düzeltildi / Denetim gerekli | Personal/business labels and local encrypted statements already exist. This pass adds repeat-import fingerprints, encrypted export/restore with AES-GCM validation and before/after record-count confirmation, configurable auto-lock, and cache/transient-state clearing. Field-level edit history, full row diagnostics/OCR confidence, transfer matching and masking controls remain open. |
| Additional field work 121–160 | Mevcut / Denetim gerekli | Existing work, assignment, checklist, media and offline features require criterion-by-criterion ownership and conflict-resolution review. No claims of complete coverage. |
| Customer experience 161–180 | Mevcut / Denetim gerekli | Existing customer/cari functions preserved; versioned merges, preference-aware communication and reversal accounting not fully audited. |
| Staff and attendance 181–200 | Mevcut / Denetim gerekli | Existing payroll/attendance and role features preserved; schedule templates, approval/audit rules and data retention need review. |
| Product insights 201–240 | Mevcut / Denetim gerekli | Existing panel/analytics preserved; period-wide synchronization, saved reports and source/exclusion counts are not individually verified. |
| Integrations/automation 241–280 | Mevcut / Dış ayar bekliyor / Denetim gerekli | Gmail remains explicit and user-triggered; saved transaction records omit email message snippets. Provider scopes, selected-sender filtering, token revocation, automation idempotency and calendar behavior remain to audit/configure. |
| Security/data quality 281–300 | Düzeltildi / Denetim gerekli | Bank owner changes and lock clear bank query cache and transient parsed records; server ownership/RLS, storage, session expiry, offline queue and cross-user isolation still need dedicated security tests. |
| Design/micro-interactions 301–400 | Denetim gerekli | No full route-by-route visual, accessibility, responsive, reduced-motion, PDF/CSV or low-end-device audit was completed. |

## Newly implemented bank safeguards

- Repeated statement and Gmail imports compare account-scoped references. When the reference is missing but the normalized date/direction/amount/counterparty/description matches, the user chooses whether those possible duplicates are included; exact duplicate rows within the same import are discarded. This is a heuristic, not proof that two similar transactions are identical.
- Email-derived records no longer persist the parsed source snippet in the encrypted movement record. Message text remains temporary for user review and is cleared when the vault locks.
- The encrypted bank backup contains ciphertext only; its password is never included. AES-GCM authentication and the current account-specific vault context are checked before restore. Restore shows existing and backup counts and requires a separate confirmation before replacing the local vault.
- Automatic vault lock can be set to 1, 5, or 10 minutes and is persisted locally per account on this device. The app also locks when the page is hidden; a separate disable-background-lock setting has not been added.
- The dashboard finance summary and monthly report share a period calculator for gross accrued customer debt, collected payments, expenses, payroll earned and payroll outflow. Its net metric is recorded net cash flow and does not include bank vault transactions or claim to be the bank balance or full accrual profit.
- CSV exports use semicolon delimiters and neutralize text beginning with spreadsheet formula markers. Numeric and textual cells are quoted.
- The app shell clears in-memory query data after sign-out or a detected account switch; persistent offline records remain identity-keyed in IndexedDB.

## Rate behavior and limits

- With `FXAPI_API_KEY`, requests use FXAPI's REST latest endpoint and the application's server checks `/v1/status` to obtain the actual plan. The implementation polls no faster than that plan's documented interval. It does not claim a WebSocket or streaming feed.
- Without that key, fallback uses Frankfurter daily reference data; it is not an intraday market quote. The UI describes the dataset and uses its date without inventing a time.
- The converter does not model bank buy/sell spreads or guarantee an executable trade price. Historical report values are not silently repriced by this pass.
- Confirm data display and redistribution rights against the specific provider account and intended app use before enabling FXAPI in production. Public provider pages alone do not establish account-specific rights.

## Latest prompt: 300 design + 400 product improvements

| Scope | Status | Evidence / limits |
| --- | --- | --- |
| Profile identity, selection and archive | Eklendi / Migration bekliyor | Added stable `business_profiles`, one default profile per team, legacy usta-name migration, profile selection in the app shell, profile create/rename/archive/restore UI, and metadata-only profile audit events. Archived profiles retain read/report access and cannot receive new records. |
| Operational and finance profile scope | Eklendi / Migration bekliyor | Work records, transactions and expenses gain a profile ID, are backfilled to the legacy default, and are queried/cached by profile. Composite foreign keys enforce same-team profile association. Existing owner/team RLS is preserved. Profile IDs cannot be changed on existing rows. Customer master records remain team-shared; personal bank-vault movements remain account-local and are not assigned to business profiles. |
| Offline/profile switching | Eklendi / Denetim gerekli | Offline cache keys and queued writes carry profile IDs; switching profiles removes in-memory queries, and local selection syncs across browser tabs. Full conflict/failed-queue recovery still needs review. |
| Payroll and report identity | Eklendi / Denetim gerekli | Yevmiye PDF uses the selected profile name. Monthly report data is profile-filtered and PDF/CSV identify the selected profile and period. Full logo snapshots, all document families, page-by-page visual QA, and 200% zoom checks remain open. |
| Remaining 300 design criteria and 400 feature criteria | Denetim gerekli | Not represented as completed wholesale. Existing functionality was preserved; each numbered criterion still needs its own implementation or verified evidence before claiming full coverage. |
| Database migration and production rollout | Migration bekliyor | `0016_business_profiles.sql` is included in the direct-DB migration runner with completeness/backfill verification. This environment has no direct database URL, so the production schema was not changed or verified here. |

The profile migration retains the existing team and owner fields. Legacy work, expense and transaction rows map to the original team's default profile; old extra names become profiles but do not claim ownership of historical rows. The migration also updates new-account provisioning so future accounts receive a default profile.

## Environment and release

Copy `.env.example` to a local `.env` or configure equivalent secrets in the hosting environment. `SUPABASE_SERVICE_ROLE_KEY`, `FXAPI_API_KEY`, and cron secrets are server-only. Never add real values to source control or a `VITE_` variable.

No deployment is reported as complete until tests, type checking, lint, production build, and the correct production deployment are verified. Supabase migrations and OAuth/provider settings are external project state and are not changed by this document.
