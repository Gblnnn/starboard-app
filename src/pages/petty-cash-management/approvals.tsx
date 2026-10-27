import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, ChevronDown, ChevronUp, ClipboardList,
  Loader2, RotateCcw, ThumbsDown, ThumbsUp, X,
} from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  type PettyCashRequest,
  type PettyCashSubmission,
  type PettyCashTransaction,
  formatOMR,
  statusColor,
  statusLabel,
} from "./types";
import { usePettyCashAccess } from "./usePettyCashAccess";
import AccessDenied from "./AccessDenied";

const PILL = (color: string, children: React.ReactNode) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: "0.25rem",
    padding: "0.2rem 0.55rem", borderRadius: "999px",
    fontSize: "0.68rem", fontWeight: 700,
    background: color + "20", color,
  }}>
    {children}
  </span>
);

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  borderRadius: "0.6rem",
  border: "1px solid rgba(100,100,100,0.2)",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function Approvals() {
  const { userData } = useAuth();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const isAdmin = userData?.role === "admin";
  const { loading: accessLoading, canAccessApprovals } = usePettyCashAccess();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<"requests" | "submissions">(
    searchParams.get("tab") === "submissions" ? "submissions" : "requests"
  );
  const [pendingRequests, setPendingRequests] = useState<PettyCashRequest[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<PettyCashSubmission[]>([]);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<number[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);
  const [loadingSub, setLoadingSub] = useState(true);

  // Expanded submission details
  const [expandedSubId, setExpandedSubId] = useState<number | null>(null);
  const [subLines, setSubLines] = useState<Record<number, PettyCashTransaction[]>>({});

  // Action dialog
  const [actionDialog, setActionDialog] = useState<{
    type: "request_approve" | "request_reject" | "request_reduce"
        | "sub_approve_pc" | "sub_reject" | "sub_return";
    id: number;
    submissionIds?: number[];
    requestedAmount?: number;
    approvedAmount?: number;
  } | null>(null);
  const [actionRemarks, setActionRemarks] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadPendingRequests = async () => {
    setLoadingReq(true);
    try {
      let q = supabase
        .from("petty_cash_request")
        .select("*")
        .eq("status", "pending_approval")
        .order("request_date", { ascending: true });
      if (!isAdmin && empId) q = q.eq("approver_id", empId);
      const { data, error } = await q;
      if (error) throw error;
      setPendingRequests(data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load pending requests");
    } finally {
      setLoadingReq(false);
    }
  };

  const loadPendingSubmissions = async () => {
    setLoadingSub(true);
    try {
      let q = supabase
        .from("petty_cash_submission")
        .select("*")
        .eq("status", "pending_petty_cash_approval")
        .order("submission_date", { ascending: true });
      if (!isAdmin && empId) q = q.eq("petty_cash_approver_id", empId);
      const { data, error } = await q;
      if (error) throw error;
      setPendingSubmissions(data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load pending submissions");
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    loadPendingRequests();
    loadPendingSubmissions();
  }, [empId]);

  const loadSubLines = async (submissionId: number) => {
    if (subLines[submissionId]) return;
    const { data } = await supabase
      .from("petty_cash_transaction")
      .select("*, petty_cash_expense_category(category_name)")
      .eq("submission_id", submissionId)
      .order("trans_date");
    const rows = (data || []).map((r: any) => ({
      ...r,
      category_name: r.petty_cash_expense_category?.category_name || "",
    }));
    setSubLines((prev) => ({ ...prev, [submissionId]: rows }));
  };

  const handleRequestAction = async () => {
    if (!actionDialog || !empId) return;
    setActionLoading(true);
    try {
      const { id, type, requestedAmount } = actionDialog;
      const amount = parseFloat(actionAmount);

      if (type === "request_approve") {
        await supabase.from("petty_cash_request").update({
          status: "approved",
          approved_amount: requestedAmount,
          approver_id: empId,
          approval_date: new Date().toISOString(),
          approval_remarks: actionRemarks.trim() || null,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        toast.success("Request approved");
      } else if (type === "request_reduce") {
        if (!amount || amount <= 0) { toast.error("Enter approved amount"); return; }
        if (!actionRemarks.trim()) { toast.error("Reason is required when reducing amount"); return; }
        await supabase.from("petty_cash_request").update({
          status: "approved",
          approved_amount: amount,
          approver_id: empId,
          approval_date: new Date().toISOString(),
          approval_remarks: actionRemarks.trim(),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        toast.success("Request approved with reduced amount");
      } else if (type === "request_reject") {
        if (!actionRemarks.trim()) { toast.error("Rejection reason is required"); return; }
        await supabase.from("petty_cash_request").update({
          status: "rejected",
          approver_id: empId,
          approval_date: new Date().toISOString(),
          approval_remarks: actionRemarks.trim(),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        toast.success("Request rejected");
      }

      setActionDialog(null);
      setActionRemarks("");
      setActionAmount("");
      loadPendingRequests();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmissionAction = async () => {
    if (!actionDialog || !empId) return;
    setActionLoading(true);
    try {
      const { id, type } = actionDialog;
      const submissionIds = actionDialog.submissionIds;

      if (submissionIds) {
        if (type === "sub_approve_pc") {
          const approvalDate = new Date().toISOString();
          const { data: lines, error: linesError } = await supabase
            .from("petty_cash_transaction")
            .select("id, exp_amount")
            .in("submission_id", submissionIds);
          if (linesError) throw linesError;

          const lineUpdates = await Promise.all((lines || []).map((line) =>
            supabase.from("petty_cash_transaction").update({
              approved_amount: line.exp_amount,
              fin_approved_amount: line.exp_amount,
              updated_at: approvalDate,
            }).eq("id", line.id)
          ));
          const lineError = lineUpdates.find((result) => result.error)?.error;
          if (lineError) throw lineError;

          const { error } = await supabase.from("petty_cash_submission").update({
            status: "approved",
            petty_cash_approver_id: empId,
            petty_cash_approval_date: approvalDate,
            approval_remarks: actionRemarks.trim() || null,
            updated_at: approvalDate,
          }).in("id", submissionIds);
          if (error) throw error;
          toast.success(`${submissionIds.length} submission${submissionIds.length === 1 ? "" : "s"} approved — ready for Finance payment`);
        } else if (type === "sub_reject") {
          if (!actionRemarks.trim()) { toast.error("Rejection reason is required"); return; }
          const updatedAt = new Date().toISOString();
          const { error } = await supabase.from("petty_cash_submission").update({
            status: "rejected",
            approval_remarks: actionRemarks.trim(),
            updated_at: updatedAt,
          }).in("id", submissionIds);
          if (error) throw error;

          const releaseResults = await Promise.all(submissionIds.map((submissionId) =>
            supabase.rpc("pc_release_fuel_bills", { p_submission_id: submissionId })
          ));
          const releaseError = releaseResults.find((result) => result.error)?.error;
          if (releaseError) throw releaseError;
          toast.success(`${submissionIds.length} submission${submissionIds.length === 1 ? "" : "s"} rejected — fuel bills released`);
        }

        setActionDialog(null);
        setActionRemarks("");
        setActionAmount("");
        setSelectedSubmissionIds([]);
        loadPendingSubmissions();
        return;
      }

      if (type === "sub_approve_pc") {
        const approvalDate = new Date().toISOString();
        const lines = subLines[id] || [];
        const lineUpdates = await Promise.all(lines.map((line) =>
          supabase.from("petty_cash_transaction").update({
            approved_amount: line.exp_amount,
            fin_approved_amount: line.exp_amount,
            updated_at: approvalDate,
          }).eq("id", line.id)
        ));
        const lineError = lineUpdates.find((result) => result.error)?.error;
        if (lineError) throw lineError;

        const { error } = await supabase.from("petty_cash_submission").update({
          status: "approved",
          petty_cash_approver_id: empId,
          petty_cash_approval_date: approvalDate,
          approval_remarks: actionRemarks.trim() || null,
          updated_at: approvalDate,
        }).eq("id", id);
        if (error) throw error;
        toast.success("Submission approved — ready for Finance payment");
      } else if (type === "sub_reject") {
        if (!actionRemarks.trim()) { toast.error("Rejection reason is required"); return; }
        await supabase.from("petty_cash_submission").update({
          status: "rejected",
          approval_remarks: actionRemarks.trim(),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        // Release fuel bills
        await supabase.rpc("pc_release_fuel_bills", { p_submission_id: id });
        toast.success("Submission rejected — fuel bills released");
      } else if (type === "sub_return") {
        if (!actionRemarks.trim()) { toast.error("Return reason is required"); return; }
        await supabase.from("petty_cash_submission").update({
          status: "returned_for_correction",
          approval_remarks: actionRemarks.trim(),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        // Release fuel bill reservations
        await supabase.rpc("pc_release_fuel_bills", { p_submission_id: id });
        toast.success("Submission returned for correction");
      }

      setActionDialog(null);
      setActionRemarks("");
      setActionAmount("");
      setSelectedSubmissionIds([]);
      loadPendingSubmissions();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const canApproveRequest = (req: PettyCashRequest) =>
    isAdmin || req.approver_id === empId;

  const canApproveSubPC = (sub: PettyCashSubmission) =>
    sub.status === "pending_petty_cash_approval" &&
    (isAdmin || sub.petty_cash_approver_id === empId);

  const selectableSubmissionIds = pendingSubmissions
    .filter(canApproveSubPC)
    .map((submission) => submission.id);
  const allSubmissionsSelected = selectableSubmissionIds.length > 0 &&
    selectableSubmissionIds.every((id) => selectedSubmissionIds.includes(id));

  if (!accessLoading && !canAccessApprovals) {
    return (
      <AccessDenied
        title="Approvals Restricted"
        message="Access to the approvals section is restricted to designated Petty Cash Approvers and Administrators."
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="Approvals" icon={<ClipboardList width="1.125rem" />} />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 680, margin: "0 auto" }}>
        {/* Tab switcher */}
        <div style={{
          display: "flex", gap: "0.5rem", marginBottom: "1.25rem",
          background: "rgba(100,100,100,0.07)", borderRadius: "0.75rem", padding: "0.25rem",
        }}>
          {(["requests", "submissions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "0.6rem", borderRadius: "0.6rem", border: "none",
                background: tab === t ? "#1e3a5f" : "transparent",
                color: tab === t ? "white" : "inherit",
                fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {t === "requests" ? `Cash Requests (${pendingRequests.length})` : `Bill Submissions (${pendingSubmissions.length})`}
            </button>
          ))}
        </div>

        {/* === REQUESTS TAB === */}
        {tab === "requests" && (
          <>
            {loadingReq ? (
              <div style={{ textAlign: "center", padding: "3rem" }}><Loader2 className="animate-spin" /></div>
            ) : pendingRequests.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                <CheckCircle2 width="2rem" style={{ margin: "0 auto 0.75rem", opacity: 0.3 }} />
                <p>No pending cash requests</p>
              </div>
            ) : (
              pendingRequests.map((req) => (
                <div key={req.id} style={{
                  border: "1px solid rgba(100,100,100,0.12)",
                  borderRadius: "0.875rem", padding: "1rem",
                  marginBottom: "0.75rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div>
                      <p style={{ fontWeight: 700 }}>{req.request_number}</p>
                      <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {req.project_code} · {req.emp_id} · {moment(req.request_date).format("DD MMM YYYY")}
                      </p>
                    </div>
                    {PILL(statusColor[req.status] || "#64748b", statusLabel[req.status])}
                  </div>
                  <p style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>{req.particulars}</p>
                  <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.875rem" }}>
                    <div>
                      <p style={{ fontSize: "0.7rem", color: "#64748b" }}>Requested</p>
                      <p style={{ fontWeight: 700 }}>{formatOMR(req.request_amount)}</p>
                    </div>
                  </div>
                  {canApproveRequest(req) && (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        onClick={() => { setActionDialog({ type: "request_approve", id: req.id, requestedAmount: req.request_amount }); setActionRemarks(""); }}
                        style={{ flex: 1, padding: "0.55rem", borderRadius: "0.5rem", border: "none", background: "#16a34a", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                      >
                        <ThumbsUp width="0.8rem" /> Approve Full
                      </button>
                      <button
                        onClick={() => { setActionDialog({ type: "request_reduce", id: req.id, requestedAmount: req.request_amount }); setActionRemarks(""); setActionAmount(""); }}
                        style={{ flex: 1, padding: "0.55rem", borderRadius: "0.5rem", border: "none", background: "#d97706", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                      >
                        Reduce
                      </button>
                      <button
                        onClick={() => { setActionDialog({ type: "request_reject", id: req.id }); setActionRemarks(""); }}
                        style={{ flex: 1, padding: "0.55rem", borderRadius: "0.5rem", border: "none", background: "#dc2626", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                      >
                        <ThumbsDown width="0.8rem" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* === SUBMISSIONS TAB === */}
        {tab === "submissions" && (
          <>
            {loadingSub ? (
              <div style={{ textAlign: "center", padding: "3rem" }}><Loader2 className="animate-spin" /></div>
            ) : pendingSubmissions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                <CheckCircle2 width="2rem" style={{ margin: "0 auto 0.75rem", opacity: 0.3 }} />
                <p>No pending expense submissions</p>
              </div>
            ) : (
              <>
                {selectableSubmissionIds.length > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem",
                  }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                      <input
                        type="checkbox"
                        aria-label="Select all pending submissions"
                        checked={allSubmissionsSelected}
                        onChange={(event) => setSelectedSubmissionIds(
                          event.target.checked ? selectableSubmissionIds : []
                        )}
                      />
                      Select all
                    </label>
                    {selectedSubmissionIds.length > 0 && (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => {
                            setActionDialog({
                              type: "sub_approve_pc",
                              id: selectedSubmissionIds[0],
                              submissionIds: selectedSubmissionIds,
                            });
                            setActionRemarks("");
                          }}
                          style={{ padding: "0.55rem 0.75rem", borderRadius: "0.5rem", border: "none", background: "#16a34a", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                        >
                          Approve ({selectedSubmissionIds.length})
                        </button>
                        <button
                          onClick={() => {
                            setActionDialog({
                              type: "sub_reject",
                              id: selectedSubmissionIds[0],
                              submissionIds: selectedSubmissionIds,
                            });
                            setActionRemarks("");
                          }}
                          style={{ padding: "0.55rem 0.75rem", borderRadius: "0.5rem", border: "none", background: "#dc2626", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                        >
                          Reject ({selectedSubmissionIds.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {pendingSubmissions.map((sub) => {
                const expanded = expandedSubId === sub.id;
                const lines = subLines[sub.id] || [];
                const totalClaimed = lines.reduce((s, l) => s + l.exp_amount, 0);

                return (
                  <div key={sub.id} style={{
                    border: "1px solid rgba(100,100,100,0.12)",
                    borderRadius: "0.875rem",
                    marginBottom: "0.75rem",
                    overflow: "hidden",
                  }}>
                    {/* Header */}
                    <div
                      style={{ padding: "1rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
                      onClick={async () => {
                        if (!expanded) await loadSubLines(sub.id);
                        setExpandedSubId(expanded ? null : sub.id);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                        {canApproveSubPC(sub) && (
                          <input
                            type="checkbox"
                            aria-label={`Select submission ${sub.submission_number}`}
                            checked={selectedSubmissionIds.includes(sub.id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setSelectedSubmissionIds((selected) =>
                              event.target.checked
                                ? [...selected, sub.id]
                                : selected.filter((id) => id !== sub.id)
                            )}
                          />
                        )}
                        <div>
                          <p style={{ fontWeight: 700 }}>{sub.submission_number}</p>
                          <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                            {sub.project_code} · {sub.emp_id} · {moment(sub.submission_date).format("DD MMM YYYY")}
                          </p>
                          {PILL(statusColor[sub.status] || "#64748b", statusLabel[sub.status])}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {lines.length > 0 && <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{formatOMR(totalClaimed)}</span>}
                        {expanded ? <ChevronUp width="1rem" /> : <ChevronDown width="1rem" />}
                      </div>
                    </div>

                    {/* Lines */}
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          style={{ borderTop: "1px solid rgba(100,100,100,0.1)", overflow: "hidden" }}
                        >
                          {lines.length === 0 ? (
                            <div style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <Loader2 className="animate-spin" width="1rem" />
                            </div>
                          ) : (
                            <div style={{ padding: "0.75rem 1rem" }}>
                              {lines.map((l) => (
                                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.5rem", borderBottom: "1px solid rgba(100,100,100,0.07)", marginBottom: "0.5rem" }}>
                                  <div>
                                    <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{l.category_name}</p>
                                    <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{moment(l.trans_date).format("DD MMM")} · {l.particulars}</p>
                                    {l.fuel_log_id && <span style={{ fontSize: "0.66rem", background: "#d9770615", color: "#d97706", padding: "0.1rem 0.4rem", borderRadius: "0.3rem", fontWeight: 600 }}>Fuel Bill</span>}
                                  </div>
                                  <p style={{ fontWeight: 700, fontSize: "0.85rem" }}>{formatOMR(l.exp_amount)}</p>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700 }}>
                                Total: {formatOMR(totalClaimed)}
                              </div>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid rgba(100,100,100,0.08)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {canApproveSubPC(sub) && (
                              <>
                                <button
                                  onClick={async () => { await loadSubLines(sub.id); setActionDialog({ type: "sub_approve_pc", id: sub.id }); setActionRemarks(""); }}
                                  style={{ flex: 1, padding: "0.55rem", borderRadius: "0.5rem", border: "none", background: "#16a34a", color: "white", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  onClick={() => { setActionDialog({ type: "sub_return", id: sub.id }); setActionRemarks(""); }}
                                  style={{ flex: 1, padding: "0.55rem", borderRadius: "0.5rem", border: "none", background: "#b45309", color: "white", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  <RotateCcw width="0.75rem" style={{ display: "inline" }} /> Return
                                </button>
                                <button
                                  onClick={() => { setActionDialog({ type: "sub_reject", id: sub.id }); setActionRemarks(""); }}
                                  style={{ flex: 1, padding: "0.55rem", borderRadius: "0.5rem", border: "none", background: "#dc2626", color: "white", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  ✗ Reject
                                </button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Action Dialog */}
      {actionDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          zIndex: 100, padding: "0 0 env(safe-area-inset-bottom)",
        }}>
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{
              background: "var(--background, #fff)",
              borderRadius: "1.25rem 1.25rem 0 0",
              padding: "1.5rem",
              width: "100%",
              maxWidth: 520,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontWeight: 700 }}>
                {actionDialog.type.includes("approve") ? "Approve" :
                 actionDialog.type.includes("reject") ? "Reject" :
                 actionDialog.type.includes("reduce") ? "Reduce Amount" : "Return for Correction"}
                {actionDialog.submissionIds && actionDialog.submissionIds.length > 1
                  ? ` ${actionDialog.submissionIds.length} submissions`
                  : ""}
              </h3>
              <button onClick={() => setActionDialog(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X width="1.25rem" />
              </button>
            </div>

            {(actionDialog.type === "request_reduce") && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                  Approved Amount (OMR) *
                </label>
                <input
                  type="number" step="0.001" min="0.001"
                  max={actionDialog.requestedAmount}
                  placeholder={`Max: ${formatOMR(actionDialog.requestedAmount)}`}
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  style={INPUT_STYLE}
                />
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                {actionDialog.type.includes("approve") ? "Remarks (optional)" : "Reason *"}
              </label>
              <textarea
                rows={3}
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                placeholder={actionDialog.type.includes("approve") ? "Optional remarks..." : "Provide a reason..."}
                style={{ ...INPUT_STYLE, resize: "none" }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setActionDialog(null)}
                style={{ flex: 1, padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={actionDialog.type.startsWith("request") ? handleRequestAction : handleSubmissionAction}
                disabled={actionLoading}
                style={{
                  flex: 2, padding: "0.75rem", borderRadius: "0.65rem", border: "none",
                  background: actionDialog.type.includes("reject") ? "#dc2626" :
                              actionDialog.type.includes("return") ? "#b45309" : "#16a34a",
                  color: "white", fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                }}
              >
                {actionLoading
                  ? <Loader2 className="animate-spin" width="1rem" />
                  : actionDialog.submissionIds
                    ? `${actionDialog.type.includes("approve") ? "Approve" : "Reject"} ${actionDialog.submissionIds.length} submission${actionDialog.submissionIds.length === 1 ? "" : "s"}`
                    : "Confirm"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
