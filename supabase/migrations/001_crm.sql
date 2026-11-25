create schema keystone;
set search_path=keystone,public;
create table records (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('lead','customer','property','contact','task','appointment','note','communication','document','activity','employee')),
 name text not null check(length(trim(name)) between 1 and 240),
 employee_id uuid references records, parent_id uuid references records,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 archived boolean not null default false, check(parent_id is distinct from id));
create index records_kind on records(kind,archived,created_at);
create index records_parent on records(parent_id);
create index records_employee on records(employee_id);
create table employees(id uuid primary key references records, auth_user_id uuid unique, data jsonb not null default '{}');
create table leads(id uuid primary key references records, data jsonb not null default '{}');
create unique index lead_email on leads(lower(trim(data->>'email'))) where coalesce(trim(data->>'email'),'')<>'';
create table customers(id uuid primary key references records, source_lead_id uuid unique references leads, data jsonb not null default '{}');
create unique index customer_email on customers(lower(trim(data->>'email'))) where coalesce(trim(data->>'email'),'')<>'';
create table contacts(id uuid primary key references records, data jsonb not null default '{}');
create table properties(id uuid primary key references records, data jsonb not null default '{}');
create table tasks(id uuid primary key references records, data jsonb not null default '{}');
create table appointments(id uuid primary key references records, data jsonb not null default '{}');
create table notes(id uuid primary key references records, data jsonb not null default '{}');
create table communications(id uuid primary key references records, data jsonb not null default '{}');
create table documents(id uuid primary key references records, data jsonb not null default '{}');
create table activities(id uuid primary key references records, data jsonb not null default '{}');
create table contact_relationships(record_id uuid references records, related_id uuid references records, primary key(record_id,related_id),check(record_id<>related_id));
create index relationships_reverse on contact_relationships(related_id);
create table tags(id uuid primary key default gen_random_uuid(),name text unique not null);
create table services(id uuid primary key default gen_random_uuid(),name text unique not null);
create table tag_relationships(record_id uuid references records, tag_id uuid references tags,primary key(record_id,tag_id));
create table property_services(record_id uuid references records,service_id uuid references services,primary key(record_id,service_id));
create table pipeline_stages(id uuid primary key default gen_random_uuid(),name text unique not null,position int not null);
create table custom_fields(id uuid primary key default gen_random_uuid(),kind text not null,name text not null,unique(kind,name));
create table company_settings(key text primary key,value jsonb not null);
create view detail as
select id,data from leads union all select id,data from customers union all select id,data from properties union all select id,data from contacts union all select id,data from tasks union all select id,data from appointments union all select id,data from notes union all select id,data from communications union all select id,data from documents union all select id,data from activities union all select id,data from employees;
create view workspace as select r.*,d.data,
array(select t.name from tag_relationships x join tags t on t.id=x.tag_id where x.record_id=r.id order by t.name) tags,
array(select s.name from property_services x join services s on s.id=x.service_id where x.record_id=r.id order by s.name) services,
array(select related_id from contact_relationships where record_id=r.id) links
from records r join detail d using(id);
do $$ declare tbl record; begin
for tbl in select tablename from pg_tables where schemaname='keystone' loop
execute format('alter table keystone.%I enable row level security',tbl.tablename);
end loop;end $$;
revoke all on schema keystone from public;
revoke all on all tables in schema keystone from public;
