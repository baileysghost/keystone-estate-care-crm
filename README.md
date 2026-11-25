# Keystone Estate Care CRM

An employee workspace for estate care. The demo opens directly to the overview and uses fictional households, properties, contact details, schedules and employees. Use a dedicated database for the demo. Anyone admitted to the demo can read and change its records.

## Try it locally

Use Node.js 22.13+ or 24 and npm. From the project root:

```sh
npm ci
cp .env.example .env.local
npm run demo:documents
npm run dev
```

Open the local URL printed by Next.js. With an empty DATABASE_URL, the server runs embedded PostgreSQL (PGlite) in .demo/db and saves uploaded files under .demo/files. The same CRM schema and SQL operations run in both modes. Local embedded mode is single-process. Stop the dev server before running offline data-maintenance commands. The app requires a configured database on Vercel.

**Walkthrough.** From Leads, open a household and log a call. Add a note and a task. On Sales Pipeline, drag the lead to Won or use its stage selector, then accept conversion. Open the customer profile and inspect its original notes, documents, contacts and property links. Reload to verify persistence. From Calendar, select a date to add a visit. Open a visit and use Edit appointment to reschedule it.

## Application

| Area | Workflows |
| --- | --- |
| Overview | Database-derived customer, property, lead and pipeline totals, monthly growth, sources, status distribution, tasks, upcoming visits and recent changes |
| Leads and pipeline | Search, statuses, sorting, pagination, selectable columns, bulk stage and archive actions, restore, CSV import/export, drag-and-drop and keyboard-accessible stage selection |
| Customers, properties, contacts | Shared record profiles, linked contacts and estates, services, preferences, assignments, documents, tasks and timelines |
| Operations | Due dates, completion, filtered task views, daily/weekly/monthly calendar and agenda, notes, pinning, communication logging and last contact updates |
| Documents | Private uploads, related records, categories, preview and download for PDF, PNG, JPEG and plain text, up to 4 MiB each |
| Reports | Date-range totals, growth, source and outcome groups, account and estate service mix, follow-up completion, recorded employee activity and CSV export |
| Settings | Employee directory, company identity, uploaded company logo, catalogs, tags, appearance, dashboard reminders and default assignment for the session |

Upload a JPEG or PNG in Documents before selecting it as the company logo. Use Cmd+K or Ctrl+K for global search. Each record type has its own form and contextual actions. Lead imports require a name header and support up to 500 records per import. Use a lead export as a template. A duplicate email or invalid row rolls back the batch. Directory and report calculations exclude archived records. Report date ranges use record creation dates. Conversion rate is won leads divided by total leads in scope.

## Supabase setup

1. Create a new, dedicated fictional demo project. In its SQL Editor run supabase/migrations/001_crm.sql, then supabase/migrations/002_storage.sql, then supabase/seed.sql. Run each complete file once. The seed refuses a nonempty workspace.
2. In the project Connect dialog copy the PostgreSQL transaction pooler URI. Substitute the URL-encoded database password. Set DATABASE_URL only on the server. The adapter uses TLS and disables prepared statements for the transaction pooler.
3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in protected server environment settings. The storage migration creates the private keystone-demo bucket. Keep the keystone database schema outside exposed Data API schemas and retain the absence of anonymous bucket policies.
4. With those settings in a private local .env.local, run npm run demo:documents to add the two fictional sample reports. This command can be rerun.
5. Verify record creation, conversion, settings writes, document upload, preview and download against this isolated project before sharing it.

| Server variable | Purpose |
| --- | --- |
| CRM_DEMO_MODE | Set to fictional to enable demonstration services |
| DATABASE_URL | Dedicated demo PostgreSQL connection URI |
| SUPABASE_URL | URL of the same Supabase project |
| SUPABASE_SERVICE_ROLE_KEY | Server-only credential for the private storage bucket |

## Vercel deployment

Import the GitHub repository as a new Next.js project. Use its root directory and built-in build settings. Configure the four variables above for the intended environment. Enable Deployment Protection and verify coverage of the actual URL you plan to share. If your plan protects preview deployments only, share a protected preview and leave production without database credentials. Deploy, then test a private browser session signed out of Vercel. Verify the CRM page, /api/crm and a document URL all require access. Sign in with the authorized team and repeat the walkthrough. Record the verified URL after these checks succeed.

