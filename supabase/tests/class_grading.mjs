// Run against isolated in-memory Postgres: node supabase/tests/class_grading.mjs [path-to-pglite-module]
// Requires @electric-sql/pglite in the module search path, or an explicit module path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const setup = readFileSync(new URL('../setup.sql', import.meta.url), 'utf8');
const update = readFileSync(new URL('../update.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20261008_manual_class_grading.sql', import.meta.url), 'utf8');
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tutor = uuid(1), otherTutor = uuid(2), firstClass = uuid(3), secondClass = uuid(4), otherClass = uuid(5);

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
      // Recreate the previous grading schema before inserting existing work.
      await db.exec(`
        drop function public.send_class_for_grading(uuid, uuid);
        alter table public.grading_jobs alter column status set default 'queued';
        alter table public.grading_jobs drop constraint grading_jobs_status_check;
        alter table public.grading_jobs add constraint grading_jobs_status_check
          check (status in ('queued','processing','awaiting_review','failed'));
        create or replace function public.methodmark_enqueue_grading()
        returns trigger language plpgsql security definer set search_path = '' as $$
        begin
          insert into public.grading_jobs(submission_id) values (new.id) on conflict do nothing;
          return new;
        end;
        $$;
      `);
    }
    for (const [classId, owner, paperId] of [[firstClass, tutor, uuid(6)], [secondClass, tutor, uuid(7)], [otherClass, otherTutor, uuid(8)]]) {
      await db.exec(`
        set request.jwt.claim.sub = '${owner}'; set role authenticated;
        insert into public.classes(id,name,subject,school_year,subject_level)
          values ('${classId}','Maths','Mathematics',3,'G3');
        insert into public.papers(id,title,subject,school_year,subject_level,duration_minutes,questions_snapshot,status)
          values ('${paperId}','Algebra','Mathematics',3,'G3',45,'[{"id":"q1"}]','reviewed');
        select public.publish_assignments('${paperId}',array['${classId}'::uuid],now()+interval '7 days');
        reset role;
      `);
    }
    async function submit(classId, owner, studentId) {
      await db.exec(`
        set request.jwt.claim.sub = '${owner}'; set role authenticated;
        select public.add_class_students('${classId}', array['${studentId}'::uuid]);
        reset role;
        insert into public.submissions(id,assignment_id,student_id,student_code)
          select '${studentId}',a.id,s.id,s.student_code from public.assignments a
          join public.students s on s.class_id = a.class_id where s.id = '${studentId}';
      `);
    }
    // Preserve an existing reviewed job through the upgrade and repeated migrations.
    await submit(firstClass, tutor, uuid(10));
    await db.exec(`update public.grading_jobs set status='awaiting_review', result='{}', review_draft='{}', version=9`);
    const oldJob = (await db.query('select * from public.grading_jobs')).rows;
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(update);
    assert.deepEqual((await db.query('select * from public.grading_jobs')).rows, oldJob);
    for (let i = 11; i <= 16; i++) await submit(firstClass, tutor, uuid(i));
    await submit(secondClass, tutor, uuid(17));
    await submit(otherClass, otherTutor, uuid(18));
    assert.equal((await db.query("select count(*)::int n from public.grading_jobs where status='submitted'")).rows[0].n, 8);
    await db.exec('set role service_role');
    assert.equal((await db.query('select * from public.claim_grading_job()')).rows.length, 0, 'Unsent work cannot be claimed');
    await db.exec('reset role');
    for (const [number, status] of [[13, 'queued'], [14, 'processing'], [15, 'awaiting_review'], [16, 'failed']]) {
      await db.query('update public.grading_jobs set status=$1 where submission_id=$2', [status, uuid(number)]);
    }
    const protectedJobs = (await db.query("select * from public.grading_jobs where status <> 'submitted' order by submission_id")).rows;
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select public.send_class_for_grading($1,$2)', [firstClass, tutor]), e => e.code === '42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const send = async (cls, owner) => (await db.query('select public.send_class_for_grading($1,$2) n', [cls, owner])).rows[0].n;
    assert.equal(await send(firstClass, otherTutor), 0, 'Another tutor cannot send this class');
    assert.equal(await send(firstClass, tutor), 2);
    assert.equal(await send(firstClass, tutor), 0, 'Repeated sends do not duplicate grading');
    const remaining = (await db.query("select submission_id from public.grading_jobs where status='submitted' order by submission_id")).rows;
    assert.deepEqual(remaining.map(row => row.submission_id), [uuid(17), uuid(18)]);
    for (const original of protectedJobs) {
      assert.deepEqual((await db.query('select * from public.grading_jobs where submission_id=$1', [original.submission_id])).rows[0], original);
    }
    const claims = (await db.query('select * from public.claim_grading_job()')).rows;
    assert.equal(claims.length, 1);
    assert.equal(claims[0].status, 'processing');
    assert.ok([uuid(11), uuid(12), uuid(13)].includes(claims[0].submission_id));
    while ((await db.query('select * from public.claim_grading_job()')).rows.length) {
      // Drain only the work already sent by the tutor.
    }
    await db.exec('reset role');
    await submit(firstClass, tutor, uuid(19));
    await db.exec('set role service_role');
    assert.equal((await db.query('select * from public.claim_grading_job()')).rows.length, 0,
      'A later student submission must wait for another tutor send, even after this class was sent before');
    assert.equal(await send(firstClass, tutor), 1, 'Later submissions can be sent separately');
    assert.equal((await db.query('select * from public.claim_grading_job()')).rows[0].submission_id, uuid(19),
      'Only the tutor send action makes the new work available to the grading worker');
    console.log(`${mode}: migration, submission trigger, ownership, class isolation, idempotency and worker claiming passed`);
  } finally {
    await db.close();
  }
}
