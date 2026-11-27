-- Text read from scanned evidence by OCR (soma-OCR). Staff-only, written by the server (service role) only.

create table public.document_texts (
  document_id uuid primary key references public.documents (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'skipped')),
  text text,
  page_count int,
  confidence numeric(5, 1),
  engine text,
  error text,
  attempts int not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_texts_status_idx on public.document_texts (status);

alter table public.document_texts enable row level security;

-- Same rule as documents: every staff role (officers, admins, commissioners) may read. No client writes.
create policy staff_read_document_texts on public.document_texts
  for select to authenticated
  using (public.staff_role() is not null);

create or replace function public.touch_document_texts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger document_texts_touch before update on public.document_texts
  for each row execute function public.touch_document_texts();

-- Audit without the text: the audit log is immutable, so OCR text must never be copied into it.
create or replace function public.audit_document_text_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_id text := coalesce(new.document_id, old.document_id)::text;
  summary_old jsonb := case when old is null then null
    else jsonb_build_object('status', old.status, 'attempts', old.attempts, 'confidence', old.confidence,
                            'page_count', old.page_count, 'error', old.error) end;
  summary_new jsonb := case when new is null then null
    else jsonb_build_object('status', new.status, 'attempts', new.attempts, 'confidence', new.confidence,
                            'page_count', new.page_count, 'error', new.error) end;
begin
  insert into audit_log (actor_id, actor_channel, action, entity, entity_id, details)
  values (
    auth.uid(),
    'db',
    lower(tg_op),
    tg_table_name,
    rec_id,
    case tg_op
      when 'UPDATE' then jsonb_build_object('old', summary_old, 'new', summary_new)
      when 'INSERT' then jsonb_build_object('new', summary_new)
      else jsonb_build_object('old', summary_old) end
  );
  return coalesce(new, old);
end;
$$;

create trigger document_texts_audit after insert or update or delete on public.document_texts
  for each row execute function public.audit_document_text_change();