Provider references: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Vercel deployment protection](https://vercel.com/docs/deployment-protection).

## Architecture

Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui button and Radix dialog primitives, Lucide icons, Recharts and dnd-kit. Records flow from the client UI through same-origin route handlers to a transaction service and PostgreSQL. The server alone handles storage credentials. The browser keeps transient presentation state and uses the location hash for deep links.

The keystone schema stores stable UUIDs, timestamps, ownership, archive status and parent links in records. Eleven entity tables share this key. Extensible type-specific attributes live in JSONB. Foreign keys, a unique converted-lead reference, normalized case-insensitive email indexes, service/tag joins and cross-record links preserve identity. The workspace view assembles the client projection. Row-level security is enabled on every base table. The demo database owner executes server queries. No client-access policies are granted. Pipeline stage definitions and company settings are editable. Custom field definitions and employee authentication links are reserved for later use.

Conversion locks the lead, checks Won status and atomically creates or retrieves one customer. The source lead remains available for sales reporting. Properties, contacts, tasks and appointments move to the customer, while its profile also resolves notes, communication, documents and audit entries attached to the original lead. Record changes and their audit entries commit together. Form edits carry a timestamp to detect stale saves.

## API and integrations

| Endpoint | Behavior |
| --- | --- |
| GET /api/crm | Read the demo snapshot and company settings |
| POST /api/crm | Save a validated batch, convert a won lead or update one setting |
| POST /api/files | Upload multipart file, category, description and optional parent_id |
| GET /api/files?id=UUID | Stream the associated private file. Add download=1 for attachment disposition |

The current API trusts the protected demo boundary. For Hermes or another external integration, add a separate authenticated API with individual scopes, rate limits, audit identity, idempotency keys and bounded pagination. Call the same transaction services after checking authorization. Calendar synchronization can consume appointment IDs and update timestamps through that service. No paid AI or external calendar connection is required.

## Demo reset

For local reset, stop the app, **move** .demo to a backup location and run npm run demo:documents. The next startup uses the new fictional data. On a dedicated Supabase demo project, back up the database and files. In a single SQL Editor transaction run BEGIN, SET LOCAL keystone.allow_demo_reset = 'reset-fictional-records', the contents of supabase/demo-reset.sql, and COMMIT. The script rejects linked employee accounts. Run the seed and sample-document command again. Remove old sample uploads separately from the private demo bucket. There is no browser reset endpoint.

## Tests

```sh
npm test
npm run lint
npm run build
npm run typecheck
```

The database regression suite runs against an isolated in-memory PostgreSQL engine. Browser tests write fictional QA rows to a disposable local demo. Run npm run build first. The test runner starts an isolated production server on port 4289 with an in-memory database and a separate upload directory. Install Playwright Chromium with npx playwright install chromium, or set CHROMIUM_PATH to an existing executable, then run npm run test:ui. Test data must stay separate from customer records.

## Employee authentication and production launch

- [ ] Create a separate production database and bucket. Apply migrations without the fictional seed.
- [ ] Configure invite-only Supabase Auth, server-side session handling and verified identity checks for every read, write and file request. Bind each verified auth.users ID to exactly one employees.auth_user_id and enforce the identity relationship in the database.
- [ ] Define administrator, manager and employee permission matrices. Derive actor identity server-side. Enforce assignment and record access in the service and database, including linked properties, documents and search results.
- [ ] Replace privileged demo reads/writes with user-scoped or least-privileged access and tested row-level policies. Restrict settings and employee changes to authorized administrators. Require scoped file authorization before any storage call.
- [ ] Test anonymous denial, cross-employee access denial, invitations, revoked employees, expired sessions, direct API calls and private file downloads. Verify no demo endpoint can bypass the new rules.
- [ ] Configure rate limits, upload content validation/scanning, backup/restore tests, monitoring and audit retention. Keep property access codes in a separate restricted system when that feature is designed.
- [ ] Replace the demo switch with the authenticated production configuration. Verify deployment protection, domain settings and server secrets. Run browser, database and live Supabase smoke tests before entering actual customer data.

The demo reads one workspace snapshot and paginates in the browser. Move search, aggregates and pagination to indexed server queries before growing beyond demo-scale datasets. Employee assignment and activity counts in demo mode do not establish authenticated authorship.
