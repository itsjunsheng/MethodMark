import type { Paper } from '../data';
import type { Submission } from './assignments';

export type GradingStatus = 'submitted' | 'queued' | 'processing' | 'awaiting_review' | 'failed';
export type QueueItem = {
  submission_id: string; status: GradingStatus; flagged: boolean; error: string | null;
  student_code: string; student_name: string | null; class_id: string; class_name: string; paper_title: string;
  submitted_at: string; review_saved_at: string | null; version: number; updated_at?: string;
  // Every part of the saved review is ticked as checked (set by the server).
  review_complete: boolean;
};
export type GradedPoint = { id: string; code: string; criterion: string; max_marks: number;
  awarded: number | null; evidence: string; rationale: string; confidence: number };
export type GradedPart = { part_id: string; label: string | null; transcription: string;
  legibility: string; confidence: number; flags: string[]; feedback: string; points: GradedPoint[] };
export type GradedQuestion = { question_id: string; number: number; parts: GradedPart[] };
export type GradingResult = { prompt_version: string; questions: GradedQuestion[] };
export type ReviewDraft = { questions: { question_id: string; parts: { part_id: string;
  points: { point_id: string; awarded: number | null }[]; feedback: string; checked: boolean }[] }[] };
export type GradingDetail = {
  job: { submission_id: string; status: GradingStatus; vision_model?: string | null; result: GradingResult | null; error: string | null;
    review_draft: ReviewDraft | null; version: number; review_saved_at: string | null };
  submission: Submission; paper: Paper; photos: { name: string; url: string }[];
  class_name: string; manual_error: string | null;
};
