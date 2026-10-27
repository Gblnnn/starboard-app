-- Calculate reimbursement entitlement per submission after applying the
-- custodian's opening balance and received petty-cash funding.
CREATE OR REPLACE VIEW public.v_petty_cash_reimbursement_due AS
WITH active_assignments AS (
  SELECT project_code, emp_id, GREATEST(0, op_balance) AS op_balance
  FROM public.pettycash_user
  WHERE active = TRUE
),
funding AS (
  SELECT
    r.project_code,
    r.emp_id,
    COALESCE(SUM(p.payment_amount), 0) AS total_funding
  FROM public.petty_cash_request r
  JOIN public.petty_cash_request_payment p ON p.request_id = r.id
  WHERE r.status IN ('approved','partially_paid','fully_paid')
  GROUP BY r.project_code, r.emp_id
),
approved_submissions AS (
  SELECT
    s.id AS submission_id,
    s.submission_number,
    s.submission_date,
    s.petty_cash_approval_date,
    s.project_code,
    s.emp_id,
    COALESCE(SUM(COALESCE(t.fin_approved_amount, t.approved_amount, t.exp_amount)), 0) AS approved_amount
  FROM public.petty_cash_submission s
  JOIN public.petty_cash_transaction t ON t.submission_id = s.id
  WHERE s.status = 'approved'
  GROUP BY s.id
),
running_expenses AS (
  SELECT
    s.*,
    a.op_balance + COALESCE(f.total_funding, 0) AS available_funds,
    SUM(s.approved_amount) OVER (
      PARTITION BY s.project_code, s.emp_id
      ORDER BY s.petty_cash_approval_date, s.submission_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_approved
  FROM approved_submissions s
  JOIN active_assignments a
    ON a.project_code = s.project_code AND a.emp_id = s.emp_id
  LEFT JOIN funding f
    ON f.project_code = s.project_code AND f.emp_id = s.emp_id
),
submission_entitlement AS (
  SELECT
    r.*,
    GREATEST(0, r.cumulative_approved - r.available_funds)
      - GREATEST(0, r.cumulative_approved - r.approved_amount - r.available_funds)
      AS approved_reimbursement_amount
  FROM running_expenses r
),
submission_payments AS (
  SELECT submission_id, COALESCE(SUM(payment_amount), 0) AS reimbursement_paid
  FROM public.petty_cash_reimbursement_payment
  GROUP BY submission_id
)
SELECT
  e.submission_id,
  e.submission_number,
  e.submission_date,
  e.petty_cash_approval_date,
  e.project_code,
  e.emp_id,
  e.approved_reimbursement_amount,
  COALESCE(p.reimbursement_paid, 0) AS reimbursement_paid,
  GREATEST(0, e.approved_reimbursement_amount - COALESCE(p.reimbursement_paid, 0))
    AS outstanding_reimbursement
FROM submission_entitlement e
LEFT JOIN submission_payments p ON p.submission_id = e.submission_id;

CREATE OR REPLACE VIEW public.v_petty_cash_balance AS
WITH assignments AS (
  SELECT id, project_code, emp_id, op_balance, op_date, active
  FROM public.pettycash_user
  WHERE active = TRUE
),
payments AS (
  SELECT
    r.project_code,
    r.emp_id,
    COALESCE(SUM(p.payment_amount), 0) AS total_funding
  FROM public.petty_cash_request r
  JOIN public.petty_cash_request_payment p ON p.request_id = r.id
  WHERE r.status IN ('approved','partially_paid','fully_paid')
  GROUP BY r.project_code, r.emp_id
),
approved_expenses AS (
  SELECT
    t.project_code,
    t.emp_id,
    COALESCE(SUM(COALESCE(t.fin_approved_amount, t.approved_amount, t.exp_amount)), 0) AS total_approved_expenses
  FROM public.petty_cash_transaction t
  JOIN public.petty_cash_submission s ON s.id = t.submission_id
  WHERE s.status = 'approved'
  GROUP BY t.project_code, t.emp_id
),
pending_expenses AS (
  SELECT
    t.project_code,
    t.emp_id,
    COALESCE(SUM(t.exp_amount), 0) AS total_pending_expenses
  FROM public.petty_cash_transaction t
  JOIN public.petty_cash_submission s ON s.id = t.submission_id
  WHERE s.status IN ('draft','pending_petty_cash_approval','pending_finance_approval','returned_for_correction')
  GROUP BY t.project_code, t.emp_id
),
reimbursement_totals AS (
  SELECT
    project_code,
    emp_id,
    COALESCE(SUM(approved_reimbursement_amount), 0) AS total_reimbursable,
    COALESCE(SUM(reimbursement_paid), 0) AS total_reimbursement_paid,
    COALESCE(SUM(outstanding_reimbursement), 0) AS total_outstanding
  FROM public.v_petty_cash_reimbursement_due
  GROUP BY project_code, emp_id
),
approved_funding_unpaid AS (
  SELECT
    r.project_code,
    r.emp_id,
    COALESCE(SUM(r.approved_amount), 0)
      - COALESCE(SUM(paid.total_paid), 0) AS awaiting_payment
  FROM public.petty_cash_request r
  LEFT JOIN (
    SELECT request_id, SUM(payment_amount) AS total_paid
    FROM public.petty_cash_request_payment
    GROUP BY request_id
  ) paid ON paid.request_id = r.id
  WHERE r.status IN ('approved','partially_paid')
  GROUP BY r.project_code, r.emp_id
)
SELECT
  a.project_code,
  a.emp_id,
  a.active,
  a.op_balance,
  COALESCE(p.total_funding, 0) AS total_funding_received,
  COALESCE(ae.total_approved_expenses, 0) AS total_approved_expenses,
  a.op_balance
    + COALESCE(p.total_funding, 0)
    - COALESCE(ae.total_approved_expenses, 0) AS available_balance,
  COALESCE(pe.total_pending_expenses, 0) AS pending_expense_claims,
  COALESCE(rt.total_reimbursable, 0) AS approved_reimbursement_payable,
  COALESCE(rt.total_reimbursement_paid, 0) AS reimbursement_paid,
  COALESCE(rt.total_outstanding, 0) AS outstanding_reimbursement,
  COALESCE(afu.awaiting_payment, 0) AS approved_funding_awaiting_payment
FROM assignments a
LEFT JOIN payments p
  ON p.project_code = a.project_code AND p.emp_id = a.emp_id
LEFT JOIN approved_expenses ae
  ON ae.project_code = a.project_code AND ae.emp_id = a.emp_id
LEFT JOIN pending_expenses pe
  ON pe.project_code = a.project_code AND pe.emp_id = a.emp_id
LEFT JOIN reimbursement_totals rt
  ON rt.project_code = a.project_code AND rt.emp_id = a.emp_id
LEFT JOIN approved_funding_unpaid afu
  ON afu.project_code = a.project_code AND afu.emp_id = a.emp_id;

CREATE OR REPLACE FUNCTION public.pc_record_reimbursement_payment(
  p_submission_id bigint,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_reference text,
  p_recorded_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission public.petty_cash_submission%ROWTYPE;
  v_assignment_id bigint;
  v_outstanding numeric(12,3);
  v_payment_id bigint;
BEGIN
  SELECT * INTO v_submission
  FROM public.petty_cash_submission
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND OR v_submission.status <> 'approved' THEN
    RAISE EXCEPTION 'Submission % is not approved for reimbursement', p_submission_id;
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.pettycash_user
  WHERE project_code = v_submission.project_code
    AND emp_id = v_submission.emp_id
    AND active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active petty cash assignment found for submission %', p_submission_id;
  END IF;

  IF p_payment_amount IS NULL OR p_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT outstanding_reimbursement INTO v_outstanding
  FROM public.v_petty_cash_reimbursement_due
  WHERE submission_id = p_submission_id;

  IF NOT FOUND OR v_outstanding <= 0 THEN
    RAISE EXCEPTION 'Submission % has no outstanding reimbursement', p_submission_id;
  END IF;

  IF p_payment_amount > v_outstanding THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding reimbursement of % for submission %',
      p_payment_amount, v_outstanding, p_submission_id;
  END IF;

  INSERT INTO public.petty_cash_reimbursement_payment
    (submission_id, project_code, emp_id, payment_amount, payment_date, payment_reference, recorded_by)
  VALUES
    (p_submission_id, v_submission.project_code, v_submission.emp_id, p_payment_amount, p_payment_date, p_payment_reference, p_recorded_by)
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'submission_id', p_submission_id,
    'payment_amount', p_payment_amount,
    'outstanding_reimbursement', v_outstanding - p_payment_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pc_record_reimbursement_payment(bigint,numeric,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pc_record_reimbursement_payment(bigint,numeric,date,text,text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.petty_cash_reimbursement_payment FROM authenticated;
GRANT SELECT ON public.petty_cash_reimbursement_payment TO authenticated;
GRANT SELECT ON public.v_petty_cash_reimbursement_due TO authenticated;
