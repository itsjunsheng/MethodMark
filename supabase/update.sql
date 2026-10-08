-- Existing database update. Run once in the Supabase SQL Editor.
begin;

-- Tutors can delete their own assignments, including published assignments.
drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments for delete to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

-- Add archive flags and the expanded palette.
alter table public.classes add column if not exists is_archived boolean not null default false;
alter table public.papers add column if not exists is_archived boolean not null default false;

alter table public.classes add column if not exists color text not null default 'sage';
alter table public.classes drop constraint if exists classes_color_check;
alter table public.classes add constraint classes_color_check
    check (color in ('sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate'));
alter table public.classes alter column color set default
    (array['sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate'])[1 + floor(random() * 12)::integer];

alter table public.papers add column if not exists color text not null default 'sage';
alter table public.papers drop constraint if exists papers_color_check;
alter table public.papers add constraint papers_color_check
    check (color in ('sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate'));
alter table public.papers alter column color set default
    (array['sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate'])[1 + floor(random() * 12)::integer];

-- Preserve older hidden papers in the archive.
do $$
begin
    if exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'papers' and column_name = 'is_deleted') then
        execute 'update public.papers set is_archived = true where is_deleted';
    end if;
end;
$$;
update public.papers set is_archived = true,
    status = case when published_at is not null then 'published' else 'draft' end
where status = 'archived';
alter table public.papers drop constraint if exists papers_status_check;
alter table public.papers add constraint papers_status_check
    check (status in ('draft', 'reviewed', 'published'));

create or replace function public.methodmark_guard_paper()
returns trigger language plpgsql set search_path = '' as $$
declare
    content_changed boolean;
begin
    if tg_op = 'INSERT' then
        new.published_at := null;
        if new.status = 'published' then
            raise exception 'Create and review the paper before publishing';
        end if;
        return new;
    end if;

    if new.id is distinct from old.id or new.tutor_id is distinct from old.tutor_id then
        raise exception 'Paper ID and tutor cannot be changed';
    end if;

    content_changed := row(
        new.title, new.subject, new.school_year, new.subject_level,
        new.duration_minutes, new.instructions, new.questions_snapshot
    ) is distinct from row(
        old.title, old.subject, old.school_year, old.subject_level,
        old.duration_minutes, old.instructions, old.questions_snapshot
    );

    new.published_at := old.published_at;
    if old.published_at is not null then
        if content_changed or new.status <> 'published' then
            raise exception 'Published content is frozen; create a new draft copy to edit it';
        end if;
    elsif new.status = 'published' then
        if old.status <> 'reviewed' or content_changed then
            raise exception 'Review the saved paper before publishing';
        end if;
        new.published_at := now();
    elsif old.status = 'reviewed' and content_changed then
        new.status := 'draft';
    end if;
    return new;
end;
$$;

create or replace function public.publish_assignments(
    p_paper_id uuid, p_class_ids uuid[], p_due_at timestamptz
)
returns setof public.assignments
language plpgsql security invoker set search_path = '' as $$
declare
    paper_state text;
begin
    if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false' then
        raise exception 'Please log in.' using errcode = '42501';
    end if;
    if p_class_ids is null or cardinality(p_class_ids) not between 1 and 50
        or array_position(p_class_ids, null) is not null
        or cardinality(p_class_ids) <> (select count(distinct id) from unnest(p_class_ids) id) then
        raise exception 'Choose between 1 and 50 classes.' using errcode = '22023';
    end if;
    select status into paper_state from public.papers
    where id = p_paper_id and tutor_id = auth.uid() and not is_archived for update;
    if not found or paper_state not in ('reviewed', 'published') then
        raise exception 'Save and review the paper before publishing.' using errcode = '22023';
    end if;
    perform id from public.classes
    where id = any(p_class_ids) and tutor_id = auth.uid() and not is_archived
    order by id for no key update;
    if (select count(*) from public.classes
        where id = any(p_class_ids) and tutor_id = auth.uid() and not is_archived) <> cardinality(p_class_ids) then
        raise exception 'One or more classes are unavailable.' using errcode = '42501';
    end if;
    if (p_due_at is null or p_due_at <= now()) and exists (
        select 1 from unnest(p_class_ids) requested(class_id) where not exists (
            select 1 from public.assignments a
            where a.class_id = requested.class_id and a.paper_id = p_paper_id and a.status <> 'draft'
        )
    ) then
        raise exception 'Choose a future submission deadline.' using errcode = '22023';
    end if;
    if paper_state = 'reviewed' then
        update public.papers set status = 'published' where id = p_paper_id;
    end if;
    insert into public.assignments(class_id, paper_id, status, due_at)
    select id, p_paper_id, 'published', p_due_at from unnest(p_class_ids) id
    on conflict (class_id, paper_id) do update
    set status = 'published', due_at = excluded.due_at
    where public.assignments.status = 'draft';

    return query select cp.* from public.assignments cp
    where cp.paper_id = p_paper_id and cp.class_id = any(p_class_ids);
