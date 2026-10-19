-- Submissions already approved by the petty-cash approver no longer require a second finance approval.
UPDATE public.petty_cash_transaction AS t
SET approved_amount = COALESCE(t.approved_amount, t.exp_amount),
    fin_approved_amount = COALESCE(
      t.fin_approved_amount,
      t.approved_amount,
      t.exp_amount
    ),
    updated_at = now()
FROM public.petty_cash_submission AS s
WHERE s.id = t.submission_id
  AND s.status = 'pending_finance_approval';

UPDATE public.petty_cash_submission
SET status = 'approved',
    petty_cash_approval_date = COALESCE(petty_cash_approval_date, fin_approval_date, now()),
    updated_at = now()
WHERE status = 'pending_finance_approval';
