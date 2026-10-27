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
  isOpeningBalance?: boolean;
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
  const [ledgerClosingBalance, setLedgerClosingBalance] = useState(0);

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
      let assignmentsQuery = supabase
        .from("pettycash_user")
        .select("project_code,emp_id,op_balance,op_date")
        .eq("active", true);
      if (projectCode) assignmentsQuery = assignmentsQuery.eq("project_code", projectCode);
      if (custodianId) assignmentsQuery = assignmentsQuery.eq("emp_id", custodianId);
      else if (!canViewAll && empId) assignmentsQuery = assignmentsQuery.eq("emp_id", empId);

      const { data: assignmentData, error: assignmentError } = await assignmentsQuery;
      if (assignmentError) throw assignmentError;
      const assignments = assignmentData || [];
      if (assignments.length === 0) {
        setLedgerRows([]);
        setLedgerClosingBalance(0);
        setLedgerLoaded(true);
        return;
      }

      const projectCodes = [...new Set(assignments.map((assignment) => assignment.project_code))];
      const custodianIds = [...new Set(assignments.map((assignment) => assignment.emp_id))];
      let receiptsQuery = supabase
        .from("petty_cash_request_payment")
        .select("id,request_id,project_code,payment_amount,payment_date,payment_reference")
        .in("project_code", projectCodes)
        .lte("payment_date", toDate)
        .order("payment_date");
      let transactionsQuery = supabase
        .from("petty_cash_transaction")
        .select("id,submission_id,project_code,emp_id,expense_category_id,trans_date,particulars,fin_approved_amount,approved_amount,exp_amount")
        .in("project_code", projectCodes)
        .lte("trans_date", toDate)
        .order("trans_date");
      if (custodianIds.length) {
        receiptsQuery = receiptsQuery.in("project_code", projectCodes);
        transactionsQuery = transactionsQuery.in("emp_id", custodianIds);
      }

      const [receiptsResult, transactionsResult] = await Promise.all([
        receiptsQuery,
        transactionsQuery,
      ]);
      if (receiptsResult.error) throw receiptsResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      const requestIds = [...new Set((receiptsResult.data || []).map((payment) => payment.request_id))];
      const submissionIds = [...new Set((transactionsResult.data || []).map((transaction) => transaction.submission_id))];
      const categoryIds = [...new Set((transactionsResult.data || []).map((transaction) => transaction.expense_category_id))];
      const [requestsResult, submissionsResult, categoriesResult, reimbursementPaymentsResult] = await Promise.all([
        requestIds.length
          ? supabase.from("petty_cash_request").select("id,request_number,emp_id,particulars").in("id", requestIds)
          : Promise.resolve({ data: [], error: null }),
        submissionIds.length
          ? supabase.from("petty_cash_submission").select("id,submission_number,status").in("id", submissionIds).eq("status", "approved")
          : Promise.resolve({ data: [], error: null }),
        categoryIds.length
          ? supabase.from("petty_cash_expense_category").select("id,category_name").in("id", categoryIds)
          : Promise.resolve({ data: [], error: null }),
        submissionIds.length
          ? supabase.from("petty_cash_reimbursement_payment").select("submission_id,payment_amount,payment_date,payment_reference").in("submission_id", submissionIds).lte("payment_date", toDate).order("payment_date")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (requestsResult.error) throw requestsResult.error;
      if (submissionsResult.error) throw submissionsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (reimbursementPaymentsResult.error) throw reimbursementPaymentsResult.error;

      const requestsById = new Map((requestsResult.data || []).map((request) => [request.id, request]));
      const submissionsById = new Map((submissionsResult.data || []).map((submission) => [submission.id, submission]));
      const categoriesById = new Map((categoriesResult.data || []).map((category) => [category.id, category.category_name]));
      const reimbursementPaymentsBySubmission = new Map<number, string[]>();
      (reimbursementPaymentsResult.data || []).forEach((payment) => {
        const payments = reimbursementPaymentsBySubmission.get(payment.submission_id) || [];
        payments.push(`${moment(payment.payment_date).format("DD MMM YYYY")} ${formatOMR(Number(payment.payment_amount))}${payment.payment_reference ? ` (Ref: ${payment.payment_reference})` : ""}`);
        reimbursementPaymentsBySubmission.set(payment.submission_id, payments);
      });

      const events: Omit<LedgerRow, "runningBalance">[] = [];

      (receiptsResult.data || []).forEach((p) => {
        const request = requestsById.get(p.request_id);
        if (!request || (custodianId && request.emp_id !== custodianId) ||
          (!canViewAll && empId && request.emp_id !== empId)) return;
        events.push({
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

      (transactionsResult.data || []).forEach((bill) => {
        const submission = submissionsById.get(bill.submission_id);
        if (!submission || (custodianId && bill.emp_id !== custodianId) ||
          (!canViewAll && empId && bill.emp_id !== empId)) return;
        const approvedAmount = Number(bill.fin_approved_amount ?? bill.approved_amount ?? bill.exp_amount);
        const reimbursements = reimbursementPaymentsBySubmission.get(bill.submission_id) || [];
        events.push({
          id: `bill-${bill.id}`,
          date: bill.trans_date,
          reference: submission.submission_number,
          project_code: bill.project_code,
          emp_id: bill.emp_id,
          details: `${categoriesById.get(bill.expense_category_id) || "Expense"} — ${bill.particulars}${reimbursements.length ? `\nFinance reimbursement: ${reimbursements.join("; ")}` : "\nPaid from petty cash balance"}`,
          receipts: 0,
          payments: approvedAmount,
        });
      });

      events.sort((a, b) =>
        a.date.localeCompare(b.date) ||
        Number(b.receipts > 0) - Number(a.receipts > 0) ||
        a.id.localeCompare(b.id)
      );
      const accountBalances = new Map<string, number>();
      assignments.forEach((assignment) => {
        const accountKey = `${assignment.project_code}:${assignment.emp_id}`;
        accountBalances.set(accountKey, Number(assignment.op_balance || 0));
      });

      const applyEvent = (event: Omit<LedgerRow, "runningBalance">) => {
        const accountKey = `${event.project_code}:${event.emp_id}`;
        const updatedBalance = (accountBalances.get(accountKey) || 0) + event.receipts - event.payments;
        accountBalances.set(accountKey, updatedBalance);
        return updatedBalance;
      };

      events.filter((event) => event.date < fromDate).forEach((event) => {
        applyEvent(event);
      });
      const openingBalances = new Map(accountBalances);

      const rangeRows: LedgerRow[] = [];
      events.filter((event) => event.date >= fromDate).forEach((event) => {
        if (!assignments.some((item) =>
          item.project_code === event.project_code && item.emp_id === event.emp_id
        )) return;
        rangeRows.push({ ...event, runningBalance: applyEvent(event) });
      });

      const openingRows: LedgerRow[] = assignments.map((assignment) => {
        const accountKey = `${assignment.project_code}:${assignment.emp_id}`;
        return {
          id: `opening-${accountKey}`,
          date: fromDate,
          reference: "—",
          project_code: assignment.project_code,
          emp_id: assignment.emp_id,
          details: "Opening balance brought forward",
          receipts: 0,
          payments: 0,
          runningBalance: openingBalances.get(accountKey) || 0,
          isOpeningBalance: true,
        };
      });

      setLedgerRows([...openingRows, ...rangeRows]);
      setLedgerClosingBalance([...accountBalances.values()].reduce((total, balance) => total + balance, 0));
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
                <button type="button" onClick={() => { setSelectedProject(null); setSelectedEmpId(null); setLedgerRows([]); setLedgerClosingBalance(0); setLedgerLoaded(false); }} style={{ border: "none", background: "transparent", color: "#1e3a5f", fontWeight: 600, cursor: "pointer" }}>
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
                Click a project balance above to view cash receipts and approved bill payments for this date range.
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

              {ledgerLoaded && !ledgerRows.some((row) => !row.isOpeningBalance) && (
                <p style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>
                  No cash receipts or approved bills in this date range.
                </p>
              )}
              {ledgerRows.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#1e3a5f", color: "white" }}>
                        {["Sl. No.", "Date", "Reference", "Project", "Custodian", "Details", "Cash Received", "Payments (Approved Bills)", "Running Balance"].map((h) => (
                          <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: ["Cash Received", "Payments (Approved Bills)", "Running Balance"].includes(h) ? "right" : "left", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: "1px solid rgba(100,100,100,0.1)", background: i % 2 === 0 ? "transparent" : "rgba(100,100,100,0.02)", verticalAlign: "top" }}>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{row.isOpeningBalance ? "—" : ledgerRows.slice(0, i).filter((entry) => !entry.isOpeningBalance).length + 1}</td>
                          <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.isOpeningBalance ? "—" : moment(row.date).format("DD MMM YYYY")}</td>
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
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: ledgerClosingBalance < 0 ? "#dc2626" : "#16a34a" }}>
                          {formatOMR(ledgerClosingBalance)}
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
        body.pc-ledger-print-mode .pc-ledger-report { position: static; width: 100%; margin: 0 !important; background: white; color: black; }
        body.pc-ledger-print-mode .pc-ledger-controls { display: none !important; }
        body.pc-ledger-print-mode .pc-ledger-heading { display: block !important; }
        body.pc-ledger-print-mode .pc-ledger-report table { font-size: 9px !important; }
        body.pc-ledger-print-mode .pc-ledger-report th { background: #e5e7eb !important; color: black !important; }
      }`}</style>
    </motion.div>
  );
}
