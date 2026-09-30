import type { ItemColour } from '../lib/colours';

export type ClassDetails = {
  color?: ItemColour;
  name: string;
  subject: 'Mathematics' | 'Additional Mathematics';
  school_year: number;
  subject_level: 'G1' | 'G2' | 'G3';
};

export type TutorClass = ClassDetails & {
  id: string;
  is_archived?: boolean;
  students: { count: number }[];
};

export type Student = {
  id: string;
  class_id: string;
  student_code: string;
  name: string | null;
  is_active: boolean;
};
