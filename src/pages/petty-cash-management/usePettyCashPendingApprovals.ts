import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePettyCashAccess } from "./usePettyCashAccess";

interface PettyCashApprovalCounts {
  requests: number;
  submissions: number;
}

const EMPTY_COUNTS: PettyCashApprovalCounts = { requests: 0, submissions: 0 };

export function usePettyCashPendingApprovals(enabled = true) {
  const { userData } = useAuth();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const isAdmin = userData?.role === "admin";
  const permissions = usePettyCashAccess();
  const { loading: accessLoading, canAccessApprovals } = permissions;
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  useEffect(() => {
    let active = true;

    if (accessLoading) {
      setCounts(EMPTY_COUNTS);
      return () => { active = false; };
    }

    if (!enabled || !canAccessApprovals || (!isAdmin && !empId)) {
      setCounts(EMPTY_COUNTS);
      return () => { active = false; };
    }

    const loadCounts = async () => {
      setCounts(EMPTY_COUNTS);

      try {
        let requestsQuery = supabase
          .from("petty_cash_request")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_approval");
        let submissionsQuery = supabase
          .from("petty_cash_submission")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_petty_cash_approval");

        if (!isAdmin && empId) {
          requestsQuery = requestsQuery.eq("approver_id", empId);
          submissionsQuery = submissionsQuery.eq("petty_cash_approver_id", empId);
        }

        const [requestsResult, submissionsResult] = await Promise.all([
          requestsQuery,
          submissionsQuery,
        ]);
        if (requestsResult.error) throw requestsResult.error;
        if (submissionsResult.error) throw submissionsResult.error;

        if (active) {
          setCounts({
            requests: requestsResult.count || 0,
            submissions: submissionsResult.count || 0,
          });
        }
      } catch (error) {
        console.error("Failed to load pending petty cash approvals:", error);
        if (active) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load pending petty cash approvals"
          );
        }
      }
    };

    void loadCounts();
    return () => { active = false; };
  }, [accessLoading, canAccessApprovals, empId, enabled, isAdmin]);

  return {
    ...counts,
    total: counts.requests + counts.submissions,
    canAccessApprovals: enabled && canAccessApprovals,
    permissions,
  };
}
