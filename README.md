# Keystone Estate Care CRM

Keystone staff manage estate care, professional relationships, probate opportunities and follow-ups in one workspace. Hosted access uses confirmed Supabase employee identities with administrator-managed membership. The local embedded workspace includes five fictional test contacts. The separate probate demonstration dataset can be loaded and removed from Settings.

## Try it locally

Use Node.js 22.13+ or 24 and npm. From the project root:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Next.js. With an empty DATABASE_URL, the server runs embedded PostgreSQL (PGlite) in .demo/db and saves uploaded files under .demo/files. The same CRM schema and SQL operations run in both modes. Local embedded mode is single-process. Stop the dev server before running offline data-maintenance commands. The app requires a configured database on Vercel.

**Walkthrough.** Open Contacts and search for Test contact. To try the pipeline, create a lead, open its profile and log a call. Add a note and a task. On Sales Pipeline, drag the lead to Won or use its stage selector, then accept conversion. Open the customer profile and inspect its original notes, documents, contacts and property links. Reload to verify persistence. From Calendar, select a date to add a visit. Open a visit and use Edit appointment to reschedule it.

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

## Supabase and Vercel

Follow the [deployment and authentication guide](docs/HERMES_SETUP.md) for server configuration, migrations, access management, verification and rollback. Configure credentials only in the appropriate server environment.

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

Employees use authenticated CRM endpoints. Hermes uses a dedicated bearer credential for the versioned research endpoints. See the [integration handoff](docs/HERMES_INTEGRATION.md), [request examples](docs/HERMES_API_EXAMPLES.md) and [OpenAPI contract](docs/openapi.json).

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

