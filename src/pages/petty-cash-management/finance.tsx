import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, CreditCard, Loader2, X, DollarSign, ReceiptText } from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type PettyCashRequest, formatOMR, statusColor, statusLabel } from "./types";
import { sendPettyCashEmailNotices } from "./notifications";
import { usePettyCashAccess } from "./usePettyCashAccess";
import AccessDenied from "./AccessDenied";

interface ReimbursementDue {
  submission_id: number;
  submission_number: string;
  submission_date: string;
  petty_cash_approval_date: string;
  project_code: string;
  emp_id: string;
  approved_reimbursement_amount: number;
  reimbursement_paid: number;
  outstanding_reimbursement: number;
}

interface ReimbursementBill {
  id: number;
  trans_number: string;
  trans_date: string;
  particulars: string;
  exp_amount: number;
  approved_amount: number | null;
  fin_approved_amount: number | null;
  fuel_log_id: string | null;
  receipt_path: string | null;
  category_name: string;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  borderRadius: "0.6rem",
  border: "1px solid rgba(100,100,100,0.2)",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const PILL = (color: string, children: React.ReactNode) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 700, background: color + "20", color }}>
    {children}
  </span>
);

export default function Finance() {
  const { userData } = useAuth();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const { loading: accessLoading, canAccessFinance } = usePettyCashAccess();

  const [tab, setTab] = useState<"funding" | "reimbursements">("funding");
  const [approvedRequests, setApprovedRequests] = useState<(PettyCashRequest & { total_paid: number })[]>([]);
  const [approvedSubmissions, setApprovedSubmissions] = useState<ReimbursementDue[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment dialog
  const [payDialog, setPayDialog] = useState<{
    type: "funding" | "reimbursement";
    id: number;
    maxAmount: number;
    label: string;
  } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(moment().format("YYYY-MM-DD"));
  const [payRef, setPayRef] = useState("");
  const [paying, setPaying] = useState(false);

  const notifyCustodianByEmail = async (notice: Parameters<typeof sendPettyCashEmailNotices>[0][number]) => {
    try {
      const failedCount = await sendPettyCashEmailNotices([notice]);
      if (failedCount > 0) {
        toast.error("Payment was recorded, but the petty-cash email notification could not be sent");
      }
    } catch (error) {
      console.error("Failed to load petty-cash payment recipient:", error);
      toast.error("Payment was recorded, but the petty-cash email notification could not be sent");
    }
  };

  const loadFunding = async () => {
    try {
      const { data, error } = await supabase
        .from("petty_cash_request")
        .select("*, petty_cash_request_payment(payment_amount)")
        .in("status", ["approved", "partially_paid"])
        .order("request_date", { ascending: true });
      if (error) throw error;
      const rows = (data || []).map((r: any) => ({
        ...r,
        total_paid: (r.petty_cash_request_payment || []).reduce((s: number, p: any) => s + Number(p.payment_amount), 0),
      }));
      setApprovedRequests(rows);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load funding requests");
    }
  };

  const loadReimbursements = async () => {
    try {
      // The view applies available petty cash and prior payments per submission.
      const { data, error } = await supabase
        .from("v_petty_cash_reimbursement_due")
        .select("submission_id,submission_number,submission_date,petty_cash_approval_date,project_code,emp_id,approved_reimbursement_amount,reimbursement_paid,outstanding_reimbursement")
        .gt("outstanding_reimbursement", 0)
        .order("petty_cash_approval_date", { ascending: true });
      if (error) throw error;
      setApprovedSubmissions((data || []) as ReimbursementDue[]);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load reimbursements");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadFunding(), loadReimbursements()]);
      setLoading(false);
    };
    init();
  }, []);

  const handlePayment = async () => {
    if (!payDialog || !empId) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount > payDialog.maxAmount + 0.0001) { toast.error(`Amount exceeds outstanding: ${formatOMR(payDialog.maxAmount)}`); return; }

    setPaying(true);
    try {
      if (payDialog.type === "funding") {
        const request = approvedRequests.find((item) => item.id === payDialog.id);
        if (!request) throw new Error("Funding request is no longer available. Reload and try again.");
        const result = await supabase.rpc("pc_record_funding_payment", {
          p_request_id: payDialog.id,
          p_payment_amount: amount,
          p_payment_date: payDate,
          p_payment_reference: payRef.trim() || null,
          p_recorded_by: empId,
        });
        if (result.error) throw result.error;
        await notifyCustodianByEmail({
          empId: request.emp_id,
          subject: `Finance payment recorded for ${request.request_number}`,
          message: [
            `Finance recorded a payment of ${formatOMR(amount)} for petty cash request ${request.request_number}.`,
            `Payment date: ${moment(payDate).format("DD MMM YYYY")}.`,
            payRef.trim() ? `Reference: ${payRef.trim()}.` : null,
          ].filter(Boolean).join("\n"),
        });
        toast.success(`Payment of ${formatOMR(amount)} recorded`);
      } else {
        const submission = approvedSubmissions.find((item) => item.submission_id === payDialog.id);
        if (!submission) throw new Error("Bill submission is no longer available. Reload and try again.");
        const { error } = await supabase.rpc("pc_record_reimbursement_payment", {
          p_submission_id: payDialog.id,
          p_payment_amount: amount,
          p_payment_date: payDate,
          p_payment_reference: payRef.trim() || null,
          p_recorded_by: empId,
        });
        if (error) throw error;
        await notifyCustodianByEmail({
          empId: submission.emp_id,
          subject: `Finance reimbursement recorded for ${submission.submission_number}`,
          message: [
            `Finance recorded a reimbursement payment of ${formatOMR(amount)} for bill submission ${submission.submission_number}.`,
            `Payment date: ${moment(payDate).format("DD MMM YYYY")}.`,
            payRef.trim() ? `Reference: ${payRef.trim()}.` : null,
          ].filter(Boolean).join("\n"),
        });
        toast.success(`Reimbursement payment of ${formatOMR(amount)} recorded`);
      }
      setPayDialog(null);
      setPayAmount("");
      setPayDate(moment().format("YYYY-MM-DD"));
      setPayRef("");
      await Promise.all([loadFunding(), loadReimbursements()]);
    } catch (err: any) {
      toast.error(err?.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  if (!accessLoading && !canAccessFinance) {
    return (
      <AccessDenied
        title="Finance Restricted"
        message="Access to finance disbursements and reimbursement settlements is restricted to Finance Approvers and Administrators."
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="Finance" icon={<CreditCard width="1.125rem" />} />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 680, margin: "0 auto" }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", background: "rgba(100,100,100,0.07)", borderRadius: "0.75rem", padding: "0.25rem" }}>
          {(["funding", "reimbursements"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ flex: 1, padding: "0.6rem", borderRadius: "0.6rem", border: "none", background: tab === t ? "#1e3a5f" : "transparent", color: tab === t ? "white" : "inherit", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s" }}
            >
              {t === "funding" ? `Fund Requests (${approvedRequests.length})` : "Reimbursements"}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            {/* FUNDING PAYMENTS */}
            {tab === "funding" && (
              approvedRequests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                  <DollarSign width="2rem" style={{ margin: "0 auto 0.75rem", opacity: 0.3 }} />
                  <p>No approved funding requests awaiting payment</p>
                </div>
              ) : (
                approvedRequests.map((req) => {
                  const outstanding = (req.approved_amount ?? 0) - req.total_paid;
                  return (
                    <div key={req.id} style={{ border: "1px solid rgba(100,100,100,0.12)", borderRadius: "0.875rem", padding: "1rem", marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <div>
                          <p style={{ fontWeight: 700 }}>{req.request_number}</p>
                          <p style={{ fontSize: "0.72rem", color: "#64748b" }}>{req.project_code} · {req.emp_id} · {moment(req.request_date).format("DD MMM YYYY")}</p>
                        </div>
                        {PILL(statusColor[req.status] || "#64748b", statusLabel[req.status])}
                      </div>
                      <p style={{ fontSize: "0.82rem", marginBottom: "0.75rem", color: "#64748b" }}>{req.particulars}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.875rem" }}>
                        <div>
                          <p style={{ fontSize: "0.68rem", color: "#64748b" }}>Approved</p>
                          <p style={{ fontWeight: 700 }}>{formatOMR(req.approved_amount)}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: "0.68rem", color: "#64748b" }}>Paid</p>
                          <p style={{ fontWeight: 700, color: "#16a34a" }}>{formatOMR(req.total_paid)}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: "0.68rem", color: "#64748b" }}>Outstanding</p>
                          <p style={{ fontWeight: 700, color: outstanding > 0 ? "#dc2626" : "inherit" }}>{formatOMR(outstanding)}</p>
                        </div>
                      </div>
                      {outstanding > 0 && (
                        <button
                          onClick={() => {
                            setPayDialog({ type: "funding", id: req.id, maxAmount: outstanding, label: req.request_number });
                            setPayAmount(outstanding.toFixed(3));
                            setPayDate(moment().format("YYYY-MM-DD"));
                            setPayRef("");
                          }}
                          style={{ width: "100%", padding: "0.65rem", borderRadius: "0.6rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
                        >
                          Record Payment
                        </button>
                      )}
                    </div>
                  );
                })
              )
            )}

            {/* REIMBURSEMENTS */}
            {tab === "reimbursements" && (
              approvedSubmissions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                  <ReceiptText width="2rem" style={{ margin: "0 auto 0.75rem", opacity: 0.3 }} />
                  <p>No outstanding reimbursements</p>
                </div>
              ) : (
                approvedSubmissions.map((sub) => (
                  <ReimbursementCard
                    key={sub.submission_id}
                    reimbursement={sub}
                    onPay={() => {
                      setPayDialog({
                        type: "reimbursement",
                        id: sub.submission_id,
                        maxAmount: Number(sub.outstanding_reimbursement),
                        label: sub.submission_number,
                      });
                      setPayAmount(Number(sub.outstanding_reimbursement).toFixed(3));
                      setPayDate(moment().format("YYYY-MM-DD"));
                      setPayRef("");
                    }}
                  />
                ))
              )
            )}
          </>
        )}
      </div>

      {/* Payment Dialog */}
      {payDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            style={{ background: "var(--background, #fff)", borderRadius: "1.25rem 1.25rem 0 0", padding: "1.5rem", width: "100%", maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontWeight: 700 }}>Record Payment — {payDialog.label}</h3>
              <button onClick={() => setPayDialog(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X width="1.25rem" /></button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "1rem" }}>
              Outstanding: {formatOMR(payDialog.maxAmount)}
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Payment Amount (OMR) *</label>
              <input type="number" step="0.001" min="0.001" max={payDialog.maxAmount} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Payment Date *</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Reference / Cheque No.</label>
              <input type="text" placeholder="Optional" value={payRef} onChange={(e) => setPayRef(e.target.value)} style={INPUT_STYLE} />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setPayDialog(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handlePayment} disabled={paying} style={{ flex: 2, padding: "0.75rem", borderRadius: "0.65rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                {paying ? <Loader2 className="animate-spin" width="1rem" /> : "Record Payment"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function ReimbursementCard({ reimbursement, onPay }: { reimbursement: ReimbursementDue; onPay: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [billsLoaded, setBillsLoaded] = useState(false);
  const [bills, setBills] = useState<ReimbursementBill[]>([]);
  const outstanding = Number(reimbursement.outstanding_reimbursement);

  const toggleDetails = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (billsLoaded || loadingBills) return;

    setLoadingBills(true);
    try {
      const { data, error } = await supabase
        .from("petty_cash_transaction")
        .select("id,trans_number,trans_date,particulars,exp_amount,approved_amount,fin_approved_amount,fuel_log_id,receipt_path,petty_cash_expense_category(category_name)")
        .eq("submission_id", reimbursement.submission_id)
        .order("trans_date", { ascending: true });
      if (error) throw error;

      setBills((data || []).map((bill) => ({
        id: bill.id,
        trans_number: bill.trans_number,
        trans_date: bill.trans_date,
        particulars: bill.particulars,
        exp_amount: Number(bill.exp_amount),
        approved_amount: bill.approved_amount,
        fin_approved_amount: bill.fin_approved_amount,
        fuel_log_id: bill.fuel_log_id,
        receipt_path: bill.receipt_path,
        category_name: bill.petty_cash_expense_category?.[0]?.category_name || "",
      })));
      setBillsLoaded(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load submission details");
      setExpanded(false);
    } finally {
      setLoadingBills(false);
    }
  };

  return (
    <div style={{ border: "1px solid rgba(100,100,100,0.12)", borderRadius: "0.875rem", marginBottom: "0.75rem", overflow: "hidden" }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggleDetails}
        style={{ width: "100%", padding: "1rem", border: "none", background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
          <div>
            <p style={{ fontWeight: 700 }}>{reimbursement.submission_number}</p>
            <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
              {reimbursement.project_code} · {reimbursement.emp_id} · {moment(reimbursement.petty_cash_approval_date).format("DD MMM YYYY")}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>
            <span>Balance to be paid: {formatOMR(outstanding)}</span>
            {expanded ? <ChevronUp width="1rem" /> : <ChevronDown width="1rem" />}
          </div>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid rgba(100,100,100,0.1)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <div>
              <p style={{ fontSize: "0.68rem", color: "#64748b" }}>Reimbursable</p>
              <p style={{ fontWeight: 700 }}>{formatOMR(reimbursement.approved_reimbursement_amount)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.68rem", color: "#64748b" }}>Previously Paid</p>
              <p style={{ fontWeight: 700, color: "#16a34a" }}>{formatOMR(reimbursement.reimbursement_paid)}</p>
            </div>
          </div>
          {loadingBills ? (
            <div style={{ textAlign: "center", padding: "0.75rem" }}>
              <Loader2 className="animate-spin" width="1rem" />
            </div>
          ) : bills.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>No bill details found for this submission.</p>
          ) : (
            <div>
              {bills.map((bill) => (
                <div key={bill.id} style={{ padding: "0.65rem 0", borderBottom: "1px solid rgba(100,100,100,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                    <div>
                      <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        {bill.category_name || "Expense"} · {bill.trans_number}
                      </p>
                      <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {moment(bill.trans_date).format("DD MMM YYYY")} · {bill.particulars}
                      </p>
                      {bill.fuel_log_id && (
                        <p style={{ fontSize: "0.68rem", color: "#d97706", fontWeight: 600 }}>Fuel bill</p>
                      )}
                      {bill.receipt_path && (
                        <p style={{ fontSize: "0.68rem", color: "#64748b" }}>Receipt attached</p>
                      )}
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <p style={{ fontSize: "0.72rem", color: "#64748b" }}>Claimed {formatOMR(bill.exp_amount)}</p>
                      <p style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                        Approved {formatOMR(bill.fin_approved_amount ?? bill.approved_amount ?? bill.exp_amount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {outstanding > 0 && (
        <button
          onClick={onPay}
          style={{ width: "calc(100% - 2rem)", margin: "0 1rem 1rem", padding: "0.65rem", borderRadius: "0.6rem", border: "none", background: "#7c3aed", color: "white", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
        >
          Record Reimbursement Payment
        </button>
      )}
    </div>
  );
}
