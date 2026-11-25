// Run against your own isolated fictional demo only, after schema and data setup.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import { transaction, closeDatabase } from "../lib/database.mjs";
import { save } from "../lib/repository.mjs";
import { connectionUrl } from "../lib/connection.mjs";
const bucket = connectionUrl()
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ).storage.from("keystone-demo")
  : null;
try {
  for (const [key, name, body] of [
    [
      "a1bf2e21-e122-47ac-9ab2-a44b01000001",
      "Sample care plan.txt",
      "Fictional care plan\nWeekly exterior walkthrough and monthly vendor review.",
    ],
    [
      "a1bf2e21-e122-47ac-9ab2-a44b01000002",
      "Sample visit report.txt",
      "Fictional visit report\nThe scheduled walkthrough was completed. No maintenance items were recorded.",
    ],
  ]) {
    await transaction(async (q) => {
      await q("select pg_advisory_xact_lock(71839)");
      if (
        (await q("select id from documents where data->>'key'=$1", [key]))
          .length
      )
        return;
      const [owner] = await q(
        "select id from records where kind='property' order by name limit 1",
      );
      if (!owner) throw Error("Seed properties first.");
      if (bucket) {
        const { error } = await bucket.upload(key, Buffer.from(body), {
          contentType: "text/plain",
          upsert: true,
        });
        if (error) throw error;
      } else {
        await fs.mkdir(".demo/files", { recursive: true });
        await fs.writeFile(".demo/files/" + key, body);
      }
      await save(q, {
        kind: "document",
        name,
        parent_id: owner.id,
        data: {
          key,
          mime: "text/plain",
          category: "Service reports",
          description: "Fictional demonstration document.",
        },
      });
    });
  }
} finally {
  await closeDatabase();
}
