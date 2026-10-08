-- Apply to an existing database that already has the grading queue.
begin;

-- Tutors explicitly send new submissions for grading; existing jobs keep their state.
alter table public.grading_jobs drop constraint if exists grading_jobs_status_check;
alter table public.grading_jobs add constraint grading_jobs_status_check
    check (status in ('submitted','queued','processing','awaiting_review','failed'));
alter table public.grading_jobs alter column status set default 'submitted';

-- Student submission only registers waiting work; it must never start grading.
create or replace function public.methodmark_enqueue_grading()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into public.grading_jobs(submission_id, status)
    values (new.id, 'submitted') on conflict do nothing;
    return new;
end;
$$;
revoke all on function public.methodmark_enqueue_grading() from public, anon, authenticated;

-- Service-only: the API supplies the authenticated tutor, never a client-supplied tutor ID.
create or replace function public.send_class_for_grading(p_class_id uuid, p_tutor_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
    queued_count integer;
begin
    update public.grading_jobs j
    set status = 'queued', version = j.version + 1, updated_at = now()
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where j.submission_id = s.id and a.class_id = p_class_id and a.tutor_id = p_tutor_id
        and j.status = 'submitted' and j.review_draft is null;
    get diagnostics queued_count = row_count;
    return queued_count;
end;
$$;
revoke all on function public.send_class_for_grading(uuid, uuid) from public, anon, authenticated;
grant execute on function public.send_class_for_grading(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
