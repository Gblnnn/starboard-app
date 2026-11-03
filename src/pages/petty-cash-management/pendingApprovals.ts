import { supabase } from "@/lib/supabase";
import type { PettyCashRequest, PettyCashSubmission } from "./types";

export async function loadAssignedPendingApprovals(empId: string): Promise<{
  requests: PettyCashRequest[];
  submissions: PettyCashSubmission[];
}> {
  const { data: assignments, error: assignmentError } = await supabase
    .from("pettycash_user")
    .select("emp_id, project_code")
    .eq("approver_id", empId)
    .eq("active", true);
  if (assignmentError) throw assignmentError;

  const assignedCustodians = new Set(
    (assignments || []).map((assignment) => `${assignment.project_code}:${assignment.emp_id}`),
  );
  const [requestResult, submissionResult] = await Promise.all([
    supabase
      .from("petty_cash_request")
      .select("*")
      .eq("status", "pending_approval")
      .order("request_date", { ascending: true }),
    supabase
      .from("petty_cash_submission")
      .select("*")
      .eq("status", "pending_petty_cash_approval")
      .order("submission_date", { ascending: true }),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (submissionResult.error) throw submissionResult.error;

  return {
    requests: (requestResult.data || []).filter((request) =>
      request.approver_id === empId ||
      assignedCustodians.has(`${request.project_code}:${request.emp_id}`)
    ).map((request) => ({ ...request, approver_id: empId })),
    submissions: (submissionResult.data || []).filter((submission) =>
      submission.petty_cash_approver_id === empId ||
      assignedCustodians.has(`${submission.project_code}:${submission.emp_id}`)
    ).map((submission) => ({ ...submission, petty_cash_approver_id: empId })),
  };
}
