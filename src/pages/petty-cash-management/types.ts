// =============================================================================
// Petty Cash Module — Shared TypeScript Types
// =============================================================================

export type PettyCashRequestStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'partially_paid'
  | 'fully_paid'
  | 'cancelled';

export type PettyCashSubmissionStatus =
  | 'draft'
  | 'pending_petty_cash_approval'
  | 'approved'
  | 'rejected'
  | 'returned_for_correction'
  | 'cancelled';

export interface PettyCashUser {
  id: number;
  project_code: string;
  emp_id: string;
  approver_id: string | null;
  finapprover_id: string | null;
  op_balance: number;
  op_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  project_name?: string;
  custodian_name?: string;
  approver_name?: string;
  finapprover_name?: string;
}

export interface PettyCashRequest {
  id: number;
  request_number: string;
  request_date: string;
  project_code: string;
  emp_id: string;
  particulars: string;
  request_amount: number;
  approved_amount: number | null;
  approver_id: string | null;
  approval_date: string | null;
  approval_remarks: string | null;
  status: PettyCashRequestStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined
  custodian_name?: string;
  project_name?: string;
  total_paid?: number;
}

export interface PettyCashRequestPayment {
  id: number;
  request_id: number;
  project_code: string;
  payment_amount: number;
  payment_date: string;
  payment_reference: string | null;
  recorded_by: string;
  created_at: string;
}

export interface PettyCashSubmission {
  id: number;
  submission_number: string;
  submission_date: string;
  project_code: string;
  emp_id: string;
  submitted_by: string;
  petty_cash_approver_id: string | null;
  petty_cash_approval_date: string | null;
  fin_approver_id: string | null;
  fin_approval_date: string | null;
  status: PettyCashSubmissionStatus;
  approval_remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  custodian_name?: string;
  project_name?: string;
  total_claimed?: number;
  total_approved?: number;
}

export interface PettyCashTransaction {
  id: number;
  trans_number: string;
  submission_id: number;
  trans_date: string;
  project_code: string;
  emp_id: string;
  expense_category_id: number;
  particulars: string;
  exp_amount: number;
  approved_amount: number | null;
  fin_approved_amount: number | null;
  fuel_log_id: number | null;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category_name?: string;
}

export interface PettyCashReimbursementPayment {
  id: number;
  submission_id: number;
  project_code: string;
  emp_id: string;
  payment_amount: number;
  payment_date: string;
  payment_reference: string | null;
  recorded_by: string;
  created_at: string;
}

export interface PettyCashExpenseCategory {
  id: number;
  category_name: string;
  active: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface PettyCashBalance {
  project_code: string;
  emp_id: string;
  active: boolean;
  op_balance: number;
  total_funding_received: number;
  total_approved_expenses: number;
  available_balance: number;
  pending_expense_claims: number;
  approved_reimbursement_payable: number;
  reimbursement_paid: number;
  outstanding_reimbursement: number;
  approved_funding_awaiting_payment: number;
}

export interface FuelLogEntry {
  id: number;
  date: string;
  employee_code: string | null;
  employee_name: string | null;
  project: string | null;
  vehicle_number: string | null;
  odometer_reading: number | null;
  amount_spent: number;
  litres: number | null;
  petty_cash_submission_id: number | null;
}

// Utility
export const formatOMR = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'OMR 0.000';
  return `OMR ${Number(value).toFixed(3)}`;
};

export const statusLabel: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  partially_paid: 'Partially Paid',
  fully_paid: 'Fully Paid',
  cancelled: 'Cancelled',
  pending_petty_cash_approval: 'Pending PC Approval',
  returned_for_correction: 'Returned',
};

export const statusColor: Record<string, string> = {
  draft: '#64748b',
  pending_approval: '#d97706',
  pending_petty_cash_approval: '#d97706',
  approved: '#16a34a',
  fully_paid: '#16a34a',
  rejected: '#dc2626',
  cancelled: '#6b7280',
  partially_paid: '#ea580c',
  returned_for_correction: '#b45309',
};
