-- OshiTrip v1. Run once in Supabase SQL Editor. No service-role key in the app.
begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
create policy admin_read_self on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
grant select on public.admin_users to authenticated;
revoke insert, update, delete on public.admin_users from anon, authenticated;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.franchises (
  id text primary key, name text not null check (length(name)>0),
  parent_id text references public.franchises(id), check (id <> parent_id)
);
create table public.events (
  id text primary key, slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title_ja text not null check (length(title_ja)>0), title_zh text not null check (length(title_zh)>0),
  category text not null check (category in ('联动咖啡厅','快闪店','主题展览','音乐和声优活动','其他联动')),
  summary text not null default '', fees text,
  conditions jsonb not null default '[]' check (jsonb_typeof(conditions)='array'),
  status text not null default 'draft' check (status in ('draft','review','published','cancelled','archived')),
  verified_at timestamptz, updated_at timestamptz not null default now(),
  check (status <> 'published' or verified_at is not null)
);
create table public.event_franchises (
  event_id text references public.events(id) on delete cascade,
  franchise_id text references public.franchises(id), primary key(event_id,franchise_id)
);
create table public.event_venues (
  id text primary key, event_id text not null references public.events(id) on delete cascade,
  city text not null, name text not null, address text,
  start_date date not null, end_date date not null, check (start_date<=end_date)
);
create table public.reservation_rounds (
  id text primary key, venue_id text not null references public.event_venues(id) on delete cascade,
  label text not null, method text not null check (method in ('先着预约','抽选报名','当日整理券','无需预约','官方 App 预约','尚未公布')),
  kind text not null check (kind in ('rolling','fixed','none','unannounced','unknown')),
  opens_at timestamptz, closes_at timestamptz, days_before int, open_time text,
  cutoff_days_before int, cutoff_time text, url text check (url is null or url ~ '^https://[^/[:space:]]+'), note text not null default '',
  check (opens_at is null or closes_at is null or opens_at<=closes_at),
  check (days_before between 0 and 365), check (cutoff_days_before between 0 and 365),
  check (open_time is null or open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (cutoff_time is null or cutoff_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (kind<>'rolling' or (days_before is not null and cutoff_days_before is not null and cutoff_time is not null and days_before>=cutoff_days_before))
);
create table public.event_sources (
  id text primary key, event_id text not null references public.events(id) on delete cascade,
  url text not null check (url ~ '^https://[^/[:space:]]+'), label text not null, checked_at timestamptz
);
create table public.ingestion_candidates (
  id uuid primary key default gen_random_uuid(), source_url text not null check (source_url ~ '^https://[^/[:space:]]+'),
  fingerprint text not null unique, payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','reviewed','rejected')),
  error text, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(), adapter text not null,
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null check(status in ('running','success','failed','blocked')), error text
);
create index on public.event_venues(event_id);
create index on public.event_venues(city,start_date,end_date);
create index on public.reservation_rounds(venue_id);
create index on public.event_sources(event_id);
create index on public.event_franchises(franchise_id);
create index on public.events(status);

alter table public.franchises enable row level security;
alter table public.events enable row level security;
alter table public.event_franchises enable row level security;
alter table public.event_venues enable row level security;
alter table public.reservation_rounds enable row level security;
alter table public.event_sources enable row level security;
alter table public.ingestion_candidates enable row level security;
alter table public.ingestion_runs enable row level security;
create policy franchises_read on public.franchises for select to anon,authenticated using(true);
create policy events_read on public.events for select to anon,authenticated using(status in ('published','cancelled') or (select public.is_admin()));
create policy links_read on public.event_franchises for select to anon,authenticated using(exists(select 1 from public.events e where e.id=event_id));
create policy venues_read on public.event_venues for select to anon,authenticated using(exists(select 1 from public.events e where e.id=event_id));
create policy rounds_read on public.reservation_rounds for select to anon,authenticated using(exists(select 1 from public.event_venues v where v.id=venue_id));
create policy sources_read on public.event_sources for select to anon,authenticated using(exists(select 1 from public.events e where e.id=event_id));
do $$ declare t text; begin
  foreach t in array array['franchises','events','event_franchises','event_venues','reservation_rounds','event_sources','ingestion_candidates','ingestion_runs'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;
grant select on public.franchises,public.events,public.event_franchises,public.event_venues,public.reservation_rounds,public.event_sources to anon;
revoke all on public.ingestion_candidates,public.ingestion_runs from anon;

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

-- Invoker is deliberate: every nested query is subject to the caller's RLS.
create function public.read_catalog() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'franchises', coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.franchises f),'[]'),
    'events', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'franchise_ids',coalesce((select jsonb_agg(ef.franchise_id) from public.event_franchises ef where ef.event_id=e.id),'[]'),
      'sources',coalesce((select jsonb_agg(to_jsonb(s)-'event_id') from public.event_sources s where s.event_id=e.id),'[]'),
      'venues',coalesce((select jsonb_agg((to_jsonb(v)-'event_id') || jsonb_build_object(
        'rounds',coalesce((select jsonb_agg(to_jsonb(r)-'venue_id' order by r.id) from public.reservation_rounds r where r.venue_id=v.id),'[]')
      ) order by v.start_date,v.id) from public.event_venues v where v.event_id=e.id),'[]')
    ) order by e.updated_at desc) from public.events e),'[]')
  );
