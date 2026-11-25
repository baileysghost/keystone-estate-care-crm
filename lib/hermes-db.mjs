import "server-only";
import postgres from "postgres";
import { connectionUrl } from "./connection.mjs";

let _pool: ReturnType<typeof postgres> | null = null;

function pool() {
  const url = connectionUrl();
  if (!url) throw Error("No database connection URL.");
  _pool ??= postgres(url, { prepare: false, max: 5, ssl: "require" });
  return _pool;
}

export async function closeHermesDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

type TxFn = (q: (sql: string, args?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>;

export async function hermesTx(fn: TxFn): Promise<unknown> {
  const sql = pool();
  return sql.begin(async (tx) => {
    await tx`SET search_path = hermes, keystone, public`;
    const q = async (stmt: string, args?: unknown[]) =>
      Array.from(await tx.unsafe(stmt, args));
    return fn(q as Parameters<TxFn>[0]);
  });
}

export async function hermesQuery(
  stmt: string,
  args?: unknown[],
): Promise<Record<string, unknown>[]> {
  const sql = pool();
  await sql`SET search_path = hermes, keystone, public`;
  return Array.from(await sql.unsafe(stmt, args));
}