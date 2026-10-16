-- Roomboard schema. Mirrors src/data/core.ts. Dates are London calendar days; stays are [arrival, departure).
create extension if not exists btree_gist;

create type app_role as enum ('client','manager','cleaner');
create type bath_kind as enum ('ensuite','private','shared');
create type dep_status as enum ('planned','confirmed','tbc','ufn');
create type co_status as enum ('needs','scheduled','in_progress','ready');

create table profiles (id uuid primary key references auth.users on delete cascade, full_name text not null, role app_role not null, email text, phone text, sms_opt_in boolean not null default false, push_enabled boolean not null default false);
create table properties (id text primary key, name text not null, short_name text not null, contracted boolean not null default false, address text, blurb text, photo_url text, features text[] default '{}', beds_label text, brand text, checkout_time time default '10:00', checkin_time time default '15:00', sort int default 0);
create table units (id text primary key, property_id text not null references properties, name text not null, sort int default 0);
create table rooms (id text primary key, property_id text not null references properties, unit_id text not null references units, name text not null, floor text, bath bath_kind not null, note text, photo_url text, sort int default 0);
-- Contract allocation is separate from stays: which rooms the client may use, and for what period.
create table contract_allocations (id uuid primary key default gen_random_uuid(), room_id text not null references rooms, valid_from date not null, valid_to date not null, note text);
create table workers (id uuid primary key default gen_random_uuid(), name text not null, company text, phone text, notes text, uses int default 0, last_used date, created_at timestamptz default now());

create table stays (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms,
  worker_id uuid references workers,              -- null = hold, "name to follow". Naming it updates this same row.
  hold_label text,
  arrival date not null,
  departure date,                                  -- exclusive; null when dep_status in (tbc, ufn)
  dep_status dep_status not null default 'planned',
  away_from date, away_to date,                    -- away, room retained: no clean
  notes text,
  version int not null default 1,
  updated_by uuid references auth.users default auth.uid(),
  updated_at timestamptz not null default now(),
  check (departure is null or departure > arrival),
  check ((dep_status in ('tbc','ufn')) = (departure is null)),
  check (worker_id is not null or hold_label is not null),
  -- No double-booking, enforced by the database:
  exclude using gist (room_id with =, daterange(arrival, coalesce(departure, 'infinity'::date), '[)') with &&)
);

-- Readiness is separate from the stay.
create table changeovers (
  id uuid primary key default gen_random_uuid(), room_id text not null references rooms,
  from_stay_id uuid references stays on delete set null, to_stay_id uuid references stays on delete set null,
  after_date date not null, ready_by date, status co_status not null default 'needs',
  scheduled_for date, cleaner_id uuid references profiles, note text, invalidated_reason text, updated_at timestamptz default now(),
  vacated boolean not null default false,     -- actual departure recorded; Ready requires it
  vacated_at timestamptz, zero_day boolean not null default false,
  cancelled_reason text,                      -- departure removed after scheduling: kept, never silently deleted
  exception_reason text,                      -- provider forced an out-of-window clean; flagged until resolved
  unique (from_stay_id)
);
create table activity (id bigserial primary key, ts timestamptz default now(), user_id uuid default auth.uid(), property_id text, entity text, entity_id text, text text not null);
create table enquiries (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), created_by uuid default auth.uid(), property_id text references properties, date_from date not null, date_to date, long_term boolean default false, people int default 1, note text, status text default 'new');
create table alert_outbox (id bigserial primary key, created_at timestamptz default now(), recipient_id uuid references profiles, recipient text not null, channel text not null check (channel in ('email','sms','push','whatsapp')),
  subject text not null, body text not null,
  status text not null default 'queued' check (status in ('queued','accepted','delivered','failed','acknowledged','no_address')),
  attempts int default 0, next_attempt_at timestamptz default now(), last_error text, provider_id text, acknowledged_at timestamptz,
  dedupe_key text unique);  -- same event+recipient+channel is only queued once
create index on alert_outbox (status, next_attempt_at);

create function my_role() returns app_role language sql stable security definer set search_path = public as $$ select role from profiles where id = auth.uid() $$;
