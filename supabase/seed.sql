-- Demo data only. Safe to rerun for the same demo tutor: existing question
-- and paper IDs are preserved rather than overwritten.
-- Change this email before the first run to attach papers to your Auth account.
begin;

select set_config('methodmark.seed_tutor_email', 'demo.tutor@example.com', true);

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
