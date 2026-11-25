-- Administrator SQL console only. Select the isolated fictional demo project.
-- Set keystone.allow_demo_reset = 'reset-fictional-records' in the same transaction.
do $$ begin
if current_setting('keystone.allow_demo_reset',true) is distinct from 'reset-fictional-records' then
raise exception 'Explicit demo reset confirmation required';end if;
if exists(select 1 from keystone.employees where auth_user_id is not null) then
raise exception 'An employee has been linked to authentication. Reset refused.';end if;
truncate keystone.records,keystone.company_settings,keystone.tags,keystone.services,keystone.pipeline_stages,keystone.custom_fields cascade;
end $$;
