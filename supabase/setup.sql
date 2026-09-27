-- MethodMark: copy this ENTIRE file into Supabase SQL Editor and run once.
-- Fresh project only. Creates 3 tables, 5 demo questions and 2 demo papers.
-- Change methodmark.seed_tutor_email below to your tutor Auth email if desired.
-- A demo tutor profile is not a login account; passwords belong to Supabase Auth.
-- If you already ran the earlier full setup, do not run this bootstrap again.
-- Regenerate this file with: python supabase/scripts/build_sql_editor.py
-- Sources: migrations/20260927000100_initial_methodmark_schema.sql + seed.sql

begin;

-- Initial MethodMark schema: tutor profiles, question bank and saved papers.
-- Fresh database only. Student access is account-free through get_student_paper.


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

-- DEMO SEED DATA

-- Demo data only. Safe to rerun for the same demo tutor: existing question
-- and paper IDs are preserved rather than overwritten.
-- Change this email before the first run to attach papers to your Auth account.

select set_config('methodmark.seed_tutor_email', '20junsheng01@gmail.com', true);

-- Reuse a matching tutor profile if it already exists.
insert into public.tutors (id, name, email)
values (
    '00000000-0000-4000-8000-000000000001',
    'Demo Tutor',
    lower(current_setting('methodmark.seed_tutor_email'))
)
on conflict (email) do nothing;

-- Link existing Auth accounts, including the demo email.
insert into public.tutors (auth_user_id, name, email)
select
    id,
    coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''), 'Tutor'),
    lower(email)
from auth.users
where email is not null and coalesce(is_anonymous, false) = false
on conflict (email) do update
set auth_user_id = excluded.auth_user_id
where public.tutors.auth_user_id is null;

-- SAMPLE 1: standalone quadratic question.
insert into public.questions (
    id, subject, school_year, subject_level, topics, difficulty,
    question_content, solution, marking_rubric, status
) values (
    '10000000-0000-4000-8000-000000000001',
    'Mathematics', 3, 'G3', array['Quadratic equations'], 'medium',
    $json$
    {
      "shared_blocks": [],
      "parts": [
        {"id":"main","label":null,"blocks":[
          {"type":"text","text":"Solve x² − 9 = 0, showing your working."}
        ]}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "parts":[
        {"part_id":"main","worked_solution":[
          "(x − 3)(x + 3) = 0",
          "x = 3 or x = −3"
        ]}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "parts":[
        {"part_id":"main","marking_points":[
          {"id":"main_m1","code":"M1","max_marks":1,
           "criterion":"Uses a valid method, such as factorisation or taking square roots."},
          {"id":"main_a1","code":"A1","max_marks":1,
           "criterion":"States both roots: 3 and −3."}
        ]}
      ]
    }
    $json$::jsonb,
    'approved'
)
on conflict (id) do nothing;

-- SAMPLE 2: two-part question.
insert into public.questions (
    id, subject, school_year, subject_level, topics, difficulty,
    question_content, solution, marking_rubric, status
) values (
    '10000000-0000-4000-8000-000000000002',
    'Mathematics', 3, 'G3', array['Linear equations'], 'easy',
    $json$
    {
      "shared_blocks":[
        {"type":"text","text":"The variables x and y are related by y = 3x + 2."}
      ],
      "parts":[
        {"id":"part_a","label":"(a)","blocks":[
          {"type":"text","text":"Find y when x = 4."}
        ]},
        {"id":"part_b","label":"(b)","blocks":[
          {"type":"text","text":"Find x when y = 20."}
        ]}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "parts":[
        {"part_id":"part_a","worked_solution":["y = 3(4) + 2","y = 14"]},
        {"part_id":"part_b","worked_solution":["20 = 3x + 2","3x = 18","x = 6"]}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "parts":[
        {"part_id":"part_a","marking_points":[
          {"id":"a_m1","code":"M1","max_marks":1,"criterion":"Correctly substitutes x = 4."},
          {"id":"a_a1","code":"A1","max_marks":1,"criterion":"Obtains y = 14."}
        ]},
        {"part_id":"part_b","marking_points":[
          {"id":"b_m1","code":"M1","max_marks":1,"criterion":"Forms 20 = 3x + 2."},
          {"id":"b_a1","code":"A1","max_marks":1,"criterion":"Obtains x = 6."}
        ]}
      ]
    }
    $json$::jsonb,
    'approved'
)
on conflict (id) do nothing;

-- SAMPLE 3: question with stored SVG diagram source.
insert into public.questions (
    id, subject, school_year, subject_level, topics, difficulty,
    question_content, solution, marking_rubric, status
) values (
    '10000000-0000-4000-8000-000000000003',
    'Mathematics', 2, 'G3', array['Pythagoras theorem'], 'medium',
    $json$
    {
      "shared_blocks":[
        {"type":"text","text":"Triangle ABC is right-angled at B. AB = 3 cm and BC = 4 cm."},
        {"type":"diagram","format":"svg",
         "source":"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 110'><path d='M20 20 L20 80 L100 80 Z M20 70 H30 V80' fill='none' stroke='black'/><text x='8' y='18'>A</text><text x='6' y='94'>B</text><text x='104' y='94'>C</text></svg>",
         "alt_text":"Triangle ABC with AB vertical, BC horizontal, and a right angle at B."}
      ],
      "parts":[
        {"id":"main","label":null,"blocks":[
          {"type":"text","text":"Calculate the length of AC."}
        ]}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "parts":[
        {"part_id":"main","worked_solution":[
          "AC² = AB² + BC²",
          "AC² = 3² + 4² = 25",
          "AC = 5 cm"
        ]}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "parts":[
        {"part_id":"main","marking_points":[
          {"id":"main_m1","code":"M1","max_marks":1,
           "criterion":"Correctly applies Pythagoras theorem: AC² = 3² + 4²."},
          {"id":"main_a1","code":"A1","max_marks":1,"criterion":"Obtains AC = 5 cm."}
        ]}
      ]
    }
    $json$::jsonb,
    'approved'
)
on conflict (id) do nothing;

-- SAMPLE 4: G2 question.
insert into public.questions (
    id, subject, school_year, subject_level, topics, difficulty,
    question_content, solution, marking_rubric, status
) values (
    '10000000-0000-4000-8000-000000000004',
    'Mathematics', 2, 'G2', array['Linear equations'], 'easy',
    '{"shared_blocks":[],"parts":[{"id":"main","label":null,"blocks":[{"type":"text","text":"Solve 3x + 7 = 22."}]}]}'::jsonb,
    '{"parts":[{"part_id":"main","worked_solution":["3x = 15","x = 5"]}]}'::jsonb,
    '{"parts":[{"part_id":"main","marking_points":[
      {"id":"main_m1","code":"M1","max_marks":1,"criterion":"Subtracts 7 from both sides to obtain 3x = 15."},
      {"id":"main_a1","code":"A1","max_marks":1,"criterion":"Obtains x = 5."}
    ]}]}'::jsonb,
    'approved'
)
on conflict (id) do nothing;

-- SAMPLE 5: G1 question.
insert into public.questions (
    id, subject, school_year, subject_level, topics, difficulty,
    question_content, solution, marking_rubric, status
) values (
    '10000000-0000-4000-8000-000000000005',
    'Mathematics', 1, 'G1', array['Percentages'], 'easy',
    '{"shared_blocks":[],"parts":[{"id":"main","label":null,"blocks":[{"type":"text","text":"Find 20% of 80."}]}]}'::jsonb,
    '{"parts":[{"part_id":"main","worked_solution":["20 ÷ 100 × 80","16"]}]}'::jsonb,
    '{"parts":[{"part_id":"main","marking_points":[
      {"id":"main_m1","code":"M1","max_marks":1,"criterion":"Uses 20 ÷ 100 × 80 or an equivalent method."},
      {"id":"main_a1","code":"A1","max_marks":1,"criterion":"Obtains 16."}
    ]}]}'::jsonb,
    'approved'
)
on conflict (id) do nothing;

