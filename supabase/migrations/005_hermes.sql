set search_path=keystone,public;
create table employee_access (
  email text primary key check(email=lower(email)), role text not null check(role in ('administrator','employee')),
  employee_id uuid unique references employees, enabled boolean not null default true,
  check(role='administrator' or employee_id is not null)
);
create table integration_settings (key text primary key, value jsonb not null);
insert into integration_settings values
('territory','["San Pedro","Rancho Palos Verdes","Palos Verdes Estates","Rolling Hills","Rolling Hills Estates","Torrance","Redondo Beach","Hermosa Beach","Manhattan Beach","El Segundo","Lomita","Harbor City","Harbor Gateway","Wilmington","Carson","Gardena","Hawthorne","Lawndale","Inglewood","Long Beach","Signal Hill","Lakewood"]'),
('expansion','["Seal Beach","Los Alamitos","Surrounding Los Angeles County cities","Northern Orange County"]'),
('sources','["Los Angeles County Superior Court","Public probate case search","Public court calendar","California public legal notices","Daily Breeze","Long Beach Press-Telegram","California State Bar","Official law firm website","Professional business directory"]'),
('weights','{"territory":25,"real_estate":30,"recent":15,"license":10,"contact":10,"sources":10}'),
('schedule','"06:00 America/Los_Angeles"'),('enabled','false');
create table law_firms(id uuid primary key default gen_random_uuid(),name_key text not null, firm_name text not null, data jsonb not null default '{}', demo boolean not null default false,unique(demo,name_key));
create table attorneys(id uuid primary key default gen_random_uuid(), name_key text not null, full_name text not null, law_firm_id uuid references law_firms, bar_key text,email_key text,data jsonb not null default '{}', staff jsonb not null default '{}', demo boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(demo,bar_key),unique(demo,email_key));
create unique index attorney_name_firm on attorneys(demo,name_key,law_firm_id) where law_firm_id is not null;
create table probate_cases(id uuid primary key default gen_random_uuid(),jurisdiction_key text not null,case_key text not null,data jsonb not null,score_breakdown jsonb not null default '{}',lead_score int not null default 0 check(lead_score between 0 and 100),stage text not null default 'Newly discovered',assigned_employee_id uuid references employees,reviewed boolean not null default false,archived boolean not null default false, client_id uuid references customers,first_discovered_at timestamptz not null default now(),last_verified_at timestamptz,updated_at timestamptz not null default now(),demo boolean not null default false,unique(demo,jurisdiction_key,case_key));
create index probate_inbox on probate_cases(demo,archived,first_discovered_at desc);
create table case_attorneys(case_id uuid references probate_cases on delete cascade,attorney_id uuid references attorneys on delete cascade,primary key(case_id,attorney_id));
create table lead_sources(id uuid primary key default gen_random_uuid(),case_id uuid references probate_cases on delete cascade,attorney_id uuid references attorneys on delete cascade,source_url text not null,data jsonb not null,date_retrieved timestamptz not null default now(),check(num_nonnulls(case_id,attorney_id)=1),unique(case_id,source_url),unique(attorney_id,source_url));
create table hermes_runs(id uuid primary key default gen_random_uuid(),external_run_id text not null,status text not null,started_at timestamptz not null default now(),completed_at timestamptz,data jsonb not null default '{}',demo boolean not null default false,unique(demo,external_run_id));
create table research_requests(id uuid primary key default gen_random_uuid(),case_id uuid references probate_cases on delete cascade,description text not null,created_at timestamptz not null default now(),completed_at timestamptz,result text,demo boolean not null default false);
create table probate_activity(id uuid primary key default gen_random_uuid(),case_id uuid references probate_cases on delete cascade,attorney_id uuid references attorneys on delete cascade,actor text not null,action text not null,detail text,created_at timestamptz not null default now());
create table probate_tasks(id uuid primary key default gen_random_uuid(),case_id uuid not null references probate_cases on delete cascade,employee_id uuid references employees,title text not null,due date not null,completed boolean not null default false);
create table hermes_receipts(key text primary key,digest text not null,response jsonb not null,created_at timestamptz not null default now());
create table hermes_rate(minute timestamptz primary key,requests int not null);
create table hermes_audit(id uuid primary key, endpoint text not null,status int not null,created_at timestamptz not null default now());
do $$ declare n text; begin
foreach n in array array['employee_access','integration_settings','law_firms','attorneys','probate_cases','case_attorneys','lead_sources','hermes_runs','research_requests','probate_activity','probate_tasks','hermes_receipts','hermes_rate','hermes_audit'] loop
execute format('alter table keystone.%I enable row level security',n);
if exists(select from pg_roles where rolname='keystone_web') then
execute format('grant select,insert,update,delete on keystone.%I to keystone_web',n);
execute format('create policy server_access on keystone.%I to keystone_web using(true) with check(true)',n);
end if;
end loop; end $$;
insert into schema_migrations(version) values('005_hermes');
