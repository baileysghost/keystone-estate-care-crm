import { normalize, score } from "./hermes-schema.mjs";
export class InputError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}
const known = (o) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v != null && v !== "unknown"),
  );
export async function settings(q) {
  return Object.fromEntries(
    (await q("select * from integration_settings")).map((r) => [
      r.key,
      r.value,
    ]),
  );
}
async function sources(q, column, id, items) {
  for (const s of items)
    await q(
      `insert into lead_sources(${column},source_url,data,date_retrieved) values($1,$2,$3::jsonb,coalesce($4::timestamptz,now())) on conflict(${column},source_url) do update set data=excluded.data,date_retrieved=greatest(lead_sources.date_retrieved,excluded.date_retrieved)`,
      [id, s.source_url, JSON.stringify(s), s.date_retrieved || null],
    );
}
const result = (id, created) => ({
  id,
  created,
  updated: !created,
  duplicate: !created,
});
export async function professional(q, input, inherited = [], demo = false) {
  const { sources: own = [], ...info } = input,
    citations = own.length ? own : inherited;
  if (!citations.length)
    throw new InputError(
      "Professional records require a public business source.",
    );
  const name = normalize(info.full_name),
    bar = info.license_status === "verified" ? info.state_bar_number : null,
    email = info.contact_verified
      ? info.professional_email?.toLowerCase()
      : null;
  let firm = null;
  if (info.law_firm) {
    const details = info.firm_details || {},
      domain =
        details.verified && details.website
          ? new URL(details.website).hostname
              .toLowerCase()
              .replace(/^www\./, "")
          : null,
      phone = details.verified ? normalize(details.business_phone) : null;
    const found = await q(
      "select * from law_firms where demo=$1 and (name_key=$2 or data->>'verified_domain'=$3 or data->>'verified_phone'=$4)",
      [demo, normalize(info.law_firm), domain, phone || null],
    );
    if (found.length > 1)
      throw new InputError(
        "Conflicting firm identity. Employee review required.",
        409,
      );
    const data = JSON.stringify(
      known({
        ...details,
        verified_domain: domain,
        verified_phone: phone || null,
      }),
    );
    [firm] = found.length
      ? await q(
          "update law_firms set data=data||$2::jsonb where id=$1 returning id",
          [found[0].id, data],
        )
      : await q(
          "insert into law_firms(firm_name,name_key,demo,data) values($1,$2,$3,$4::jsonb) returning id",
          [info.law_firm, normalize(info.law_firm), demo, data],
        );
  }
  if (!name || (!bar && !email && !firm))
    throw new InputError(
      "Provide a verified bar number, verified professional email, or a name and firm.",
    );
  const matches = await q(
    "select * from attorneys where demo=$1 and (bar_key=$2 or email_key=$3 or (name_key=$4 and law_firm_id=$5))",
    [demo, bar || null, email || null, name, firm?.id || null],
  );
  if (
    matches.length > 1 ||
    (matches[0] &&
      matches[0].name_key !== name &&
      (!bar || matches[0].bar_key !== bar)) ||
    (bar && matches[0]?.bar_key && matches[0].bar_key !== bar)
  )
    throw new InputError(
      "Conflicting identity. Employee review required.",
      409,
    );
  const old = matches[0],
    data = JSON.stringify({ ...old?.data, ...known(info) });
  const [p] = old
    ? await q(
        "update attorneys set data=$2::jsonb,full_name=$3,name_key=$4,bar_key=coalesce($5,bar_key),email_key=coalesce($6,email_key),law_firm_id=coalesce($7,law_firm_id),updated_at=now() where id=$1 returning *",
        [
          old.id,
          data,
          info.full_name,
          name,
          bar || null,
          email || null,
          firm?.id || null,
        ],
      )
    : await q(
        "insert into attorneys(data,full_name,name_key,bar_key,email_key,law_firm_id,demo) values($1::jsonb,$2,$3,$4,$5,$6,$7) returning *",
        [
          data,
          info.full_name,
          name,
          bar || null,
          email || null,
          firm?.id || null,
          demo,
        ],
      );
  await sources(q, "attorney_id", p.id, citations);
  if (old) {
    const config = await settings(q);
    for (const c of await q(
      "select c.id,c.data from probate_cases c join case_attorneys a on a.case_id=c.id where a.attorney_id=$1",
      [p.id],
    ))
      await rescore(q, c.id, c.data, config);
  }
  return result(p.id, !old);
}
export async function ingest(
  q,
  input,
  config,
  updateOnly = false,
  demo = false,
) {
  const { attorney, sources: refs = [], external_run_id, ...fields } = input;
  if (
    (["verified", "partially_verified"].includes(fields.verification_status) ||
      fields.real_estate_status === "confirmed" ||
      fields.property_city ||
      fields.property_county) &&
    !refs.length
  )
    throw new InputError("A verified claim requires a public source.");
  if (
    external_run_id &&
    !(
      await q(
        "select id from hermes_runs where external_run_id=$1 and demo=$2",
        [external_run_id, demo],
      )
    ).length
  )
    throw new InputError("Unknown run.", 404);
  const key = [
    normalize(fields.jurisdiction),
    normalize(fields.case_number),
    demo,
  ];
  if (!key[0] || !key[1])
    throw new InputError(
      "Case number and jurisdiction must contain letters or digits.",
    );
  const [old] = await q(
    "select * from probate_cases where jurisdiction_key=$1 and case_key=$2 and demo=$3 for update",
    key,
  );
  if (updateOnly && !old) throw new InputError("Case not found.", 404);
  const data = { ...old?.data, ...known(fields) };
  const [row] = await q(
    "insert into probate_cases(jurisdiction_key,case_key,demo,data) values($1,$2,$3,$4::jsonb) on conflict(demo,jurisdiction_key,case_key) do update set data=excluded.data returning id",
    [...key, JSON.stringify(data)],
  );
  if (attorney) {
    const p = await professional(q, attorney, refs, demo);
    await q("insert into case_attorneys values($1,$2) on conflict do nothing", [
      row.id,
      p.id,
    ]);
  }
  await sources(q, "case_id", row.id, refs);
  await rescore(q, row.id, data, config);
  await q(
    "update probate_cases set updated_at=now(),last_verified_at=case when $2 then now() else last_verified_at end where id=$1",
    [row.id, fields.verification_status === "verified" && refs.length > 0],
  );
  if (
    !old ||
    Object.entries(fields).some(([k, v]) => v != null && old.data[k] !== v)
  )
    await q(
      "insert into probate_activity(case_id,actor,action) values($1,'Hermes',$2)",
      [row.id, old ? "Updated public case information" : "Discovered case"],
    );
  return result(row.id, !old);
}
export async function dispatch(q, path, b, config) {
  if (path === "leads" || path === "case-updates")
    return ingest(q, b, config, path === "case-updates");
  if (path === "attorneys") return professional(q, b);
  if (path === "batch") {
    const cases = [],
      attorneys = [];
    for (const p of b.attorneys) attorneys.push(await professional(q, p));
    for (const c of b.cases)
      cases.push(
        await ingest(q, { external_run_id: b.external_run_id, ...c }, config),
      );
    return { cases, attorneys };
  }
  if (path === "runs/start") {
    const rows = await q(
      "insert into hermes_runs(external_run_id,status) values($1,'running') on conflict do nothing returning id",
      [b.external_run_id],
    );
    return rows.length
      ? result(rows[0].id, true)
      : result(
          (
            await q(
              "select id from hermes_runs where external_run_id=$1 and not demo",
              [b.external_run_id],
            )
          )[0].id,
          false,
        );
  }
  if (path === "runs/complete") {
    if (b.error_summary)
      b = {
        ...b,
        error_summary: b.error_summary
          .replace(
            /(?:https?:\/\/|postgres(?:ql)?:\/\/)[^\s]+/gi,
            "[URL omitted]",
          )
          .replace(
            /(?:bearer\s+|(?:password|api_key|token)\s*[:=]\s*)[^\s]+/gi,
            "[credential omitted]",
          ),
      };
    const [r] = await q(
      "update hermes_runs set status=$2,completed_at=now(),data=$3::jsonb where external_run_id=$1 and not demo and status='running' returning id",
      [b.external_run_id, b.status, JSON.stringify(b)],
    );
    if (!r)
      throw new InputError("No running operation with this identifier.", 409);
    return result(r.id, false);
  }
  if (path === "research-requests/complete") {
    const [r] = await q(
      "update research_requests set result=$2,completed_at=now() where id=$1 and completed_at is null and not demo returning id",
      [b.id, JSON.stringify({ result: b.result, sources: b.sources })],
    );
    if (!r) throw new InputError("Open request not found.", 404);
    return result(r.id, false);
  }
  throw new InputError("Unknown operation.", 404);
}

export async function rescore(q, id, data, config) {
  const linked = await q(
    "select data from attorneys join case_attorneys on attorney_id=id where case_id=$1",
    [id],
  );
  const citations = await q(
    "select source_url from lead_sources where case_id=$1",
    [id],
  );
  const professional = {
    license_status: linked.some((x) => x.data.license_status === "verified")
      ? "verified"
      : null,
    contact_verified: linked.some(
      (x) =>
        x.data.contact_verified &&
        (x.data.professional_email || x.data.business_phone),
    ),
    business_phone: true,
  };
  const scored = score(data, professional, citations, config);
  await q(
    "update probate_cases set score_breakdown=$2::jsonb,lead_score=$3 where id=$1",
    [id, JSON.stringify(scored.breakdown), scored.total],
  );
}
