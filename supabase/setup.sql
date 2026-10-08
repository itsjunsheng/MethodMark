-- Fresh setup. Keep auth.users. Run seed_questions.sql separately.
begin;

-- Remove retired signup hooks.
drop trigger if exists methodmark_tutor_signup on auth.users;
drop function if exists public.methodmark_new_tutor();
drop function if exists public.get_student_paper(uuid);

-- Tutor-owned classes.
create table public.classes (
    id uuid primary key default gen_random_uuid(),
    tutor_id uuid not null default auth.uid()
        references auth.users(id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 100),
    color text not null default
        (array['sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate'])[1 + floor(random() * 12)::integer]
        check (color in ('sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate')),

    subject text not null check (subject in ('Mathematics', 'Additional Mathematics')),
    school_year smallint not null check (school_year between 1 and 5),
    subject_level text not null check (subject_level in ('G1', 'G2', 'G3')),
    is_archived boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, tutor_id)
);

-- Each student record belongs to one class.
create table public.students (
    id uuid primary key default gen_random_uuid(),
    tutor_id uuid not null default auth.uid(),
    class_id uuid not null,
    student_code text not null
        check (length(student_code) <= 50 and student_code ~ '^[a-z]+-[a-z]+$'),
    name text check (length(btrim(name)) between 1 and 100),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (class_id, tutor_id)
        references public.classes(id, tutor_id) on delete cascade,
    unique (class_id, student_code)
);

-- Question parts, solutions and rubrics share part IDs.
create table public.questions (
    id uuid primary key default gen_random_uuid(),
    subject text not null check (subject in ('Mathematics', 'Additional Mathematics')),
    school_year smallint not null check (school_year between 1 and 5),
    subject_level text not null check (subject_level in ('G1', 'G2', 'G3')),
    topics text[] not null check (cardinality(topics) > 0),
    difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
    question_content jsonb not null,
    solution jsonb not null,
    marking_rubric jsonb not null,
    status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (coalesce(
        jsonb_typeof(question_content) = 'object'
        and jsonb_typeof(question_content -> 'shared_blocks') = 'array'
        and jsonb_typeof(question_content -> 'parts') = 'array'
        and jsonb_array_length(question_content -> 'parts') > 0, false)),
    check (coalesce(
        jsonb_typeof(solution) = 'object'
        and jsonb_typeof(solution -> 'parts') = 'array'
        and jsonb_array_length(solution -> 'parts') > 0, false)),
    check (coalesce(
        jsonb_typeof(marking_rubric) = 'object'
        and jsonb_typeof(marking_rubric -> 'parts') = 'array'
        and jsonb_array_length(marking_rubric -> 'parts') > 0, false))
);

-- Ordered paper snapshots.
create table public.papers (
    id uuid primary key default gen_random_uuid(),
    tutor_id uuid not null default auth.uid()
        references auth.users(id) on delete cascade,
    title text not null check (length(btrim(title)) between 1 and 200),
    color text not null default
        (array['sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate'])[1 + floor(random() * 12)::integer]
        check (color in ('sage','blue','lavender','rose','peach','sand','teal','mint','sky','indigo','plum','slate')),

    subject text not null check (subject in ('Mathematics', 'Additional Mathematics')),
    school_year smallint not null check (school_year between 1 and 5),
    subject_level text not null check (subject_level in ('G1', 'G2', 'G3')),
    duration_minutes integer not null check (duration_minutes > 0),
    instructions text not null default 'Answer all questions. Show your working clearly.',
    is_archived boolean not null default false,
    status text not null default 'draft'
        check (status in ('draft', 'reviewed', 'published')),
    questions_snapshot jsonb not null default '[]'::jsonb
        check (jsonb_typeof(questions_snapshot) = 'array'),
    question_count integer
        generated always as (jsonb_array_length(questions_snapshot)) stored,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, tutor_id),
    check (status not in ('reviewed', 'published')
        or jsonb_array_length(questions_snapshot) > 0)
);

-- One assignment per paper and class.
create table public.assignments (
    id uuid primary key default gen_random_uuid(),
    tutor_id uuid not null default auth.uid(),
    class_id uuid not null,
    paper_id uuid not null,
    share_token uuid not null unique default gen_random_uuid(),
    status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
    due_at timestamptz,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (class_id, tutor_id)
        references public.classes(id, tutor_id) on delete cascade,
    foreign key (paper_id, tutor_id)
        references public.papers(id, tutor_id) on delete cascade,
    unique (class_id, paper_id),
    check (status = 'draft' or published_at is not null)
);

