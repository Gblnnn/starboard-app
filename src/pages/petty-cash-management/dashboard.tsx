import Back from "@/components/back";
import { useAuth } from "@/components/AuthProvider";
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

interface LedgerRow {
  id: string;
  date: string;
  reference: string;
  project_code: string;
  emp_id: string;
  details: string;
  receipts: number;
  payments: number;
  runningBalance: number;
}

export default function Dashboard() {
  const { userData } = useAuth();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const {
    loading: accessLoading,
    canAccessDashboard,
    isAdmin,
    isApprover,
    isFinanceApprover,
  } = usePettyCashAccess();
  const canViewAll = isAdmin || isApprover || isFinanceApprover;

  const [balances, setBalances] = useState<PettyCashBalance[]>([]);
  const [custodianNames, setCustodianNames] = useState<Record<string, string>>({});
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [fundingAwaiting, setFundingAwaiting] = useState(0);
  const [outstandingReimb, setOutstandingReimb] = useState(0);

  // Ledger params
  const [fromDate, setFromDate] = useState(moment().startOf("month").format("YYYY-MM-DD"));
  const [toDate, setToDate] = useState(moment().format("YYYY-MM-DD"));
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      let balancesQuery = supabase
        .from("v_petty_cash_balance")
        .select("*")
        .eq("active", true);
      if (!canViewAll && empId) balancesQuery = balancesQuery.eq("emp_id", empId);
      const { data: balData, error: balError } = await balancesQuery;
      if (balError) throw balError;
      setBalances(balData || []);

      const custodianIds = [...new Set((balData || []).map((balance) => balance.emp_id))];
      const { data: employees, error: employeesError } = custodianIds.length
        ? await supabase.from("employees").select("emp_id, name").in("emp_id", custodianIds)
        : { data: [], error: null };
      if (employeesError) throw employeesError;
      setCustodianNames(Object.fromEntries((employees || []).map((employee) => [employee.emp_id, employee.name])));

      const totals = (balData || []).reduce((acc, b) => ({
        fundingAwaiting: acc.fundingAwaiting + b.approved_funding_awaiting_payment,
        outstandingReimb: acc.outstandingReimb + b.outstanding_reimbursement,
      }), { fundingAwaiting: 0, outstandingReimb: 0 });
      setFundingAwaiting(totals.fundingAwaiting);
      setOutstandingReimb(totals.outstandingReimb);

      // Current month approved expenses
      const startOfMonth = moment().startOf("month").format("YYYY-MM-DD");
      let monthQuery = supabase
        .from("petty_cash_transaction")
        .select("fin_approved_amount, petty_cash_submission!inner(petty_cash_approval_date, status)")
        .eq("petty_cash_submission.status", "approved")
        .gte("petty_cash_submission.petty_cash_approval_date", startOfMonth);
      if (!canViewAll && empId) monthQuery = monthQuery.eq("emp_id", empId);
      const { data: monthData, error: monthError } = await monthQuery;
      if (monthError) throw monthError;
      const monthTotal = (monthData || []).reduce((s: number, r: any) => s + Number(r.fin_approved_amount || 0), 0);
      setMonthExpenses(monthTotal);

      // Pending counts
      let requestsQuery = supabase.from("petty_cash_request").select("id", { count: "exact", head: true }).eq("status", "pending_approval");
      let submissionsQuery = supabase.from("petty_cash_submission").select("id", { count: "exact", head: true }).eq("status", "pending_petty_cash_approval");
      if (!canViewAll && empId) {
        requestsQuery = requestsQuery.eq("emp_id", empId);
        submissionsQuery = submissionsQuery.eq("emp_id", empId);
      }
      const { count: rCount, error: requestCountError } = await requestsQuery;
      if (requestCountError) throw requestCountError;
      setPendingRequests(rCount || 0);
      const { count: sCount, error: submissionCountError } = await submissionsQuery;
      if (submissionCountError) throw submissionCountError;
      setPendingSubmissions(sCount || 0);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async (
    projectCode: string | null = selectedProject,
    custodianId: string | null = selectedEmpId
  ) => {
    if (!fromDate || !toDate || fromDate > toDate) {
      toast.error("Select a valid date range");
      return;
    }

    setLoadingLedger(true);
    setLedgerLoaded(false);
    try {
      let receiptsQuery = supabase
        .from("petty_cash_request_payment")
        .select("id,project_code,payment_amount,payment_date,payment_reference,petty_cash_request!inner(request_number,emp_id,particulars)")
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate)
        .order("payment_date");
      let reimbursementsQuery = supabase
        .from("petty_cash_reimbursement_payment")
        .select("id,project_code,emp_id,payment_amount,payment_date,payment_reference,petty_cash_submission!inner(submission_number,petty_cash_transaction(id,trans_date,particulars,fin_approved_amount,approved_amount,exp_amount,petty_cash_expense_category(category_name)))")
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate)
        .order("payment_date");

      if (projectCode) {
        receiptsQuery = receiptsQuery.eq("project_code", projectCode);
        reimbursementsQuery = reimbursementsQuery.eq("project_code", projectCode);
      }
      if (custodianId) {
        receiptsQuery = receiptsQuery.eq("petty_cash_request.emp_id", custodianId);
        reimbursementsQuery = reimbursementsQuery.eq("emp_id", custodianId);
      } else if (!canViewAll && empId) {
        receiptsQuery = receiptsQuery.eq("petty_cash_request.emp_id", empId);
        reimbursementsQuery = reimbursementsQuery.eq("emp_id", empId);
      }

      const [receiptsResult, reimbursementsResult] = await Promise.all([
        receiptsQuery,
        reimbursementsQuery,
      ]);
      if (receiptsResult.error) throw receiptsResult.error;
      if (reimbursementsResult.error) throw reimbursementsResult.error;

      const rows: Omit<LedgerRow, "runningBalance">[] = [];

      (receiptsResult.data || []).forEach((p) => {
        const request = p.petty_cash_request[0];
        if (!request) return;
        rows.push({
          id: `receipt-${p.id}`,
          date: p.payment_date,
          reference: request.request_number,
          project_code: p.project_code,
          emp_id: request.emp_id,
          details: `Cash received — ${request.particulars}${p.payment_reference ? ` (Ref: ${p.payment_reference})` : ""}`,
          receipts: Number(p.payment_amount),
          payments: 0,
        });
      });

      (reimbursementsResult.data || []).forEach((payment) => {
        const submission = payment.petty_cash_submission[0];
        if (!submission) return;
        const bills = (submission.petty_cash_transaction || []).map((bill) => {
          const category = bill.petty_cash_expense_category?.[0]?.category_name || "Expense";
          const amount = bill.fin_approved_amount ?? bill.approved_amount ?? bill.exp_amount;
          return `${moment(bill.trans_date).format("DD MMM YYYY")} · ${category} · ${bill.particulars} (${formatOMR(amount)})`;
        });
        rows.push({
          id: `reimbursement-${payment.id}`,
          date: payment.payment_date,
          reference: submission.submission_number,
          project_code: payment.project_code,
          emp_id: payment.emp_id,
          details: `Reimbursement bills${payment.payment_reference ? ` (Ref: ${payment.payment_reference})` : ""}\n${bills.length > 0 ? bills.join("\n") : "No bill details"}`,
          receipts: 0,
          payments: Number(payment.payment_amount),
        });
      });

      rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      let runningBalance = 0;
      const accountBalances = new Map<string, number>();
      setLedgerRows(rows.map((row) => {
        const accountKey = `${row.project_code}:${row.emp_id}`;
        runningBalance = (accountBalances.get(accountKey) || 0) + row.receipts - row.payments;
        accountBalances.set(accountKey, runningBalance);
        return { ...row, runningBalance };
      }));
      setLedgerLoaded(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load ledger");
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    if (!accessLoading) void load();
  }, [accessLoading, canViewAll, empId]);

  const totalAvailable = balances.reduce((s, b) => s + b.available_balance, 0);
  const totalFunding = balances.reduce((s, b) => s + b.total_funding_received, 0);

  const printLedger = () => {
    document.body.classList.add("pc-ledger-print-mode");
    window.print();
  };

  useEffect(() => {
    const clearPrintMode = () => document.body.classList.remove("pc-ledger-print-mode");
    window.addEventListener("afterprint", clearPrintMode);
    return () => {
      window.removeEventListener("afterprint", clearPrintMode);
      clearPrintMode();
    };
  }, []);

  if (!accessLoading && !canAccessDashboard) {
    return (
      <AccessDenied
        title="Dashboard Restricted"
        message="Access to the petty cash dashboard is restricted to assigned custodians, Finance Approvers, Petty Cash Approvers, and Administrators."
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
              <button
                key={`${b.project_code}-${b.emp_id}`}
                type="button"
                onClick={() => {
                  setSelectedProject(b.project_code);
                  setSelectedEmpId(b.emp_id);
                  void loadLedger(b.project_code, b.emp_id);
                }}
                style={{ ...CARD, width: "100%", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", color: "inherit", background: selectedProject === b.project_code ? "rgba(30,58,95,0.06)" : "transparent", cursor: "pointer" }}
              >
                <div>
                  <p style={{ fontWeight: 700 }}>{b.project_code}</p>
                  <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Custodian: {b.emp_id}{custodianNames[b.emp_id] ? ` · ${custodianNames[b.emp_id]}` : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontWeight: 700, color: b.available_balance < 0 ? "#dc2626" : "#16a34a" }}>{formatOMR(b.available_balance)}</p>
                  {b.outstanding_reimbursement > 0 && (
                    <p style={{ fontSize: "0.7rem", color: "#dc2626" }}>Reimb: {formatOMR(b.outstanding_reimbursement)}</p>
                  )}
                </div>
                </button>
            ))}

            {/* Ledger section */}
            <div className="pc-ledger-report" style={{ marginTop: "1.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
                <h3 style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                {selectedProject ? `${selectedProject} Details` : "Transaction Ledger"}
                </h3>
                {selectedProject && (
                <button type="button" onClick={() => { setSelectedProject(null); setSelectedEmpId(null); setLedgerRows([]); setLedgerLoaded(false); }} style={{ border: "none", background: "transparent", color: "#1e3a5f", fontWeight: 600, cursor: "pointer" }}>
                  All projects
                </button>
                )}
              </div>
              <header className="pc-ledger-heading" style={{ display: "none", textAlign: "center", marginBottom: "0.75rem" }}>
                <h2 style={{ fontWeight: 700 }}>Sohar Star United LLC</h2>
                <p>Petty Cash Transaction Ledger</p>
                <p>{moment(fromDate).format("DD MMM YYYY")} – {moment(toDate).format("DD MMM YYYY")}</p>
                {selectedProject && <p>{selectedProject} · Custodian {selectedEmpId}</p>}
              </header>
              <p className="pc-ledger-controls" style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.75rem" }}>
                Click a project balance above to view cash received and reimbursement payments for this date range.
              </p>

              <div className="pc-ledger-controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.875rem" }}>
                <div>
                  <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>From</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: "100%", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid rgba(100,100,100,0.2)", fontSize: "0.85rem", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>To</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: "100%", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid rgba(100,100,100,0.2)", fontSize: "0.85rem", fontFamily: "inherit" }} />
                </div>
              </div>

              <div className="pc-ledger-controls" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <button onClick={() => loadLedger()} disabled={loadingLedger} style={{ flex: 1, padding: "0.7rem", borderRadius: "0.6rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  {loadingLedger ? <Loader2 className="animate-spin" width="0.9rem" /> : "Load Ledger"}
                </button>
                {ledgerRows.length > 0 && (
                  <button onClick={printLedger} style={{ padding: "0.7rem 1rem", borderRadius: "0.6rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
                    <Printer width="0.9rem" /> Print
                  </button>
                )}
              </div>

              {ledgerLoaded && ledgerRows.length === 0 && (
                <p style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>
                  No cash receipts or reimbursement payments in this date range.
                </p>
              )}
              {ledgerRows.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#1e3a5f", color: "white" }}>
                        {["Sl. No.", "Date", "Reference", "Project", "Custodian", "Details", "Cash Received", "Reimbursement Paid", "Running Balance"].map((h) => (
                          <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: ["Cash Received", "Reimbursement Paid", "Running Balance"].includes(h) ? "right" : "left", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: "1px solid rgba(100,100,100,0.1)", background: i % 2 === 0 ? "transparent" : "rgba(100,100,100,0.02)", verticalAlign: "top" }}>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{i + 1}</td>
                          <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{moment(row.date).format("DD MMM YYYY")}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.reference}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.project_code}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.emp_id}</td>
                          <td style={{ padding: "0.5rem 0.75rem", minWidth: 280, whiteSpace: "pre-line" }}>{row.details}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#16a34a", fontWeight: row.receipts > 0 ? 600 : undefined }}>
                            {row.receipts > 0 ? formatOMR(row.receipts) : "—"}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#dc2626", fontWeight: row.payments > 0 ? 600 : undefined }}>
                            {row.payments > 0 ? formatOMR(row.payments) : "—"}
                          </td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: row.runningBalance < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}>
                            {formatOMR(row.runningBalance)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid #1e3a5f", fontWeight: 700 }}>
                        <td colSpan={6} style={{ padding: "0.6rem 0.75rem" }}>Total</td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#16a34a" }}>
                          {formatOMR(ledgerRows.reduce((s, r) => s + r.receipts, 0))}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#dc2626" }}>
                          {formatOMR(ledgerRows.reduce((s, r) => s + r.payments, 0))}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: ledgerRows.reduce((sum, row) => sum + row.receipts - row.payments, 0) < 0 ? "#dc2626" : "#16a34a" }}>
                          {formatOMR(ledgerRows.reduce((sum, row) => sum + row.receipts - row.payments, 0))}
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
      <style>{`@media print {
        @page { size: landscape; margin: 8mm; }
        body.pc-ledger-print-mode { margin: 0 !important; }
        body.pc-ledger-print-mode * { visibility: hidden !important; }
        body.pc-ledger-print-mode .pc-ledger-report,
        body.pc-ledger-print-mode .pc-ledger-report * { visibility: visible !important; }
        body.pc-ledger-print-mode .pc-ledger-report { position: fixed; inset: 0; width: 100%; margin: 0 !important; background: white; color: black; }
        body.pc-ledger-print-mode .pc-ledger-controls { display: none !important; }
        body.pc-ledger-print-mode .pc-ledger-heading { display: block !important; }
        body.pc-ledger-print-mode .pc-ledger-report table { font-size: 9px !important; }
        body.pc-ledger-print-mode .pc-ledger-report th { background: #e5e7eb !important; color: black !important; }
      }`}</style>
    </motion.div>
  );
}
