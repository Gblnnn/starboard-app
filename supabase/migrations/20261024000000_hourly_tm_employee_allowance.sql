ALTER TABLE public.hourly_tm_employee_config
  ADD COLUMN allowance numeric(15,3) NOT NULL DEFAULT 0
  CHECK (allowance >= 0);

ALTER TABLE public.hourly_tm_payroll_snapshot
  ADD COLUMN allowance numeric(15,3) NOT NULL DEFAULT 0
  CHECK (allowance >= 0),
  ADD COLUMN allowance_pay numeric(15,3) NOT NULL DEFAULT 0
  CHECK (allowance_pay >= 0);
