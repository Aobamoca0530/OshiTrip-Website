begin;
alter table public.events add column translated_rules jsonb not null default '[]'::jsonb check(jsonb_typeof(translated_rules)='array');
create or replace function public.save_event(document jsonb, expected_updated_at timestamptz default null) returns text
language plpgsql security invoker set search_path='' as $$
declare b jsonb; asset jsonb; existing public.events; e public.events; v jsonb; r jsonb; s jsonb; fid text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if jsonb_array_length(document->'venues')<1 or jsonb_array_length(document->'sources')<1 or jsonb_array_length(document->'franchise_ids')<1 then raise exception 'Venues, sources and franchises required'; end if;
  if document->>'status'='published' and not exists(select 1 from jsonb_array_elements(document->'sources') x where x->>'checked_at' is not null) then raise exception 'Verified source required'; end if;
  if document->'image' is not null and document->'image'<>'null'::jsonb then
    if not exists(select 1 from jsonb_array_elements(document->'sources') x where x->>'url'=document->'image'->>'source_url') then raise exception 'Image source must belong to event sources'; end if;
    if document->>'status'='published' and document->'image'->>'checked_on' is null then raise exception 'Verified image required'; end if;
  end if;
  for b in select value from jsonb_array_elements(coalesce(document->'benefits','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(document->'sources') x where x->>'url'=b->>'source_url') then raise exception 'Benefit source must belong to event'; end if;
    if document->>'status'='published' and b->>'checked_on' is null then raise exception 'Verified benefit required'; end if;
    if exists(select 1 from jsonb_array_elements_text(b->'venue_ids') ref_id where not exists(select 1 from jsonb_array_elements(document->'venues') event_venue where event_venue->>'id'=ref_id)) then raise exception 'Benefit venue must belong to event'; end if;
  end loop;
  for asset in select value from jsonb_array_elements(coalesce(document->'gallery','[]'::jsonb) || coalesce((select jsonb_agg(x->'image') from jsonb_array_elements(coalesce(document->'benefits','[]'::jsonb)) x where x->'image'<>'null'::jsonb),'[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(document->'sources') x where x->>'url'=asset->>'source_url') then raise exception 'Gallery source must belong to event'; end if;
    if document->>'status'='published' and asset->>'checked_on' is null then raise exception 'Verified gallery image required'; end if;
  end loop;

  for b in select value from jsonb_array_elements(coalesce(document->'translated_rules','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(document->'sources') x where x->>'url'=b->>'source_url') then raise exception 'Rule source must belong to event'; end if;
    if document->>'status'='published' and b->>'checked_on' is null then raise exception 'Verified rule required'; end if;
    if b->>'image_url' is not null then
      if coalesce(b->>'image_sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Rule image fingerprint required'; end if;
      if not exists(select 1 from jsonb_array_elements(coalesce(document->'gallery','[]'::jsonb) || jsonb_build_array(document->'image') || coalesce((select jsonb_agg(x->'image') from jsonb_array_elements(coalesce(document->'benefits','[]'::jsonb)) x),'[]'::jsonb)) a where a->>'url'=b->>'image_url' and a->>'source_url'=b->>'source_url') then raise exception 'Rule image must belong to event'; end if;
    end if;
  end loop;
  select * into existing from public.events where id=document->>'id' for update;
  if found then
    if expected_updated_at is null or existing.updated_at<>expected_updated_at then raise exception 'CONFLICT: activity changed; reload before saving'; end if;
  elsif expected_updated_at is not null then raise exception 'CONFLICT: activity no longer exists';
  end if;
  select * into e from jsonb_populate_record(null::public.events,document);
  insert into public.events(id,slug,title_ja,title_zh,category,summary,fees,conditions,status,verified_at,updated_at,image,benefits,gallery,translated_rules)
  values(e.id,e.slug,e.title_ja,e.title_zh,e.category,e.summary,e.fees,e.conditions,e.status,e.verified_at,clock_timestamp(),e.image,coalesce(e.benefits,'[]'::jsonb),coalesce(e.gallery,'[]'::jsonb),coalesce(e.translated_rules,'[]'::jsonb))
  on conflict(id) do update set slug=excluded.slug,title_ja=excluded.title_ja,title_zh=excluded.title_zh,
    category=excluded.category,summary=excluded.summary,fees=excluded.fees,conditions=excluded.conditions,status=excluded.status,verified_at=excluded.verified_at,image=excluded.image,benefits=excluded.benefits,gallery=excluded.gallery,translated_rules=excluded.translated_rules;
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

commit;
