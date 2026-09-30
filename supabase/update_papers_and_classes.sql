-- Existing database only. Fresh databases use setup.sql.
begin;

alter table public.classes add column if not exists color text not null default
    (array['sage','blue','lavender','rose','peach','sand'])[1 + floor(random() * 6)::integer]
    check (color in ('sage','blue','lavender','rose','peach','sand'));

alter table public.papers add column if not exists color text not null default
    (array['sage','blue','lavender','rose','peach','sand'])[1 + floor(random() * 6)::integer]
    check (color in ('sage','blue','lavender','rose','peach','sand'));

-- Keep assignment snapshots when removing papers from the library.
alter table public.papers add column if not exists is_deleted boolean not null default false;

grant update(color) on public.classes to authenticated;

-- Deleted papers cannot be assigned to new classes.
create or replace function public.publish_assignments(
    p_paper_id uuid, p_class_ids uuid[], p_due_at timestamptz
)
returns setof public.assignments
language plpgsql security invoker set search_path = '' as $$
declare
    paper_state text;
begin
    if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false' then
        raise exception 'Please log in.' using errcode = '42501';
    end if;
    if p_class_ids is null or cardinality(p_class_ids) not between 1 and 50
        or array_position(p_class_ids, null) is not null
        or cardinality(p_class_ids) <> (select count(distinct id) from unnest(p_class_ids) id) then
        raise exception 'Choose between 1 and 50 classes.' using errcode = '22023';
    end if;
    select status into paper_state from public.papers
    where id = p_paper_id and tutor_id = auth.uid() and not is_deleted for update;
    if not found or paper_state not in ('reviewed', 'published') then
        raise exception 'Save and review the paper before publishing.' using errcode = '22023';
    end if;
    perform id from public.classes
    where id = any(p_class_ids) and tutor_id = auth.uid() and not is_archived
    order by id for no key update;
    if (select count(*) from public.classes
        where id = any(p_class_ids) and tutor_id = auth.uid() and not is_archived) <> cardinality(p_class_ids) then
        raise exception 'One or more classes are unavailable.' using errcode = '42501';
    end if;
    if (p_due_at is null or p_due_at <= now()) and exists (
        select 1 from unnest(p_class_ids) requested(class_id) where not exists (
            select 1 from public.assignments a
            where a.class_id = requested.class_id and a.paper_id = p_paper_id and a.status <> 'draft'
        )
    ) then
        raise exception 'Choose a future submission deadline.' using errcode = '22023';
    end if;
    if paper_state = 'reviewed' then
        update public.papers set status = 'published' where id = p_paper_id;
    end if;
    insert into public.assignments(class_id, paper_id, status, due_at)
    select id, p_paper_id, 'published', p_due_at from unnest(p_class_ids) id
    on conflict (class_id, paper_id) do update
    set status = 'published', due_at = excluded.due_at
    where public.assignments.status = 'draft';

    return query select cp.* from public.assignments cp
    where cp.paper_id = p_paper_id and cp.class_id = any(p_class_ids);
end;
$$;
revoke all on function public.publish_assignments(uuid, uuid[], timestamptz)
    from public, anon, authenticated;
grant execute on function public.publish_assignments(uuid, uuid[], timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
