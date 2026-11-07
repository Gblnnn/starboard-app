ALTER TABLE public.pettycash_user
  ADD COLUMN IF NOT EXISTS verifier_id text;

ALTER TABLE public.petty_cash_request
  ADD COLUMN IF NOT EXISTS verifier_id text,
  ADD COLUMN IF NOT EXISTS verified_amount numeric(12,3),
  ADD COLUMN IF NOT EXISTS verified_date timestamptz,
  ADD COLUMN IF NOT EXISTS verifier_remarks text;

ALTER TABLE public.petty_cash_submission
  ADD COLUMN IF NOT EXISTS verifier_id text,
  ADD COLUMN IF NOT EXISTS verified_amount numeric(12,3),
  ADD COLUMN IF NOT EXISTS verified_date timestamptz,
  ADD COLUMN IF NOT EXISTS verifier_remarks text;

ALTER TABLE public.petty_cash_transaction
  ADD COLUMN IF NOT EXISTS verified_amount numeric(12,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pettycash_user_verifier_id_fkey') THEN
    ALTER TABLE public.pettycash_user
      ADD CONSTRAINT pettycash_user_verifier_id_fkey
      FOREIGN KEY (verifier_id) REFERENCES public.employees (emp_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_request_verifier_id_fkey') THEN
    ALTER TABLE public.petty_cash_request
      ADD CONSTRAINT petty_cash_request_verifier_id_fkey
      FOREIGN KEY (verifier_id) REFERENCES public.employees (emp_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_submission_verifier_id_fkey') THEN
    ALTER TABLE public.petty_cash_submission
      ADD CONSTRAINT petty_cash_submission_verifier_id_fkey
      FOREIGN KEY (verifier_id) REFERENCES public.employees (emp_id);
  END IF;
END $$;

ALTER TABLE public.petty_cash_request
  DROP CONSTRAINT IF EXISTS petty_cash_request_verified_amount_check,
  ADD CONSTRAINT petty_cash_request_verified_amount_check
    CHECK (verified_amount IS NULL OR (verified_amount >= 0 AND verified_amount <= request_amount)),
  DROP CONSTRAINT IF EXISTS petty_cash_request_status_check,
  ADD CONSTRAINT petty_cash_request_status_check
    CHECK (status IN ('draft','pending_verification','pending_approval','approved','rejected',
                      'partially_paid','fully_paid','cancelled'));

ALTER TABLE public.petty_cash_submission
  DROP CONSTRAINT IF EXISTS petty_cash_submission_verified_amount_check,
  ADD CONSTRAINT petty_cash_submission_verified_amount_check
    CHECK (verified_amount IS NULL OR verified_amount >= 0),
  DROP CONSTRAINT IF EXISTS petty_cash_submission_status_check,
  ADD CONSTRAINT petty_cash_submission_status_check
    CHECK (status IN ('draft','pending_verification','pending_petty_cash_approval',
                      'pending_finance_approval','approved','rejected',
                      'returned_for_correction','cancelled'));

ALTER TABLE public.petty_cash_transaction
  DROP CONSTRAINT IF EXISTS petty_cash_transaction_verified_amount_check,
  ADD CONSTRAINT petty_cash_transaction_verified_amount_check
    CHECK (verified_amount IS NULL OR (verified_amount >= 0 AND verified_amount <= exp_amount));

CREATE OR REPLACE VIEW public.v_petty_cash_balance AS
WITH assignments AS (
  SELECT id, project_code, emp_id, op_balance, op_date, active
  FROM public.pettycash_user
  WHERE active = TRUE
),
payments AS (
  SELECT r.project_code, r.emp_id, COALESCE(SUM(p.payment_amount), 0) AS total_funding
  FROM public.petty_cash_request r
  JOIN public.petty_cash_request_payment p ON p.request_id = r.id
  WHERE r.status IN ('approved','partially_paid','fully_paid')
  GROUP BY r.project_code, r.emp_id
),
approved_expenses AS (
  SELECT t.project_code, t.emp_id,
         COALESCE(SUM(COALESCE(t.fin_approved_amount, t.approved_amount, t.exp_amount)), 0) AS total_approved_expenses
  FROM public.petty_cash_transaction t
  JOIN public.petty_cash_submission s ON s.id = t.submission_id
  WHERE s.status = 'approved'
  GROUP BY t.project_code, t.emp_id
),
pending_expenses AS (
  SELECT t.project_code, t.emp_id,
         COALESCE(SUM(COALESCE(t.verified_amount, t.exp_amount)), 0) AS total_pending_expenses
  FROM public.petty_cash_transaction t
  JOIN public.petty_cash_submission s ON s.id = t.submission_id
  WHERE s.status IN ('draft','pending_verification','pending_petty_cash_approval',
                     'pending_finance_approval','returned_for_correction')
  GROUP BY t.project_code, t.emp_id
),
reimbursement_totals AS (
  SELECT project_code, emp_id,
         COALESCE(SUM(approved_reimbursement_amount), 0) AS total_reimbursable,
         COALESCE(SUM(reimbursement_paid), 0) AS total_reimbursement_paid,
         COALESCE(SUM(outstanding_reimbursement), 0) AS total_outstanding
  FROM public.v_petty_cash_reimbursement_due
  GROUP BY project_code, emp_id
),
approved_funding_unpaid AS (
  SELECT r.project_code, r.emp_id,
         COALESCE(SUM(r.approved_amount), 0) - COALESCE(SUM(paid.total_paid), 0) AS awaiting_payment
  FROM public.petty_cash_request r
  LEFT JOIN (
    SELECT request_id, SUM(payment_amount) AS total_paid
    FROM public.petty_cash_request_payment
    GROUP BY request_id
  ) paid ON paid.request_id = r.id
  WHERE r.status IN ('approved','partially_paid')
  GROUP BY r.project_code, r.emp_id
)
SELECT a.project_code, a.emp_id, a.active, a.op_balance,
       COALESCE(p.total_funding, 0) AS total_funding_received,
       COALESCE(ae.total_approved_expenses, 0) AS total_approved_expenses,
       a.op_balance + COALESCE(p.total_funding, 0) - COALESCE(ae.total_approved_expenses, 0) AS available_balance,
       COALESCE(pe.total_pending_expenses, 0) AS pending_expense_claims,
       COALESCE(rt.total_reimbursable, 0) AS approved_reimbursement_payable,
       COALESCE(rt.total_reimbursement_paid, 0) AS reimbursement_paid,
       COALESCE(rt.total_outstanding, 0) AS outstanding_reimbursement,
       COALESCE(afu.awaiting_payment, 0) AS approved_funding_awaiting_payment
FROM assignments a
LEFT JOIN payments p ON p.project_code = a.project_code AND p.emp_id = a.emp_id
LEFT JOIN approved_expenses ae ON ae.project_code = a.project_code AND ae.emp_id = a.emp_id
LEFT JOIN pending_expenses pe ON pe.project_code = a.project_code AND pe.emp_id = a.emp_id
LEFT JOIN reimbursement_totals rt ON rt.project_code = a.project_code AND rt.emp_id = a.emp_id
LEFT JOIN approved_funding_unpaid afu ON afu.project_code = a.project_code AND afu.emp_id = a.emp_id;

CREATE OR REPLACE FUNCTION public.pc_validate_handover(p_project_code text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_assignment public.pettycash_user%ROWTYPE;
  v_balance numeric(12,3);
  v_open_submissions bigint;
  v_open_requests bigint;
  v_outstanding_reimb numeric(12,3);
  v_reserved_fuel bigint;
  v_issues jsonb := '[]'::jsonb;
  v_can_proceed boolean := true;
BEGIN
  SELECT * INTO v_assignment
  FROM public.pettycash_user
  WHERE project_code = p_project_code AND active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active assignment found for project %', p_project_code;
  END IF;

  SELECT available_balance INTO v_balance
  FROM public.v_petty_cash_balance
  WHERE project_code = p_project_code AND emp_id = v_assignment.emp_id AND active = TRUE;
  IF v_balance IS NULL THEN v_balance := 0; END IF;
  IF v_balance <> 0 THEN
    v_can_proceed := false;
    v_issues := v_issues || jsonb_build_object(
      'type', 'balance',
      'message', format('Unsettled petty cash balance: OMR %s', v_balance)
    );
  END IF;

  SELECT COUNT(*) INTO v_open_submissions
  FROM public.petty_cash_submission
  WHERE project_code = p_project_code AND emp_id = v_assignment.emp_id
    AND status IN ('draft','pending_verification','pending_petty_cash_approval',
                   'pending_finance_approval','returned_for_correction');
  IF v_open_submissions > 0 THEN
    v_can_proceed := false;
    v_issues := v_issues || jsonb_build_object(
      'type', 'open_submissions',
      'message', format('%s expense submission(s) pending resolution', v_open_submissions)
    );
  END IF;

  SELECT COUNT(*) INTO v_open_requests
  FROM public.petty_cash_request
  WHERE project_code = p_project_code AND emp_id = v_assignment.emp_id
    AND status IN ('draft','pending_verification','pending_approval','approved','partially_paid');
  IF v_open_requests > 0 THEN
    v_can_proceed := false;
    v_issues := v_issues || jsonb_build_object(
      'type', 'open_requests',
      'message', format('%s funding request(s) pending resolution', v_open_requests)
    );
  END IF;

  SELECT outstanding_reimbursement INTO v_outstanding_reimb
  FROM public.v_petty_cash_balance
  WHERE project_code = p_project_code AND emp_id = v_assignment.emp_id AND active = TRUE;
  IF v_outstanding_reimb IS NULL THEN v_outstanding_reimb := 0; END IF;
  IF v_outstanding_reimb > 0 THEN
    v_can_proceed := false;
    v_issues := v_issues || jsonb_build_object(
      'type', 'outstanding_reimbursement',
      'message', format('Outstanding reimbursement payable: OMR %s', v_outstanding_reimb)
    );
  END IF;

  SELECT COUNT(*) INTO v_reserved_fuel
  FROM public.fuel_log fl
  JOIN public.petty_cash_submission s ON s.id = fl.petty_cash_submission_id
  WHERE fl.petty_cash_submission_id IS NOT NULL
    AND s.project_code = p_project_code AND s.emp_id = v_assignment.emp_id
    AND s.status NOT IN ('approved','rejected','cancelled');
  IF v_reserved_fuel > 0 THEN
    v_can_proceed := false;
    v_issues := v_issues || jsonb_build_object(
      'type', 'reserved_fuel',
      'message', format('%s fuel bill(s) reserved by unresolved submissions', v_reserved_fuel)
    );
  END IF;

  RETURN jsonb_build_object(
    'can_proceed', v_can_proceed,
    'current_emp_id', v_assignment.emp_id,
    'balance', v_balance,
    'issues', v_issues
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pc_validate_handover(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pc_validate_handover(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pc_perform_handover(
  p_project_code text,
  p_new_emp_id text,
  p_new_approver text,
  p_new_finapprover text,
  p_performed_by text,
  p_op_balance numeric DEFAULT 0,
  p_op_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_validation jsonb;
  v_old_id bigint;
  v_old_approver text;
  v_old_verifier text;
  v_old_finapprover text;
  v_new_id bigint;
BEGIN
  v_validation := public.pc_validate_handover(p_project_code);
  IF NOT (v_validation ->> 'can_proceed')::boolean THEN
    RAISE EXCEPTION 'Handover blocked: %', v_validation -> 'issues';
  END IF;

  SELECT id, approver_id, verifier_id, finapprover_id
  INTO v_old_id, v_old_approver, v_old_verifier, v_old_finapprover
  FROM public.pettycash_user
  WHERE project_code = p_project_code AND active = TRUE;

  UPDATE public.pettycash_user
  SET active = FALSE, updated_at = now()
  WHERE id = v_old_id;

  INSERT INTO public.pettycash_user
    (project_code, emp_id, approver_id, verifier_id, finapprover_id, op_balance, op_date, active)
  VALUES (
    p_project_code,
    p_new_emp_id,
    COALESCE(NULLIF(p_new_approver, ''), v_old_approver),
    v_old_verifier,
    COALESCE(NULLIF(p_new_finapprover, ''), v_old_finapprover),
    p_op_balance,
    p_op_date,
    TRUE
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'old_id', v_old_id,
    'new_id', v_new_id,
    'performed_by', p_performed_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pc_perform_handover(text,text,text,text,text,numeric,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pc_perform_handover(text,text,text,text,text,numeric,date) TO authenticated;