end;
$$;

create or replace function public.methodmark_guard_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        new.published_at := null;
    else
        if row(new.id, new.tutor_id, new.class_id, new.paper_id)
            is distinct from row(old.id, old.tutor_id, old.class_id, old.paper_id) then
            raise exception 'Assignment identity cannot be changed';
        end if;
        new.published_at := old.published_at;
    end if;

    if new.status = 'published' then
        if (tg_op = 'INSERT' or old.status <> 'published') and (
            not exists (select 1 from public.classes
                where id = new.class_id and tutor_id = new.tutor_id and not is_archived)
            or not exists (select 1 from public.papers
                where id = new.paper_id and tutor_id = new.tutor_id and not is_archived)
        ) then
            raise exception 'Restore the class and paper before assigning' using errcode = '22023';
        end if;
        if not exists (
            select 1 from public.papers
            where id = new.paper_id and tutor_id = new.tutor_id and status = 'published'
        ) then
            raise exception 'Publish the reviewed paper before opening its class assignment';
        end if;
        new.published_at := coalesce(new.published_at, now());
    elsif new.status = 'draft' and new.published_at is not null then
        raise exception 'Close a published assignment instead of returning it to draft';
    end if;
    return new;
end;
$$;

alter table public.papers drop column if exists is_deleted;

grant update(color, is_archived) on public.classes to authenticated;
grant update, delete on public.papers to authenticated;
grant delete on public.classes to authenticated;

-- Permanent deletion cascades to assignments and submissions.
drop policy if exists papers_delete on public.papers;
create policy papers_delete on public.papers for delete to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

