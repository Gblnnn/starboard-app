import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, CheckSquare, FileText, Fuel, Loader2, Printer,
  Plus, Send, Square, Trash2,
} from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  type PettyCashExpenseCategory,
  type FuelLogEntry,
  formatOMR,
} from "./types";
import { usePettyCashAccess } from "./usePettyCashAccess";
import AccessDenied from "./AccessDenied";

interface BillLine {
  id: string; // client-side temp id
  expense_category_id: number;
  category_name: string;
  trans_date: string;
  particulars: string;
  exp_amount: string;
  fuel_log_id: number | null;
  is_fuel: boolean;
}

interface ProjectAssignment {
  project_code: string;
  emp_id: string;
  assignment_id: number;
  available_balance: number;
  approver_id: string | null;
  finapprover_id: string | null;
}

interface UnsettledBillSubmission {
  id: number;
  submission_number: string;
  submission_date: string;
  project_code: string;
  emp_id: string;
  custodian_name: string;
  particulars: string[];
  approved_amount: number;
  reimbursed_amount: number;
  outstanding: number;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 0.875rem",
  borderRadius: "0.65rem",
  border: "1px solid rgba(100,100,100,0.2)",
  fontSize: "0.9rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  marginBottom: "0.3rem",
  display: "block",
  opacity: 0.7,
};

