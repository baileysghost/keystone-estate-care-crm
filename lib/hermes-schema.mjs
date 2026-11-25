import { z } from "zod";
const text = z.string().trim().min(1).max(240);
const memo = z.string().trim().min(1).max(4000);
const url = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((v) => !new URL(v).username && !new URL(v).password);
const date = z.iso.date();
export const stages = [
  "Newly discovered",
  "Research required",
  "Verified",
  "Ready for outreach",
  "Contacted",
  "Awaiting response",
  "Follow-up scheduled",
  "Consultation scheduled",
  "Proposal sent",
  "Client acquired",
  "Closed / not interested",
];
export const relationships = [
  "New contact",
  "Not contacted",
  "Outreach initiated",
  "Awaiting response",
  "Follow-up required",
  "Interested",
  "Referral partner",
  "Active client",
  "Not interested",
  "Do not contact",
  "Archived",
];
export const source = z.strictObject({
  source_name: text,
  source_type: text,
  source_url: url,
  date_published: date.nullish(),
  date_retrieved: z.iso.datetime({ offset: true }).nullish(),
  verification_notes: memo.nullish(),
});
const citations = z.array(source).max(20);
export const attorney = z.strictObject({
  full_name: text,
  law_firm: text.nullish(),
  firm_details: z
    .strictObject({
      website: url.nullish(),
      business_phone: text.nullish(),
      professional_email: z.email().nullish(),
      business_address: text.nullish(),
      verified: z.boolean(),
    })
    .optional(),
  website: url.nullish(),
  business_address: text.nullish(),
  state_bar_number: z
    .string()
    .regex(/^\d{1,9}$/)
    .nullish(),
  license_status: z
    .enum(["verified", "unverified", "inactive", "unknown"])
    .nullish(),
  professional_email: z.email().max(254).nullish(),
  business_phone: text.nullish(),
  contact_verified: z.boolean().optional(),
  practice_areas: z.array(text).max(20).optional(),
  service_areas: z.array(text).max(40).optional(),
  category: z
    .enum([
      "Probate attorney",
      "Estate planning attorney",
      "Professional fiduciary",
      "Trust administration professional",
      "Estate administrator",
      "Probate real estate professional",
      "Property management professional",
      "Referral partner",
    ])
    .optional(),
  sources: citations.optional(),
});
export const lead = z.strictObject({
  external_run_id: text.optional(),
  case_number: text,
  jurisdiction: text,
  courthouse: text.nullish(),
  filing_date: date.nullish(),
  hearing_date: date.nullish(),
  case_status: text.nullish(),
  property_city: text.nullish(),
  property_county: text.nullish(),
  real_estate_status: z
    .enum(["confirmed", "unconfirmed", "unknown", "none"])
    .nullish(),
  verification_status: z
    .enum([
      "verified",
      "partially_verified",
      "unverified",
      "conflicting_information",
      "research_required",
    ])
    .nullish(),
  verification_notes: memo.nullish(),
  research_summary: memo.nullish(),
  attorney: attorney.nullish(),
  sources: citations.optional(),
});
const run = z.strictObject({ external_run_id: text });
const count = z.number().int().nonnegative().max(10000000).optional();
export const schemas = {
  leads: lead,
  "case-updates": lead,
  attorneys: attorney,
  batch: z.strictObject({
    external_run_id: text.optional(),
    cases: z.array(lead).max(50),
    attorneys: z.array(attorney).max(50),
  }),
  "runs/start": run,
  "runs/complete": run.extend({
    status: z.enum(["completed", "warnings", "failed"]),
    sources_checked: count,
    cases_discovered: count,
    leads_created: count,
    leads_updated: count,
    duplicates_prevented: count,
    attorneys_discovered: count,
    errors_count: count,
    error_summary: memo.nullish(),
    estimated_processing_cost: z.number().nonnegative().optional(),
  }),
  "research-requests/complete": z.strictObject({
    id: z.uuid(),
    result: memo,
    sources: citations.min(1),
  }),
};
export const normalize = (v) =>
  v
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "") || "";
export function score(data, professional, sources, settings, now = new Date()) {
  const age = (now - new Date(data.filing_date + "T00:00:00Z")) / 86400000;
  const checks = {
    territory:
      data.verification_status === "verified" &&
      settings.territory.some(
        (c) => normalize(c) === normalize(data.property_city),
      ),
    real_estate: data.real_estate_status === "confirmed",
    recent: age >= 0 && age < 31,
    license: professional?.license_status === "verified",
    contact:
      professional?.contact_verified &&
      Boolean(professional.professional_email || professional.business_phone),
    sources:
      new Set(
        sources.map((s) =>
          new URL(s.source_url).hostname.replace(/^www\./, ""),
        ),
      ).size >= 2,
  };
  const breakdown = Object.fromEntries(
    Object.entries(checks).map(([k, v]) => [k, v ? settings.weights[k] : 0]),
  );
  return {
    breakdown,
    total: Math.min(
      100,
      Object.values(breakdown).reduce((a, b) => a + b, 0),
    ),
  };
}
