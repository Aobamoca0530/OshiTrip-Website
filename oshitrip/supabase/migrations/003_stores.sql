begin;
create table public.store_branches (
 id text primary key, retailer_id text not null, name text not null, city text not null,
 address text not null, official_url text not null check(official_url ~ '^https://'),
 phone text, stock_url text check(stock_url ~ '^https://'), stock_note text not null,
 stock_source_url text check(stock_source_url ~ '^https://'), checked_on date,
 status text not null check(status in ('draft','published','archived')),
 updated_at timestamptz not null default clock_timestamp(),
 check(status <> 'published' or checked_on is not null)
);
alter table public.store_branches enable row level security;
create policy stores_read on public.store_branches for select to anon,authenticated using(status='published' or (select public.is_admin()));
create policy stores_admin on public.store_branches for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
grant select on public.store_branches to anon;
grant select,insert,update,delete on public.store_branches to authenticated;
create trigger stores_touch before update on public.store_branches for each row execute function public.touch_updated_at();
commit;
