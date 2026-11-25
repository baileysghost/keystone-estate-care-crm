export default {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: {
    "/*": ["./supabase/migrations/*.sql", "./supabase/seed.sql"],
  },
  devIndicators: false,
};
