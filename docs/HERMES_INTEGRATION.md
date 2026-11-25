# Hermes Integration Handoff

Use the Keystone Estate Care CRM at `https://keystone-estate-care-crm.vercel.app/api/v1/hermes`. Confirm authenticated health and enabled ingestion before scheduling production requests. Configure the external scheduler for 06:00 America/Los_Angeles daily, including daylight saving changes.

| Method | Path | Operation |
|---|---|---|
| GET | /health | Check credential, database and enabled status |
| GET | /config | Read approved territories, sources, weights and schedule |
| GET | /research-requests | Retrieve the oldest 100 pending employee requests |
| POST | /research-requests/complete | Submit request ID, verified result and sources |
| POST | /runs/start | Register a unique external_run_id |
| POST | /leads | Upsert one probate case |
| POST | /attorneys | Upsert a public professional contact |
| POST | /batch | Commit up to 50 cases and 50 professional contacts atomically |
| POST | /case-updates | Update a previously registered case |
| POST | /runs/complete | Close a running operation and report counts or errors |

Send `Authorization: Bearer <HERMES_API_KEY>` on every request. POST JSON with `Content-Type: application/json` and a unique stable `Idempotency-Key` of 8–160 letters, digits, dots, underscores, colons or hyphens. Reuse the identical serialized body and key after a timeout. Keep requests below 256 KiB and 120 authenticated requests per minute. Honor Retry-After on 429 and use bounded exponential backoff with jitter on transport failures and 503. Pause when ingestion is disabled. Correct validation failures before sending a corrected request with a fresh key. Stop on 401 and obtain the current credential. Route identity conflicts to an employee.

Each response contains success and request_id plus data on success or error on failure. Record writes return data.id, created, updated and duplicate. A replay returns the original successful data. Batch returns arrays named cases and attorneys. GET /health and the API base return status, database_connected, ingestion_enabled and available at the top level and in data. GET /leads and /attorneys also support paginated reads with limit (1–200) and offset. GET config returns territory, expansion, sources, weights, enabled and schedule. GET research-requests returns an array of id, case_id, description and created_at. Run completion accepts completed, warnings or failed. Send sanitized summaries without credentials, raw page dumps or unnecessary personal information.

The machine-readable OpenAPI contract defines required fields, enums, object limits, date formats and all optional fields. Cases require case_number and jurisdiction. Separate court jurisdiction from verified property city and county. Include source name, source type, original public HTTP(S) URL, and publication/retrieval dates when known. Use null or omit unknown facts. Attach citations to verified claims and every professional record. A professional requires full_name and a usable identity (verified bar number, verified business email, or firm and name). Only set contact_verified or verified license status when supported by evidence. Omit exact residential addresses and family contact details. Never infer vacancy or vulnerability, access restricted systems or initiate outreach. Employees perform all outreach.

Read the configuration before each run. Start the operation, submit sourced records, resolve pending requests and report the final outcome even on partial failure. A queued request is pending work until Hermes reports its result. No external scheduler is installed by this CRM.
