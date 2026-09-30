-- MethodMark: run AFTER setup.sql in the Supabase SQL Editor.
-- Inserts only 30 original development questions. No tutors, classes, students
-- or papers are created. Review these examples before assigning them.
-- Includes G1/G2/G3 Mathematics, Additional Mathematics, three difficulties,
-- standalone questions, labelled/nested parts and stored SVG diagram source.
-- Stable IDs make this safe to rerun: existing rows are left unchanged.
-- Question topic/year/level tags are examples, not a full syllabus mapping.
--
-- Format: question_content = shared_blocks + parts;
-- solution and marking_rubric refer to those parts by part_id.
-- M = method, A = accuracy, B = an independent correct statement or result.
-- max_marks is the numeric mark allocation; code is its display label.

begin;

insert into public.questions (
    id, subject, school_year, subject_level, topics, difficulty,
    question_content, solution, marking_rubric, status
) values
-- Q01: Mathematics, Secondary 3 G3, Quadratic equations (medium).
(
    '10000000-0000-4000-8000-000000000001', 'Mathematics', 3, 'G3', array['Quadratic equations'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve x² − 9 = 0, showing your working."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "(x − 3)(x + 3) = 0",
        "x = 3 or x = −3"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_m1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses a valid method, such as factorisation or taking square roots."
        },
        {
          "id": "main_a1",
          "code": "A1",
          "max_marks": 1,
          "criterion": "States both roots: 3 and −3."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q02: Mathematics, Secondary 3 G3, Linear equations (easy).
(
    '10000000-0000-4000-8000-000000000002', 'Mathematics', 3, 'G3', array['Linear equations'], 'easy',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "The variables x and y are related by y = 3x + 2."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Find y when x = 4."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "Find x when y = 20."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "y = 3(4) + 2",
        "y = 14"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "20 = 3x + 2",
        "3x = 18",
        "x = 6"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "a_m1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Correctly substitutes x = 4."
        },
        {
          "id": "a_a1",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains y = 14."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "b_m1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Forms 20 = 3x + 2."
        },
        {
          "id": "b_a1",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains x = 6."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q03: Mathematics, Secondary 2 G3, Pythagoras theorem (medium).
(
    '10000000-0000-4000-8000-000000000003', 'Mathematics', 2, 'G3', array['Pythagoras theorem'], 'medium',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "Triangle ABC is right-angled at B. AB = 3 cm and BC = 4 cm."
    },
    {
      "type": "diagram",
      "format": "svg",
      "source": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 110'><path d='M20 20 L20 80 L100 80 Z M20 70 H30 V80' fill='none' stroke='black'/><text x='8' y='18'>A</text><text x='6' y='94'>B</text><text x='104' y='94'>C</text></svg>",
      "alt_text": "Triangle ABC with AB vertical, BC horizontal, and a right angle at B."
    }
  ],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Calculate the length of AC."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "AC² = AB² + BC²",
        "AC² = 3² + 4² = 25",
        "AC = 5 cm"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_m1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Correctly applies Pythagoras theorem: AC² = 3² + 4²."
        },
        {
          "id": "main_a1",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains AC = 5 cm."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q04: Mathematics, Secondary 2 G2, Linear equations (easy).
(
    '10000000-0000-4000-8000-000000000004', 'Mathematics', 2, 'G2', array['Linear equations'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve 3x + 7 = 22."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "3x = 15",
        "x = 5"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_m1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Subtracts 7 from both sides to obtain 3x = 15."
        },
        {
          "id": "main_a1",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains x = 5."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q05: Mathematics, Secondary 1 G1, Percentages (easy).
(
    '10000000-0000-4000-8000-000000000005', 'Mathematics', 1, 'G1', array['Percentages'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Find 20% of 80."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "20 ÷ 100 × 80",
        "16"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_m1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses 20 ÷ 100 × 80 or an equivalent method."
        },
        {
          "id": "main_a1",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 16."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q06: Mathematics, Secondary 1 G1, Integers (easy).
(
    '10000000-0000-4000-8000-000000000006', 'Mathematics', 1, 'G1', array['Integers'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Evaluate −7 + 12 − 5."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "−7 + 12 = 5",
        "5 − 5 = 0"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "Obtains 0."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q07: Mathematics, Secondary 1 G1, Fractions (easy).
(
    '10000000-0000-4000-8000-000000000007', 'Mathematics', 1, 'G1', array['Fractions'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Calculate 3/4 + 1/8. Give your answer as a fraction in its simplest form."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "3/4 = 6/8",
        "6/8 + 1/8 = 7/8"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Expresses the fractions using a common denominator."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 7/8."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q08: Mathematics, Secondary 1 G1, Ratio (medium).
(
    '10000000-0000-4000-8000-000000000008', 'Mathematics', 1, 'G1', array['Ratio'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "A bag contains 24 marbles. The ratio of red marbles to blue marbles is 1 : 2. Find the number of marbles of each colour."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "Total number of ratio parts = 1 + 2 = 3",
        "One part = 24 ÷ 3 = 8",
        "Red marbles = 8; blue marbles = 16"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Divides 24 into 3 equal parts."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 8 red marbles and 16 blue marbles."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q09: Mathematics, Secondary 1 G1, Percentages (medium).
(
    '10000000-0000-4000-8000-000000000009', 'Mathematics', 1, 'G1', array['Percentages'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "A bag costs $80 before a 15% discount. Calculate its sale price."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "Discount = 0.15 × 80 = $12",
        "Sale price = 80 − 12 = $68"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Finds 15% of 80, or calculates 85% of 80 directly."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains $68."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q10: Mathematics, Secondary 1 G1, Perimeter and area (hard).
(
    '10000000-0000-4000-8000-000000000010', 'Mathematics', 1, 'G1', array['Perimeter and area'], 'hard',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "A rectangle has a perimeter of 34 cm. Its length is 3 cm more than its width."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Find the width and length of the rectangle."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "Calculate the area of the rectangle."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "Let the width be w cm, so the length is (w + 3) cm.",
        "2w + 2(w + 3) = 34",
        "4w = 28",
        "Width = 7 cm; length = 10 cm"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "Area = length × width = 10 × 7",
        "Area = 70 cm²"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "part_a_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Forms a correct perimeter equation or an equivalent arithmetic method."
        },
        {
          "id": "part_a_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains width 7 cm and length 10 cm."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses length multiplied by width."
        },
        {
          "id": "part_b_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 70 cm²."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q11: Mathematics, Secondary 2 G2, Linear equations (easy).
(
    '10000000-0000-4000-8000-000000000011', 'Mathematics', 2, 'G2', array['Linear equations'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve 5x − 8 = 27."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "5x = 35",
        "x = 7"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Adds 8 to both sides, obtaining 5x = 35."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains x = 7."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q12: Mathematics, Secondary 2 G2, Simultaneous equations (medium).
(
    '10000000-0000-4000-8000-000000000012', 'Mathematics', 2, 'G2', array['Simultaneous equations'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve the simultaneous equations 2x + y = 11 and x − y = 1."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "Add the equations: 3x = 12",
        "x = 4",
        "4 − y = 1",
        "y = 3"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses a valid substitution or elimination method."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains x = 4."
        },
        {
          "id": "main_3",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains y = 3."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q13: Mathematics, Secondary 2 G2, Percentages (medium).
(
    '10000000-0000-4000-8000-000000000013', 'Mathematics', 2, 'G2', array['Percentages'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "A club's membership increases from 120 to 138. Calculate the percentage increase."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "Increase = 138 − 120 = 18",
        "Percentage increase = (18/120) × 100% = 15%"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Divides the increase of 18 by the original membership of 120."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 15%."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q14: Mathematics, Secondary 2 G2, Percentages (hard).
(
    '10000000-0000-4000-8000-000000000014', 'Mathematics', 2, 'G2', array['Percentages'], 'hard',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "A jacket is discounted by 20%, then by a further 10% of the reduced price. The final price is $72. Find the original price."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "Let the original price be $p.",
        "0.80 × 0.90 × p = 72",
        "0.72p = 72",
        "p = 100",
        "The original price was $100."
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses successive multipliers of 0.80 and 0.90."
        },
        {
          "id": "main_2",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Divides 72 by the combined multiplier 0.72."
        },
        {
          "id": "main_3",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains $100."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q15: Mathematics, Secondary 2 G2, Statistics (easy).
(
    '10000000-0000-4000-8000-000000000015', 'Mathematics', 2, 'G2', array['Statistics'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Find the mean of 6, 8, 10, 12 and 14."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "Sum = 6 + 8 + 10 + 12 + 14 = 50",
        "Mean = 50 ÷ 5 = 10"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Divides the sum of the five values by 5."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 10."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q16: Mathematics, Secondary 2 G2, Probability (medium).
(
    '10000000-0000-4000-8000-000000000016', 'Mathematics', 2, 'G2', array['Probability'], 'medium',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "A bag contains 3 red, 5 blue and 2 green counters. One counter is chosen at random."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Find the probability that the counter is blue."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "Find the probability that the counter is not red."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "P(blue) = 5/10 = 1/2"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "P(not red) = (5 + 2)/10 = 7/10"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "part_a_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "Obtains 1/2 or an equivalent fraction."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "Obtains 7/10 or an equivalent value."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q17: Mathematics, Secondary 2 G3, Pythagoras theorem (easy).
(
    '10000000-0000-4000-8000-000000000017', 'Mathematics', 2, 'G3', array['Pythagoras theorem'], 'easy',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "Triangle ABC is right-angled at B. AB = 6 cm and BC = 8 cm. The diagram is not drawn to scale."
    },
    {
      "type": "diagram",
      "format": "svg",
      "source": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 190'><path d='M55 30 L55 145 L210 145 Z M55 130 H70 V145' fill='none' stroke='black' stroke-width='2'/><g font-family='Arial' font-size='15'><text x='40' y='22'>A</text><text x='37' y='165'>B</text><text x='214' y='162'>C</text><text x='8' y='95'>6 cm</text><text x='108' y='170'>8 cm</text></g></svg>",
      "alt_text": "Right-angled triangle ABC with AB = 6 cm, BC = 8 cm and a right angle at B. Diagram not to scale."
    }
  ],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Calculate the length of AC."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "AC² = 6² + 8² = 100",
        "AC = 10 cm"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses AC² = 6² + 8²."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains AC = 10 cm."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q18: Mathematics, Secondary 2 G3, Angles (medium).
(
    '10000000-0000-4000-8000-000000000018', 'Mathematics', 2, 'G3', array['Angles'], 'medium',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "In triangle ABC, angle BAC = 40° and angle ABC = 65°."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Find angle ACB."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "BC is extended beyond C to D. Find angle ACD."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "Angle ACB = 180° − 40° − 65° = 75°"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "Angle ACD = 180° − 75° = 105°"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "part_a_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses the angle sum of a triangle."
        },
        {
          "id": "part_a_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 75°."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "Obtains 105°; an exterior-angle method is also valid."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q19: Mathematics, Secondary 2 G3, Algebraic expressions (medium).
(
    '10000000-0000-4000-8000-000000000019', 'Mathematics', 2, 'G3', array['Algebraic expressions'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Expand and simplify (2x − 3)(x + 4)."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "(2x − 3)(x + 4) = 2x² + 8x − 3x − 12",
        "= 2x² + 5x − 12"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Expands both brackets using all four products."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 2x² + 5x − 12."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q20: Mathematics, Secondary 2 G3, Algebraic fractions (hard).
(
    '10000000-0000-4000-8000-000000000020', 'Mathematics', 2, 'G3', array['Algebraic fractions'], 'hard',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Simplify (x² − 9)/(x² + x − 6), stating all values of x for which the original expression is undefined."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "x² − 9 = (x − 3)(x + 3)",
        "x² + x − 6 = (x + 3)(x − 2)",
        "The expression simplifies to (x − 3)/(x − 2).",
        "The original denominator is zero at x = −3 and x = 2."
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Factorises the numerator and denominator."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains (x − 3)/(x − 2)."
        },
        {
          "id": "main_3",
          "code": "B1",
          "max_marks": 1,
          "criterion": "States both excluded values: x = −3 and x = 2."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q21: Mathematics, Secondary 3 G3, Quadratic equations (easy).
(
    '10000000-0000-4000-8000-000000000021', 'Mathematics', 3, 'G3', array['Quadratic equations'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve x² − 5x + 6 = 0."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "(x − 2)(x − 3) = 0",
        "x = 2 or x = 3"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses a valid method, such as factorisation."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains both roots, 2 and 3."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q22: Mathematics, Secondary 3 G3, Quadratic equations (medium).
(
    '10000000-0000-4000-8000-000000000022', 'Mathematics', 3, 'G3', array['Quadratic equations'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve 2x² + x − 6 = 0."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "(2x − 3)(x + 2) = 0",
        "x = 3/2 or x = −2"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses a valid method, such as factorisation."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains both roots, 3/2 and −2."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q23: Mathematics, Secondary 3 G3, Quadratic equations (hard).
(
    '10000000-0000-4000-8000-000000000023', 'Mathematics', 3, 'G3', array['Quadratic equations'], 'hard',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "A rectangle has width x cm, length (x + 3) cm and area 54 cm²."
    }
  ],
  "parts": [
    {
      "id": "part_a_i",
      "label": "(a)(i)",
      "blocks": [
        {
          "type": "text",
          "text": "Form a quadratic equation in x."
        }
      ]
    },
    {
      "id": "part_a_ii",
      "label": "(a)(ii)",
      "blocks": [
        {
          "type": "text",
          "text": "Hence find the width and length of the rectangle."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "Calculate the perimeter of the rectangle."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a_i",
      "worked_solution": [
        "x(x + 3) = 54",
        "x² + 3x − 54 = 0"
      ]
    },
    {
      "part_id": "part_a_ii",
      "worked_solution": [
        "(x + 9)(x − 6) = 0",
        "x = −9 or x = 6",
        "Reject x = −9 because a length must be positive.",
        "Width = 6 cm; length = 9 cm"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "Perimeter = 2(6 + 9) = 30 cm"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a_i",
      "marking_points": [
        {
          "id": "part_a_i_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "Forms x² + 3x − 54 = 0 or an equivalent equation."
        }
      ]
    },
    {
      "part_id": "part_a_ii",
      "marking_points": [
        {
          "id": "part_a_ii_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Solves the quadratic equation using a valid method."
        },
        {
          "id": "part_a_ii_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Selects the positive solution and gives width 6 cm and length 9 cm."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses twice the sum of the width and length."
        },
        {
          "id": "part_b_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 30 cm."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q24: Mathematics, Secondary 3 G3, Coordinate geometry (medium).
(
    '10000000-0000-4000-8000-000000000024', 'Mathematics', 3, 'G3', array['Coordinate geometry'], 'medium',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "The points P and Q have coordinates (2, 3) and (6, 11), respectively."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Calculate the gradient of PQ."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "Find the equation of the line PQ."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "Gradient = (11 − 3)/(6 − 2) = 8/4 = 2"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "y = 2x + c",
        "Substitute P(2, 3): 3 = 4 + c",
        "c = −1",
        "y = 2x − 1"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "part_a_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses change in y divided by change in x."
        },
        {
          "id": "part_a_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains gradient 2."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Substitutes one given point into a line equation with the gradient."
        },
        {
          "id": "part_b_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains y = 2x − 1 or an equivalent equation."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q25: Mathematics, Secondary 3 G3, Coordinate geometry (hard).
(
    '10000000-0000-4000-8000-000000000025', 'Mathematics', 3, 'G3', array['Coordinate geometry'], 'hard',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "A line is perpendicular to y = 2x + 3 and passes through (4, 1). Find its equation."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "The perpendicular gradient is −1/2.",
        "y − 1 = (−1/2)(x − 4)",
        "y = −x/2 + 3"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "Finds the perpendicular gradient −1/2."
        },
        {
          "id": "main_2",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses the point (4, 1) to form the line equation."
        },
        {
          "id": "main_3",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains y = −x/2 + 3 or an equivalent equation."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q26: Additional Mathematics, Secondary 3 G3, Indices (easy).
(
    '10000000-0000-4000-8000-000000000026', 'Additional Mathematics', 3, 'G3', array['Indices'], 'easy',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve 2^(x + 1) = 16."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "16 = 2^4",
        "x + 1 = 4",
        "x = 3"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Writes both sides as powers of 2 and equates the exponents."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains x = 3."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q27: Additional Mathematics, Secondary 3 G3, Surds (medium).
(
    '10000000-0000-4000-8000-000000000027', 'Additional Mathematics', 3, 'G3', array['Surds'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Simplify √50 + √8, giving your answer in the form a√2."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "√50 = 5√2 and √8 = 2√2",
        "5√2 + 2√2 = 7√2"
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Expresses both surds as multiples of √2."
        },
        {
          "id": "main_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 7√2."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q28: Additional Mathematics, Secondary 3 G3, Logarithms (medium).
(
    '10000000-0000-4000-8000-000000000028', 'Additional Mathematics', 3, 'G3', array['Logarithms'], 'medium',
    $json$
{
  "shared_blocks": [],
  "parts": [
    {
      "id": "main",
      "label": null,
      "blocks": [
        {
          "type": "text",
          "text": "Solve log₂(x) + log₂(x − 2) = 3."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "worked_solution": [
        "The logarithms require x > 2.",
        "log₂[x(x − 2)] = 3",
        "x(x − 2) = 8",
        "x² − 2x − 8 = 0",
        "(x − 4)(x + 2) = 0",
        "Reject x = −2. The solution is x = 4."
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "main",
      "marking_points": [
        {
          "id": "main_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Combines the logarithms and obtains x(x − 2) = 8."
        },
        {
          "id": "main_2",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Solves the resulting quadratic equation."
        },
        {
          "id": "main_3",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Gives x = 4 only, rejecting the invalid root."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q29: Additional Mathematics, Secondary 3 G3, Quadratic functions (hard).
(
    '10000000-0000-4000-8000-000000000029', 'Additional Mathematics', 3, 'G3', array['Quadratic functions'], 'hard',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "The function f is defined by f(x) = 2x² − 12x + 23."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Express f(x) in the form a(x − h)² + k."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "State the minimum value of f(x) and the value of x at which it occurs."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "f(x) = 2(x² − 6x) + 23",
        "= 2[(x − 3)² − 9] + 23",
        "= 2(x − 3)² + 5"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "The squared term is non-negative.",
        "The minimum value is 5, when x = 3."
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "part_a_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Completes the square after factoring out 2."
        },
        {
          "id": "part_a_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 2(x − 3)² + 5."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "B1",
          "max_marks": 1,
          "criterion": "States the minimum value is 5."
        },
        {
          "id": "part_b_2",
          "code": "B1",
          "max_marks": 1,
          "criterion": "States that it occurs at x = 3."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
),

-- Q30: Additional Mathematics, Secondary 4 G3, Differentiation (hard).
(
    '10000000-0000-4000-8000-000000000030', 'Additional Mathematics', 4, 'G3', array['Differentiation'], 'hard',
    $json$
{
  "shared_blocks": [
    {
      "type": "text",
      "text": "The curve is defined by f(x) = x³ − 6x² + 9x + 2."
    }
  ],
  "parts": [
    {
      "id": "part_a",
      "label": "(a)",
      "blocks": [
        {
          "type": "text",
          "text": "Find f'(x)."
        }
      ]
    },
    {
      "id": "part_b",
      "label": "(b)",
      "blocks": [
        {
          "type": "text",
          "text": "Find the coordinates of the stationary points."
        }
      ]
    },
    {
      "id": "part_c",
      "label": "(c)",
      "blocks": [
        {
          "type": "text",
          "text": "Determine the nature of each stationary point."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "worked_solution": [
        "f'(x) = 3x² − 12x + 9"
      ]
    },
    {
      "part_id": "part_b",
      "worked_solution": [
        "3x² − 12x + 9 = 0",
        "3(x − 1)(x − 3) = 0",
        "x = 1 or x = 3",
        "f(1) = 6 and f(3) = 2",
        "The stationary points are (1, 6) and (3, 2)."
      ]
    },
    {
      "part_id": "part_c",
      "worked_solution": [
        "f''(x) = 6x − 12",
        "f''(1) = −6 < 0: (1, 6) is a local maximum.",
        "f''(3) = 6 > 0: (3, 2) is a local minimum."
      ]
    }
  ]
}
    $json$::jsonb,
    $json$
{
  "parts": [
    {
      "part_id": "part_a",
      "marking_points": [
        {
          "id": "part_a_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Applies the power rule to the polynomial."
        },
        {
          "id": "part_a_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains 3x² − 12x + 9."
        }
      ]
    },
    {
      "part_id": "part_b",
      "marking_points": [
        {
          "id": "part_b_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Sets the derivative equal to zero and solves."
        },
        {
          "id": "part_b_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains x = 1 and x = 3."
        },
        {
          "id": "part_b_3",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Obtains both coordinates: (1, 6) and (3, 2)."
        }
      ]
    },
    {
      "part_id": "part_c",
      "marking_points": [
        {
          "id": "part_c_1",
          "code": "M1",
          "max_marks": 1,
          "criterion": "Uses the second derivative or a valid first-derivative sign test."
        },
        {
          "id": "part_c_2",
          "code": "A1",
          "max_marks": 1,
          "criterion": "Correctly identifies (1, 6) as a local maximum and (3, 2) as a local minimum."
        }
      ]
    }
  ]
}
    $json$::jsonb,
    'approved'
)
on conflict (id) do nothing;

commit;
