import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../../lib/database.mjs";
import { save } from "../../../lib/repository.mjs";
import { checkOrigin, problem } from "../../../lib/api";
type Query = (
  sql: string,
  params?: unknown[],
) => Promise<{ name: string; data: Record<string, string> }[]>;
function storage() {
  if (!process.env.DATABASE_URL) return null;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  ).storage.from("keystone-demo");
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (process.env.CRM_DEMO_MODE !== "fictional")
      throw Error("Demo mode required.");
    const f = await req.formData();
    const file = f.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 4194304 ||
      !["application/pdf", "image/jpeg", "image/png", "text/plain"].includes(
        file.type,
      )
    )
      throw Error("Choose a PDF, JPEG, PNG or text file under 4 MB.");
    const parent = z
      .uuid()
      .nullable()
      .parse(f.get("parent_id") || null);
    const name = z.string().min(1).max(240).parse(file.name);
    const key = randomUUID();
    const bucket = storage();
    const bytes = Buffer.from(await file.arrayBuffer());
    const dir = path.resolve(process.env.CRM_FILE_DIR || ".demo/files");
    if (bucket) {
      const { error } = await bucket.upload(key, bytes, {
        contentType: file.type,
      });
      if (error) throw Error("Private storage upload failed.");
    } else {
      if (process.env.VERCEL) throw Error("Configure demo storage.");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, key), bytes);
    }
    try {
      await transaction((q: Query) =>
        save(q, {
          kind: "document",
          name,
          parent_id: parent,
          data: {
            key,
            mime: file.type,
            category: String(f.get("category") || "General documents"),
            description: String(f.get("description") || "").slice(0, 8000),
          },
        }),
      );
    } catch (e) {
      if (bucket) await bucket.remove([key]);
      else await fs.unlink(path.join(dir, key));
      throw e;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return problem(e);
  }
}
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const id = z.uuid().parse(params.get("id"));
    const [file] = await transaction((q: Query) =>
      q(
        "select name,data from workspace where kind='document' and archived=false and id=$1",
        [id],
      ),
    );
    if (!file) return new Response(null, { status: 404 });
    const key = z.uuid().parse(file.data.key),
      bucket = storage();
    let bytes: Uint8Array;
    if (bucket) {
      const { data, error } = await bucket.download(key);
      if (error) throw Error("File unavailable.");
      bytes = new Uint8Array(await data.arrayBuffer());
    } else
      bytes = await fs.readFile(
        path.resolve(process.env.CRM_FILE_DIR || ".demo/files", key),
      );
    return new Response(new Uint8Array(bytes).buffer, {
      headers: {
        "Content-Type": file.data.mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          (params.has("download") ? "attachment" : "inline") +
          "; filename*=UTF-8''" +
          encodeURIComponent(file.name),
      },
    });
  } catch (e) {
    return problem(e);
  }
}
