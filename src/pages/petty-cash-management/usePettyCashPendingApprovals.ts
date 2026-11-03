import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadAssignedPendingApprovals } from "./pendingApprovals";
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
      try {
        let nextCounts: PettyCashApprovalCounts;
        if (isAdmin) {
          const [requestsResult, submissionsResult] = await Promise.all([
            supabase
              .from("petty_cash_request")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending_approval"),
            supabase
              .from("petty_cash_submission")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending_petty_cash_approval"),
          ]);
          if (requestsResult.error) throw requestsResult.error;
          if (submissionsResult.error) throw submissionsResult.error;
          nextCounts = {
            requests: requestsResult.count || 0,
            submissions: submissionsResult.count || 0,
          };
        } else {
          const assigned = await loadAssignedPendingApprovals(empId!);
          nextCounts = {
            requests: assigned.requests.length,
            submissions: assigned.submissions.length,
          };
        }

        if (active) {
          setCounts(nextCounts);
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
    const intervalId = window.setInterval(() => {
      void loadCounts();
    }, 15000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadCounts();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [accessLoading, canAccessApprovals, empId, enabled, isAdmin]);

  return {
    ...counts,
    total: counts.requests + counts.submissions,
    canAccessApprovals: enabled && canAccessApprovals,
    permissions,
  };
}