-- Only newly inserted papers are published below. Existing paper edits/statuses
-- are preserved on subsequent seed runs. Array order sets question numbering.
do $seed_papers$
declare
    seed_tutor_id uuid;
    inserted_ids uuid[];
begin
    select id into strict seed_tutor_id
    from public.tutors
    where email = lower(current_setting('methodmark.seed_tutor_email'));

    with sample_papers (
        id, title, school_year, duration_minutes, status, question_ids
    ) as (
        values
        (
            '20000000-0000-4000-8000-000000000001'::uuid,
            'Algebra Practice', 3, 20, 'draft',
            array[
                '10000000-0000-4000-8000-000000000001'::uuid,
                '10000000-0000-4000-8000-000000000002'::uuid
            ]
        ),
        (
            '20000000-0000-4000-8000-000000000002'::uuid,
            'Pythagoras Practice', 2, 15, 'reviewed',
            array['10000000-0000-4000-8000-000000000003'::uuid]
        )
    ), inserted_papers as (
        insert into public.papers (
            id, tutor_id, title, subject, school_year, subject_level,
            duration_minutes, status, questions_snapshot
        )
        select
            p.id,
            seed_tutor_id,
            p.title,
            'Mathematics',
            p.school_year,
            'G3',
            p.duration_minutes,
            p.status,
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'paper_question_id', gen_random_uuid(),
                        'source_question_id', q.id,
                        'topics', q.topics,
                        'difficulty', q.difficulty,
                        'question_content', q.question_content,
                        'solution', q.solution,
                        'marking_rubric', q.marking_rubric
                    )
                    order by array_position(p.question_ids, q.id)
                )
                from public.questions as q
                where q.id = any(p.question_ids)
            )
        from sample_papers as p
        on conflict (id) do nothing
        returning id
    )
    select coalesce(array_agg(id), array[]::uuid[]) into inserted_ids
    from inserted_papers;

    update public.papers
    set status = 'published'
    where id = '20000000-0000-4000-8000-000000000002'
        and id = any(inserted_ids);
end;
$seed_papers$;

commit;

-- Expected on a fresh project: 5 questions and 2 papers.
-- Tutor count includes any existing email-based Auth accounts.
select
    (select count(*) from public.tutors) as tutors,
    (select count(*) from public.questions) as questions,
    (select count(*) from public.papers) as papers;

select id, title, status, question_count, share_token
from public.papers
order by title;

-- Student-safe preview; no login, solutions or marking criteria.
select public.get_student_paper(share_token) as student_preview
from public.papers
where id = '20000000-0000-4000-8000-000000000002';
