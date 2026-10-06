import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage, Shift, ShiftType, timeOfDay } from "./shared";

type ShiftForm = Omit<Shift, "id" | "active_yn"> & { active_yn: "Y" | "N" };
const emptyForm: ShiftForm = {
  shift_code: "",
  shift_name: "",
  punch_in: "07:00",
  punch_out: "17:00",
  default_ot_minutes: 0,
  break_minutes: 0,
  shift_type: "DAY",
  active_yn: "Y",
};

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export default function ShiftMaster() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("shift_master")
        .select("id, shift_code, shift_name, punch_in, punch_out, default_ot_minutes, break_minutes, shift_type, active_yn")
        .order("shift_code");
      if (error) throw error;
      setShifts((data ?? []) as Shift[]);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load shifts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadShifts(); }, [loadShifts]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const saveShift = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = form.shift_code.trim();
    const name = form.shift_name.trim();
    if (!code || !name || !form.punch_in || !form.punch_out) {
      toast.error("Complete the required shift fields.");
      return;
    }
    if (form.punch_in === form.punch_out) {
      toast.error("Punch-in and punch-out times must differ.");
      return;
    }
    if (!Number.isInteger(Number(form.default_ot_minutes)) || form.default_ot_minutes < 0 ||
      !Number.isInteger(Number(form.break_minutes)) || form.break_minutes < 0) {
      toast.error("Default OT and break must be non-negative whole minutes.");
      return;
    }
    if (!["DAY", "NIGHT"].includes(form.shift_type)) {
      toast.error("Select DAY or NIGHT for the shift type.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        shift_code: code,
        shift_name: name,
        punch_in: form.punch_in,
        punch_out: form.punch_out,
        default_ot_minutes: Number(form.default_ot_minutes),
        break_minutes: Number(form.break_minutes),
        shift_type: form.shift_type,
        active_yn: form.active_yn,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };
      const result = editingId === null
        ? await supabase.from("shift_master").insert({ ...values, created_by: user?.id ?? null })
        : await supabase.from("shift_master").update(values).eq("id", editingId);
      if (result.error) throw result.error;
      toast.success(editingId === null ? "Shift created." : "Shift updated.");
      resetForm();
      await loadShifts();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to save the shift. Check that the shift code is unique."));
    } finally {
      setSaving(false);
    }
  };

  const editShift = (shift: Shift) => {
    setEditingId(shift.id);
    setForm({
      shift_code: shift.shift_code,
      shift_name: shift.shift_name,
      punch_in: timeOfDay(shift.punch_in),
      punch_out: timeOfDay(shift.punch_out),
      default_ot_minutes: shift.default_ot_minutes,
      break_minutes: shift.break_minutes,
      shift_type: shift.shift_type,
      active_yn: shift.active_yn.trim().toUpperCase() === "Y" ? "Y" : "N",
    });
  };

  const toggleActive = async (shift: Shift) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("shift_master").update({
        active_yn: shift.active_yn.trim().toUpperCase() === "Y" ? "N" : "Y",
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      }).eq("id", shift.id);
      if (error) throw error;
      await loadShifts();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to change shift status."));
    } finally {
      setSaving(false);
    }
  };

  const filteredShifts = shifts.filter((shift) =>
    `${shift.shift_code} ${shift.shift_name} ${shift.shift_type}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.5fr)]">
      <form onSubmit={(event) => void saveShift(event)} className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{editingId === null ? "Add shift" : "Edit shift"}</h2>
          <p className="mt-1 text-sm text-slate-500">Shift codes used by project mappings and rosters.</p>
        </div>
        <label className="block text-sm font-medium text-slate-700">Shift code
          <input className={`${fieldClass} mt-1`} maxLength={40} required value={form.shift_code} onChange={(event) => setForm({ ...form, shift_code: event.target.value })} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Shift name
          <input className={`${fieldClass} mt-1`} maxLength={120} required value={form.shift_name} onChange={(event) => setForm({ ...form, shift_name: event.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">Punch in
            <input className={`${fieldClass} mt-1`} type="time" required value={form.punch_in} onChange={(event) => setForm({ ...form, punch_in: event.target.value })} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Punch out
            <input className={`${fieldClass} mt-1`} type="time" required value={form.punch_out} onChange={(event) => setForm({ ...form, punch_out: event.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">Default OT (minutes)
            <input className={`${fieldClass} mt-1`} type="number" min={0} step={1} required value={form.default_ot_minutes} onChange={(event) => setForm({ ...form, default_ot_minutes: Number(event.target.value) })} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Break (minutes)
            <input className={`${fieldClass} mt-1`} type="number" min={0} step={1} required value={form.break_minutes} onChange={(event) => setForm({ ...form, break_minutes: Number(event.target.value) })} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">Type
            <select className={`${fieldClass} mt-1`} value={form.shift_type} onChange={(event) => setForm({ ...form, shift_type: event.target.value as ShiftType })}>
              <option value="DAY">DAY</option><option value="NIGHT">NIGHT</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Active
            <select className={`${fieldClass} mt-1`} value={form.active_yn} onChange={(event) => setForm({ ...form, active_yn: event.target.value as "Y" | "N" })}>
              <option value="Y">Yes</option><option value="N">No</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50" type="submit" disabled={saving}>{saving ? "Saving..." : "Save shift"}</button>
          {editingId !== null && <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="font-semibold text-slate-900">Shift master</h2><p className="text-sm text-slate-500">{shifts.length} shifts · historical shifts are deactivated, not deleted</p></div>
          <input aria-label="Search shifts" className={`${fieldClass} max-w-xs`} placeholder="Search code, name or type" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {loading ? <p className="p-6 text-sm text-slate-500">Loading shifts…</p> : filteredShifts.length === 0 ? <p className="p-6 text-sm text-slate-500">No shifts found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Code", "Name", "Punches", "Break", "Default OT", "Type", "Active", "Actions"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.map((shift) => <tr key={shift.id}>
                  <td className="px-3 py-3 font-semibold text-slate-800">{shift.shift_code}</td>
                  <td className="px-3 py-3">{shift.shift_name}</td>
                  <td className="px-3 py-3">{timeOfDay(shift.punch_in)}–{timeOfDay(shift.punch_out)}</td>
                  <td className="px-3 py-3">{shift.break_minutes} min</td>
                  <td className="px-3 py-3">{shift.default_ot_minutes} min</td>
                  <td className="px-3 py-3">{shift.shift_type}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${shift.active_yn.trim().toUpperCase() === "Y" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{shift.active_yn.trim().toUpperCase() === "Y" ? "Active" : "Inactive"}</span></td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <button className="mr-3 font-medium text-teal-700 hover:underline" type="button" onClick={() => editShift(shift)}>Edit</button>
                    <button className="font-medium text-slate-600 hover:underline disabled:opacity-50" type="button" disabled={saving} onClick={() => void toggleActive(shift)}>{shift.active_yn.trim().toUpperCase() === "Y" ? "Deactivate" : "Activate"}</button>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
