import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  AlertCircle, Check, Loader2, Plus, UserCog, X,
} from "lucide-react";
import moment from "moment";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type PettyCashUser, formatOMR } from "./types";

interface EmployeeOption {
  emp_id: string;
  name: string;
}

interface ProjectOption {
  project_code: string;
  project_name: string;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  borderRadius: "0.65rem",
  border: "1px solid rgba(100,100,100,0.2)",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.3rem", display: "block", opacity: 0.7,
};

export default function Assignments() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === "admin";

  const [assignments, setAssignments] = useState<PettyCashUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Create/edit assignment dialog
  const [createDialog, setCreateDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<PettyCashUser | null>(null);
  const [formProject, setFormProject] = useState("");
  const [formEmpId, setFormEmpId] = useState("");
  const [formApprover, setFormApprover] = useState("");
  const [formFinApprover, setFormFinApprover] = useState("");
  const [formOpBalance, setFormOpBalance] = useState("0");
  const [formOpDate, setFormOpDate] = useState(moment().format("YYYY-MM-DD"));
  const [formLoading, setFormLoading] = useState(false);

  // Handover dialog
  const [handoverDialog, setHandoverDialog] = useState<PettyCashUser | null>(null);
  const [handoverNewEmp, setHandoverNewEmp] = useState("");
  const [handoverOpBalance, setHandoverOpBalance] = useState("0");
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverValidation, setHandoverValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pettycash_user")
        .select("*")
        .order("project_code");
      if (error) throw error;
      setAssignments(data || []);

      const { data: empData } = await supabase
        .from("employees")
        .select("emp_id, name")
        .not("emp_id", "is", null)
        .order("name");
      setEmployees((empData || []).map((e) => ({ emp_id: String(e.emp_id), name: e.name || "" })));

      const { data: projData } = await supabase
        .from("projects")
        .select("project_code, project_name")
        .order("project_code");
      setProjects(projData || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setFormProject("");
    setFormEmpId("");
    setFormApprover("");
    setFormFinApprover("");
    setFormOpBalance("0");
    setFormOpDate(moment().format("YYYY-MM-DD"));
    setCreateDialog(true);
  };

  const openEdit = (a: PettyCashUser) => {
    setEditTarget(a);
    setFormProject(a.project_code);
    setFormEmpId(a.emp_id);
    setFormApprover(a.approver_id || "");
    setFormFinApprover(a.finapprover_id || "");
    setFormOpBalance(String(a.op_balance));
    setFormOpDate(a.op_date || moment().format("YYYY-MM-DD"));
    setCreateDialog(true);
  };

  const handleSave = async () => {
    if (!formProject || !formEmpId) { toast.error("Project and custodian are required"); return; }
    setFormLoading(true);
    try {
      if (editTarget) {
        // Update existing
        const { error } = await supabase.from("pettycash_user").update({
          approver_id: formApprover || null,
          finapprover_id: formFinApprover || null,
          op_balance: parseFloat(formOpBalance) || 0,
          op_date: formOpDate || null,
          updated_at: new Date().toISOString(),
        }).eq("id", editTarget.id);
        if (error) throw error;
        toast.success("Assignment updated");
      } else {
        // Check if project already has active assignment
        const { data: existing } = await supabase
          .from("pettycash_user")
          .select("id")
          .eq("project_code", formProject)
          .eq("active", true)
          .maybeSingle();
        if (existing) { toast.error("This project already has an active assignment. Use Change Custodian to replace it."); return; }

        const { error } = await supabase.from("pettycash_user").insert({
          project_code: formProject,
          emp_id: formEmpId,
          approver_id: formApprover || null,
          finapprover_id: formFinApprover || null,
          op_balance: parseFloat(formOpBalance) || 0,
          op_date: formOpDate || null,
          active: true,
        });
        if (error) throw error;
        toast.success("Assignment created");
      }
      setCreateDialog(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save assignment");
    } finally {
      setFormLoading(false);
    }
  };

  const openHandover = async (a: PettyCashUser) => {
    setHandoverDialog(a);
    setHandoverNewEmp("");
    setHandoverOpBalance("0");
    setHandoverValidation(null);
    setValidating(true);
    try {
      const { data, error } = await supabase.rpc("pc_validate_handover", { p_project_code: a.project_code });
      if (error) throw error;
      setHandoverValidation(data);
    } catch (err: any) {
      setHandoverValidation({ can_proceed: false, issues: [{ message: err?.message }] });
    } finally {
      setValidating(false);
    }
  };

  const handleHandover = async () => {
    if (!handoverDialog || !handoverNewEmp) { toast.error("Select new custodian"); return; }
    if (!handoverValidation?.can_proceed) { toast.error("Handover blocked — resolve outstanding items first"); return; }
    setHandoverLoading(true);
    try {
      const { error } = await supabase.rpc("pc_perform_handover", {
        p_project_code: handoverDialog.project_code,
        p_new_emp_id: handoverNewEmp,
        p_new_approver: "",
        p_new_finapprover: "",
        p_performed_by: userData?.emp_id || userData?.email || "admin",
        p_op_balance: parseFloat(handoverOpBalance) || 0,
        p_op_date: moment().format("YYYY-MM-DD"),
      });
      if (error) throw error;
      toast.success(`Handover complete — new custodian: ${handoverNewEmp}`);
      setHandoverDialog(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Handover failed");
    } finally {
      setHandoverLoading(false);
    }
  };

  const grouped = assignments.reduce<Record<string, PettyCashUser[]>>((acc, a) => {
    if (!acc[a.project_code]) acc[a.project_code] = [];
    acc[a.project_code].push(a);
    return acc;
  }, {});

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="Assignments" icon={<UserCog width="1.125rem" />}
        extra={
          isAdmin && (
            <button
              onClick={openCreate}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.875rem", borderRadius: "0.6rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
            >
              <Plus width="0.85rem" /> New
            </button>
          )
        }
      />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 680, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}><Loader2 className="animate-spin" /></div>
        ) : (
          Object.entries(grouped).map(([projectCode, list]) => (
            <div key={projectCode} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.5rem", color: "#1e3a5f" }}>{projectCode}</h3>
              {list.map((a) => (
                <div key={a.id} style={{
                  border: `1px solid ${a.active ? "rgba(22,163,74,0.25)" : "rgba(100,100,100,0.12)"}`,
                  borderRadius: "0.875rem", padding: "1rem", marginBottom: "0.5rem",
                  background: a.active ? "rgba(22,163,74,0.03)" : "rgba(100,100,100,0.02)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>Custodian: {a.emp_id}</p>
                      <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        Approver: {a.approver_id || "—"} · Finance: {a.finapprover_id || "—"}
                      </p>
                      <p style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        Opening: {formatOMR(a.op_balance)} {a.op_date ? `· ${moment(a.op_date).format("DD MMM YYYY")}` : ""}
                      </p>
                    </div>
                    <span style={{
                      padding: "0.2rem 0.5rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 700,
                      background: a.active ? "#16a34a20" : "#64748b20",
                      color: a.active ? "#16a34a" : "#64748b",
                    }}>
                      {a.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => openEdit(a)}
                        style={{ flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      {a.active && (
                        <button
                          onClick={() => openHandover(a)}
                          style={{ flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "none", background: "#d97706", color: "white", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                        >
                          <UserCog width="0.75rem" /> Change Custodian
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Dialog */}
      {createDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            style={{ background: "var(--background, #fff)", borderRadius: "1.25rem 1.25rem 0 0", padding: "1.5rem", width: "100%", maxWidth: 520, maxHeight: "90svh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontWeight: 700 }}>{editTarget ? "Edit Assignment" : "New Assignment"}</h3>
              <button onClick={() => setCreateDialog(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X width="1.25rem" /></button>
            </div>

            {!editTarget && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={LABEL_STYLE}>Project *</label>
                <select value={formProject} onChange={(e) => setFormProject(e.target.value)} style={INPUT_STYLE}>
                  <option value="">— Select Project —</option>
                  {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
                </select>
              </div>
            )}
            {!editTarget && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={LABEL_STYLE}>Custodian *</label>
                <select value={formEmpId} onChange={(e) => setFormEmpId(e.target.value)} style={INPUT_STYLE}>
                  <option value="">— Select Employee —</option>
                  {employees.map((e) => <option key={e.emp_id} value={e.emp_id}>{e.emp_id} — {e.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom: "1rem" }}>
              <label style={LABEL_STYLE}>Petty Cash Approver</label>
              <select value={formApprover} onChange={(e) => setFormApprover(e.target.value)} style={INPUT_STYLE}>
                <option value="">— None —</option>
                {employees.map((e) => <option key={e.emp_id} value={e.emp_id}>{e.emp_id} — {e.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={LABEL_STYLE}>Finance Approver</label>
              <select value={formFinApprover} onChange={(e) => setFormFinApprover(e.target.value)} style={INPUT_STYLE}>
                <option value="">— None —</option>
                {employees.map((e) => <option key={e.emp_id} value={e.emp_id}>{e.emp_id} — {e.name}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div>
                <label style={LABEL_STYLE}>Opening Balance (OMR)</label>
                <input type="number" step="0.001" min="0" value={formOpBalance} onChange={(e) => setFormOpBalance(e.target.value)} style={INPUT_STYLE} />
              </div>
              <div>
                <label style={LABEL_STYLE}>Opening Date</label>
                <input type="date" value={formOpDate} onChange={(e) => setFormOpDate(e.target.value)} style={INPUT_STYLE} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setCreateDialog(false)} style={{ flex: 1, padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={formLoading} style={{ flex: 2, padding: "0.75rem", borderRadius: "0.65rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                {formLoading ? <Loader2 className="animate-spin" width="1rem" /> : <Check width="1rem" />} Save
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Handover Dialog */}
      {handoverDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            style={{ background: "var(--background, #fff)", borderRadius: "1.25rem 1.25rem 0 0", padding: "1.5rem", width: "100%", maxWidth: 520, maxHeight: "90svh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontWeight: 700 }}>Change Custodian — {handoverDialog.project_code}</h3>
              <button onClick={() => setHandoverDialog(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X width="1.25rem" /></button>
            </div>

            {validating && (
              <div style={{ textAlign: "center", padding: "1rem" }}>
                <Loader2 className="animate-spin" /> <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>Validating outstanding items...</p>
              </div>
            )}

            {handoverValidation && (
              <>
                {!handoverValidation.can_proceed ? (
                  <div style={{ padding: "1rem", borderRadius: "0.75rem", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", color: "#dc2626" }}>
                      <AlertCircle width="1rem" />
                      <strong>Handover Blocked</strong>
                    </div>
                    {(handoverValidation.issues || []).map((issue: any, i: number) => (
                      <p key={i} style={{ fontSize: "0.8rem", color: "#dc2626", marginBottom: "0.25rem" }}>· {issue.message}</p>
                    ))}
                    <p style={{ fontSize: "0.78rem", marginTop: "0.5rem", color: "#64748b" }}>
                      Resolve all outstanding items before proceeding with handover.
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: "0.875rem", borderRadius: "0.75rem", background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.2)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Check width="1rem" color="#16a34a" />
                    <span style={{ fontSize: "0.82rem", color: "#16a34a", fontWeight: 600 }}>All checks passed — handover can proceed</span>
                  </div>
                )}

                {handoverValidation.can_proceed && (
                  <>
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={LABEL_STYLE}>New Custodian *</label>
                      <select value={handoverNewEmp} onChange={(e) => setHandoverNewEmp(e.target.value)} style={INPUT_STYLE}>
                        <option value="">— Select New Custodian —</option>
                        {employees.filter((e) => e.emp_id !== handoverDialog.emp_id).map((e) => (
                          <option key={e.emp_id} value={e.emp_id}>{e.emp_id} — {e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: "1.25rem" }}>
                      <label style={LABEL_STYLE}>Opening Balance for New Custodian (OMR)</label>
                      <input type="number" step="0.001" min="0" value={handoverOpBalance} onChange={(e) => setHandoverOpBalance(e.target.value)} style={INPUT_STYLE} />
                      <p style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.3rem" }}>
                        Physical cash handed over must be explicitly reconciled. New custodian does not inherit old balance.
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button onClick={() => setHandoverDialog(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                      <button onClick={handleHandover} disabled={handoverLoading || !handoverNewEmp} style={{ flex: 2, padding: "0.75rem", borderRadius: "0.65rem", border: "none", background: "#d97706", color: "white", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                        {handoverLoading ? <Loader2 className="animate-spin" width="1rem" /> : <UserCog width="1rem" />} Confirm Handover
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
