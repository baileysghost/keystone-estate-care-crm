-- Migration 005: Hermes Agent Integration
-- Independent schema for probate research automation API

create schema if not exists hermes;
set search_path=hermes,public;

-- Track research runs
create table if not exists hermes.research_runs (
  id              uuid primary key default gen_random_uuid(),
  run_id          text unique not null,
  status          text not null check(status in ('pending','running','completed','partial','failed')),
  started_at      timestamptz not null default now(),
  completed_at   timestamptz,
  sources_checked int         not null default 0,
  sources_unavailable int    not null default 0,
  cases_discovered int        not null default 0,
  leads_created   int         not null default 0,
  leads_updated   int         not null default 0,
  duplicates_prevented int  not null default 0,
  attorneys_created int       not null default 0,
  attorneys_updated int      not null default 0,
  requests_completed int     not null default 0,
  validation_failures int    not null default 0,
  api_failures     int        not null default 0,
  retry_queue_size int        not null default 0,
  ai_cost_usd      numeric(8,4) not null default 0,
  notes           text
);
create index research_runs_status on hermes.research_runs(status,started_at);

-- Probable cause leads submitted by the automation agent
create table if not exists hermes.leads (
  id                    uuid primary key default gen_random_uuid(),
  crm_record_id         uuid references keystone.leads on delete set null,
  external_run_id      text,
  case_number          text not null,
  jurisdiction         text,
  property_city        text,
  property_county      text,
  attorney_full_name   text,
  attorney_law_firm   text,
  attorney_email       text,
  attorney_phone      text,
  estate_name          text,
  probate_stage        text,
  real_estate_involved  boolean,
  lead_score           int,
  status               text not null default 'pending'
                          check(status in ('pending','qualified','submitted','duplicate','rejected')),
  submitted_at         timestamptz not null default now(),
  crm_submitted_at    timestamptz,
  idempotency_key     text unique,
  data                 jsonb not null default '{}',
  constraint unique_hermes_case_jurisdiction
    unique(case_number, jurisdiction)
);
create index hermes_leads_case on hermes.leads(case_number, jurisdiction);
create index hermes_leads_status on hermes.leads(status, submitted_at);
create index hermes_leads_run on hermes.leads(external_run_id);

-- Attorney contacts
create table if not exists hermes.attorneys (
  id                   uuid primary key default gen_random_uuid(),
  crm_record_id        uuid references keystone.contacts on delete set null,
  full_name            text not null,
  bar_number           text,
  bar_status           text,
  law_firm             text,
  professional_email   text,
  business_phone      text,
  law_firm_website    text,
  business_address    text,
  probate_practice     boolean default false,
  estate_planning_practice boolean default false,
  trust_admin_practice boolean default false,
  geo_service_area     text,
  status               text not null default 'pending'
                          check(status in ('pending','verified','submitted','duplicate','rejected')),
  submitted_at         timestamptz not null default now(),
  crm_submitted_at    timestamptz,
  idempotency_key     text unique,
  data                 jsonb not null default '{}',
  constraint unique_hermes_attorney
    unique(full_name, law_firm)
);
create index hermes_attorneys_status on hermes.attorneys(status, submitted_at);

-- Case update log for monitoring previously discovered cases
create table if not exists hermes.case_updates (
  id                   uuid primary key default gen_random_uuid(),
  hermes_lead_id       uuid references hermes.leads on delete cascade,
  run_id               text,
  update_type          text not null check(update_type in (
                            'status_change','attorney_change','hearing_scheduled',
                            'real_estate_confirmed','property_city_confirmed','other')),
  previous_value       text,
  new_value            text,
  source_url           text,
  source_name           text,
  data                 jsonb not null default '{}',
  created_at           timestamptz not null default now()
);
create index case_updates_lead on hermes.case_updates(hermes_lead_id, created_at);

-- Source registry for tracking research source health
create table if not exists hermes.sources (
  id                   uuid primary key default gen_random_uuid(),
  source_name          text unique not null,
  source_url           text,
  source_type          text check(source_type in ('legal_notice','court_site','newspaper',
                                                    'assessor','state_bar','other')),
  geo_coverage         text,
  access_method        text,
  access_permitted     boolean default true,
  last_success         timestamptz,
  last_attempt         timestamptz,
  error_count          int not null default 0,
  last_error           text,
  is_active            boolean not null default true,
  notes                text
);

-- Research request queue from employees
create table if not exists hermes.research_requests (
  id          uuid primary key default gen_random_uuid(),
  run_id      text,
  request_type text not null,
  description text,
  priority    text default 'normal' check(priority in ('low','normal','high')),
  status      text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
  created_at  timestamptz not null default now(),
  completed_at timestamptz,
  result_note text,
  data        jsonb not null default '{}'
);
create index research_requests_status on hermes.research_requests(status, created_at);

-- Global research configuration
create table if not exists hermes.config (
  key    text primary key,
  value  jsonb not null
);

-- Initialize default config
insert into hermes.config (key, value) values
  ('service_territories', '[
    {"name":"Rancho Palos Verdes","tier":1},
    {"name":"Palos Verdes Estates","tier":1},
    {"name":"Rolling Hills","tier":1},
    {"name":"Rolling Hills Estates","tier":1},
    {"name":"San Pedro","tier":1},
    {"name":"Torrance","tier":1},
    {"name":"Manhattan Beach","tier":1},
    {"name":"Hermosa Beach","tier":1},
    {"name":"Redondo Beach","tier":1},
    {"name":"Long Beach","tier":1},
    {"name":"El Segundo","tier":1},
    {"name":"Lomita","tier":2},
    {"name":"Harbor City","tier":2},
    {"name":"Harbor Gateway","tier":2},
    {"name":"Wilmington","tier":2},
    {"name":"Carson","tier":2},
    {"name":"Gardena","tier":2},
    {"name":"Hawthorne","tier":2},
    {"name":"Lawndale","tier":2},
    {"name":"Inglewood","tier":2},
    {"name":"Signal Hill","tier":2},
    {"name":"Lakewood","tier":2},
    {"name":"Seal Beach","tier":3},
    {"name":"Los Alamitos","tier":3}
  ]'::jsonb)
on conflict(key) do nothing;

insert into hermes.config (key, value) values
  ('research_defaults', '{"lookback_days":30,"daily_discovery_window_days":7,"max_leads_per_run":50}'::jsonb)
on conflict(key) do nothing;

-- Schema migration tracking
create table if not exists hermes.schema_migrations (version text primary key);
insert into hermes.schema_migrations (version) values ('005_hermes')
on conflict(version) do nothing;

-- RLS
do $$ begin
  foreach tbl in array variant['', 'research_runs','leads','attorneys','case_updates','sources','research_requests','config'] loop
    if tbl != '' then
      execute format('alter table hermes.%I enable row level security', tbl);
    end if;
  end loop;
end; $$;

revoke all on schema hermes from public;
revoke all on all tables in schema hermes from public;