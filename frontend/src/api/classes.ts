import type { ItemColour } from '../lib/colours';
import { supabase } from '../lib/supabase';
import type { ClassDetails, Student, TutorClass } from '../types/classes';

function client() {
  if (!supabase) throw new Error('Please log in to manage your classes.');
  return supabase;
}

function checkError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error('Class management is not ready yet. Please contact your administrator.');
  }
  if (error.code === '42501' || error.code === 'PGRST301') {
    throw new Error('This information is unavailable. Refresh the page or log in again.');
  }
  if (error.code === 'P0001' || error.code === '22023') throw new Error(error.message);
  throw new Error('Could not save or load your classes. Check your connection and try again.');
}

const studentFields = 'id,class_id,student_code,name,is_active';
const classFields = 'id,name,color,subject,school_year,subject_level,students(count)';

export async function listClasses(signal: AbortSignal): Promise<TutorClass[]> {
  const { data, error } = await client().from('classes').select(classFields).eq('students.is_active', true)
    .eq('is_archived', false).order('created_at', { ascending: false }).abortSignal(signal);
  checkError(error);
  return data ?? [];
}

export async function createClass(id: string, details: ClassDetails): Promise<TutorClass> {
  // A stable ID makes retries safe if a successful response was lost.
  const { error } = await client().from('classes').upsert(
    { id, ...details, name: details.name.trim() }, { onConflict: 'id', ignoreDuplicates: true },
  );
  checkError(error);
  const { data, error: readError } = await client().from('classes').select(classFields)
    .eq('students.is_active', true).eq('id', id).single();
  checkError(readError);
  if (!data) throw new Error('Could not load the new class. Please refresh the page.');
  return data;
}

export async function listClassStudents(classId: string, signal: AbortSignal): Promise<Student[]> {
  const rows: Student[] = [];
  // Do not silently truncate large rosters at Supabase's response limit.
  for (let from = 0; ; from += 500) {
    const { data, error } = await client().from('students').select(studentFields)
      .eq('class_id', classId).eq('is_active', true).order('created_at').order('id')
      .range(from, from + 499).abortSignal(signal);
    checkError(error);
    const batch: Student[] = data ?? [];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

export async function addClassStudents(classId: string, studentIds: string[]) {
  const { error } = await client().rpc('add_class_students', {
    p_class_id: classId, p_student_ids: studentIds,
  });
  checkError(error);
}

export async function updateStudentName(id: string, name: string): Promise<Student> {
  const { data, error } = await client().from('students').update({ name: name.trim() || null })
    .eq('id', id).select(studentFields).single();
  checkError(error);
  if (!data) throw new Error('This student is unavailable. Please refresh the class.');
  return data;
}

export async function removeClassStudent(classId: string, studentId: string) {
  // Keep submitted work while disabling this student code.
  const { error } = await client().from('students').update({ is_active: false })
    .eq('class_id', classId).eq('id', studentId);
  checkError(error);
}

export async function deleteClass(classId: string) {
  // The database removes this class, its students and assignments; papers remain.
  const { error } = await client().from('classes').delete().eq('id', classId);
  checkError(error);
}

export async function updateClassColour(id: string, color: ItemColour): Promise<TutorClass> {
  const { data, error } = await client().from('classes').update({ color }).eq('id', id)
    .select(classFields).eq('students.is_active', true).single();
  checkError(error);
  if (!data) throw new Error('This class is unavailable. Please refresh the page.');
  return data;
}
