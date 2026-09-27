-- Initial MethodMark schema: tutor profiles, question bank and saved papers.
-- Fresh database only. Student access is account-free through get_student_paper.

begin;

create table public.tutors (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    name text not null,
    email text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

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
        and question_content -> 'parts' <> '[]'::jsonb, false)),
    check (coalesce(
        jsonb_typeof(solution) = 'object'
        and jsonb_typeof(solution -> 'parts') = 'array'
        and solution -> 'parts' <> '[]'::jsonb, false)),
    check (coalesce(
        jsonb_typeof(marking_rubric) = 'object'
        and jsonb_typeof(marking_rubric -> 'parts') = 'array'
        and marking_rubric -> 'parts' <> '[]'::jsonb, false))
);

create table public.papers (
    id uuid primary key default gen_random_uuid(),
    tutor_id uuid not null references public.tutors(id),
    title text not null check (length(btrim(title)) > 0),
    subject text not null check (subject in ('Mathematics', 'Additional Mathematics')),
    school_year smallint not null check (school_year between 1 and 5),
    subject_level text not null check (subject_level in ('G1', 'G2', 'G3')),
    duration_minutes integer not null check (duration_minutes > 0),
    instructions text not null default 'Answer all questions. Show your working clearly.',
    status text not null default 'draft'
        check (status in ('draft', 'reviewed', 'published', 'archived')),
    questions_snapshot jsonb not null default '[]'::jsonb
        check (jsonb_typeof(questions_snapshot) = 'array'),
    question_count integer
        generated always as (jsonb_array_length(questions_snapshot)) stored,
    share_token uuid not null unique default gen_random_uuid(),
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (status not in ('reviewed', 'published')
        or jsonb_array_length(questions_snapshot) > 0)
);

create index questions_filter_idx
    on public.questions (subject, school_year, subject_level, difficulty)
    where status = 'approved';
create index questions_topics_idx on public.questions using gin (topics);
create index papers_tutor_idx on public.papers (tutor_id, created_at desc);

create function public.methodmark_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger tutors_updated_at before update on public.tutors
for each row execute function public.methodmark_touch_updated_at();
create trigger questions_updated_at before update on public.questions
for each row execute function public.methodmark_touch_updated_at();
create trigger papers_updated_at before update on public.papers
for each row execute function public.methodmark_touch_updated_at();

-- Preserve the exact paper students received.
create function public.methodmark_guard_paper()
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
        if content_changed or new.status not in ('published', 'archived') then
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

-- New tutor registrations create profiles or attach to the seeded profile.
-- Students use shared links; do not create anonymous Auth users for them.
create function public.methodmark_new_tutor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.email is not null and coalesce(new.is_anonymous, false) = false then
        insert into public.tutors (auth_user_id, name, email)
        values (
            new.id,
            coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'Tutor'),
            lower(new.email)
        )
        on conflict (email) do update
            set auth_user_id = excluded.auth_user_id
            where public.tutors.auth_user_id is null
               or public.tutors.auth_user_id = excluded.auth_user_id;
    end if;
    return new;
end;
$$;

create trigger methodmark_tutor_signup after insert on auth.users
for each row execute function public.methodmark_new_tutor();

revoke all on function public.methodmark_touch_updated_at() from public, anon, authenticated;
revoke all on function public.methodmark_guard_paper() from public, anon, authenticated;
revoke all on function public.methodmark_new_tutor() from public, anon, authenticated;

-- Tutor tables are private; the student function below exposes questions only.
alter table public.tutors enable row level security;
alter table public.questions enable row level security;
alter table public.papers enable row level security;

revoke all on public.tutors, public.questions, public.papers
    from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select on public.tutors, public.questions, public.papers to authenticated;
grant update (name) on public.tutors to authenticated;
grant insert, update, delete on public.papers to authenticated;
grant all on public.tutors, public.questions, public.papers to service_role;

create policy tutors_read_own on public.tutors
for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy tutors_edit_own on public.tutors
for update to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create policy tutors_read_question_bank on public.questions
for select to authenticated
using (
    status = 'approved'
    and exists (
        select 1 from public.tutors where auth_user_id = (select auth.uid())
    )
);

create policy tutors_read_papers on public.papers
for select to authenticated
using (tutor_id in (
    select id from public.tutors where auth_user_id = (select auth.uid())
));

create policy tutors_create_papers on public.papers
for insert to authenticated
with check (tutor_id in (
    select id from public.tutors where auth_user_id = (select auth.uid())
));

create policy tutors_edit_papers on public.papers
for update to authenticated
using (tutor_id in (
    select id from public.tutors where auth_user_id = (select auth.uid())
))
with check (tutor_id in (
    select id from public.tutors where auth_user_id = (select auth.uid())
));

create policy tutors_delete_drafts on public.papers
for delete to authenticated
using (
    status = 'draft'
    and tutor_id in (
        select id from public.tutors where auth_user_id = (select auth.uid())
    )
);

-- Students call this function with a published paper's share_token.
-- Returns content and available marks, never solutions or rubric criteria.
create function public.get_student_paper(p_share_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'subject', p.subject,
        'school_year', p.school_year,
        'subject_level', p.subject_level,
        'duration_minutes', p.duration_minutes,
        'instructions', p.instructions,
        'question_count', p.question_count,
        'questions', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'paper_question_id', item.value ->> 'paper_question_id',
                'position', item.ordinality,
                'question_content', item.value -> 'question_content',
                'part_marks', (
                    select jsonb_object_agg(part ->> 'part_id', (
                        select coalesce(sum((point ->> 'max_marks')::numeric), 0)
                        from jsonb_array_elements(part -> 'marking_points') as point
                    ))
                    from jsonb_array_elements(
                        item.value -> 'marking_rubric' -> 'parts'
                    ) as part
                )
            ) order by item.ordinality), '[]'::jsonb)
            from jsonb_array_elements(p.questions_snapshot)
                with ordinality as item(value, ordinality)
        )
    )
    from public.papers as p
    where p.share_token = p_share_token and p.status = 'published';
$$;

revoke all on function public.get_student_paper(uuid) from public, anon, authenticated;
grant execute on function public.get_student_paper(uuid)
    to anon, authenticated, service_role;

commit;

