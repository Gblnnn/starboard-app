import { supabase } from "@/lib/supabase";
import type { PettyCashRequest, PettyCashSubmission } from "./types";

export async function loadAssignedPendingApprovals(empId: string): Promise<{
  requests: PettyCashRequest[];
  submissions: PettyCashSubmission[];
}> {
  const { data: assignments, error: assignmentError } = await supabase
    .from("pettycash_user")
    .select("emp_id, project_code, approver_id, verifier_id")
    .eq("active", true);
  if (assignmentError) throw assignmentError;

  const approvalAssignments = new Set(
    (assignments || [])
      .filter((assignment) => assignment.approver_id === empId)
      .map((assignment) => `${assignment.project_code}:${assignment.emp_id}`),
  );
  const verificationAssignments = new Set(
    (assignments || [])
      .filter((assignment) => assignment.verifier_id?.trim().toLowerCase() === empId.toLowerCase())
      .map((assignment) => `${assignment.project_code}:${assignment.emp_id}`),
  );
  const [requestResult, submissionResult] = await Promise.all([
    supabase
      .from("petty_cash_request")
      .select("*")
      .in("status", ["pending_verification", "pending_approval"])
      .order("request_date", { ascending: true }),
    supabase
      .from("petty_cash_submission")
      .select("*")
      .in("status", ["pending_verification", "pending_petty_cash_approval"])
      .order("submission_date", { ascending: true }),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (submissionResult.error) throw submissionResult.error;

  return {
    requests: (requestResult.data || []).filter((request) =>
      request.status === "pending_verification"
        ? request.verifier_id === empId ||
          verificationAssignments.has(`${request.project_code}:${request.emp_id}`)
        : request.approver_id === empId ||
          approvalAssignments.has(`${request.project_code}:${request.emp_id}`)
    ).map((request) => request.status === "pending_verification"
      ? { ...request, verifier_id: empId }
      : { ...request, approver_id: empId }),
    submissions: (submissionResult.data || []).filter((submission) =>
      submission.status === "pending_verification"
        ? submission.verifier_id === empId ||
          verificationAssignments.has(`${submission.project_code}:${submission.emp_id}`)
        : submission.petty_cash_approver_id === empId ||
          approvalAssignments.has(`${submission.project_code}:${submission.emp_id}`)
    ).map((submission) => submission.status === "pending_verification"
      ? { ...submission, verifier_id: empId }
      : { ...submission, petty_cash_approver_id: empId }),
  };
}
