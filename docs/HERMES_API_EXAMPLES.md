# API examples

Run these in an isolated test database. Supply HERMES_API_KEY from the agent's secret manager. The examples use fictional records.

```sh
base=https://keystone-estate-care-crm.vercel.app/api/v1/hermes
get() { curl --fail-with-body -sS -H "Authorization: Bearer $HERMES_API_KEY" "$base/$1"; }
post() { curl --fail-with-body -sS -H "Authorization: Bearer $HERMES_API_KEY" -H "Idempotency-Key: $2" -H 'Content-Type: application/json' --data-binary "$3" "$base/$1"; }
get health
get config
post runs/start example-start-001 '{"external_run_id":"example-run-001"}'
post batch example-batch-001 '{"external_run_id":"example-run-001","cases":[{"case_number":"EXAMPLE-001","jurisdiction":"Example County","verification_status":"unverified"}],"attorneys":[{"full_name":"Avery Example","law_firm":"Example Firm","sources":[{"source_url":"https://example.com/firm","source_name":"Example professional directory","source_type":"directory"}]}]}'
post case-updates example-update-001 '{"case_number":"EXAMPLE-001","jurisdiction":"Example County","verification_status":"research_required"}'
post runs/complete example-close-001 '{"external_run_id":"example-run-001","status":"completed","cases_discovered":1,"leads_created":1,"attorneys_discovered":1,"sources_checked":2,"errors_count":0}'
get research-requests
```

For a standalone case or professional contact send the corresponding object from the batch array to /leads or /attorneys. For research completion send id, result and sources to /research-requests/complete. Use an actual queued request ID. Retrying an identical successful request returns the same result. Changing the payload with the same key returns 409. An invalid field returns 422 with the affected field path.
