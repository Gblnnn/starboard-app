import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export interface PettyCashPermissions {
  loading: boolean;
  isAdmin: boolean;
  isCustodian: boolean;
  isApprover: boolean;
  isVerifier: boolean;
  isFinanceApprover: boolean;
  canAccessDashboard: boolean;
  canAccessFinance: boolean;
  canAccessCategories: boolean;
  canAccessApprovals: boolean;
  canRequestCash: boolean;
  canSubmitBills: boolean;
  canManageAssignments: boolean;
}

/**
 * Access Control Hook for Petty Cash Management
 * - Admin user has full access
 * - Finance approver user has access to dashboard, finance, categories
 * - Approver user has access to dashboard, approvals
 * - Custodian has access to request cash and submit bills
 */
export function usePettyCashAccess(): PettyCashPermissions {
  const { userData } = useAuth();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const isAdmin = userData?.role === "admin";
  const isFinanceRole = userData?.role === "management";

  const [loading, setLoading] = useState(true);
  const [isCustodian, setIsCustodian] = useState(false);
  const [isApprover, setIsApprover] = useState(false);
  const [isVerifier, setIsVerifier] = useState(false);
  const [isFinanceApprover, setIsFinanceApprover] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkRoles() {
      if (isAdmin) {
        if (isMounted) {
          setIsCustodian(true);
          setIsApprover(true);
          setIsVerifier(true);
          setIsFinanceApprover(true);
          setLoading(false);
        }
        return;
      }

      if (!empId) {
        if (isMounted) {
          setIsCustodian(false);
          setIsApprover(false);
          setIsVerifier(false);
          setIsFinanceApprover(false);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("pettycash_user")
          .select("emp_id, approver_id, verifier_id, finapprover_id")
          .eq("active", true)
          .or(`emp_id.eq.${empId},approver_id.eq.${empId},verifier_id.eq.${empId},finapprover_id.eq.${empId}`);

        if (error) throw error;

        const hasCustodian = (data || []).some((r) => String(r.emp_id) === empId);
        const hasApprover = (data || []).some((r) => String(r.approver_id) === empId);
        const hasVerifier = (data || []).some((r) => String(r.verifier_id).trim().toLowerCase() === empId.toLowerCase());
        const hasFinApprover =
          isFinanceRole || (data || []).some((r) => String(r.finapprover_id) === empId);

        if (isMounted) {
          setIsCustodian(hasCustodian);
          setIsApprover(hasApprover);
          setIsVerifier(hasVerifier);
          setIsFinanceApprover(hasFinApprover);
        }
      } catch (err) {
        console.error("Error evaluating petty cash permissions:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkRoles();
    return () => {
      isMounted = false;
    };
  }, [empId, isAdmin, isFinanceRole]);

  return {
    loading,
    isAdmin,
    isCustodian: isAdmin || isCustodian,
    isApprover: isAdmin || isApprover,
    isVerifier: isAdmin || isVerifier,
    isFinanceApprover: isAdmin || isFinanceApprover,
    canAccessDashboard: isAdmin || isCustodian || isFinanceApprover || isApprover || isVerifier,
    canAccessFinance: isAdmin || isFinanceApprover,
    canAccessCategories: isAdmin || isFinanceApprover,
    canAccessApprovals: isAdmin || isApprover || isVerifier,
    canRequestCash: isAdmin || isCustodian,
    canSubmitBills: isAdmin || isCustodian,
    canManageAssignments: isAdmin,
  };
}
