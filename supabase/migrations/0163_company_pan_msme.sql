-- 0163 — A company's PAN and MSME (Udyam) number, printed on Birdwing invoices
--
-- Both live on the Masters company beside its GSTIN; the shape is checked in
-- lib/masters/companies-actions.ts, here only that nothing runs on.
-- birdwing_issue_invoice() is 0115's, unchanged but for the two columns its
-- snapshot takes, so an issued invoice keeps the PAN it was printed with.
--
-- Re-runnable throughout.

alter table companies add column if not exists pan text;
alter table companies add column if not exists msme_number text;

alter table companies drop constraint if exists companies_pan_length;
alter table companies add constraint companies_pan_length
  check (pan is null or length(pan) between 1 and 20);
alter table companies drop constraint if exists companies_msme_number_length;
alter table companies add constraint companies_msme_number_length
  check (msme_number is null or length(msme_number) between 1 and 40);

create or replace function birdwing_issue_invoice(
  p_stay_id uuid,
  p_bill_to_name text,
  p_bill_to_gstin text default null,
  p_bill_to_address text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stay record;
  v_existing text;
  v_settings record;
  v_company record;
  v_lines jsonb;
  v_total numeric;
  v_taxable numeric;
  v_gst numeric;
  v_no int;
  v_number text;
begin
  select s.id, s.ref, s.is_block, s.status, s.arrival, s.departure, s.discount,
         s.adults, s.children, g.name as guest_name, g.phone as guest_phone
    into v_stay
  from birdwing_stays s
  left join birdwing_guests g on g.id = s.guest_id
  where s.id = p_stay_id
  for update of s;

  if not found then
    raise exception 'That stay could not be found.';
  end if;
  if v_stay.is_block then
    raise exception 'A room block has nothing to invoice.';
  end if;

  select number into v_existing from birdwing_invoices
  where stay_id = p_stay_id and status = 'issued';
  if v_existing is not null then
    return v_existing;
  end if;

  if length(trim(coalesce(p_bill_to_name, ''))) = 0 then
    raise exception 'Say who the invoice is made out to.';
  end if;

  select * into v_settings from birdwing_settings where id;
  if v_settings.company_id is null then
    raise exception 'Choose the invoicing company in Birdwing → Settings before issuing an invoice.';
  end if;
  select id, name, legal_name, address, gstin, pan, msme_number, state, phone, email into v_company
  from companies where id = v_settings.company_id;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'head', c.head,
      'description', c.description,
      'sac', c.sac,
      'qty', c.qty,
      'rate', c.rate,
      'rate_includes_gst', c.rate_includes_gst,
      'gst_pct', c.gst_pct,
      'taxable', round(c.amount / (1 + c.gst_pct / 100), 2),
      'amount', c.amount
    ) order by c.sort_order, c.created_at), '[]'::jsonb),
    coalesce(sum(c.amount), 0),
    coalesce(sum(round(c.amount / (1 + c.gst_pct / 100), 2)), 0)
    into v_lines, v_total, v_taxable
  from birdwing_stay_charges c
  where c.stay_id = p_stay_id;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Add at least one charge before issuing the invoice.';
  end if;
  if v_stay.discount > v_total then
    raise exception 'The discount is more than the charges.';
  end if;

  v_gst := v_total - v_taxable;
  v_no := birdwing_mint('invoice');
  -- The founder's series (Maloor Eco Farms, Guest House), unpadded as on
  -- the invoices already sent.
  v_number := 'MEF/GH/' || v_no::text;

  insert into birdwing_invoices (
    stay_id, number, issued_on, issued_by, bill_to_name, bill_to_gstin, bill_to_address,
    taxable, cgst, sgst, total, discount, payable, snapshot, created_by, updated_by
  ) values (
    p_stay_id, v_number, current_date, auth.uid(), trim(p_bill_to_name),
    nullif(trim(coalesce(p_bill_to_gstin, '')), ''),
    nullif(trim(coalesce(p_bill_to_address, '')), ''),
    v_taxable, round(v_gst / 2, 2), v_gst - round(v_gst / 2, 2), v_total,
    v_stay.discount, v_total - v_stay.discount,
    jsonb_build_object(
      'lines', v_lines,
      'company', to_jsonb(v_company),
      'place_of_supply', v_settings.place_of_supply,
      'bank_details', v_settings.bank_details,
      'upi_id', v_settings.upi_id,
      'terms', v_settings.invoice_terms,
      'stay', jsonb_build_object(
        'ref', v_stay.ref, 'arrival', v_stay.arrival, 'departure', v_stay.departure,
        'guests', v_stay.adults + v_stay.children,
        'guest_name', v_stay.guest_name, 'guest_phone', v_stay.guest_phone
      )
    ),
    auth.uid(), auth.uid()
  );

  return v_number;
end $$;

revoke execute on function birdwing_issue_invoice(uuid, text, text, text) from public, anon;
grant execute on function birdwing_issue_invoice(uuid, text, text, text) to authenticated;

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'companies'
         and column_name in ('pan', 'msme_number')) <> 2 then
    raise exception '0163: companies is missing pan or msme_number';
  end if;
  if position('msme_number' in pg_get_functiondef(
       'birdwing_issue_invoice(uuid, text, text, text)'::regprocedure)) = 0 then
    raise exception '0163: birdwing_issue_invoice does not snapshot the new columns';
  end if;
  if has_function_privilege('anon', 'birdwing_issue_invoice(uuid, text, text, text)', 'execute') then
    raise exception '0163: anon can run birdwing_issue_invoice';
  end if;
  if (select prosecdef from pg_proc
       where oid = 'birdwing_issue_invoice(uuid, text, text, text)'::regprocedure) then
    raise exception '0163: birdwing_issue_invoice became security definer';
  end if;
end $$;
