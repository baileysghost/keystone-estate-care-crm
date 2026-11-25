export const entities = [
  "lead",
  "customer",
  "property",
  "contact",
  "task",
  "appointment",
  "note",
  "communication",
  "document",
  "activity",
  "employee",
] as const;
export type Kind = (typeof entities)[number];
export type Row = {
  id: string;
  kind: Kind;
  name: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  employee_id: string | null;
  parent_id: string | null;
  data: Record<string, string>;
  tags: string[];
  services: string[];
  links: string[];
};
export type Settings = Record<string, string[]>;
export type Snapshot = { rows: Row[]; settings: Settings };
export const fields: Record<Kind, string[]> = {
  lead: "first_name last_name household email phone secondary_phone street city state zip website source value priority status last_contact follow_up estate_name probate_county case_reference probate_stage billing_arrangement".split(
    " ",
  ),
  customer:
    "household email alternate_email phone secondary_phone billing_address preferred_method status customer_since source frequency service_start renewal monthly_value instructions preferences estate_name probate_county case_reference probate_stage billing_arrangement escrow_status estimated_escrow_close".split(
      " ",
    ),
  property:
    "street city state zip property_type square_feet status frequency emergency_contact preferred_times instructions maintenance last_service next_service occupancy_status vacancy_since inspection_frequency next_inspection property_security_status".split(
      " ",
    ),
  contact: "contact_type job_title company email phone preferred_method".split(
    " ",
  ),
  task: "category description due time priority status completed_on".split(" "),
  appointment:
    "category due time end_time description inspection_outcome report_sent_date".split(
      " ",
    ),
  note: ["description", "pinned"],
  communication: ["category", "due", "time", "description", "follow_up"],
  document: ["category", "description"],
  activity: ["description"],
  employee: ["role", "email"],
};
export const defaults: Settings = {
  company: ["Keystone Estate Care"],
  stages: [
    "New Lead",
    "Contact Attempted",
    "Contacted",
    "Qualified",
    "Consultation Scheduled",
    "Proposal Sent",
    "Negotiation",
    "Won",
    "Lost",
    "On Hold",
  ],
  sources: [
    "Website",
    "Referral",
    "Phone inquiry",
    "Email inquiry",
    "Social media",
    "Networking",
    "Cold outreach",
    "Advertising",
    "Other",
  ],
  customerStatuses: [
    "Active",
    "Pending",
    "Inactive",
    "Former Customer",
    "On Hold",
  ],
  propertyTypes: [
    "Primary residence",
    "Secondary residence",
    "Vacation home",
    "Luxury estate",
    "Rental property",
    "Commercial property",
    "Other",
  ],
  services: [
    "Estate oversight",
    "Home watch",
    "Vendor coordination",
    "Seasonal preparation",
    "Vacant-property inspections",
    "Estate inventory and photo reporting",
    "Property security coordination",
    "Cleanout coordination",
    "Escrow handoff",
  ],
  taskTypes: [
    "Phone call",
    "Email",
    "Follow-up",
    "Meeting",
    "Property visit",
    "Consultation",
    "Prepare proposal",
    "Customer check-in",
    "Service reminder",
    "Administrative task",
    "Other",
  ],
  tags: ["Coastal", "Referral", "Seasonal"],
  notifications: ["Show overdue reminders"],
  appearance: ["Light"],
  logo: ["Keystone mark"],
};
export function choices(
  kind: Kind,
  key: string,
  s: Settings,
): string[] | undefined {
  if (key === "status")
    return kind === "lead"
      ? s.stages
      : kind === "customer"
        ? s.customerStatuses
        : kind === "task"
          ? ["Open", "In progress", "Completed"]
          : ["Active", "Pending", "Inactive"];
  const opts: Settings = {
    probate_stage: [
      "Unconfirmed",
      "Intake",
      "Representative appointed",
      "Estate administration",
      "Preparing for sale",
      "In escrow",
      "Closed",
    ],
    billing_arrangement: [
      "Unconfirmed",
      "Direct billing",
      "Escrow-deferred",
      "Other",
    ],
    escrow_status: ["Unconfirmed", "Not opened", "Open", "Closed", "Cancelled"],
    occupancy_status: [
      "Unconfirmed",
      "Vacant",
      "Occupied",
      "Partially occupied",
    ],
    inspection_frequency: [
      "Unconfirmed",
      "Weekly",
      "Every two weeks",
      "Monthly",
      "As requested",
    ],
    property_security_status: [
      "Unconfirmed",
      "Check scheduled",
      "Secured at last visit",
      "Action required",
    ],
    inspection_outcome: [
      "Not applicable",
      "No issues observed",
      "Follow-up required",
      "Unable to access",
    ],
    source: s.sources,
    property_type: s.propertyTypes,
    priority: ["Normal", "High", "Low"],
    pinned: ["No", "Yes"],
    preferred_method: ["Email", "Phone", "Text"],
    role: ["Employee", "Manager", "Administrator"],
    contact_type: [
      "Property owner",
      "Homeowner",
      "Property manager",
      "Estate manager",
      "Family member",
      "Personal assistant",
      "Vendor",
      "Contractor",
      "Referral partner",
      "Executor",
      "Administrator",
      "Trustee",
      "Probate attorney",
      "Probate realtor",
      "Escrow officer",
      "Other",
    ],
    category:
      kind === "task"
        ? s.taskTypes
        : kind === "appointment"
          ? [
              "Customer appointment",
              "Consultation",
              "Property visit",
              "Service appointment",
              "Internal meeting",
              "Follow-up",
            ]
          : kind === "document"
            ? [
                "Service agreements",
                "Contracts",
                "Proposals",
                "Estimates",
                "Property photographs",
                "Inspection reports",
                "Service reports",
                "General documents",
                "Other",
              ]
            : [
                "Phone call",
                "Email",
                "Text message",
                "In-person meeting",
                "Property visit",
                "Internal note",
                "Other",
              ],
  };
  return opts[key];
}
export const dates = new Set(
  "last_contact follow_up customer_since service_start renewal last_service next_service due completed_on estimated_escrow_close vacancy_since next_inspection report_sent_date".split(
    " ",
  ),
);
export const label = (s: string) =>
  s.replace(/_/g, " ").replace(/^./, (v) => v.toUpperCase());
export const plural: Record<Kind, string> = {
  lead: "Leads",
  customer: "Customers",
  property: "Properties",
  contact: "Contacts",
  task: "Tasks",
  appointment: "Calendar",
  activity: "Activity",
  employee: "Employees",
  document: "Documents",
  note: "Notes",
  communication: "Communications",
};
export const today = (d = new Date()) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
