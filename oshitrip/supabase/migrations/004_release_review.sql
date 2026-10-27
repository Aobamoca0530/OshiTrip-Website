begin;
create function public.apply_release_candidate(candidate_id uuid, payload jsonb, expected_updated_at timestamptz)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare candidate public.ingestion_candidates; saved_at timestamptz;
begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into candidate from public.ingestion_candidates where id=candidate_id and status='pending' for update;
 if not found then raise exception 'Candidate already handled or missing'; end if;
 if candidate.payload->>'kind' <> 'release-source' then raise exception 'Wrong candidate type'; end if;
 if not exists(select 1 from jsonb_array_elements(payload->'sources') s where s->>'url'=candidate.source_url) then raise exception 'Candidate source missing from release'; end if;
 if payload->>'status'='published' and exists(select 1 from jsonb_array_elements(payload->'sources') s where nullif(s->>'checked_on','') is null) then raise exception 'Verify sources before publishing'; end if;
 saved_at := public.save_release(payload,expected_updated_at);
 update public.ingestion_candidates set status='reviewed',reviewed_at=clock_timestamp() where id=candidate_id;
 return saved_at;
end $$;
revoke all on function public.apply_release_candidate(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.apply_release_candidate(uuid,jsonb,timestamptz) to authenticated;
-- Worker credentials live only in the scheduler; anonymous users never see raw candidates/logs.
-- Supabase service_role is a built-in role. Local test databases need not contain it.
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant select,insert,update on public.ingestion_candidates,public.ingestion_runs to service_role;
 end if;
end $$;
commit;
