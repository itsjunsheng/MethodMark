// Run against isolated in-memory Postgres: node supabase/tests/result_release.mjs [path-to-pglite-module]
// Requires @electric-sql/pglite in the module search path, or an explicit module path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const setup = readFileSync(new URL('../setup.sql', import.meta.url), 'utf8');
const update = readFileSync(new URL('../update.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20261008_result_release.sql', import.meta.url), 'utf8');
const uuid = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tutor = uuid(1), otherTutor = uuid(2), classId = uuid(3), paperId = uuid(4), work = uuid(10), unsent = uuid(11);
const review = score => ({ questions: [{ question_id: 'q1', parts: [{ part_id: 'main', checked: true, feedback: 'Check the root.',
  points: [{ point_id: 'm1', awarded: 1 }, { point_id: 'a1', awarded: score }] }] }] });

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
    await db.exec(setup);
    if (mode === 'upgrade') {
      // Recreate the schema before result release.
      await db.exec(`
        drop function public.release_result(uuid, uuid, integer, jsonb);
        drop function public.reopen_result(uuid, uuid, integer);
        drop trigger grading_jobs_log_review on public.grading_jobs;
        drop function public.methodmark_log_review();
        drop table public.review_events; drop table public.results;
        alter table public.grading_jobs drop column reviewed_by;
        alter table public.grading_jobs drop constraint grading_jobs_status_check;
        alter table public.grading_jobs add constraint grading_jobs_status_check
          check (status in ('submitted','queued','processing','awaiting_review','failed'));
      `);
    }
    await db.exec(`
      set request.jwt.claim.sub = '${tutor}'; set role authenticated;
      insert into public.classes(id,name,subject,school_year,subject_level) values ('${classId}','Maths','Mathematics',3,'G3');
      insert into public.papers(id,title,subject,school_year,subject_level,duration_minutes,questions_snapshot,status)
        values ('${paperId}','Algebra','Mathematics',3,'G3',45,'[{"id":"q1"}]','reviewed');
      select public.publish_assignments('${paperId}',array['${classId}'::uuid],now()+interval '7 days');
      select public.add_class_students('${classId}', array['${work}'::uuid, '${unsent}'::uuid]);
      reset role;
      insert into public.submissions(id,assignment_id,student_id,student_code)
        select s.id,a.id,s.id,s.student_code from public.assignments a
        join public.students s on s.class_id = a.class_id;
      update public.grading_jobs set status='awaiting_review', result='{"questions":[]}', version=4
        where submission_id='${work}';
    `);
    const before = (await db.query('select * from public.grading_jobs order by submission_id')).rows;
    if (mode === 'upgrade') {
      await db.exec(migration);
      await db.exec(migration);
      await db.exec(update);
      const after = (await db.query('select * from public.grading_jobs order by submission_id')).rows;
      assert.deepEqual(after.map(({ reviewed_by, ...row }) => row), before, 'Existing jobs survive the upgrade');
    }
    const one = async (sql, params) => (await db.query(sql, params)).rows[0];
    const events = async () => (await db.query(
      'select action, tutor_id, review from public.review_events order by id')).rows;

    // Saving a draft is logged with the tutor who saved it.
    await db.query('update public.grading_jobs set review_draft=$1, reviewed_by=$2, version=5 where submission_id=$3',
      [review(0), tutor, work]);
    assert.deepEqual(await events(), [{ action: 'draft_saved', tutor_id: tutor, review: review(0) }]);

    // Only the service role can release or reopen, and only for the owning tutor at the current version.
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set request.jwt.claim.sub = '${tutor}'; set role ${role}`);
      await assert.rejects(db.query('select public.release_result($1,$2,5,$3)', [work, tutor, review(1)]), e => e.code === '42501');
      await assert.rejects(db.query('select public.reopen_result($1,$2,5)', [work, tutor]), e => e.code === '42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const release = (submission, owner, version, value) =>
      one('select public.release_result($1,$2,$3,$4) as r', [submission, owner, version, value]).then(row => row.r);
    assert.equal(await release(work, otherTutor, 5, review(1)), null, 'Another tutor cannot release this result');
    assert.equal(await release(work, tutor, 4, review(1)), null, 'A stale version cannot release');
    assert.equal(await release(unsent, tutor, 0, review(1)), null, 'Work that was never marked cannot be released');
    assert.equal((await db.query('select * from public.results')).rows.length, 0);
    const first = await release(work, tutor, 5, review(1));
    assert.equal(first.version, 6);
    let job = await one('select status, review_draft, reviewed_by, version from public.grading_jobs where submission_id=$1', [work]);
    assert.deepEqual(job, { status: 'released', review_draft: review(1), reviewed_by: tutor, version: 6 });
    let result = await one('select review, released_by, release_count from public.results where submission_id=$1', [work]);
    assert.deepEqual(result, { review: review(1), released_by: tutor, release_count: 1 });
    assert.deepEqual((await events()).map(row => row.action), ['draft_saved', 'released'], 'Release logs once, not as a draft');
    assert.equal(await release(work, tutor, 6, review(0)), null, 'A released result must be reopened before it changes');

    // Reopening keeps the student's last released result until the tutor releases again.
    const reopen = (owner, version) => one('select public.reopen_result($1,$2,$3) as r', [work, owner, version]).then(row => row.r);
    assert.equal(await reopen(otherTutor, 6), null);
    assert.equal(await reopen(tutor, 5), null);
    assert.deepEqual(await reopen(tutor, 6), { version: 7 });
    assert.equal(await reopen(tutor, 7), null, 'Only released results can be reopened');
    job = await one('select status from public.grading_jobs where submission_id=$1', [work]);
    assert.equal(job.status, 'awaiting_review');
    assert.deepEqual((await one('select review from public.results where submission_id=$1', [work])).review, review(1));
    assert.equal((await release(work, tutor, 7, review(0))).version, 8);
    result = await one('select review, release_count from public.results where submission_id=$1', [work]);
    assert.deepEqual(result, { review: review(0), release_count: 2 });
    assert.deepEqual((await events()).map(row => row.action), ['draft_saved', 'released', 'reopened', 'released']);

    // The audit trail is append-only, even for the backend.
    await assert.rejects(db.query('update public.review_events set action=$1', ['released']), e => e.code === '42501');
    await assert.rejects(db.query('delete from public.review_events'), e => e.code === '42501');
    await assert.rejects(db.query('delete from public.results'), e => e.code === '42501');
    await db.exec('reset role');

    // Tutors read only their own results and audit records; students and other tutors read none.
    for (const [owner, role, count] of [[tutor, 'authenticated', 1], [otherTutor, 'authenticated', 0], [tutor, 'anon', null]]) {
      await db.exec(`set request.jwt.claim.sub = '${owner}'; set role ${role}`);
      for (const table of ['results', 'review_events']) {
        if (count === null) {
          await assert.rejects(db.query(`select * from public.${table}`), e => e.code === '42501');
        } else {
          assert.equal((await db.query(`select distinct submission_id from public.${table}`)).rows.length, count);
        }
      }
      if (role === 'authenticated') {
        await assert.rejects(db.query('insert into public.results(submission_id,review,released_by) values ($1,$2,$3)',
          [unsent, review(1), owner]), e => e.code === '42501');
        await assert.rejects(db.query('update public.results set review=$1', [review(1)]), e => e.code === '42501');
      }
      await db.exec('reset role');
    }

    // Deleting the assignment removes its results and audit records with the submission.
    await db.exec(`set request.jwt.claim.sub = '${tutor}'; set role authenticated;
      delete from public.assignments; reset role;`);
    for (const table of ['results', 'review_events', 'grading_jobs']) {
      assert.equal((await one(`select count(*)::int n from public.${table}`)).n, 0, table + ' cascade');
    }
    console.log(`${mode}: release, reopen, ownership, versioning, audit trail, read access and deletion cascades passed`);
  } finally {
    await db.close();
  }
}
