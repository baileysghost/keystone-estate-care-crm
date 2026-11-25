import { transaction, table } from "./database.mjs";
export async function snapshot() {
  return transaction(async (q) => ({
    rows: await q("select * from workspace order by created_at desc,id"),
    settings: Object.fromEntries(
      (await q("select * from company_settings")).map((x) => [x.key, x.value]),
    ),
  }));
}
async function audit(q, parent, employee, title, desc = "") {
  const [r] = await q(
    "insert into records(kind,name,parent_id,employee_id) values('activity',$1,$2,$3) returning id",
    [title, parent, employee],
  );
  await q("insert into activities values($1,$2)", [
    r.id,
    JSON.stringify({ description: desc }),
  ]);
}
export async function save(q, r) {
  if (
    !Object.hasOwn(table, r.kind) ||
    r.kind === "activity" ||
    !String(r.name || "").trim()
  )
    throw Error("Enter a record name.");
  let id = r.id;
  if (id) {
    const [old] = await q("select * from records where id=$1 for update", [id]);
    if (!old || old.kind !== r.kind) throw Error("Record missing.");
    if (
      r.updated_at &&
      new Date(old.updated_at).valueOf() !== new Date(r.updated_at).valueOf()
    )
      throw Error("This record changed. Refresh and retry.");
    await q(
      "update records set name=$2,employee_id=$3,parent_id=$4,archived=$5,updated_at=clock_timestamp() where id=$1",
      [id, r.name, r.employee_id || null, r.parent_id || null, !!r.archived],
    );
  } else {
    [{ id }] = await q(
      "insert into records(kind,name,employee_id,parent_id) values($1,$2,$3,$4) returning id",
      [r.kind, r.name, r.employee_id || null, r.parent_id || null],
    );
  }
  const data = { ...r.data };
  if (r.kind === "task") {
    if (data.status === "Completed")
      data.completed_on ||= new Date().toISOString().slice(0, 10);
    else delete data.completed_on;
  }
  await q(
    "insert into " +
      table[r.kind] +
      "(id,data) values($1,$2) on conflict(id) do update set data=excluded.data",
    [id, JSON.stringify(data)],
  );
  for (const [catalog, junction, col, values] of [
    ["tags", "tag_relationships", "tag_id", r.tags],
    ["services", "property_services", "service_id", r.services],
  ]) {
    await q("delete from " + junction + " where record_id=$1", [id]);
    for (const name of new Set(values || [])) {
      const [x] = await q(
        "insert into " +
          catalog +
          "(name) values($1) on conflict(name) do update set name=excluded.name returning id",
        [name],
      );
      await q("insert into " + junction + " values($1,$2)", [id, x.id]);
    }
  }
  await q("delete from contact_relationships where record_id=$1", [id]);
  for (const link of new Set(r.links || []))
    await q("insert into contact_relationships values($1,$2)", [id, link]);
  if (
    r.kind === "communication" &&
    r.parent_id &&
    data.category !== "Internal note"
  ) {
    const [parent] = await q("select kind from records where id=$1", [
      r.parent_id,
    ]);
    const day = data.due || new Date().toISOString().slice(0, 10);
    await q(
      "update " +
        table[parent.kind] +
        " set data=data||jsonb_build_object('last_contact',greatest(coalesce(data->>'last_contact',''),$2::text)) where id=$1",
      [r.parent_id, day],
    );
    await q("update records set updated_at=clock_timestamp() where id=$1", [
      r.parent_id,
    ]);
  }
  await audit(
    q,
    id,
    r.employee_id || null,
    (r.archived ? "Archived " : r.id ? "Updated " : "Created ") + r.kind,
    r.name + (r.kind === "lead" ? " · " + (data.status || "") : ""),
  );
  return id;
}
export async function convert(q, id) {
  const [r] = await q(
    "select * from records where id=$1 and kind='lead' for update",
    [id],
  );
  if (!r) throw Error("Lead missing.");
  const [existing] = await q(
    "select id from customers where source_lead_id=$1",
    [id],
  );
  if (existing) return existing.id;
  const [lead] = await q("select * from workspace where id=$1", [id]);
  if (lead.data.status !== "Won") throw Error("Mark the lead Won first.");
  const customer = await save(q, {
    ...lead,
    id: null,
    kind: "customer",
    parent_id: null,
    links: [id],
    data: {
      ...lead.data,
      status: "Active",
      customer_since: new Date().toISOString().slice(0, 10),
    },
  });
  await q("update customers set source_lead_id=$2 where id=$1", [customer, id]);
  await q(
    "update records set parent_id=$2,updated_at=clock_timestamp() where parent_id=$1 and kind in ('property','contact','task','appointment')",
    [id, customer],
  );
  await audit(q, id, r.employee_id, "Converted to customer", r.name);
  return customer;
}
