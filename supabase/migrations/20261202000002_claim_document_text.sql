-- Claims one document for OCR atomically: creates its row if missing, then takes it only if it still needs
-- reading, has attempts left and is not being read right now (a claim older than 5 minutes is treated as dead).
-- Concurrent callers re-check the WHERE clause after the row lock, so only one of them gets the document.
create or replace function public.claim_document_text(p_document_id uuid, p_max_attempts int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed int;
begin
  insert into document_texts (document_id) values (p_document_id) on conflict (document_id) do nothing;
  update document_texts
     set claimed_at = now(), attempts = attempts + 1, status = 'pending'
   where document_id = p_document_id
     and status in ('pending', 'failed')
     and attempts < p_max_attempts
     and (claimed_at is null or claimed_at < now() - interval '5 minutes');
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

revoke execute on function public.claim_document_text(uuid, int) from public, anon, authenticated;
