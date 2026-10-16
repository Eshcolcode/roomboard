-- Row-level security per role. client = client coordinator, manager = provider manager, cleaner.
alter table profiles enable row level security; alter table properties enable row level security; alter table units enable row level security;
alter table rooms enable row level security; alter table workers enable row level security; alter table stays enable row level security;
alter table changeovers enable row level security; alter table activity enable row level security; alter table enquiries enable row level security;
alter table alert_outbox enable row level security; alter table contract_allocations enable row level security;

-- Client must never see cleaner details: clients read only their own profile and managers.
create policy "read profiles" on profiles for select using (id = auth.uid() or my_role() in ('manager','cleaner') or (my_role() = 'client' and role = 'manager'));
create policy "manager profiles" on profiles for all using (my_role() = 'manager');
create policy "read properties" on properties for select using (auth.uid() is not null);  -- non-contracted shown on the upsell page
create policy "manager properties" on properties for all using (my_role() = 'manager');
create policy "read units" on units for select using (auth.uid() is not null);
create policy "read rooms" on rooms for select using (auth.uid() is not null);
create policy "manager rooms" on rooms for all using (my_role() = 'manager');
create policy "read alloc" on contract_allocations for select using (my_role() in ('client','manager'));
-- Workers (personal data): client and manager only.
create policy "workers rw" on workers for all using (my_role() in ('client','manager')) with check (my_role() in ('client','manager'));
-- Stays: client and manager edit, cleaner reads (the UI shows first names only). Client is limited to contracted rooms.
create policy "stays read" on stays for select using (auth.uid() is not null);
create policy "stays write" on stays for all using (my_role() = 'manager' or (my_role() = 'client' and exists (select 1 from rooms r join properties p on p.id = r.property_id where r.id = room_id and p.contracted)))
  with check (my_role() = 'manager' or (my_role() = 'client' and exists (select 1 from rooms r join properties p on p.id = r.property_id where r.id = room_id and p.contracted)));
-- Changeovers: everyone sees them. Manager schedules. Cleaner updates progress on their own tasks. Client is read-only.
create policy "co read" on changeovers for select using (auth.uid() is not null);
create policy "co manager" on changeovers for update using (my_role() = 'manager');
create policy "co cleaner" on changeovers for update using (my_role() = 'cleaner' and cleaner_id = auth.uid()) with check (status in ('in_progress','ready'));
create policy "activity read" on activity for select using (my_role() in ('client','manager'));
create policy "enq insert" on enquiries for insert with check (my_role() in ('client','manager'));
create policy "enq read" on enquiries for select using (my_role() = 'manager' or created_by = auth.uid());
create policy "outbox read" on alert_outbox for select using (my_role() = 'manager' or recipient_id = auth.uid());

alter publication supabase_realtime add table stays, changeovers, activity, workers, enquiries;
