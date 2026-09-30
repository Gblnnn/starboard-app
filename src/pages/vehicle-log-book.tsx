import AddRecordButton from "@/components/add-record-button";
import Back from "@/components/back";
import DropDown from "@/components/dropdown";
import NumberPlate from "@/components/number-plate";
import RefreshButton from "@/components/refresh-button";
import { ResponsiveModal } from "@/components/responsive-modal";
import DefaultDialog from "@/components/ui/default-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { AnimatePresence, motion } from "framer-motion";
import {
  Car,
  EllipsisVertical,
  Plus,
  Search
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  vehicle_number: string;
  make: string;
  model: string;
  year: string;
  type: string;
  status: string;
  registration_type: string;
  assigned_to: string | null; // stores emp_id from employees table
  notes: string;
  created_at?: string;
}

interface FuelLog {
  id: string;
  date: string;
  odometer_reading: number;
  amount_spent: number;
  litres: number;
  vehicle_number: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const computeStats = (logs: FuelLog[]) => {
  const empty = {
    totalKm: 0, totalFuel: 0, avgMileage: 0,
    monthlyData: MONTHS.map(m => ({ name: m, fuel: 0 })),
  };
  if (logs.length === 0) return empty;

  const sorted = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const readings = sorted.map(l => Number(l.odometer_reading)).filter(r => r > 0);
  const totalKm = readings.length >= 2 ? Math.max(...readings) - Math.min(...readings) : 0;
  const totalFuel = logs.reduce((sum, l) => sum + (Number(l.litres) || 0), 0);
  const avgMileage = totalFuel > 0 && totalKm > 0 ? totalKm / totalFuel : 0;
  const year = new Date().getFullYear();

  const monthlyData = MONTHS.map((name, idx) => ({
    name,
    fuel: Math.round(
      logs
        .filter(l => new Date(l.date).getMonth() === idx && new Date(l.date).getFullYear() === year)
        .reduce((sum, l) => sum + (Number(l.litres) || 0), 0) * 10,
    ) / 10,
  }));

  return {
    totalKm,
    totalFuel: Math.round(totalFuel * 10) / 10,
    avgMileage: Math.round(avgMileage * 10) / 10,
    monthlyData,
  };
};


const CONDITIONS = ["Excellent", "Good", "Fair", "Poor", "Needs Repair"];
const REG_TYPES = ["Private", "Commercial", "Government"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function VehicleLogBook() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // employees list: id = emp_id, name = display name
  const [records, setRecords] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshCompleted, setRefreshCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // detail sheet
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLogs, setDetailLogs] = useState<FuelLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // add / edit form
  const [formOpen, setFormOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // form fields
  const [fPlate, setFPlate] = useState("");
  const [fMake, setFMake] = useState("");
  const [fModel, setFModel] = useState("");
  const [fYear, setFYear] = useState("");
  const [fType, setFType] = useState("");
  const [fRegType, setFRegType] = useState("Private");
  const [fCondition, setFCondition] = useState("Good");
  const [fNotes, setFNotes] = useState("");
  const [fAssignedTo, setFAssignedTo] = useState<string | null>(null);

  // assignee dialog
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeTarget, setAssigneeTarget] = useState<"form" | "direct">("form");

  // delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vehiclesRes, employeesRes] = await Promise.all([
        supabase.from("vehicle_master").select("*").order("vehicle_number"),
        supabase.from("employees").select("emp_id, name").not("emp_id", "is", null).order("name"),
      ]);

      if (vehiclesRes.error) {
        console.error("❌ vehicle_master error:", vehiclesRes.error);
        throw vehiclesRes.error;
      }
      if (employeesRes.error) {
        console.error("❌ employees error:", employeesRes.error);
        throw employeesRes.error;
      }
      console.log(`✅ vehicles: ${vehiclesRes.data?.length ?? 0}, employees: ${employeesRes.data?.length ?? 0}`);

      setVehicles(
        (vehiclesRes.data || []).map(d => ({
          id: d.id,
          vehicle_number: d.vehicle_number || "",
          make: d.make || "",
          model: d.model || "",
          year: d.year || "",
          type: d.type || "",
          status: d.status || "Good",
          registration_type: d.registration_type || "Private",
          assigned_to: d.assigned_to || null,  // emp_id value
          notes: d.notes || "",
          created_at: d.created_at,
        })),
      );

      // Map emp_id → id, name → name so the rest of the component works unchanged
      setRecords(
        (employeesRes.data || []).map(e => ({
          id: e.emp_id,
          name: e.name || "Unknown",
        })),
      );

      setRefreshCompleted(true);
      setTimeout(() => setRefreshCompleted(false), 1000);
    } catch (err) {
      console.error("Error fetching vehicles:", err);
      toast.error("Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  };

  const fetchFuelLogs = async (vehicleNumber: string) => {
    setDetailLoading(true);
    setDetailLogs([]);
    try {
      const { data, error } = await supabase
        .from("fuel_log")
        .select("*")
        .eq("vehicle_number", vehicleNumber)
        .order("date", { ascending: true });

      if (error) throw error;

      setDetailLogs(
        (data || []).map(d => ({
          id: d.id,
          date: d.date || "",
          odometer_reading: Number(d.odometer_reading) || 0,
          amount_spent: Number(d.amount_spent) || 0,
          litres: Number(d.litres) || 0,
          vehicle_number: d.vehicle_number || "",
        })),
      );
    } catch (err) {
      console.error("Error fetching fuel logs:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Map emp_id → employee name for display
  const recordNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of records) m.set(r.id, r.name);
    return m;
  }, [records]);

  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(
      v =>
        v.vehicle_number.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q) ||
        v.year.toLowerCase().includes(q),
    );
  }, [vehicles, searchQuery]);

  const filteredRecords = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    const base = q
      ? records.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
      : records;
    return base.slice(0, 50);
  }, [records, assigneeSearch]);

  const stats = useMemo(() => computeStats(detailLogs), [detailLogs]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditMode(false);
    setFPlate(""); setFMake(""); setFModel(""); setFYear("");
    setFType(""); setFRegType("Private"); setFCondition("Good");
    setFNotes(""); setFAssignedTo(null);
    setFormOpen(true);
  };

  const openEdit = () => {
    if (!selectedVehicle) return;
    setEditMode(true);
    setFPlate(selectedVehicle.vehicle_number);
    setFMake(selectedVehicle.make);
    setFModel(selectedVehicle.model);
    setFYear(selectedVehicle.year);
    setFType(selectedVehicle.type);
    setFRegType(selectedVehicle.registration_type);
    setFCondition(selectedVehicle.status);
    setFNotes(selectedVehicle.notes);
    setFAssignedTo(selectedVehicle.assigned_to);
    setDetailOpen(false);
    setFormOpen(true);
  };

  const openDetail = (v: Vehicle) => {
    setSelectedVehicle(v);
    setDetailOpen(true);
    fetchFuelLogs(v.vehicle_number);
  };

  const saveVehicle = async () => {
    if (!fPlate.trim() || !fMake.trim()) {
      toast.error("Vehicle number and make are required");
      return;
    }
    setSaving(true);
    try {
      if (editMode && selectedVehicle) {
        const { error } = await supabase
          .from("vehicle_master")
          .update({
            vehicle_number: fPlate.trim(),
            make: fMake.trim(),
            model: fModel.trim(),
            year: fYear.trim(),
            type: fType.trim(),
            registration_type: fRegType,
            status: fCondition,
            assigned_to: fAssignedTo,  // emp_id
            notes: fNotes.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedVehicle.id);
        if (error) throw error;
        toast.success("Vehicle updated");
      } else {
        const { error } = await supabase
          .from("vehicle_master")
          .insert({
            vehicle_number: fPlate.trim(),
            make: fMake.trim(),
            model: fModel.trim(),
            year: fYear.trim(),
            type: fType.trim(),
            registration_type: fRegType,
            status: fCondition,
            assigned_to: fAssignedTo,  // emp_id
            notes: fNotes.trim(),
          });
        if (error) throw error;
        toast.success("Vehicle added");
      }
      setFormOpen(false);
      await fetchData();
    } catch (err) {
      console.error("Error saving vehicle:", err);
      toast.error("Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  };

  const deleteVehicle = async () => {
    if (!selectedVehicle) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vehicle_master")
        .delete()
        .eq("id", selectedVehicle.id);
      if (error) throw error;
      toast.success("Vehicle deleted");
      setDetailOpen(false);
      setDeleteConfirm(false);
      await fetchData();
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      toast.error("Failed to delete vehicle");
    } finally {
      setSaving(false);
    }
  };

  const directAssign = async (empId: string | null) => {
    if (!selectedVehicle) return;
    setSaving(true);
    try {
//      const oldAssigned = selectedVehicle.assigned_to;
      const { error } = await supabase
        .from("vehicle_master")
        .update({
          assigned_to: empId,  // emp_id
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedVehicle.id);
      if (error) throw error;
      toast.success(empId ? "Vehicle assigned" : "Assignment cleared");
      setAssigneeOpen(false);
      const updated = { ...selectedVehicle, assigned_to: empId };
      setSelectedVehicle(updated);
      setVehicles(prev => prev.map(v => v.id === selectedVehicle.id ? updated : v));
    } catch (err) {
      console.error("Error assigning vehicle:", err);
      toast.error("Failed to assign vehicle");
    } finally {
      setSaving(false);
    }
  };

  // ── Style helpers ─────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    padding: "0.7rem 0.85rem",
    borderRadius: "0.65rem",
    background: "rgba(150,150,150,0.12)",
    fontSize: "0.9rem",
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  };

  const formField = (label: string, node: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(0,0,0,0.42)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {node}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100svh", background: "rgba(248,249,252,1)" }}>
      <Back
        fixed
        blurBG
        title="Vehicles"
     
        extra={
          <RefreshButton
            fetchingData={loading}
            onClick={fetchData}
            refreshCompleted={refreshCompleted}
          />
        }
      />
      <div style={{ height: "4rem" }} />

      {/* Search bar */}
      <div style={{ position: "sticky", top: "4.5rem", zIndex: 10, background: "rgba(248,249,252,0.95)", backdropFilter: "blur(8px)", padding: "0.65rem 1rem", borderBottom: "1px solid rgba(100,100,100,0.08)" }}>
        <div style={{ position: "relative" }}>
          <Search width={15} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search by plate, make, model…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: "2.2rem", fontSize: "0.875rem" }}
          />
        </div>
      </div>

      {/* Vehicle list */}
      <div style={{ padding: "0.75rem 1rem 6rem", paddingTop: "1.25rem" }}>
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50svh" }}>
              <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "3px solid rgba(0,0,139,0.15)", borderTopColor: "darkblue", animation: "vspin 0.8s linear infinite" }} />
            </motion.div>
          ) : filteredVehicles.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "50svh", gap: "0.65rem", opacity: 0.4 }}>
              <Car size={44} />
              <p style={{ fontWeight: 700, fontSize: "1rem" }}>{searchQuery ? "No results" : "No vehicles yet"}</p>
              <p style={{ fontSize: "0.8rem" }}>{searchQuery ? "Try a different search" : "Tap + to add a vehicle"}</p>
            </motion.div>
          ) : (
            <div style={{ display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "repeat(4, 1fr)", gap: "0.6rem" }}>
              {filteredVehicles.map((vehicle, i) => (
                <motion.div
                  key={vehicle.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025 }}
                >
                  <div
                    onClick={() => openDetail(vehicle)}
                    style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.75rem", borderRadius: "0.75rem", background: "rgba(100,100,100,0.05)", cursor: "pointer", userSelect: "none" }}
                  >
                    <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", background: "rgba(0,0,139,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Car width="1rem" color="darkblue" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vehicle.vehicle_number || "No Plate"}</div>
                      <div style={{ fontSize: "0.75rem", opacity: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</div>
                    </div>
                    {vehicle.registration_type && (
                      <span style={{ fontSize: "0.65rem", fontWeight: 600, padding: "0.15rem 0.45rem", borderRadius: "0.35rem", background: "rgba(0,0,139,0.08)", color: "darkblue", whiteSpace: "nowrap", flexShrink: 0 }}>{vehicle.registration_type}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      <AddRecordButton
        icon={<Plus/>}
        onClick={openAdd}
      />

      {/* ─── Vehicle Detail Sheet ─── */}
      <ResponsiveModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title=""
        hideHeader
        contentStyle={{ padding: 0, maxHeight: "85vh", overflowY: "auto" }}
      >
        {selectedVehicle && (
          <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
                  {[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ") || "Vehicle"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {selectedVehicle.vehicle_number && (
                  <NumberPlate private={selectedVehicle.registration_type === "Private"} number={selectedVehicle.vehicle_number} />
                )}
                <DropDown
                  trigger={<EllipsisVertical width="1.1rem" style={{ opacity: 0.5 }} />}
                  onEdit={openEdit}
                  onDelete={() => setDeleteConfirm(true)}
                />
              </div>
            </div>

            {/* Assignment — displays employee name, stores emp_id */}
            <div style={{ background: "rgba(0,0,139,0.06)", borderRadius: "0.75rem", padding: "0.85rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.2rem" }}>Assigned To</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {selectedVehicle.assigned_to
                    ? (recordNameMap.get(selectedVehicle.assigned_to) || selectedVehicle.assigned_to)
                    : <span style={{ color: "rgba(0,0,0,0.32)", fontStyle: "italic", fontWeight: 500 }}>Unassigned</span>}
                </div>
              </div>
              <button
                onClick={() => { setAssigneeTarget("direct"); setAssigneeSearch(""); setAssigneeOpen(true); }}
                style={{ background: "darkblue", color: "white", border: "none", cursor: "pointer", padding: "0.38rem 0.85rem", borderRadius: "0.55rem", fontSize: "0.75rem", fontWeight: 500, flexShrink: 0 }}
              >
                {selectedVehicle.assigned_to ? "Change" : "Assign"}
              </button>
            </div>
            {selectedVehicle.assigned_to && (
              <button
                onClick={() => directAssign(null)}
                disabled={saving}
                style={{ background: "rgba(239,68,68,0.07)", color: "rgb(220,38,38)", border: "1px solid rgba(239,68,68,0.18)", cursor: "pointer", padding: "0.5rem", borderRadius: "0.55rem", fontSize: "0.75rem", fontWeight: 600, width: "100%" }}
              >
                Clear assignment
              </button>
            )}

            {/* Info Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ background: "rgba(0,0,139,0.06)", borderRadius: "0.65rem", padding: "0.65rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Type</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{selectedVehicle.type || "—"}</div>
              </div>
              <div style={{ background: "rgba(0,0,139,0.06)", borderRadius: "0.65rem", padding: "0.65rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Registration</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{selectedVehicle.registration_type || "—"}</div>
              </div>
              <div style={{ background: "rgba(0,0,139,0.06)", borderRadius: "0.65rem", padding: "0.65rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Condition</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{selectedVehicle.status || "—"}</div>
              </div>
              <div style={{ background: "rgba(0,0,139,0.06)", borderRadius: "0.65rem", padding: "0.65rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Fuel Logs</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{detailLoading ? "—" : detailLogs.length}</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ background: "rgba(100,100,100,0.05)", borderRadius: "0.75rem", padding: "0.85rem", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase" }}>Total KM</div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{detailLoading ? "—" : stats.totalKm > 0 ? stats.totalKm.toLocaleString() : "—"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase" }}>Fuel (L)</div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{detailLoading ? "—" : stats.totalFuel > 0 ? `${stats.totalFuel}` : "—"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(0,0,0,0.38)", textTransform: "uppercase" }}>km / L</div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{detailLoading ? "—" : stats.avgMileage > 0 ? `${stats.avgMileage}` : "—"}</div>
              </div>
            </div>

            {/* Fuel Consumption Chart */}
            <div style={{ background: "rgba(100,100,100,0.05)", borderRadius: "0.75rem", padding: "0.85rem 0.5rem 0.5rem" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,0,0,0.38)", marginBottom: "0.5rem", paddingLeft: "0.5rem" }}>
                Fuel Consumption — {new Date().getFullYear()}
              </div>
              {!detailLoading && detailLogs.length > 0 ? (
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={stats.monthlyData} barSize={12} margin={{ top: 0, right: 8, left: -28, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: "rgba(0,0,0,0.4)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: "0.5rem", padding: "0.3rem 0.6rem", background: "rgba(255,255,255,0.95)", border: "1px solid rgba(100,100,100,0.12)", fontSize: "0.72rem" }}
                      formatter={(v: any) => [`${v} L`, "Fuel"]}
                    />
                    <Bar dataKey="fuel" fill="rgba(0,0,139,0.75)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: "0.8rem" }}>
                  No data
                </div>
              )}
            </div>

          </div>
        )}
      </ResponsiveModal>

      {/* ─── Add / Edit Form Sheet ─── */}
      <ResponsiveModal
        open={formOpen}
        onOpenChange={v => { if (!v) setFormOpen(false); }}
        title={editMode ? "Edit Vehicle" : "Add Vehicle"}
        contentStyle={{ maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ padding: "0 1rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          {formField("Vehicle Number / Plate *",
            <input value={fPlate} onChange={e => setFPlate(e.target.value)} placeholder="e.g. 57483/H" style={inputStyle} />,
          )}
          {formField("Make *",
            <input value={fMake} onChange={e => setFMake(e.target.value)} placeholder="e.g. Toyota" style={inputStyle} />,
          )}
          {formField("Model",
            <input value={fModel} onChange={e => setFModel(e.target.value)} placeholder="e.g. Land Cruiser" style={inputStyle} />,
          )}
          {formField("Year",
            <input value={fYear} onChange={e => setFYear(e.target.value)} placeholder="e.g. 2022" style={inputStyle} />,
          )}
          {formField("Type",
            <input value={fType} onChange={e => setFType(e.target.value)} placeholder="e.g. SUV, Pickup, Sedan" style={inputStyle} />,
          )}
          {formField("Registration Type",
            <select value={fRegType} onChange={e => setFRegType(e.target.value)} style={{ ...inputStyle, appearance: "none" as React.CSSProperties["appearance"] }}>
              {REG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>,
          )}
          {formField("Condition",
            <select value={fCondition} onChange={e => setFCondition(e.target.value)} style={{ ...inputStyle, appearance: "none" as React.CSSProperties["appearance"] }}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>,
          )}
          {formField("Assign To",
            <button
              type="button"
              onClick={() => { setAssigneeTarget("form"); setAssigneeSearch(""); setAssigneeOpen(true); }}
              style={{ ...inputStyle, textAlign: "left", cursor: "pointer", color: fAssignedTo ? "inherit" : "rgba(0,0,0,0.32)" }}
            >
              {/* Display employee name; fAssignedTo holds emp_id */}
              {fAssignedTo ? (recordNameMap.get(fAssignedTo) || fAssignedTo) : "Select person…"}
            </button>,
          )}
          {formField("Notes",
            <textarea
              value={fNotes}
              onChange={e => setFNotes(e.target.value)}
              placeholder="Optional notes"
              style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
            />,
          )}
          <button
            onClick={saveVehicle}
            disabled={saving || !fPlate.trim() || !fMake.trim()}
            style={{
              marginTop: "0.25rem",
              padding: "0.85rem",
              borderRadius: "0.75rem",
              background: saving || !fPlate.trim() || !fMake.trim() ? "rgba(0,0,139,0.4)" : "darkblue",
              color: "white",
              border: "none",
              cursor: saving || !fPlate.trim() || !fMake.trim() ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: "0.9rem",
            }}
          >
            {saving ? "Saving…" : editMode ? "Save Changes" : "Add Vehicle"}
          </button>
        </div>
      </ResponsiveModal>

      {/* ─── Assignee Picker Dialog ─── */}
      {/* Lists employees by name; clicking selects their emp_id */}
      <Dialog open={assigneeOpen} onOpenChange={setAssigneeOpen}>
        <DialogContent style={{ maxWidth: "380px", padding: 0, overflow: "hidden", borderRadius: "1rem" }}>
          {/* Header */}
          <div style={{ padding: "1.1rem 1.25rem 0.85rem", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
            <DialogTitle style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em", }}>Assign to</DialogTitle>
            <div style={{ position: "relative", marginTop: "0.75rem" }}>
              <Search width={13} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", opacity: 0.35, pointerEvents: "none" }} />
              <input
                type="text"
                autoFocus
                placeholder="Search name…"
                value={assigneeSearch}
                onChange={e => setAssigneeSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.75rem 0.55rem 2rem",
                  borderRadius: "0.6rem",
                  border: "1px solid rgba(0,0,0,0.1)",
                  background: "rgba(0,0,0,0.03)",
                  fontSize: "0.85rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* List — displays name, selects emp_id */}
          <div style={{ maxHeight: "16rem", overflowY: "auto", padding: "0.5rem 0.75rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem", border:"", marginTop:"0" }}>
            {filteredRecords.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.35, fontSize: "0.8rem", padding: "1.5rem 0" }}>No results</div>
            ) : filteredRecords.map(record => (
              <div
                key={record.id}
                onClick={() => {
                  if (assigneeTarget === "form") {
                    setFAssignedTo(record.id); // stores emp_id
                    setAssigneeOpen(false);
                  } else {
                    directAssign(record.id); // passes emp_id
                  }
                }}
                style={{ display: "flex", alignItems: "", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "0.65rem", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", width: "100%", transition: "background 0.12s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,139,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{record.name}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─── */}
      <DefaultDialog
        destructive
        open={deleteConfirm}
        title="Delete Vehicle?"
        OkButtonText="Delete"
        updating={saving}
        onCancel={() => setDeleteConfirm(false)}
        onOk={deleteVehicle}
      />

      <style>{`@keyframes vspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
