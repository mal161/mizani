-- Deactivated staff lose data access immediately, not when their access token expires.
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
    from profiles p
   where p.id = auth.uid()
     and p.active
     and p.role in ('staff', 'admin', 'commissioner')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
