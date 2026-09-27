export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'diagram'; format: 'svg'; source: string; alt_text: string };

export type MarkingPoint = {
  id: string;
  code: string;
  max_marks: number;
  criterion: string;
};

export type BankQuestion = {
  id: string;
  subject: string;
  school_year: number;
  subject_level: 'G1' | 'G2' | 'G3';
  topics: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  question_content: {
    shared_blocks: ContentBlock[];
    parts: { id: string; label: string | null; blocks: ContentBlock[] }[];
  };
  solution: { parts: { part_id: string; worked_solution: string[] }[] };
  marking_rubric: { parts: { part_id: string; marking_points: MarkingPoint[] }[] };
};
