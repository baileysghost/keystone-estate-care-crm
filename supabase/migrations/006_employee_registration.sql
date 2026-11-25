-- Refuse creation of an authentication identity until an administrator grants access.
create function keystone.check_employee_registration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from keystone.employee_access where enabled and email=lower(new.email)) then
  raise exception 'Employee invitation required';
 end if;
 return new;
end $$;
revoke all on function keystone.check_employee_registration() from public;
create trigger keystone_invited_registration before insert on auth.users for each row execute function keystone.check_employee_registration();
insert into keystone.schema_migrations(version) values('006_employee_registration');
