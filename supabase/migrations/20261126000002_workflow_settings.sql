insert into public.settings (key, value) values
  ('sla_days', '{"received":3,"screening":7,"advocate_notified":14,"investigation":30,"conciliation":21,"hearing":14,"decision":14}'),
  ('conciliation_enabled', 'true'),
  ('stage_labels', '{"en":{},"sw":{}}'),
  ('categories', '["withheld_funds","negligence","delay","misconduct","overcharging","conflict_of_interest","other"]')
on conflict (key) do nothing;