$$;
revoke all on function public.read_catalog() from public;
grant execute on function public.read_catalog() to anon,authenticated;

-- Atomic aggregate save with optimistic concurrency. A stale edit cannot overwrite a newer one.
create function public.save_event(document jsonb, expected_updated_at timestamptz default null) returns text
language plpgsql security invoker set search_path='' as $$
declare existing public.events; e public.events; v jsonb; r jsonb; s jsonb; fid text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if jsonb_array_length(document->'venues')<1 or jsonb_array_length(document->'sources')<1 or jsonb_array_length(document->'franchise_ids')<1 then raise exception 'Venues, sources and franchises required'; end if;
  if document->>'status'='published' and not exists(select 1 from jsonb_array_elements(document->'sources') x where x->>'checked_at' is not null) then raise exception 'Verified source required'; end if;
  select * into existing from public.events where id=document->>'id' for update;
  if found then
    if expected_updated_at is null or existing.updated_at<>expected_updated_at then raise exception 'CONFLICT: activity changed; reload before saving'; end if;
  elsif expected_updated_at is not null then raise exception 'CONFLICT: activity no longer exists';
  end if;
  select * into e from jsonb_populate_record(null::public.events,document);
  insert into public.events(id,slug,title_ja,title_zh,category,summary,fees,conditions,status,verified_at,updated_at)
  values(e.id,e.slug,e.title_ja,e.title_zh,e.category,e.summary,e.fees,e.conditions,e.status,e.verified_at,clock_timestamp())
  on conflict(id) do update set slug=excluded.slug,title_ja=excluded.title_ja,title_zh=excluded.title_zh,
    category=excluded.category,summary=excluded.summary,fees=excluded.fees,conditions=excluded.conditions,status=excluded.status,verified_at=excluded.verified_at;
  delete from public.event_franchises where event_id=e.id;
  delete from public.event_venues where event_id=e.id;
  delete from public.event_sources where event_id=e.id;
  for fid in select jsonb_array_elements_text(document->'franchise_ids') loop
    insert into public.event_franchises values(e.id,fid);
  end loop;
  for v in select value from jsonb_array_elements(document->'venues') loop
    insert into public.event_venues select * from jsonb_populate_record(null::public.event_venues,(v-'rounds')||jsonb_build_object('event_id',e.id));
    for r in select value from jsonb_array_elements(v->'rounds') loop
      insert into public.reservation_rounds select * from jsonb_populate_record(null::public.reservation_rounds,r||jsonb_build_object('venue_id',v->>'id'));
    end loop;
  end loop;
  for s in select value from jsonb_array_elements(document->'sources') loop
    insert into public.event_sources select * from jsonb_populate_record(null::public.event_sources,s||jsonb_build_object('event_id',e.id));
  end loop;
  return e.id;
end;
$$;
revoke all on function public.save_event(jsonb,timestamptz) from public,anon;
grant execute on function public.save_event(jsonb,timestamptz) to authenticated;
commit;
