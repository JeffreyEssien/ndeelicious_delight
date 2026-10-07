begin;
create table public.cake_types (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), description text not null default '',
 lead_time_value numeric not null default 0 check (lead_time_value >= 0 and lead_time_value <= 8760),
 lead_time_unit text not null check (lead_time_unit in ('hours','days','weeks')),
 active boolean not null default false, sort_order integer not null default 0 check (sort_order >= 0),
 image text, customer_notice text, check (not active or lead_time_value > 0)
);
alter table public.cake_types enable row level security;
create policy cake_types_public_read on public.cake_types for select using (active);
grant select on public.cake_types to anon, authenticated;
grant all on public.cake_types to service_role;
alter table public.custom_cake_orders add column cake_type_id uuid references public.cake_types(id), add column lead_time_snapshot jsonb;
-- Historical requests remain untouched. No example cake types or timings are published.

create or replace function public.snapshot_cake_type_rule() returns trigger
language plpgsql set search_path = public as $$
declare t public.cake_types; tz text; hours numeric; earliest date;
begin
 if tg_op = 'UPDATE' then
   if new.cake_type_id is distinct from old.cake_type_id or new.lead_time_snapshot is distinct from old.lead_time_snapshot then
     raise exception 'Submitted cake type and lead-time snapshot are immutable';
   end if;
   return new;
 end if;
 select * into t from public.cake_types where id = new.cake_type_id and active for share;
 if not found then raise exception 'Choose an active cake type'; end if;
 select value->>'timezone' into tz from public.site_settings where key = 'business';
 if tz is null then raise exception 'Bakery timezone is required'; end if;
 hours := t.lead_time_value * case t.lead_time_unit when 'weeks' then 168 when 'days' then 24 else 1 end;
 earliest := ((current_timestamp + hours * interval '1 hour') at time zone tz)::date;
 if new.requested_date < earliest then raise exception 'Cake date needs more preparation time'; end if;
 new.lead_time_snapshot := jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'leadTimeValue',t.lead_time_value,'leadTimeUnit',t.lead_time_unit,'timezone',tz,'customerNotice',t.customer_notice);
 new.configuration := coalesce(new.configuration, '{}'::jsonb) || jsonb_build_object('cakeType',t.name,'minimumLeadTime',t.lead_time_value::text || ' ' || case when t.lead_time_value = 1 then left(t.lead_time_unit, length(t.lead_time_unit)-1) else t.lead_time_unit end,'bakeryTimezone',tz);
 return new;
end $$;
create trigger cake_type_rule_snapshot before insert or update on public.custom_cake_orders for each row execute function public.snapshot_cake_type_rule();

commit;
