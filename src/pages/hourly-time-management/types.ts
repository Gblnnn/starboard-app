// =============================================================================
// Hourly Time Management Module — Shared TypeScript Types
// Currency: OMR (Omani Rial), 3 decimal places, stored as numeric(15,3)
// =============================================================================

// ---------------------------------------------------------------------------
// Pay categories (must match DB CHECK constraint)
// ---------------------------------------------------------------------------
export type PayCategory = 'fixed_no_ot' | 'fixed_with_ot' | 'hourly_pay';
export type OTMultiplier = 1.25 | 1.50;
export type PayrollPeriodStatus = 'draft' | 'finalized' | 'reopened';

export const PAY_CATEGORY_LABELS: Record<PayCategory, string> = {
  fixed_no_ot:   'Fixed Salary (No OT)',
  fixed_with_ot: 'Fixed Salary with OT',
  hourly_pay:    'Hourly Pay',
};

export const OT_MULTIPLIER_OPTIONS: OTMultiplier[] = [1.25, 1.50];

// ---------------------------------------------------------------------------
// Attendance status (derived, never stored as editable override)
// ---------------------------------------------------------------------------
export type AttendanceStatus =
  | 'present_with_ot_125'
  | 'present_with_ot_150'
  | 'present_without_ot'
  | 'absent'
  | 'not_entered'; // no row in DB (different from absent/zero)

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------
export interface HTMProjectConfig {
  id: number;
  project_code: string;
  regular_hours: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  // Joined from projects master
  project_name?: string;
}

export interface HTMEmployeeConfig {
  id: number;
  emp_id: string;
  project_code: string;
  pay_category: PayCategory;
  monthly_salary: number | null;
  hourly_rate: number | null;
  ot_multiplier: OTMultiplier | null;
  effective_from: string; // ISO date
  effective_to: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  // Joined
  employee_name?: string;
  project_name?: string;
}

export interface HTMAttendance {
  id: number;
  emp_id: string;
  project_code: string;
  attendance_date: string; // ISO date 'YYYY-MM-DD'
  hours_worked: number; // decimal hours; 0 = explicitly zero; no row = not entered
  remarks: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface HTMHoliday {
  id: number;
  project_code: string;
  holiday_date: string; // ISO date
  holiday_name: string;
  created_at: string;
  created_by: string;
}

export interface HTMPayrollPeriod {
  id: number;
  project_code: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: PayrollPeriodStatus;
  finalized_at: string | null;
  finalized_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface HTMPayrollSnapshot {
  id: number;
  payroll_period_id: number;
  emp_id: string;
  project_code: string;
  start_date: string;
  end_date: string;
  pay_category: PayCategory;
  monthly_salary: number | null;
  hourly_rate: number | null;
  ot_multiplier: number | null;
  regular_hours: number;
  payable_days: number;
  total_hours_worked: number;
  total_ot_hours: number;
  normal_pay: number;
  ot_pay: number;
  gross_pay: number;
  daily_hours_json: Record<string, number> | null; // { "2026-10-01": 8.00, ... }
  finalized_at: string;
  finalized_by: string;
  // Joined
  employee_name?: string;
}

// ---------------------------------------------------------------------------
// Payroll calculation result (in-memory, used before finalization and for display)
// ---------------------------------------------------------------------------
export interface PayrollLineResult {
  emp_id: string;
  employee_name: string;
  project_code: string;
  pay_category: PayCategory;
  monthly_salary: number | null;
  hourly_rate: number | null;
  ot_multiplier: OTMultiplier | null;
  regular_hours: number;

  // Date-wise hours map { 'YYYY-MM-DD': number | null }
  // null = not entered (row missing); number = recorded hours (including 0)
  daily_hours: Record<string, number | null>;

  payable_days: number;
  total_hours_worked: number;
  total_ot_hours: number;
  normal_pay: number;
  ot_pay: number;
  gross_pay: number;

  // Warnings / errors
  has_config_error?: boolean;
  config_error_message?: string;
}

// ---------------------------------------------------------------------------
// Excel upload validation types
// ---------------------------------------------------------------------------
export interface ExcelUploadRow {
  emp_id: string;
  attendance_date: string;
  hours_worked: number | null;
  raw_value: string | number | null;
  row_index: number;
}

export interface ExcelUploadValidationResult {
  valid: ExcelUploadRow[];
  invalid: { row: ExcelUploadRow; reason: string }[];
  conflicts: { row: ExcelUploadRow; existing_hours: number }[];
  total_evaluated: number;
}

// ---------------------------------------------------------------------------
// Utility: format OMR with 3 decimals and comma thousands separator
// ---------------------------------------------------------------------------
export const formatOMR = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'OMR 0.000';
  return `OMR ${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;
};

export const formatHours = (h: number | null | undefined): string => {
  if (h === null || h === undefined) return '—';
  return Number(h).toFixed(2);
};

export const payrollPeriodStatusLabel: Record<PayrollPeriodStatus, string> = {
  draft: 'Draft',
  finalized: 'Finalized',
  reopened: 'Reopened',
};

export const payrollPeriodStatusColor: Record<PayrollPeriodStatus, string> = {
  draft: '#d97706',
  finalized: '#16a34a',
  reopened: '#7c3aed',
};
