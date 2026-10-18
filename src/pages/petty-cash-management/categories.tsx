import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Loader2, Plus, Tag, Pencil, Power, PowerOff, X, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type PettyCashExpenseCategory } from "./types";
import { usePettyCashAccess } from "./usePettyCashAccess";
import AccessDenied from "./AccessDenied";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  borderRadius: "0.65rem",
  border: "1px solid rgba(100,100,100,0.2)",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function Categories() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === "admin";
  const { loading: accessLoading, canAccessCategories } = usePettyCashAccess();

  const [categories, setCategories] = useState<PettyCashExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  // Dialog
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; cat?: PettyCashExpenseCategory } | null>(null);
  const [formName, setFormName] = useState("");
  const [formSort, setFormSort] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("petty_cash_expense_category")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("category_name");
      if (error) throw error;
      setCategories(data || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setFormName("");
    setFormSort("");
    setDialog({ mode: "create" });
  };

  const openEdit = (cat: PettyCashExpenseCategory) => {
    setFormName(cat.category_name);
    setFormSort(String(cat.sort_order ?? ""));
    setDialog({ mode: "edit", cat });
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Category name is required"); return; }
    setSaving(true);
    try {
      if (dialog?.mode === "create") {
        const { error } = await supabase.from("petty_cash_expense_category").insert({
          category_name: formName.trim(),
          sort_order: formSort ? parseInt(formSort) : null,
          active: true,
        });
        if (error) throw error;
        toast.success("Category created");
      } else if (dialog?.cat) {
        const { error } = await supabase.from("petty_cash_expense_category").update({
          category_name: formName.trim(),
          sort_order: formSort ? parseInt(formSort) : null,
          updated_at: new Date().toISOString(),
        }).eq("id", dialog.cat.id);
        if (error) throw error;
        toast.success("Category updated");
      }
      setDialog(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: PettyCashExpenseCategory) => {
    try {
      const { error } = await supabase.from("petty_cash_expense_category").update({
        active: !cat.active,
        updated_at: new Date().toISOString(),
      }).eq("id", cat.id);
      if (error) throw error;
      toast.success(cat.active ? "Category deactivated" : "Category activated");
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update category");
    }
  };

  const filtered = categories.filter((c) => {
    if (filter === "active") return c.active;
    if (filter === "inactive") return !c.active;
    return true;
  });

  if (!accessLoading && !canAccessCategories) {
    return (
      <AccessDenied
        title="Categories Restricted"
        message="Access to expense categories is restricted to Finance Approvers and Administrators."
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100svh", paddingBottom: "2rem" }}>
      <Back fixed blurBG title="Expense Categories" icon={<Tag width="1.125rem" />}
        extra={
          canAccessCategories && (
            <button
              onClick={openCreate}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.875rem", borderRadius: "0.6rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
            >
              <Plus width="0.85rem" /> Add
            </button>
          )
        }
      />

      <div style={{ paddingTop: "5rem", padding: "5rem 1rem 2rem", maxWidth: 560, margin: "0 auto" }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", background: "rgba(100,100,100,0.07)", borderRadius: "0.65rem", padding: "0.2rem" }}>
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1, padding: "0.5rem", borderRadius: "0.5rem", border: "none",
                background: filter === f ? "#1e3a5f" : "transparent",
                color: filter === f ? "white" : "inherit",
                fontWeight: 600, fontSize: "0.8rem", cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}><Loader2 className="animate-spin" /></div>
        ) : (
          filtered.map((cat) => (
            <div key={cat.id} style={{
              display: "flex", alignItems: "center", gap: "0.75rem",
              padding: "0.875rem 1rem", borderRadius: "0.75rem",
              border: `1px solid ${cat.active ? "rgba(100,100,100,0.12)" : "rgba(100,100,100,0.07)"}`,
              marginBottom: "0.5rem",
              opacity: cat.active ? 1 : 0.55,
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>{cat.category_name}</p>
                <p style={{ fontSize: "0.7rem", color: "#64748b" }}>
                  Sort: {cat.sort_order ?? "—"} · {cat.active ? "Active" : "Inactive"}
                </p>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    onClick={() => openEdit(cat)}
                    style={{ padding: "0.4rem", borderRadius: "0.45rem", border: "1px solid rgba(100,100,100,0.15)", background: "transparent", cursor: "pointer" }}
                  >
                    <Pencil width="0.8rem" />
                  </button>
                  <button
                    onClick={() => toggleActive(cat)}
                    title={cat.active ? "Deactivate" : "Activate"}
                    style={{ padding: "0.4rem", borderRadius: "0.45rem", border: "none", background: cat.active ? "rgba(220,38,38,0.1)" : "rgba(22,163,74,0.1)", cursor: "pointer", color: cat.active ? "#dc2626" : "#16a34a" }}
                  >
                    {cat.active ? <PowerOff width="0.8rem" /> : <Power width="0.8rem" />}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Dialog */}
      {dialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            style={{ background: "var(--background, #fff)", borderRadius: "1.25rem 1.25rem 0 0", padding: "1.5rem", width: "100%", maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h3 style={{ fontWeight: 700 }}>{dialog.mode === "create" ? "New Category" : "Edit Category"}</h3>
              <button onClick={() => setDialog(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X width="1.25rem" /></button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Category Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Building Materials" style={INPUT_STYLE} />
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Sort Order</label>
              <input type="number" min="0" step="10" value={formSort} onChange={(e) => setFormSort(e.target.value)} placeholder="e.g., 100" style={INPUT_STYLE} />
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setDialog(null)} style={{ flex: 1, padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid rgba(100,100,100,0.2)", background: "transparent", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "0.75rem", borderRadius: "0.65rem", border: "none", background: "#1e3a5f", color: "white", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                {saving ? <Loader2 className="animate-spin" width="1rem" /> : <Check width="1rem" />} Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
