-- Apply to an existing database after 20261008_manual_class_grading.sql.
begin;

-- Tutors approve and release results (UC8); students see only released results (UC12).
alter table public.grading_jobs drop constraint if exists grading_jobs_status_check;
alter table public.grading_jobs add constraint grading_jobs_status_check
    check (status in ('submitted','queued','processing','awaiting_review','failed','released'));
-- The tutor behind the latest review change, for the audit trail.
alter table public.grading_jobs add column if not exists reviewed_by uuid;

-- The approved review a student may see. Only release_result writes it.
create table if not exists public.results (
    submission_id uuid primary key references public.submissions(id) on delete cascade,
    review jsonb not null check (jsonb_typeof(review) = 'object'),
    released_by uuid not null,
    released_at timestamptz not null default now(),
    release_count integer not null default 1
);
alter table public.results enable row level security;
revoke all on public.results from public, anon, authenticated;
grant select on public.results to authenticated;
grant select, insert, update on public.results to service_role;
drop policy if exists results_owner on public.results;
create policy results_owner on public.results for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false' and exists (
    select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
    where s.id = submission_id and a.tutor_id = (select auth.uid())
));

-- Append-only record of tutor review actions. The AI's original stays in grading_jobs.result.
create table if not exists public.review_events (
    id bigint generated always as identity primary key,
    submission_id uuid not null references public.submissions(id) on delete cascade,
    tutor_id uuid,
    action text not null check (action in ('draft_saved','released','reopened')),
    review jsonb check (review is null or jsonb_typeof(review) = 'object'),
    created_at timestamptz not null default now()
);
create index if not exists review_events_submission_idx on public.review_events(submission_id, created_at);
alter table public.review_events enable row level security;
revoke all on public.review_events from public, anon, authenticated;
grant select on public.review_events to authenticated;
grant select, insert on public.review_events to service_role;
drop policy if exists review_events_owner on public.review_events;
create policy review_events_owner on public.review_events for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false' and exists (
    select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
    where s.id = submission_id and a.tutor_id = (select auth.uid())
));

-- Every saved draft is logged in the same transaction, so no save path can skip the audit.
create or replace function public.methodmark_log_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.review_draft is distinct from old.review_draft and new.status <> 'released' then
        insert into public.review_events(submission_id, tutor_id, action, review)
        values (new.submission_id, new.reviewed_by, 'draft_saved', new.review_draft);
    end if;
    return new;
end;
$$;
revoke all on function public.methodmark_log_review() from public, anon, authenticated;
drop trigger if exists grading_jobs_log_review on public.grading_jobs;
create trigger grading_jobs_log_review after update of review_draft on public.grading_jobs
for each row execute function public.methodmark_log_review();

-- Service-only: the API validates the review and supplies the authenticated tutor.
-- Saves the approved review, publishes it to the student and logs it in one transaction.
create or replace function public.release_result(
    p_submission_id uuid, p_tutor_id uuid, p_version integer, p_review jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    new_version integer;
    released timestamptz := now();
begin
    if p_review is null or jsonb_typeof(p_review) <> 'object' then
        raise exception 'A complete review is required.' using errcode = '22023';
    end if;
    update public.grading_jobs j
    set review_draft = p_review, review_saved_at = released, reviewed_by = p_tutor_id,
        status = 'released', version = j.version + 1, updated_at = released
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where j.submission_id = p_submission_id and s.id = j.submission_id
        and a.tutor_id = p_tutor_id and j.version = p_version
        and j.status in ('awaiting_review', 'failed')
    returning j.version into new_version;
    if new_version is null then
        return null;  -- Changed, already released or another tutor's: the API reports a conflict.
    end if;
    insert into public.results(submission_id, review, released_by, released_at)
    values (p_submission_id, p_review, p_tutor_id, released)
    on conflict (submission_id) do update
    set review = excluded.review, released_by = excluded.released_by,
        released_at = excluded.released_at, release_count = public.results.release_count + 1;
    insert into public.review_events(submission_id, tutor_id, action, review)
    values (p_submission_id, p_tutor_id, 'released', p_review);
    return jsonb_build_object('version', new_version, 'released_at', released);
end;
$$;
revoke all on function public.release_result(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.release_result(uuid, uuid, integer, jsonb) to service_role;

-- Reopening lets the tutor correct a released result; the student keeps the last release until the next one.
create or replace function public.reopen_result(p_submission_id uuid, p_tutor_id uuid, p_version integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    new_version integer;
begin
    update public.grading_jobs j
    set status = 'awaiting_review', reviewed_by = p_tutor_id, version = j.version + 1, updated_at = now()
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where j.submission_id = p_submission_id and s.id = j.submission_id
        and a.tutor_id = p_tutor_id and j.version = p_version and j.status = 'released'
    returning j.version into new_version;
    if new_version is null then
        return null;
    end if;
    insert into public.review_events(submission_id, tutor_id, action)
    values (p_submission_id, p_tutor_id, 'reopened');
    return jsonb_build_object('version', new_version);
end;
$$;
revoke all on function public.reopen_result(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reopen_result(uuid, uuid, integer) to service_role;

notify pgrst, 'reload schema';
commit;
