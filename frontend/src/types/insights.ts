export type InsightTrend = { assignment_id: string; title: string; class_id: string; class_name: string; date: string | null;
  average: number | null; reviewed: number; submitted: number };
export type InsightStatus = { assignment_id: string; title: string; class_name: string; due_at: string | null; students: number;
  submitted: number; not_submitted: number; processing: number; awaiting_review: number; failed: number; reviewed: number };
export type InsightTopic = { topic: string; percent: number | null; earned: number; available: number; students: number; below: number };
export type InsightMistake = { question: string; paper: string; number: number; topics: string[]; code: string; criterion: string;
  missed: number; assessed: number; rate: number; students: string[]; feedback: string[] };
export type InsightStudent = { id: string; name: string | null; code: string; class_name: string; active: boolean;
  submitted: number; reviewed: number; average: number | null; method_rate: number | null; answer_rate: number | null;
  topics: { topic: string; percent: number; class_percent: number | null }[]; gaps: string[];
  history: { assignment_id: string; title: string; date: string | null; percent: number | null; complete: boolean }[] };
export type Insights = {
  classes: { id: string; name: string }[];
  summary: { assignments: number; students: number; submissions: number; reviewed: number; checked_parts: number;
    total_parts: number; average: number | null; method_rate: number | null; answer_rate: number | null;
    slips: { count: number; parts: number; percent: number | null } };
  status: InsightStatus[]; trend: InsightTrend[]; distribution: { label: string; count: number }[];
  topics: InsightTopic[]; mistakes: InsightMistake[]; students: InsightStudent[];
};
