import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  BarChart3, Loader2, Printer, RefreshCw, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type PettyCashBalance, formatOMR } from "./types";
import { usePettyCashAccess } from "./usePettyCashAccess";
import AccessDenied from "./AccessDenied";

const CARD: React.CSSProperties = {
  border: "1px solid rgba(100,100,100,0.12)",
  borderRadius: "1rem",
  padding: "1.25rem",
};

export default function Dashboard() {
  const { loading: accessLoading, canAccessDashboard } = usePettyCashAccess();

  const [balances, setBalances] = useState<PettyCashBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [fundingAwaiting, setFundingAwaiting] = useState(0);
  const [outstandingReimb, setOutstandingReimb] = useState(0);

  // Ledger params
  const [fromDate, setFromDate] = useState(moment().startOf("month").format("YYYY-MM-DD"));
  const [toDate, setToDate] = useState(moment().format("YYYY-MM-DD"));
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // All project balances
      const { data: balData } = await supabase
        .from("v_petty_cash_balance")
        .select("*")
        .eq("active", true);
      setBalances(balData || []);

      const totals = (balData || []).reduce((acc, b) => ({
        fundingAwaiting: acc.fundingAwaiting + b.approved_funding_awaiting_payment,
        outstandingReimb: acc.outstandingReimb + b.outstanding_reimbursement,
      }), { fundingAwaiting: 0, outstandingReimb: 0 });
      setFundingAwaiting(totals.fundingAwaiting);
      setOutstandingReimb(totals.outstandingReimb);

      // Current month Finance-approved expenses
      const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
      const { data: monthData } = await supabase
        .from("petty_cash_transaction")
        .select("fin_approved_amount, petty_cash_submission!inner(fin_approval_date, status)")
        .eq("petty_cash_submission.status", "approved")
        .gte("petty_cash_submission.fin_approval_date", startOfMonth);
      const monthTotal = (monthData || []).reduce((s: number, r: any) => s + Number(r.fin_approved_amount || 0), 0);
      setMonthExpenses(monthTotal);

      // Pending counts
      const { count: rCount } = await supabase.from("petty_cash_request").select("id", { count: "exact", head: true }).eq("status", "pending_approval");
      setPendingRequests(rCount || 0);
      const { count: sCount } = await supabase.from("petty_cash_submission").select("id", { count: "exact", head: true }).in("status", ["pending_petty_cash_approval", "pending_finance_approval"]);
      setPendingSubmissions(sCount || 0);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async () => {
    setLoadingLedger(true);
    try {
      // Build ledger from payments and transactions
      const payments = await supabase
        .from("petty_cash_request_payment")
        .select("*, petty_cash_request(project_code, emp_id, request_number)")
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate)
        .order("payment_date");

      const expenses = await supabase
        .from("petty_cash_transaction")
        .select("*, petty_cash_submission!inner(project_code, emp_id, submission_number, fin_approval_date, status)")
        .eq("petty_cash_submission.status", "approved")
        .gte("petty_cash_submission.fin_approval_date", fromDate)
        .lte("petty_cash_submission.fin_approval_date", toDate + "T23:59:59");

      const rows: any[] = [];

      (payments.data || []).forEach((p: any) => {
        rows.push({
          date: p.payment_date,
          type: "funding",
          reference: p.petty_cash_request?.request_number || "",
          project_code: p.petty_cash_request?.project_code || p.project_code,
          emp_id: p.petty_cash_request?.emp_id || "",
          particulars: "Funding Payment",
          funding: p.payment_amount,
          expenses: 0,
        });
      });

      (expenses.data || []).forEach((t: any) => {
        rows.push({
          date: t.petty_cash_submission?.fin_approval_date?.split("T")[0] || "",
          type: "expense",
          reference: t.petty_cash_submission?.submission_number || "",
          project_code: t.project_code,
          emp_id: t.emp_id,
          particulars: t.particulars,
          funding: 0,
          expenses: t.fin_approved_amount || 0,
        });
      });

      rows.sort((a, b) => a.date.localeCompare(b.date));
      setLedgerRows(rows);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load ledger");
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalAvailable = balances.reduce((s, b) => s + b.available_balance, 0);
  const totalFunding = balances.reduce((s, b) => s + b.total_funding_received, 0);

  const printLedger = () => {
    window.print();
  };

  if (!accessLoading && !canAccessDashboard) {
    return (
      <AccessDenied
        title="Dashboard Restricted"
        message="Access to the petty cash dashboard is restricted to Finance Approvers, Petty Cash Approvers, and Administrators."
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="Dashboard" icon={<BarChart3 width="1.125rem" />}
        extra={
          <button onClick={() => load()} style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "none", background: "transparent", cursor: "pointer" }}>
            <RefreshCw width="1rem" className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 720, margin: "0 auto" }}>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div style={{ ...CARD, background: "linear-gradient(135deg,#1e3a5f,#0f2540)", color: "white", gridColumn: "1/-1" }}>
                <p style={{ fontSize: "0.72rem", opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Available Balance</p>
                <p style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.25rem" }}>{formatOMR(totalAvailable)}</p>
                <p style={{ fontSize: "0.75rem", opacity: 0.55, marginTop: "0.25rem" }}>Across {balances.length} active projects · Total funded: {formatOMR(totalFunding)}</p>
              </div>

              {[
                { label: "This Month Expenses", value: monthExpenses, color: "#dc2626", icon: <TrendingDown width="1rem" /> },
                { label: "Pending Requests", value: pendingRequests, isCount: true, color: "#d97706", icon: <Wallet width="1rem" /> },
                { label: "Funding Awaiting Payment", value: fundingAwaiting, color: "#7c3aed", icon: <TrendingUp width="1rem" /> },
                { label: "Outstanding Reimbursement", value: outstandingReimb, color: "#dc2626", icon: <TrendingDown width="1rem" /> },
                { label: "Submissions Pending", value: pendingSubmissions, isCount: true, color: "#d97706", icon: <Wallet width="1rem" /> },
              ].map((item, i) => (
                <div key={i} style={CARD}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem", color: item.color }}>
                    {item.icon}
                    <p style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.8 }}>{item.label}</p>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                    {(item as any).isCount ? item.value : formatOMR(item.value as number)}
                  </p>
                </div>
              ))}
            </div>

            {/* Project-wise Balances */}
            <h3 style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.75rem" }}>Project Balances</h3>
            {balances.map((b) => (
              <div key={`${b.project_code}-${b.emp_id}`} style={{ ...CARD, marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{b.project_code}</p>
                  <p style={{ fontSize: "0.72rem", color: "#64748b" }}>Custodian: {b.emp_id}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontWeight: 700, color: b.available_balance < 0 ? "#dc2626" : "#16a34a" }}>{formatOMR(b.available_balance)}</p>
                  {b.outstanding_reimbursement > 0 && (
                    <p style={{ fontSize: "0.7rem", color: "#dc2626" }}>Reimb: {formatOMR(b.outstanding_reimbursement)}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Ledger section */}
            <div style={{ marginTop: "1.75rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.875rem" }}>Transaction Ledger</h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.875rem" }}>
                <div>
                  <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>From</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: "100%", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid rgba(100,100,100,0.2)", fontSize: "0.85rem", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>To</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: "100%", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid rgba(100,100,100,0.2)", fontSize: "0.85rem", fontFamily: "inherit" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <button onClick={loadLedger} disabled={loadingLedger} style={{ flex: 1, padding: "0.7rem", borderRadius: "0.6rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  {loadingLedger ? <Loader2 className="animate-spin" width="0.9rem" /> : "Load Ledger"}
                </button>
                {ledgerRows.length > 0 && (
                  <button onClick={printLedger} style={{ padding: "0.7rem 1rem", borderRadius: "0.6rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
                    <Printer width="0.9rem" /> Print
                  </button>
                )}
              </div>

              {ledgerRows.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#1e3a5f", color: "white" }}>
                        {["Date", "Reference", "Project", "Custodian", "Particulars", "Funding", "Expenses"].map((h) => (
                          <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: h === "Funding" || h === "Expenses" ? "right" : "left", fontWeight: 600, fontSize: "0.75rem" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(100,100,100,0.1)", background: i % 2 === 0 ? "transparent" : "rgba(100,100,100,0.02)" }}>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{moment(row.date).format("DD MMM YY")}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.reference}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.project_code}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.emp_id}</td>
                          <td style={{ padding: "0.5rem 0.75rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.particulars}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#16a34a", fontWeight: row.funding > 0 ? 600 : undefined }}>
                            {row.funding > 0 ? formatOMR(row.funding) : ""}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#dc2626", fontWeight: row.expenses > 0 ? 600 : undefined }}>
                            {row.expenses > 0 ? formatOMR(row.expenses) : ""}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid #1e3a5f", fontWeight: 700 }}>
                        <td colSpan={5} style={{ padding: "0.6rem 0.75rem" }}>Total</td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#16a34a" }}>
                          {formatOMR(ledgerRows.reduce((s, r) => s + r.funding, 0))}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#dc2626" }}>
                          {formatOMR(ledgerRows.reduce((s, r) => s + r.expenses, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
