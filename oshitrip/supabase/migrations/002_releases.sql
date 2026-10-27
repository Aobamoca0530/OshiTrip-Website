-- Run after 001. Product records keep edition/retailer data in a versioned JSON document.
begin;
create table public.releases (
  id text primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status text not null check(status in ('draft','review','published','archived')),
  document jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  check(jsonb_typeof(document)='object'),
  check(document ?& array['id','slug','status','title','editions','lotteries','offers','campaigns','sources']),
  check(document->>'id'=id and document->>'slug'=slug and document->>'status'=status),
  check(length(document->>'title')>0),
  check(jsonb_typeof(document->'editions')='array' and jsonb_array_length(document->'editions')>0),
  check(jsonb_typeof(document->'lotteries')='array' and jsonb_array_length(document->'lotteries')>0),
  check(jsonb_typeof(document->'sources')='array' and jsonb_array_length(document->'sources')>0)
);
alter table public.releases enable row level security;
create policy releases_read on public.releases for select to anon, authenticated using(status='published' or (select public.is_admin()));
create policy releases_admin on public.releases for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
grant select on public.releases to anon;
grant select,insert,update,delete on public.releases to authenticated;
create trigger releases_touch before update on public.releases for each row execute function public.touch_updated_at();
create function public.save_release(payload jsonb, expected_updated_at timestamptz)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare saved_at timestamptz;
begin
  if not public.is_admin() then raise exception 'Administrator required'; end if;
  if expected_updated_at is null then
    insert into public.releases(id,slug,status,document) values(payload->>'id',payload->>'slug',payload->>'status',payload) returning updated_at into saved_at;
  else
    update public.releases set slug=payload->>'slug',status=payload->>'status',document=payload
      where id=payload->>'id' and updated_at=expected_updated_at returning updated_at into saved_at;
    if saved_at is null then raise exception 'Conflict: record changed or missing; reload before saving'; end if;
  end if;
  return saved_at;
end $$;
revoke all on function public.save_release(jsonb,timestamptz) from public, anon;
grant execute on function public.save_release(jsonb,timestamptz) to authenticated;
commit;
