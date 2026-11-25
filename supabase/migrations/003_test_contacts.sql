-- One-time fixture. Each contact is editable and can be archived normally.
do $migration$
declare item record;
begin
  create table if not exists keystone.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  );
  alter table keystone.schema_migrations enable row level security;
  insert into keystone.schema_migrations(version) values ('003_test_contacts')
  on conflict do nothing;
  if not found then return; end if;

  for item in select * from (values
    ('d63ba3a0-28df-464f-970a-4860d5bd1301'::uuid,'Mira Elmford','Estate manager','Elmford House','mira.elmford','310-555-0141'),
    ('d63ba3a0-28df-464f-970a-4860d5bd1302'::uuid,'Theo Briarwell','Property owner','Briarwell Residence','theo.briarwell','310-555-0142'),
    ('d63ba3a0-28df-464f-970a-4860d5bd1303'::uuid,'Lena Alderwick','Personal assistant','Alderwick Household','lena.alderwick','310-555-0143'),
    ('d63ba3a0-28df-464f-970a-4860d5bd1304'::uuid,'Ellis Marlowby','Vendor','Marlowby Landscape Care','ellis.marlowby','310-555-0144'),
    ('d63ba3a0-28df-464f-970a-4860d5bd1305'::uuid,'Nora Fenridge','Referral partner','Fenridge Estate Services','nora.fenridge','310-555-0145')
  ) as contacts(id,name,role,company,mailbox,phone)
  loop
    insert into keystone.records(id,kind,name) values(item.id,'contact',item.name);
    insert into keystone.contacts(id,data) values(item.id,jsonb_build_object(
      'contact_type',item.role,'job_title',item.role,'company',item.company,
      'email',item.mailbox||'@example.test','phone',item.phone,'preferred_method','Email',
      'notes','Fictional test contact for Keystone Estate Care.'));
    insert into keystone.tags(name) values('Test contact') on conflict(name) do nothing;
    insert into keystone.tag_relationships(record_id,tag_id)
      select item.id,id from keystone.tags where name='Test contact';
  end loop;
end $migration$;