revoke all on function public.methodmark_guard_paper() from public, anon, authenticated;
revoke all on function public.methodmark_guard_assignment() from public, anon, authenticated;
revoke all on function public.publish_assignments(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.publish_assignments(uuid, uuid[], timestamptz) to authenticated;

-- Keep handwriting proportions when rendering for grading.
alter table public.submissions add column if not exists drawing_sizes jsonb
    not null default '{}'::jsonb check (jsonb_typeof(drawing_sizes) = 'object');
drop function if exists public.record_student_submission(uuid, text, uuid, jsonb, jsonb);

-- Only the backend can record student submissions.
create or replace function public.record_student_submission(
    p_token uuid, p_code text, p_id uuid, p_drawing jsonb, p_attachments jsonb,
    p_drawing_sizes jsonb default '{}'::jsonb
)
returns public.submissions
language plpgsql security invoker set search_path = '' as $$
declare
    assignment public.assignments;
    member public.students;
    receipt public.submissions;
begin
    select * into assignment from public.assignments
    where share_token = p_token and status = 'published' for update;
    if not found then
        raise exception 'This assignment is unavailable.' using errcode = 'P0001';
    end if;
    select * into member from public.students
    where class_id = assignment.class_id and student_code = lower(btrim(p_code)) and is_active
    for share;
    if not found then
        raise exception 'Check your student code with your tutor.' using errcode = 'P0001';
    end if;
    select * into receipt from public.submissions
    where assignment_id = assignment.id and student_id = member.id;
    if found then
        if receipt.id = p_id then return receipt; end if;
        raise exception 'Your work has already been submitted.' using errcode = '23505';
    end if;
    if assignment.due_at is not null and assignment.due_at <= now() then
        raise exception 'The submission deadline has passed.' using errcode = 'P0001';
    end if;
    if not exists(select 1 from public.papers where id = assignment.paper_id and status = 'published') then
        raise exception 'This assignment is unavailable.' using errcode = 'P0001';
    end if;
    insert into public.submissions(id, assignment_id, student_id, student_code, drawing, attachments, drawing_sizes)
    values (p_id, assignment.id, member.id, member.student_code, p_drawing, p_attachments, p_drawing_sizes)
    returning * into receipt;
    return receipt;
end;
$$;
revoke all on function public.record_student_submission(uuid, text, uuid, jsonb, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function public.record_student_submission(uuid, text, uuid, jsonb, jsonb, jsonb) to service_role;

-- Durable grading queue; AI results remain private and provisional.
create table if not exists public.grading_jobs (
    submission_id uuid primary key references public.submissions(id) on delete cascade,
    status text not null default 'submitted' check (status in ('submitted','queued','processing','awaiting_review','failed')),
    flagged boolean not null default false,
    attempts integer not null default 0,
    lease_token uuid,
    lease_expires_at timestamptz,
    result jsonb check (result is null or jsonb_typeof(result) = 'object'),
    review_draft jsonb check (review_draft is null or jsonb_typeof(review_draft) = 'object'),
    review_saved_at timestamptz,
    error text,
    provider text,
    vision_model text,
    grading_model text,
    version integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists grading_jobs_queue_idx on public.grading_jobs(status, created_at);
alter table public.grading_jobs enable row level security;
revoke all on public.grading_jobs from public, anon, authenticated;
grant select on public.grading_jobs to authenticated;
grant all on public.grading_jobs to service_role;
drop policy if exists grading_owner on public.grading_jobs;
create policy grading_owner on public.grading_jobs for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false' and exists (
    select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
    where s.id = submission_id and a.tutor_id = (select auth.uid())
));

-- Tutors explicitly send new submissions for grading; existing jobs keep their state.
alter table public.grading_jobs drop constraint if exists grading_jobs_status_check;
alter table public.grading_jobs add constraint grading_jobs_status_check
    check (status in ('submitted','queued','processing','awaiting_review','failed'));
alter table public.grading_jobs alter column status set default 'submitted';

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

create or replace function public.methodmark_enqueue_grading()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    -- Register the submission only. The tutor's send action queues it for the worker.
    insert into public.grading_jobs(submission_id, status)
    values (new.id, 'submitted') on conflict do nothing;
    return new;
end;
$$;
revoke all on function public.methodmark_enqueue_grading() from public, anon, authenticated;
drop trigger if exists submissions_enqueue_grading on public.submissions;
create trigger submissions_enqueue_grading after insert on public.submissions
for each row execute function public.methodmark_enqueue_grading();
insert into public.grading_jobs(submission_id, status)
select id, 'submitted' from public.submissions on conflict do nothing;

-- Claims survive restarts; stale workers cannot overwrite a newer attempt.
create or replace function public.claim_grading_job()
returns setof public.grading_jobs language plpgsql security invoker set search_path = '' as $$
begin
    update public.grading_jobs set status = 'failed', lease_token = null, lease_expires_at = null,
        error = 'Processing was interrupted repeatedly. Retry grading or mark manually.',
        version = version + 1, updated_at = now()
    where status = 'processing' and lease_expires_at < now() and attempts >= 3;
    return query
    update public.grading_jobs j set status = 'processing', attempts = attempts + 1,
        lease_token = gen_random_uuid(), lease_expires_at = now() + interval '10 minutes',
        error = null, version = version + 1, updated_at = now()
    where j.submission_id = (
        select q.submission_id from public.grading_jobs q
        where q.status = 'queued' or (q.status = 'processing' and q.lease_expires_at < now())
        order by q.created_at for update skip locked limit 1
    ) returning j.*;
end;
$$;
revoke all on function public.claim_grading_job() from public, anon, authenticated;
grant execute on function public.claim_grading_job() to service_role;

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
