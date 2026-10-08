-- Allow tutors to remove their own assignments in any status.
-- Existing foreign keys delete the assignment's submissions and grading jobs.
begin;

drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments for delete to authenticated
using (tutor_id = (select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

commit;
