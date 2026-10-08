// node supabase/tests/assignment_deletion.mjs [path-to-pglite-module]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const sql = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tutor = uuid(1), otherTutor = uuid(2), paper = uuid(3);

for (const mode of ['fresh', 'upgrade']) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema auth to authenticated, anon, service_role;
      create table storage.buckets (id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      insert into auth.users values ('${tutor}'), ('${otherTutor}');
    `);
    await db.exec(sql('setup.sql'));
    if (mode === 'upgrade') {
      await db.exec(`drop policy assignments_delete on public.assignments;
        create policy assignments_delete on public.assignments for delete to authenticated
        using (tutor_id = auth.uid() and coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false' and status = 'draft');`);
      await db.exec(sql('migrations/20261008_delete_assignments.sql'));
      await db.exec(sql('migrations/20261008_delete_assignments.sql'));
      await db.exec(sql('update.sql'));
    }
    await db.exec(`set request.jwt.claim.sub = '${tutor}'; set role authenticated;
      insert into public.papers(id,title,subject,school_year,subject_level,duration_minutes,questions_snapshot,status)
        values ('${paper}','Algebra','Mathematics',3,'G3',45,'[{"id":"q1"}]','reviewed');`);
    for (const n of [4, 5]) {
      await db.exec(`insert into public.classes(id,name,subject,school_year,subject_level)
        values ('${uuid(n)}','Maths ${n}','Mathematics',3,'G3');
        select public.publish_assignments('${paper}',array['${uuid(n)}'::uuid],now()+interval '7 days');
        select public.add_class_students('${uuid(n)}', array['${uuid(n + 2)}'::uuid]);`);
    }
    await db.exec(`reset role;
      insert into public.submissions(id,assignment_id,student_id,student_code)
        select s.id,a.id,s.id,s.student_code from public.assignments a
        join public.students s on s.class_id = a.class_id;
      update public.grading_jobs set status='awaiting_review', result='{}', review_draft='{}';`);
    const assignments = (await db.query('select * from public.assignments order by class_id')).rows;
    const target = assignments[0], kept = assignments[1];
    const keptSubmission = (await db.query('select * from public.submissions where assignment_id=$1', [kept.id])).rows;
    const keptGrading = (await db.query('select * from public.grading_jobs where submission_id=$1', [uuid(7)])).rows;
    const remove = id => db.query('delete from public.assignments where id=$1 returning id', [id]);

    await db.exec(`set request.jwt.claim.sub = '${otherTutor}'; set role authenticated;`);
    assert.equal((await remove(target.id)).rows.length, 0, 'Another tutor cannot delete the assignment');
    await db.exec(`reset role; set request.jwt.claim.sub = '${tutor}';
      set request.jwt.claims = '{"is_anonymous":true}'; set role authenticated;`);
    assert.equal((await remove(target.id)).rows.length, 0, 'Anonymous accounts cannot delete assignments');
    await db.exec(`reset role; set request.jwt.claims = '{}'; set role anon;`);
    await assert.rejects(remove(target.id), e => e.code === '42501');
    await db.exec('reset role; set role authenticated;');
    assert.deepEqual((await remove(target.id)).rows, [{ id: target.id }]);
    assert.equal((await remove(target.id)).rows.length, 0, 'Repeated deletion has no side effects');
    await db.exec('reset role;');
    assert.deepEqual((await db.query('select * from public.assignments')).rows, [kept]);
    assert.deepEqual((await db.query('select * from public.submissions')).rows, keptSubmission);
    assert.deepEqual((await db.query('select * from public.grading_jobs')).rows, keptGrading);
    assert.equal((await db.query('select count(*)::int n from public.papers')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from public.classes')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int n from public.students')).rows[0].n, 2);
    assert.equal((await db.query('select id from public.assignments where share_token=$1', [target.share_token])).rows.length, 0);

    await db.exec(`set role authenticated;
      select public.publish_assignments('${paper}',array['${uuid(4)}'::uuid],now()+interval '7 days');`);
    const replacement = (await db.query('select * from public.assignments where class_id=$1', [uuid(4)])).rows[0];
    assert.notEqual(replacement.id, target.id);
    assert.notEqual(replacement.share_token, target.share_token);
    await db.exec('reset role;');
    // Closed assignments must also be removable.
    await db.query("update public.assignments set status='closed' where id=$1", [replacement.id]);
    await db.exec('set role authenticated;');
    assert.equal((await remove(replacement.id)).rows.length, 1);
    // A second tutor's real data must never appear in the first tutor's list or
    // disappear when the first tutor removes a class or paper.
    await db.exec(`reset role; set request.jwt.claim.sub = '${otherTutor}'; set role authenticated;
      insert into public.classes(id,name,subject,school_year,subject_level)
        values ('${uuid(10)}','Other tutor class','Mathematics',3,'G3');
      insert into public.papers(id,title,subject,school_year,subject_level,duration_minutes,questions_snapshot,status)
        values ('${uuid(11)}','Other paper','Mathematics',3,'G3',45,'[{"id":"q1"}]','reviewed');
      select public.publish_assignments('${uuid(11)}',array['${uuid(10)}'::uuid],now()+interval '7 days');
      select public.add_class_students('${uuid(10)}',array['${uuid(12)}'::uuid]);
      reset role;
      insert into public.submissions(id,assignment_id,student_id,student_code)
        select s.id,a.id,s.id,s.student_code from public.assignments a
        join public.students s on s.class_id=a.class_id where s.id='${uuid(12)}';`);
    const otherAssignment = (await db.query('select * from public.assignments where tutor_id=$1', [otherTutor])).rows[0];
    const otherJob = (await db.query('select * from public.grading_jobs where submission_id=$1', [uuid(12)])).rows[0];
    await db.exec(`set request.jwt.claim.sub = '${tutor}'; set role authenticated;`);
    assert.deepEqual((await db.query('select id from public.list_assignments()')).rows, [{ id: kept.id }]);
    // Class deletion cascades even when assignments contain reviewed submissions.
    await db.query('delete from public.classes where id=$1', [uuid(5)]);
    assert.equal((await db.query('select * from public.list_assignments()')).rows.length, 0);
    await db.exec('reset role;');
    assert.equal((await db.query('select id from public.submissions where id=$1', [uuid(7)])).rows.length, 0);
    assert.equal((await db.query('select submission_id from public.grading_jobs where submission_id=$1', [uuid(7)])).rows.length, 0);
    assert.equal((await db.query('select id from public.papers where id=$1', [paper])).rows.length, 1);

    await db.exec(`set role authenticated;
      select public.publish_assignments('${paper}',array['${uuid(4)}'::uuid],now()+interval '7 days');
      reset role;
      insert into public.submissions(id,assignment_id,student_id,student_code)
        select s.id,a.id,s.id,s.student_code from public.assignments a
        join public.students s on s.class_id=a.class_id where s.id='${uuid(6)}';
      update public.grading_jobs set status='processing' where submission_id='${uuid(6)}';
      set role authenticated;
      delete from public.papers where id='${paper}';`);
    assert.equal((await db.query('select * from public.list_assignments()')).rows.length, 0);
    await db.exec('reset role;');
    assert.deepEqual((await db.query('select * from public.assignments')).rows, [otherAssignment]);
    assert.deepEqual((await db.query('select * from public.grading_jobs')).rows, [otherJob]);
    assert.equal((await db.query('select id from public.submissions where id=$1', [uuid(6)])).rows.length, 0);
    assert.equal((await db.query('select id from public.classes where id=$1', [uuid(4)])).rows.length, 1);
    assert.equal((await db.query('select id from public.students where id=$1', [uuid(6)])).rows.length, 1);
    // The API's owner-scoped service query also works on the original draft-only policy.
    await db.exec(`drop policy assignments_delete on public.assignments;
      create policy assignments_delete on public.assignments for delete to authenticated
        using (tutor_id=auth.uid() and status='draft');
      set role service_role;`);
    const serviceDelete = owner => db.query('delete from public.assignments where id=$1 and tutor_id=$2 returning id', [otherAssignment.id, owner]);
    assert.equal((await serviceDelete(tutor)).rows.length, 0);
    assert.equal((await serviceDelete(otherTutor)).rows.length, 1);
    assert.equal((await serviceDelete(otherTutor)).rows.length, 0);
    await db.exec('reset role;');
    assert.equal((await db.query('select * from public.submissions')).rows.length, 0);
    assert.equal((await db.query('select * from public.grading_jobs')).rows.length, 0);
    console.log(`${mode}: assignment/class/paper cascades, tutor-scoped lists, reassignment and legacy-policy API deletion passed`);
  } finally {
    await db.close();
  }
}
