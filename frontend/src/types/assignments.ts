import type { InkDrawing } from '../lib/useHandwriting';
import type { Paper } from '../data';
import type { ContentBlock } from './questionBank';

export type ClassAssignment = {
  id: string; class_id: string; paper_id: string; share_token: string;
  class_name: string; title: string; subject: string; school_year: number; subject_level: string;
  duration_minutes: number; question_count: number; status: 'draft' | 'published' | 'closed';
  due_at: string | null; published_at: string | null; created_at: string;
  student_count: number; submitted_count: number;
};
export type SubmissionSummary = {
  id: string; student_id: string; student_code: string; submitted_at: string;
  students: { name: string | null };
};
export type Submission = SubmissionSummary & {
  drawing: InkDrawing; attachments: { path: string; name: string; mime_type: string }[];
};
export type StudentAssignment = {
  id: string; title: string; class_name: string; due_at: string | null;
  duration: number; question_count: number; accepting_submissions: boolean;
};
export type StudentPaperPayload = {
  id: string; title: string; subject: string; school_year: number; subject_level: 'G1' | 'G2' | 'G3';
  duration: number; instructions: string;
  questions: {
    id: string; topic: string; text: string; method: number; accuracy: number;
    question_content?: { shared_blocks: ContentBlock[]; parts: { id: string; label: string | null; blocks: ContentBlock[] }[] };
    marks_by_part?: Record<string, number>;
  }[];
};
export type StudentAccess = { assignment: StudentAssignment; paper: Paper; student_code: string; submitted_at: string | null };
