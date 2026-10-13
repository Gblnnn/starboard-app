create or replace function public.assert_shift_employee_project(
  target_project_code text,
  target_employee_code text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not exists (
    select 1
    from public.employees e
    where e.emp_id::text = target_employee_code
  ) or not exists (
    select 1
    from public.projects p
    where p.project_code::text = target_project_code
  ) then
    raise exception 'Employee or project was not found.';
  end if;

  if not exists (
    select 1
    from public.v_employee_latest_project latest
    where latest.emp_id::text = target_employee_code
      and latest.project_code::text = target_project_code
  ) then
    raise exception 'Employee is not assigned to this project.';
  end if;
end;
$function$;
