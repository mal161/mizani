-- Synthetic demo data only. No real persons.

insert into public.settings (key, value) values
  ('advocate_response_days', '14'),
  ('ai_enabled', 'true')
on conflict (key) do nothing;

-- Synthetic advocates roll (60 entries) built from name parts.
with firsts as (
  select unnest(array['Amani','Baraka','Chebet','Daudi','Esther','Faith','Gitau','Halima',
                      'Imani','Jabali','Kamau','Leila','Mwangi','Njeri','Otieno','Pendo',
                      'Rehema','Saitoti','Tumaini','Wanjiru']) as f
), lasts as (
  select unnest(array['Achieng','Kiprono','Mutua']) as l
), combos as (
  select f, l, row_number() over (order by f, l) as n from firsts, lasts
)
insert into public.advocates (admission_no, full_name, phone, email, firm)
select
  format('P.105/%s/%s', 1000 + n, 2005 + (n % 18)),
  f || ' ' || l,
  format('+2547990%05s', n),
  lower(f || '.' || l || n || '@demo-advocates.test'),
  (array['Haki & Co. Advocates','Uadilifu LLP','Mizani Chambers (Demo)','Sheria Partners',
         'Nuru Advocates'])[1 + (n % 5)::int]
from combos
on conflict (admission_no) do nothing;
