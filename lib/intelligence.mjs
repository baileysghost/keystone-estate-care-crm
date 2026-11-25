import { z } from "zod";
import { settings, InputError, rescore } from "./hermes-store.mjs";
import { stages, relationships } from "./hermes-schema.mjs";
import { save } from "./repository.mjs";
import { seedDemo, removeDemo } from "./hermes-demo.mjs";
const id = z.uuid(),
  note = z.string().trim().min(1).max(2000);
const admin = (u) => {
  if (u.role !== "administrator")
    throw new InputError("Administrator access required.", 403);
};
export async function overview(q, u, demo) {
  const cases = await q(
    "select * from probate_cases where demo=$1 and ($2 or assigned_employee_id=$3 or assigned_employee_id is null) order by first_discovered_at desc",
    [demo, u.role === "administrator", u.employee_id],
  );
  const ids = cases.map((c) => c.id),
    linked = await q(
      "select * from case_attorneys where case_id=any($1::uuid[])",
      [ids],
    );
  const attorneys = await q(
    "select * from attorneys where demo=$1 order by full_name",
    [demo],
  );
  const firms = await q(
    "select * from law_firms where demo=$1 order by firm_name",
    [demo],
  );
  const runs = await q(
    "select * from hermes_runs where demo=$1 order by started_at desc",
    [demo],
  );
  const activity = await q(
    "select * from probate_activity where case_id=any($1::uuid[]) or attorney_id=any($2::uuid[]) order by created_at desc",
    [ids, attorneys.map((a) => a.id)],
  );
  const sources = await q(
    "select * from lead_sources where case_id=any($1::uuid[]) or attorney_id=any($2::uuid[])",
    [ids, attorneys.map((a) => a.id)],
  );
  const tasks = await q(
    "select * from probate_tasks where case_id=any($1::uuid[]) order by due",
    [ids],
  );
  const config = await settings(q),
    employees = await q(
      "select id,name from records where kind='employee' and not archived order by name",
    );
  const access =
    u.role === "administrator"
      ? await q("select * from employee_access order by email")
      : [];
  const [properties] = await q(
    "select count(*)::int as count from records where kind='property' and not archived and ($1 or employee_id=$2)",
    [u.role === "administrator", u.employee_id],
  );
  return {
    active_properties: demo ? 0 : properties.count,
    cases,
    linked,
    attorneys,
    firms,
    runs,
    activity,
    sources,
    tasks,
    config,
    employees,
    access,
    user: u,
  };
}
export async function action(q, u, b) {
  await q("select pg_advisory_xact_lock(614092)");
  if (b.action === "settings") {
    admin(u);
    const key = z
      .enum(["territory", "expansion", "sources", "weights", "enabled"])
      .parse(b.key);
    const value =
      key === "enabled"
        ? z.boolean().parse(b.value)
        : key === "weights"
          ? z
              .strictObject(
                Object.fromEntries(
                  [
                    "territory",
                    "real_estate",
                    "recent",
                    "license",
                    "contact",
                    "sources",
                  ].map((k) => [k, z.number().int().min(0).max(100)]),
                ),
              )
              .parse(b.value)
          : z.array(note).min(1).max(200).parse(b.value);
    await q("update integration_settings set value=$2::jsonb where key=$1", [
      key,
      JSON.stringify(value),
    ]);
    if (["territory", "weights"].includes(key)) {
      const config = await settings(q);
      for (const c of await q("select id,data from probate_cases"))
        await rescore(q, c.id, c.data, config);
    }
    return;
  }
  if (b.action === "access") {
    admin(u);
    const email = z.email().parse(b.email).toLowerCase();
    if (email === u.email)
      throw new InputError(
        "Use another administrator to change your own access.",
      );
    const role = z.enum(["employee", "administrator"]).parse(b.role),
      enabled = z.boolean().parse(b.enabled);
    let emp = b.employee_id ? id.parse(b.employee_id) : null;
    if (role === "employee" && !emp) {
      const [prior] = await q(
        "select employee_id from employee_access where email=$1",
        [email],
      );
      emp =
        prior?.employee_id ||
        (await save(q, { kind: "employee", name: email, data: { email } }));
    }
    await q(
      "insert into employee_access(email,role,employee_id,enabled) values($1,$2,$3,$4) on conflict(email) do update set role=excluded.role,employee_id=excluded.employee_id,enabled=excluded.enabled",
      [email, role, emp, enabled],
    );
    return;
  }
  if (b.action === "demo-seed" || b.action === "demo-remove") {
    admin(u);
    return b.action === "demo-seed" ? seedDemo(q) : removeDemo(q);
  }
  if (b.action === "run") {
    admin(u);
    await q(
      "insert into research_requests(description) values('Run scheduled territory research on the next poll.')",
    );
    return;
  }
  if (["referral", "communication"].includes(b.action)) {
    const [person] = await q("select * from attorneys where id=$1 for update", [
      id.parse(b.id),
    ]);
    if (
      !person ||
      (u.role !== "administrator" &&
        person.staff.assigned_employee_id !== u.employee_id)
    )
      throw new InputError("Assignment required.", 403);
    if (
      b.action === "communication" &&
      (person.staff.do_not_contact ||
        person.staff.relationship_status === "Do not contact")
    )
      throw new InputError("Outreach suppressed.", 409);
    await q(
      "insert into probate_activity(attorney_id,actor,action,detail) values($1,$2,$3,$4)",
      [person.id, u.email, b.action, note.parse(b.value)],
    );
    if (b.action === "communication")
      await q(
        "update attorneys set staff=staff||jsonb_build_object('last_contacted',now()) where id=$1",
        [person.id],
      );
    return;
  }
  if (b.action === "attorney") {
    const [p] = await q("select * from attorneys where id=$1 for update", [
      id.parse(b.id),
    ]);
    if (!p) throw new InputError("Contact missing.", 404);
    if (
      u.role !== "administrator" &&
      p.staff.assigned_employee_id !== u.employee_id
    )
      throw new InputError("Assignment required.", 403);
    const staff = z
      .strictObject({
        relationship_status: z.enum(relationships).optional(),
        assigned_employee_id: id.nullish(),
        notes: note.optional(),
        next_follow_up: z.iso.date().nullish(),
        do_not_contact: z.boolean().optional(),
      })
      .parse(b.value);
    if (u.role !== "administrator" && "assigned_employee_id" in staff)
      throw new InputError("Administrator access required.", 403);
    await q("update attorneys set staff=staff||$2::jsonb where id=$1", [
      p.id,
      JSON.stringify(staff),
    ]);
    await q(
      "insert into probate_activity(attorney_id,actor,action) values($1,$2,'Updated relationship')",
      [p.id, u.email],
    );
    return;
  }
  const ids = z.array(id).min(1).max(100).parse(b.ids);
  for (const caseId of ids) {
    const [c] = await q("select * from probate_cases where id=$1 for update", [
      caseId,
    ]);
    if (!c) throw new InputError("Case missing.", 404);
    if (u.role !== "administrator" && c.assigned_employee_id !== u.employee_id)
      throw new InputError("Assignment required.", 403);
    let detail = "";
    switch (b.action) {
      case "assign":
        admin(u);
        await q(
          "update probate_cases set assigned_employee_id=$2 where id=$1",
          [caseId, id.nullable().parse(b.value)],
        );
        break;
      case "archive":
      case "reject":
        await q(
          "update probate_cases set archived=true,reviewed=true where id=$1",
          [caseId],
        );
        break;
      case "review":
      case "approve":
        await q(
          "update probate_cases set reviewed=true,stage=case when $2='approve' then 'Ready for outreach' else stage end where id=$1",
          [caseId, b.action],
        );
        break;
      case "delete-archived": {
        admin(u);
        if (!c.archived || c.client_id)
          throw new InputError("Archive an unconverted case first.");
        await q("delete from probate_cases where id=$1", [caseId]);
        await q(
          "insert into probate_activity(actor,action,detail) values($1,'Deleted archived case',$2)",
          [u.email, caseId],
        );
        continue;
      }
      case "merge": {
        admin(u);
        const target = id.parse(b.value);
        const [t] = await q(
          "select * from probate_cases where id=$1 and demo=$2 for update",
          [target, c.demo],
        );
        if (!t || t.id === caseId || c.client_id || t.archived)
          throw new InputError(
            "Select a different active case in this dataset.",
          );
        await q(
          "insert into case_attorneys select $2,attorney_id from case_attorneys where case_id=$1 on conflict do nothing",
          [caseId, target],
        );
        await q(
          "insert into lead_sources(case_id,source_url,data,date_retrieved) select $2,source_url,data,date_retrieved from lead_sources where case_id=$1 on conflict do nothing",
          [caseId, target],
        );
        for (const tbl of [
          "probate_tasks",
          "probate_activity",
          "research_requests",
        ])
          await q("update " + tbl + " set case_id=$2 where case_id=$1", [
            caseId,
            target,
          ]);
        await q(
          "update probate_cases set archived=true,reviewed=true where id=$1",
          [caseId],
        );
        await rescore(q, target, t.data, await settings(q));
        await q(
          "insert into probate_activity(case_id,actor,action,detail) values($1,$2,'Merged duplicate', $3)",
          [target, u.email, c.data.case_number],
        );
        break;
      }
      case "task-complete": {
        const rows = await q(
          "update probate_tasks set completed=true where id=$1 and case_id=$2 returning id",
          [id.parse(b.value), caseId],
        );
        if (!rows.length) throw new InputError("Follow-up missing.", 404);
        break;
      }
      case "note":
        detail = note.parse(b.value);
        break;
      case "research":
        detail = note.parse(b.value);
        await q(
          "insert into research_requests(case_id,description,demo) values($1,$2,$3)",
          [caseId, detail, c.demo],
        );
        break;
      case "follow-up": {
        const due = z.iso.date().parse(b.due);
        detail = note.parse(b.value);
        await q(
          "insert into probate_tasks(case_id,employee_id,title,due) values($1,$2,$3,$4)",
          [caseId, c.assigned_employee_id, detail, due],
        );
        await q(
          "update probate_cases set stage='Follow-up scheduled' where id=$1",
          [caseId],
        );
        break;
      }
      case "convert": {
        if (c.demo)
          throw new InputError(
            "Demonstration cases cannot create live clients.",
          );
        if (!c.client_id) {
          const client = await save(q, {
            kind: "customer",
            name: "Estate case " + c.data.case_number,
            employee_id: c.assigned_employee_id,
            data: { status: "Active" },
          });
          await q(
            "update probate_cases set client_id=$2,stage='Client acquired',reviewed=true where id=$1",
            [caseId, client],
          );
        }
        break;
      }
      case "stage": {
        detail = z.enum(stages).parse(b.value);
        if (detail === "Client acquired")
          throw new InputError("Use Convert to client.");
        if (detail === "Contacted") {
          const people = await q(
            "select a.* from attorneys a join case_attorneys c on c.attorney_id=a.id where c.case_id=$1",
            [caseId],
          );
          if (!people.length)
            throw new InputError(
              "Link a verified professional before logging outreach.",
            );
          if (people.length > 1 && !b.attorney_id)
            throw new InputError("Select the attorney contacted.");
          const recipient = b.attorney_id
            ? people.find((p) => p.id === b.attorney_id)
            : people[0];
          if (!recipient)
            throw new InputError("Attorney is not linked to this case.");
          for (const p of [recipient]) {
            if (
              p.staff.do_not_contact ||
              p.staff.relationship_status === "Do not contact" ||
              p.staff.last_contacted?.slice(0, 10) ===
                new Date().toISOString().slice(0, 10)
            )
              throw new InputError(
                "Outreach suppressed or already recorded today.",
                409,
              );
            await q(
              "insert into probate_activity(case_id,attorney_id,actor,action) values($1,$2,$3,'communication')",
              [caseId, p.id, u.email],
            );
            await q(
              "update attorneys set staff=staff||jsonb_build_object('last_contacted',now(),'relationship_status','Outreach initiated') where id=$1",
              [p.id],
            );
          }
        }
        await q("update probate_cases set stage=$2 where id=$1", [
          caseId,
          detail,
        ]);
        break;
      }
      default:
        throw new InputError("Unknown action.");
    }
    await q("update probate_cases set updated_at=now() where id=$1", [caseId]);
    await q(
      "insert into probate_activity(case_id,actor,action,detail) values($1,$2,$3,$4)",
      [caseId, u.email, b.action, detail],
    );
  }
}
