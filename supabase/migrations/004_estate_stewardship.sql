-- The record form attributes are stored in the corresponding entity's JSONB data.
insert into keystone.custom_fields(kind,name) values
('lead','estate_name'),('lead','probate_county'),('lead','case_reference'),('lead','probate_stage'),('lead','billing_arrangement'),
('customer','estate_name'),('customer','probate_county'),('customer','case_reference'),('customer','probate_stage'),('customer','billing_arrangement'),('customer','escrow_status'),('customer','estimated_escrow_close'),
('property','occupancy_status'),('property','vacancy_since'),('property','inspection_frequency'),('property','next_inspection'),('property','property_security_status'),
('appointment','inspection_outcome'),('appointment','report_sent_date')
on conflict(kind,name) do nothing;
insert into keystone.services(name) values ('Vacant-property inspections'),('Estate inventory and photo reporting'),('Property security coordination'),('Cleanout coordination'),('Escrow handoff') on conflict(name) do nothing;
update keystone.company_settings s set value=s.value || (select coalesce(jsonb_agg(v order by ord),'[]') from unnest(array['Vacant-property inspections','Estate inventory and photo reporting','Property security coordination','Cleanout coordination','Escrow handoff']) with ordinality as m(v,ord) where not s.value ? v) where s.key='services';