export default function SubmitBills() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const empId = userData?.emp_id ? String(userData.emp_id) : null;
  const { loading: accessLoading, canSubmitBills } = usePettyCashAccess();

  // Assignment / project state
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  // Categories
  const [categories, setCategories] = useState<PettyCashExpenseCategory[]>([]);

  // Submission form state
  const [submissionDate, setSubmissionDate] = useState(moment().format("YYYY-MM-DD"));
  const [bills, setBills] = useState<BillLine[]>([]);

  // New bill line form
  const [newCategoryId, setNewCategoryId] = useState<number | "">("");
  const [newDate, setNewDate] = useState(moment().format("YYYY-MM-DD"));
  const [newParticulars, setNewParticulars] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // Fuel bills
  const [fuelBills, setFuelBills] = useState<FuelLogEntry[]>([]);
  const [loadingFuel, setLoadingFuel] = useState(false);
  const [selectedFuelIds, setSelectedFuelIds] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [reportFrom, setReportFrom] = useState(moment().startOf("month").format("YYYY-MM-DD"));
  const [reportTo, setReportTo] = useState(moment().format("YYYY-MM-DD"));
  const [unsettledSubmissions, setUnsettledSubmissions] = useState<UnsettledBillSubmission[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportLoaded, setReportLoaded] = useState(false);

  const selectedAssignment = assignments.find((a) => a.project_code === selectedProject);

  const loadUnsettledSubmissions = async () => {
    if (!reportFrom || !reportTo || reportFrom > reportTo) {
      toast.error("Select a valid date range");
      return;
    }

    setLoadingReport(true);
    setReportLoaded(false);
    try {
      const { data, error } = await supabase
        .from("petty_cash_submission")
        .select("id,submission_number,submission_date,project_code,emp_id,petty_cash_transaction(trans_date,particulars,exp_amount,fin_approved_amount),petty_cash_reimbursement_payment(payment_amount)")
        .eq("status", "approved")
        .gte("submission_date", reportFrom)
        .lte("submission_date", reportTo)
        .order("submission_date", { ascending: true });
      if (error) throw error;

      const custodianIds = [...new Set((data || []).map((submission) => submission.emp_id))];
      const { data: employees, error: employeesError } = custodianIds.length
        ? await supabase.from("employees").select("emp_id, name").in("emp_id", custodianIds)
        : { data: [], error: null };
      if (employeesError) throw employeesError;
      const custodianNames = new Map((employees || []).map((employee) => [employee.emp_id, employee.name]));
      const rows = (data || []).map((submission) => {
        const transactions = submission.petty_cash_transaction || [];
        const approvedAmount = transactions.reduce(
          (total, transaction) => total + Number(transaction.fin_approved_amount ?? 0),
          0
        );
        const reimbursedAmount = (submission.petty_cash_reimbursement_payment || []).reduce(
          (total, payment) => total + Number(payment.payment_amount || 0),
          0
        );
        return {
          id: submission.id,
          submission_number: submission.submission_number,
          submission_date: submission.submission_date,
          project_code: submission.project_code,
          emp_id: submission.emp_id,
          custodian_name: custodianNames.get(submission.emp_id) || (submission.emp_id === empId ? userData?.name || "" : ""),
          particulars: transactions.map((transaction) => transaction.particulars),
          approved_amount: approvedAmount,
          reimbursed_amount: reimbursedAmount,
          outstanding: Math.max(0, approvedAmount - reimbursedAmount),
        };
      }).filter((submission) => submission.outstanding > 0.0001);

      setUnsettledSubmissions(rows);
      setReportLoaded(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load unreimbursed bills");
    } finally {
      setLoadingReport(false);
    }
  };

  const printUnsettledSubmissions = () => {
    document.body.classList.add("pc-print-mode");
    window.print();
  };

  useEffect(() => {
    const clearPrintMode = () => document.body.classList.remove("pc-print-mode");
    window.addEventListener("afterprint", clearPrintMode);
    return () => {
      window.removeEventListener("afterprint", clearPrintMode);
      clearPrintMode();
    };
  }, []);

  // Load assignments
  useEffect(() => {
    if (!empId) return;
    const load = async () => {
      setLoadingAssignments(true);
      try {
        const { data, error } = await supabase
          .from("pettycash_user")
          .select("id, project_code, emp_id, approver_id, finapprover_id")
          .eq("emp_id", empId)
          .eq("active", true);
        if (error) throw error;

        const withBalance = await Promise.all(
          (data || []).map(async (a) => {
            const { data: bal } = await supabase
              .from("v_petty_cash_balance")
              .select("available_balance")
              .eq("project_code", a.project_code)
              .eq("emp_id", a.emp_id)
              .maybeSingle();
            return {
              project_code: a.project_code,
              emp_id: a.emp_id,
              assignment_id: a.id,
              available_balance: Number(bal?.available_balance ?? 0),
              approver_id: a.approver_id,
              finapprover_id: a.finapprover_id,
            };
          })
        );
        setAssignments(withBalance);
        if (withBalance.length === 1) setSelectedProject(withBalance[0].project_code);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load assignments");
      } finally {
        setLoadingAssignments(false);
      }
    };
    load();
  }, [empId]);

  // Load categories
  useEffect(() => {
    supabase
      .from("petty_cash_expense_category")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setCategories(data || []));
  }, []);

  // Load eligible fuel bills when project changes
  useEffect(() => {
    if (!selectedProject || !empId) {
      setFuelBills([]);
      setSelectedFuelIds(new Set());
      return;
    }
    const load = async () => {
      setLoadingFuel(true);
      try {
        // Eligible: employee_code matches empId, project matches, not claimed
        const { data, error } = await supabase
          .from("fuel_log")
          .select("id, date, employee_code, employee_name, project, vehicle_number, odometer_reading, amount_spent, litres, petty_cash_submission_id")
          .eq("employee_code", empId)
          .eq("project", selectedProject)
          .is("petty_cash_submission_id", null)
          .order("date", { ascending: false });
        if (error) throw error;

        // Filter out bills already in bills list as fuel entries
        const alreadySelected = new Set(bills.filter((b) => b.fuel_log_id !== null).map((b) => b.fuel_log_id!));
        setFuelBills((data || []).filter((f) => !alreadySelected.has(f.id)) as FuelLogEntry[]);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load fuel bills");
      } finally {
        setLoadingFuel(false);
      }
    };
    load();
  }, [selectedProject, empId]);

  const addBillLine = () => {
    if (!newCategoryId) { toast.error("Select an expense category"); return; }
    if (!newParticulars.trim()) { toast.error("Enter a description"); return; }
    const amount = parseFloat(newAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    const cat = categories.find((c) => c.id === newCategoryId);

    setBills((prev) => [
      ...prev,
      {
        id: `bill-${Date.now()}`,
        expense_category_id: newCategoryId as number,
        category_name: cat?.category_name || "",
        trans_date: newDate,
        particulars: newParticulars.trim(),
        exp_amount: String(amount),
        fuel_log_id: null,
        is_fuel: false,
      },
    ]);
    setNewCategoryId("");
    setNewParticulars("");
    setNewAmount("");
    setNewDate(moment().format("YYYY-MM-DD"));
  };

  const removeBill = (id: string) => {
    const bill = bills.find((b) => b.id === id);
    if (bill?.fuel_log_id) {
      setSelectedFuelIds((prev) => {
        const next = new Set(prev);
        next.delete(bill.fuel_log_id!);
        return next;
      });
    }
    setBills((prev) => prev.filter((b) => b.id !== id));
  };

  const toggleFuelBill = (fuel: FuelLogEntry) => {
    if (selectedFuelIds.has(fuel.id)) {
      // Deselect
      setSelectedFuelIds((prev) => { const n = new Set(prev); n.delete(fuel.id); return n; });
      setBills((prev) => prev.filter((b) => b.fuel_log_id !== fuel.id));
    } else {
      // Select — find fuel category
      const fuelCat = categories.find((c) => c.category_name.toLowerCase() === "fuel");
      setSelectedFuelIds((prev) => new Set([...prev, fuel.id]));
      setBills((prev) => [
        ...prev,
        {
          id: `fuel-${fuel.id}`,
          expense_category_id: fuelCat?.id ?? 0,
          category_name: "Fuel",
          trans_date: fuel.date,
          particulars: `Fuel – ${fuel.vehicle_number || ""} – ${fuel.odometer_reading ? fuel.odometer_reading + " km" : ""}`.trim().replace(/–\s*$/, ""),
          exp_amount: String(fuel.amount_spent),
          fuel_log_id: fuel.id,
          is_fuel: true,
        },
      ]);
    }
  };

  const totalClaimed = bills.reduce((s, b) => s + parseFloat(b.exp_amount || "0"), 0);
  const personalFunded = Math.max(0, totalClaimed - (selectedAssignment?.available_balance ?? 0));

  const handleSubmit = async () => {
    if (!empId) { toast.error("Employee ID not found"); return; }
    if (!selectedProject) { toast.error("Select a project"); return; }
    if (bills.length === 0) { toast.error("Add at least one expense bill"); return; }

    setSubmitting(true);
    try {
      // Insert submission header
      const { data: subData, error: subErr } = await supabase
        .from("petty_cash_submission")
        .insert({
          submission_date: submissionDate,
          project_code: selectedProject,
          emp_id: empId,
          submitted_by: empId,
          petty_cash_approver_id: selectedAssignment?.approver_id ?? null,
          fin_approver_id: selectedAssignment?.finapprover_id ?? null,
          status: "pending_petty_cash_approval",
        })
        .select("id, submission_number")
        .single();
      if (subErr) throw subErr;

      // Insert transaction lines
      const lines = bills.map((b) => ({
        submission_id: subData.id,
        trans_date: b.trans_date,
        project_code: selectedProject,
        emp_id: empId,
        expense_category_id: b.expense_category_id,
        particulars: b.particulars,
        exp_amount: parseFloat(b.exp_amount),
        fuel_log_id: b.fuel_log_id ?? null,
      }));
      const { error: txnErr } = await supabase
        .from("petty_cash_transaction")
        .insert(lines);
      if (txnErr) throw txnErr;

      const fuelIds = bills.filter((b) => b.fuel_log_id).map((b) => b.fuel_log_id!);
      if (fuelIds.length > 0) {
        const { error: fuelErr } = await supabase.rpc("pc_reserve_fuel_bills", {
          p_submission_id: subData.id,
          p_fuel_log_ids: fuelIds,
        });
        if (fuelErr) throw fuelErr;
      }

      toast.success(`Submission ${subData.submission_number} submitted for approval`);
      navigate("/petty-cash");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save submission");
    } finally {
      setSubmitting(false);
    }
  };

  if (!accessLoading && !canSubmitBills) {
    return (
      <AccessDenied
        title="Submission Restricted"
        message="Only designated project custodians and administrators can submit expense bills and claims."
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "3rem" }}>
      <Back fixed blurBG title="Submit Bills" icon={<FileText width="1.125rem" />} />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 640, margin: "0 auto" }}>

        {/* Project */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={LABEL_STYLE}>Project *</label>
          {loadingAssignments ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#64748b", fontSize: "0.85rem" }}>
              <Loader2 className="animate-spin" width="0.9rem" /> Loading...
            </div>
          ) : (
            <select id="pc-sub-project" value={selectedProject} onChange={(e) => { setSelectedProject(e.target.value); setBills([]); setSelectedFuelIds(new Set()); }} style={INPUT_STYLE}>
              <option value="">— Select Project —</option>
              {assignments.map((a) => (
                <option key={a.project_code} value={a.project_code}>
                  {a.project_code} · Balance: {formatOMR(a.available_balance)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Date */}
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="pc-sub-date" style={LABEL_STYLE}>Submission Date *</label>
          <input id="pc-sub-date" type="date" value={submissionDate} onChange={(e) => setSubmissionDate(e.target.value)} style={INPUT_STYLE} />
        </div>

        {/* Balance indicator */}
        {selectedAssignment && (
          <div style={{
            padding: "0.875rem 1rem", borderRadius: "0.75rem",
            background: "rgba(30,58,95,0.08)", border: "1px solid rgba(30,58,95,0.15)",
            marginBottom: "1.25rem", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem",
          }}>
            <div>
              <p style={{ fontSize: "0.65rem", opacity: 0.6 }}>Available</p>
              <p style={{ fontWeight: 700, fontSize: "0.9rem", color: selectedAssignment.available_balance < 0 ? "#dc2626" : "#16a34a" }}>
                {formatOMR(selectedAssignment.available_balance)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: "0.65rem", opacity: 0.6 }}>Total Claimed</p>
              <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>{formatOMR(totalClaimed)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.65rem", opacity: 0.6 }}>Personal Funded</p>
              <p style={{ fontWeight: 700, fontSize: "0.9rem", color: personalFunded > 0 ? "#dc2626" : "inherit" }}>
                {formatOMR(personalFunded)}
              </p>
            </div>
          </div>
        )}

        {/* === ADD EXPENSE BILL === */}
        <div style={{
          border: "1px solid rgba(100,100,100,0.15)",
          borderRadius: "1rem",
          padding: "1rem",
          marginBottom: "1.25rem",
          background: "rgba(100,100,100,0.02)",
        }}>
          <h3 style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Plus width="0.9rem" /> Add Expense Bill
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={LABEL_STYLE}>Category *</label>
              <select id="pc-new-category" value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : "")} style={INPUT_STYLE}>
                <option value="">— Select —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.category_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Bill Date *</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={INPUT_STYLE} max={moment().format("YYYY-MM-DD")} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Amount (OMR) *</label>
              <input type="number" step="0.001" min="0.001" placeholder="0.000" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={LABEL_STYLE}>Description *</label>
              <input type="text" placeholder="Describe the expense..." value={newParticulars} onChange={(e) => setNewParticulars(e.target.value)} style={INPUT_STYLE} />
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={addBillLine}
            style={{
              marginTop: "0.875rem", width: "100%",
              padding: "0.7rem", borderRadius: "0.65rem",
              border: "none", background: "#1e3a5f",
              color: "white", fontWeight: 600, fontSize: "0.875rem",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            }}
          >
            <Plus width="0.9rem" /> Add Bill
          </motion.button>
        </div>

        {/* === FUEL BILLS === */}
        {selectedProject && (
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Fuel width="0.9rem" color="#d97706" />
              <h3 style={{ fontWeight: 700, fontSize: "0.875rem" }}>Unpaid Fuel Bills</h3>
              {loadingFuel && <Loader2 className="animate-spin" width="0.8rem" />}
            </div>
            {!loadingFuel && fuelBills.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "#64748b", padding: "0.75rem 0" }}>
                No eligible fuel bills found for this project.
              </p>
            )}
            {fuelBills.map((fuel) => {
              const selected = selectedFuelIds.has(fuel.id);
              return (
                <motion.div
                  key={fuel.id}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => toggleFuelBill(fuel)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.75rem 1rem", borderRadius: "0.65rem",
                    border: `1px solid ${selected ? "#d97706" : "rgba(100,100,100,0.15)"}`,
                    background: selected ? "rgba(217,119,6,0.07)" : "transparent",
                    marginBottom: "0.5rem", cursor: "pointer",
                  }}
                >
                  {selected ? <CheckSquare width="1.1rem" color="#d97706" /> : <Square width="1.1rem" opacity={0.4} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {moment(fuel.date).format("DD MMM YYYY")} · {fuel.vehicle_number || "—"}
                    </p>
                    <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      {fuel.odometer_reading ? `${fuel.odometer_reading} km` : ""} {fuel.litres ? `· ${fuel.litres}L` : ""}
                    </p>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem", whiteSpace: "nowrap" }}>
                    {formatOMR(fuel.amount_spent)}
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* === BILLS LIST === */}
        {bills.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              Bills to Submit ({bills.length})
            </h3>
            <AnimatePresence>
              {bills.map((bill) => (
                <motion.div
                  key={bill.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.75rem 0.875rem", borderRadius: "0.65rem",
                    border: "1px solid rgba(100,100,100,0.12)",
                    marginBottom: "0.5rem",
                    background: bill.is_fuel ? "rgba(217,119,6,0.04)" : "transparent",
                  }}
                >
                  {bill.is_fuel && <Fuel width="0.9rem" color="#d97706" style={{ flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: "0.82rem" }}>{bill.category_name}</p>
                    <p style={{ fontSize: "0.72rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {moment(bill.trans_date).format("DD MMM")} · {bill.particulars}
                    </p>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem", whiteSpace: "nowrap" }}>
                    {formatOMR(parseFloat(bill.exp_amount))}
                  </p>
                  <button
                    onClick={() => removeBill(bill.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", color: "#dc2626" }}
                  >
                    <Trash2 width="0.9rem" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Total */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 0.875rem", borderTop: "1px solid rgba(100,100,100,0.15)", marginTop: "0.25rem" }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 700 }}>{formatOMR(totalClaimed)}</span>
            </div>
            {personalFunded > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.875rem", background: "rgba(220,38,38,0.07)", borderRadius: "0.5rem", marginTop: "0.5rem" }}>
                <AlertCircle width="0.9rem" color="#dc2626" />
                <span style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 600 }}>
                  {formatOMR(personalFunded)} will be personally funded (exceeds available balance)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Submit buttons */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={submitting}
            onClick={handleSubmit}
            style={{
              flex: 1, padding: "0.875rem", borderRadius: "0.75rem",
              border: "none", background: "#1e3a5f",
              color: "white", fontSize: "0.9rem", fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            }}
          >
            {submitting ? <Loader2 className="animate-spin" width="1rem" /> : <Send width="1rem" />}
            Submit for Approval
          </motion.button>
        </div>

        {/* Unreimbursed bills report */}
        <section style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid rgba(100,100,100,0.15)", borderRadius: "0.875rem" }}>
          <h3 style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Unreimbursed Bills</h3>
          <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.875rem" }}>Only finance-approved submissions with an outstanding reimbursement are included. Filtered by submission date.</p>
          <div className="pc-report-controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={LABEL_STYLE}>From<input type="date" value={reportFrom} onChange={(e) => { setReportFrom(e.target.value); setReportLoaded(false); }} style={{ ...INPUT_STYLE, marginTop: "0.3rem" }} /></label>
            <label style={LABEL_STYLE}>To<input type="date" value={reportTo} onChange={(e) => { setReportTo(e.target.value); setReportLoaded(false); }} style={{ ...INPUT_STYLE, marginTop: "0.3rem" }} /></label>
          </div>
          <div className="pc-report-controls" style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button type="button" onClick={loadUnsettledSubmissions} disabled={loadingReport} style={{ flex: 1, padding: "0.7rem", borderRadius: "0.6rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 600, cursor: "pointer" }}>
              {loadingReport ? "Loading..." : "Load Unreimbursed Bills"}
            </button>
            {reportLoaded && unsettledSubmissions.length > 0 && (
              <button type="button" onClick={printUnsettledSubmissions} style={{ padding: "0.7rem 1rem", borderRadius: "0.6rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Printer width="0.9rem" /> Print
              </button>
            )}
          </div>
          {reportLoaded && (
            <div className="pc-print-report" style={{ overflowX: "auto" }}>
              <header className="pc-report-heading" style={{ textAlign: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontWeight: 700 }}>Sohar Star United LLC</h2>
                <p>Petty Cash Bill Submission Report</p>
                <p>{moment(reportFrom).format("DD MMM YYYY")} – {moment(reportTo).format("DD MMM YYYY")}</p>
              </header>
              {unsettledSubmissions.length === 0 ? (
                <p style={{ textAlign: "center", color: "#64748b", padding: "1rem" }}>No unreimbursed bills in this date range.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead><tr style={{ background: "#e5e7eb" }}>
                    {["Date", "Submission No.", "Project", "Custodian", "Material / Service Details", "Approved", "Reimbursed", "Outstanding"].map((heading) => (
                      <th key={heading} style={{ border: "1px solid #111", padding: "0.4rem", textAlign: ["Approved", "Reimbursed", "Outstanding"].includes(heading) ? "right" : "left" }}>{heading}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {unsettledSubmissions.map((submission) => (
                      <tr key={submission.id}>
                        <td style={{ border: "1px solid #111", padding: "0.4rem" }}>{moment(submission.submission_date).format("DD MMM YYYY")}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem" }}>{submission.submission_number}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem" }}>{submission.project_code}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem" }}>{submission.emp_id}{submission.custodian_name ? ` · ${submission.custodian_name}` : ""}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem" }}>{submission.particulars.join("; ")}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem", textAlign: "right" }}>{formatOMR(submission.approved_amount)}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem", textAlign: "right" }}>{formatOMR(submission.reimbursed_amount)}</td>
                        <td style={{ border: "1px solid #111", padding: "0.4rem", textAlign: "right" }}>{formatOMR(submission.outstanding)}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={7} style={{ border: "1px solid #111", padding: "0.4rem", textAlign: "right", fontWeight: 700 }}>Total Outstanding</td>
                      <td style={{ border: "1px solid #111", padding: "0.4rem", textAlign: "right", fontWeight: 700 }}>{formatOMR(unsettledSubmissions.reduce((total, submission) => total + submission.outstanding, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              <div className="pc-report-signatures" style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
                <span>Prepared By</span><span>Approved By</span>
              </div>
            </div>
          )}
        </section>
      </div>
      <style>{`@media print {
        @page { size: A4 landscape; margin: 10mm; }
        body.pc-print-mode * { visibility: hidden !important; }
        body.pc-print-mode .pc-print-report, body.pc-print-mode .pc-print-report * { visibility: visible !important; }
        body.pc-print-mode .pc-print-report { position: fixed; inset: 0; width: 100%; overflow: visible !important; background: white; color: black; padding: 0; font-size: 10px; }
        body.pc-print-mode .pc-report-controls { display: none !important; }
        body.pc-print-mode .pc-report-heading { margin-bottom: 8px !important; }
      }`}</style>
    </motion.div>
  );
}
