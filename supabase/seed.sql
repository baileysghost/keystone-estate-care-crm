set search_path=keystone,public;
do $$ declare i int; k text; rid uuid; owner_id uuid; staff uuid; title text; attrs jsonb; loc text; stage text; names text[]:=array['Alder','Bellamy','Cypress','Driftwood','Everett','Fairhaven','Glenmere','Hawthorn','Iverson','Juniper','Kingsley','Laurel','Mariner','Northfield','Orchard','Palisade','Quarry','Rowan','Seabrook','Thistle']; begin
if exists(select 1 from records) then raise exception 'Demo seed requires an empty workspace'; end if;
foreach k in array array['employee','lead','customer','property','contact','task','appointment','communication','note','activity'] loop
for i in 1..case k when 'employee' then 4 when 'lead' then 20 when 'customer' then 10 when 'property' then 15 when 'contact' then 25 when 'task' then 20 when 'appointment' then 10 else 5 end loop
loc:=names[1+(i-1)%20];title:=loc||' household';owner_id:=null;
select id into staff from records where kind='employee' order by name offset ((i-1)%4) limit 1;
if k in ('property','contact','task','appointment','communication','note','activity') then select id into owner_id from records where kind='customer' order by name offset ((i-1)%10) limit 1;end if;
attrs:='{}';
case k
when 'employee' then title:=(array['Avery Ellis','Morgan Vale','Quinn Harbor','Reese Brooks'])[i];attrs:=jsonb_build_object('role',case when i=1 then 'Administrator' else 'Employee' end);
when 'lead' then stage:=(array['New Lead','Qualified','Proposal Sent','Consultation Scheduled','Negotiation','Contacted','Contact Attempted','Won','Lost','On Hold'])[1+(i-1)%10]; attrs:=jsonb_build_object('household',title,'status',stage,'value',2200+i*375,'priority',case when i%3=0 then 'High' else 'Normal' end,'source',(array['Referral','Website','Networking','Phone inquiry'])[1+i%4],'email',lower(loc)||'@example.test','phone','310-555-'||lpad((100+i)::text,4,'0'),'city','Coral Bluffs','street',(100+i)||' Fictional Grove','follow_up',current_date+(i%9-3),'last_contact',current_date-i%8);
when 'customer' then title:=loc||' residence';attrs:=jsonb_build_object('status','Active','customer_since',current_date-i*14,'monthly_value',500+i*125,'frequency','Weekly','email',lower(loc)||'.estate@example.test');
when 'property' then title:=loc||' House';attrs:=jsonb_build_object('city','Coral Bluffs','property_type','Luxury estate','status','Active','street',(200+i)||' Example Terrace','state','CA','frequency','Weekly','next_service',current_date+i);
when 'contact' then title:=(array['Elena','Theo','Robin','Emery','Drew'])[1+(i-1)%5]||' '||loc;attrs:=jsonb_build_object('contact_type','Estate manager','email','contact'||i||'@example.test');
when 'task' then title:=(array['Confirm service window','Review care proposal','Schedule estate walkthrough','Call property manager','Prepare visit summary'])[1+(i-1)%5]||' · '||loc;attrs:=jsonb_build_object('category','Follow-up','due',current_date+i%8-2,'time','09:30','status',case when i%5=0 then 'Completed' else 'Open' end,'priority',case when i%3=0 then 'High' else 'Normal' end);
when 'appointment' then title:=(array['Estate walkthrough','Care consultation','Seasonal inspection'])[1+(i-1)%3]||' · '||loc;attrs:=jsonb_build_object('category','Property visit','due',current_date+i/2,'time',case when i%2=0 then '10:00' else '14:30' end);
when 'communication' then title:='Quarterly care review';attrs:=jsonb_build_object('category','Phone call','due',current_date-i,'description','Discussed the next scheduled service visit.');
when 'note' then title:='Service preference';attrs:=jsonb_build_object('description','Coordinate afternoon visits with the estate manager.','pinned','Yes');
else title:='Updated care schedule'; attrs:=jsonb_build_object('description',loc||' residence');
end case;
insert into records(kind,name,employee_id,parent_id,created_at) values(k,title,staff,owner_id,now()-case when k='customer' then i*14 when k='lead' then i*2 else i end * interval '1 day') returning id into rid;
execute format('insert into %I(id,data) values($1,$2)',case k when 'property' then 'properties' when 'activity' then 'activities' else k||'s' end) using rid,(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each_text(attrs));
if k in ('customer','property','lead') then insert into services(name) values('Estate oversight') on conflict do nothing;insert into property_services select rid,id from services where name='Estate oversight';end if;
end loop;end loop;end $$;
