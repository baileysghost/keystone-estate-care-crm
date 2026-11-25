export function connectionUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}