-- One submission per student and assignment.
create table public.submissions (
    id uuid primary key,
    assignment_id uuid not null references public.assignments(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    student_code text not null,
    drawing jsonb not null default '{}'::jsonb check (jsonb_typeof(drawing) = 'object'),
    drawing_sizes jsonb not null default '{}'::jsonb check (jsonb_typeof(drawing_sizes) = 'object'),
    attachments jsonb not null default '[]'::jsonb
        check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
    submitted_at timestamptz not null default now(),
    unique (assignment_id, student_id)
);

-- Query indexes.
create index classes_tutor_idx on public.classes(tutor_id, created_at desc);
create index students_tutor_idx on public.students(tutor_id);
create index students_roster_idx on public.students(class_id, created_at, id) where is_active;
create index questions_filter_idx
    on public.questions(subject, school_year, subject_level, difficulty)
    where status = 'approved';
create index questions_topics_idx on public.questions using gin(topics);
create index papers_tutor_idx on public.papers(tutor_id, created_at desc);
create index assignments_tutor_idx on public.assignments(tutor_id, created_at desc);
create index assignments_paper_idx on public.assignments(paper_id);
create index submissions_student_idx on public.submissions(student_id);

-- Modification timestamps.
create or replace function public.methodmark_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger classes_updated_at before update on public.classes
for each row execute function public.methodmark_touch_updated_at();
create trigger students_updated_at before update on public.students
for each row execute function public.methodmark_touch_updated_at();
create trigger questions_updated_at before update on public.questions
for each row execute function public.methodmark_touch_updated_at();
create trigger papers_updated_at before update on public.papers
for each row execute function public.methodmark_touch_updated_at();
create trigger assignments_updated_at before update on public.assignments
for each row execute function public.methodmark_touch_updated_at();

-- Freeze published paper content.
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
create trigger papers_guard before insert or update on public.papers
for each row execute function public.methodmark_guard_paper();

-- Only published papers can be assigned.
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
create trigger assignments_guard before insert or update on public.assignments
for each row execute function public.methodmark_guard_assignment();

revoke all on function public.methodmark_touch_updated_at() from public, anon, authenticated;
revoke all on function public.methodmark_guard_paper() from public, anon, authenticated;
revoke all on function public.methodmark_guard_assignment() from public, anon, authenticated;

-- Tutor access.
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.questions enable row level security;
alter table public.papers enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

revoke all on public.classes, public.students, public.questions, public.papers,
    public.assignments, public.submissions from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant all on public.classes, public.students, public.questions, public.papers,
    public.assignments, public.submissions to service_role;

grant select, insert, delete on public.classes to authenticated;
grant update(name, subject, school_year, subject_level, color, is_archived)
    on public.classes to authenticated;
grant select, insert on public.students to authenticated;
grant update(name, is_active) on public.students to authenticated;
grant select on public.questions, public.submissions to authenticated;
grant select, insert, update, delete on public.papers to authenticated;
grant select, insert, delete on public.assignments to authenticated;
grant update(status, due_at, share_token) on public.assignments to authenticated;

create policy classes_owner on public.classes for all to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy students_owner on public.students for all to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy approved_questions on public.questions for select to authenticated
using (status = 'approved' and (select auth.uid()) is not null
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy papers_select on public.papers for select to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy papers_insert on public.papers for insert to authenticated
with check (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy papers_update on public.papers for update to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy papers_delete on public.papers for delete to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy assignments_select on public.assignments for select to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy assignments_insert on public.assignments for insert to authenticated
with check (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy assignments_update on public.assignments for update to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy assignments_delete on public.assignments for delete to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create policy submissions_read_own on public.submissions for select to authenticated
using (exists (
    select 1 from public.assignments a
    where a.id = assignment_id and a.tutor_id = (select auth.uid())
));

-- Generate unused class codes; stable UUIDs make retries safe.
create or replace function public.add_class_students(p_class_id uuid, p_student_ids uuid[])
returns setof public.students
language plpgsql security invoker set search_path = '' as $$
declare
    student_uuid uuid;
    existing public.students;
    code text;
    colours constant text[] := array[
        'red','blue','green','yellow','orange','purple','pink','white',
        'black','grey','brown','gold','silver','teal','navy','coral',
        'mint','peach','violet','indigo','amber','ivory','lime','olive'
    ];
    animals constant text[] := array[
        'panda','tiger','lion','bear','otter','fox','wolf','deer',
        'rabbit','koala','eagle','owl','duck','swan','robin','parrot',
        'penguin','dolphin','whale','seal','turtle','frog','gecko','lizard',
        'zebra','giraffe','elephant','rhino','hippo','monkey','gorilla','lemur',
        'kangaroo','wombat','badger','beaver','squirrel','hamster','hedgehog','mole',
        'cat','dog','horse','pony','sheep','goat','alpaca','llama'
    ];
begin
    if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false' then
        raise exception 'Please log in.' using errcode = '42501';
    end if;
    if p_student_ids is null or cardinality(p_student_ids) not between 1 and 50
        or array_position(p_student_ids, null) is not null
        or cardinality(p_student_ids) <> (select count(distinct id) from unnest(p_student_ids) id) then
        raise exception 'Add between 1 and 50 students.' using errcode = '22023';
    end if;

    perform 1 from public.classes
    where id = p_class_id and tutor_id = auth.uid() and not is_archived
    for no key update;
    if not found then
        raise exception 'This class is unavailable.' using errcode = '42501';
    end if;

    for student_uuid in select id from unnest(p_student_ids) id order by id loop
        select * into existing from public.students where id = student_uuid for no key update;
        if found then
            if existing.class_id <> p_class_id or not existing.is_active then
                raise exception 'Create a new student for this class.' using errcode = '42501';
            end if;
            continue;
        end if;
        select c.colour || '-' || a.animal into code
        from unnest(colours) c(colour) cross join unnest(animals) a(animal)
        where not exists (
            select 1 from public.students s
            where s.class_id = p_class_id and s.student_code = c.colour || '-' || a.animal
        )
        order by random() limit 1;
        if code is null then
            raise exception 'No unused colour-animal codes remain for this class.' using errcode = 'P0001';
        end if;
        insert into public.students(id, class_id, student_code)
        values (student_uuid, p_class_id, code);
    end loop;

    return query select s.* from public.students s
    where s.class_id = p_class_id and s.id = any(p_student_ids) order by s.created_at, s.id;
end;
$$;
revoke all on function public.add_class_students(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.add_class_students(uuid, uuid[]) to authenticated;

-- Calculate assignment summaries on demand.
create or replace function public.list_assignments(p_class_id uuid default null)
returns table (
    id uuid, class_id uuid, paper_id uuid, share_token uuid, status text,
    due_at timestamptz, published_at timestamptz, created_at timestamptz,
    class_name text, title text, subject text, school_year smallint, subject_level text,
    duration_minutes integer, question_count integer, student_count bigint, submitted_count bigint
)
language sql stable security invoker set search_path = '' as $$
    select a.id, a.class_id, a.paper_id, a.share_token, a.status,
        a.due_at, a.published_at, a.created_at, c.name, p.title, p.subject,
        p.school_year, p.subject_level, p.duration_minutes, p.question_count,
        (select count(*) from public.students s where s.class_id = a.class_id and s.is_active),
        (select count(*) from public.submissions sub join public.students s on s.id = sub.student_id
            where sub.assignment_id = a.id and s.is_active)
    from public.assignments a
    join public.classes c on c.id = a.class_id
    join public.papers p on p.id = a.paper_id
    where a.status in ('published', 'closed') and (p_class_id is null or a.class_id = p_class_id)
    order by a.created_at desc, a.id;
$$;
revoke all on function public.list_assignments(uuid) from public, anon, authenticated;
grant execute on function public.list_assignments(uuid) to authenticated;

-- Publish all selected classes atomically.
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
revoke all on function public.publish_assignments(uuid, uuid[], timestamptz)
    from public, anon, authenticated;
grant execute on function public.publish_assignments(uuid, uuid[], timestamptz) to authenticated;

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

-- Private student photos.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('student-solutions', 'student-solutions', false, 10485760, array['image/jpeg','image/png'])
on conflict (id) do update set public = false,
    file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

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
