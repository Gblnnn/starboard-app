import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage, fetchAccessibleProjects, isAdminRole, projectDisplay, Project, Shift, timeOfDay } from "./shared";

interface ProjectShiftRow {
  id: number;
  project_code: string;
  shift_code: string;
  active_yn: string;
}

const fieldClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export default function ProjectShifts() {
  const { user, userData } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [mappings, setMappings] = useState<ProjectShiftRow[]>([]);
  const [projectCode, setProjectCode] = useState("");
  const [shiftCode, setShiftCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accessibleProjects, shiftsResult, mappingsResult] = await Promise.all([
        fetchAccessibleProjects(userData?.emp_id ? String(userData.emp_id) : null, isAdminRole(userData?.role)),
        supabase.from("shift_master").select("id, shift_code, shift_name, punch_in, punch_out, default_ot_minutes, break_minutes, shift_type, active_yn").order("shift_code"),
        supabase.from("project_shifts").select("id, project_code, shift_code, active_yn").order("project_code"),
      ]);
      if (shiftsResult.error) throw shiftsResult.error;
      if (mappingsResult.error) throw mappingsResult.error;
      setProjects(accessibleProjects);
      setShifts((shiftsResult.data ?? []) as Shift[]);
      setMappings((mappingsResult.data ?? []) as ProjectShiftRow[]);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load project shift mappings."));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [userData?.emp_id, userData?.role]);

  useEffect(() => { void loadData(); }, [loadData]);

  const shiftsForAdd = shifts.filter((shift) => shift.active_yn.trim().toUpperCase() === "Y");
  const projectByCode = useMemo(() => new Map(projects.map((project) => [project.project_code, project])), [projects]);
  const shiftByCode = useMemo(() => new Map(shifts.map((shift) => [shift.shift_code, shift])), [shifts]);

  const addMapping = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectCode || !shiftCode) {
      toast.error("Select a project and active shift.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("project_shifts").insert({
        project_code: projectCode,
        shift_code: shiftCode,
        active_yn: "Y",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Project shift mapped.");
      setShiftCode("");
      await loadData();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to save mapping. This project/shift may already be mapped."));
    } finally {
      setSaving(false);
    }
  };

  const toggleMapping = async (mapping: ProjectShiftRow) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("project_shifts").update({
        active_yn: mapping.active_yn.trim().toUpperCase() === "Y" ? "N" : "Y",
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      }).eq("id", mapping.id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      toast.error(errorMessage(error, "Unable to update mapping."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={(event) => void addMapping(event)} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="min-w-[16rem] flex-1 text-sm font-medium text-slate-700">Project
          <select className={`${fieldClass} mt-1 w-full`} value={projectCode} onChange={(event) => setProjectCode(event.target.value)} required>
            <option value="">Select project</option>
            {projects.map((project) => <option key={project.project_code} value={project.project_code}>{projectDisplay(project)}</option>)}
          </select>
        </label>
        <label className="min-w-[16rem] flex-1 text-sm font-medium text-slate-700">Active shift
          <select className={`${fieldClass} mt-1 w-full`} value={shiftCode} onChange={(event) => setShiftCode(event.target.value)} required>
            <option value="">Select shift</option>
            {shiftsForAdd.map((shift) => <option key={shift.shift_code} value={shift.shift_code}>{shift.shift_code} — {shift.shift_name}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50" disabled={saving} type="submit">{saving ? "Saving…" : "Add mapping"}</button>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Project shift mappings</h2><p className="text-sm text-slate-500">New mappings can use active shifts. Existing mappings remain visible if a shift is deactivated.</p></div>
        {loading ? <p className="p-6 text-sm text-slate-500">Loading mappings…</p> : mappings.length === 0 ? <p className="p-6 text-sm text-slate-500">No mappings are available for your projects.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Project", "Shift", "Shift name", "Punch in–out", "Break", "Default OT", "Type", "Active", "Action"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.filter((mapping) => projectByCode.has(mapping.project_code)).map((mapping) => {
                  const shift = shiftByCode.get(mapping.shift_code);
                  return <tr key={mapping.id}>
                    <td className="px-3 py-3">{projectDisplay(projectByCode.get(mapping.project_code)!)}</td>
                    <td className="px-3 py-3 font-semibold">{mapping.shift_code}</td>
                    <td className="px-3 py-3">{shift?.shift_name ?? "Shift unavailable"}</td>
                    <td className="px-3 py-3">{shift ? `${timeOfDay(shift.punch_in)}–${timeOfDay(shift.punch_out)}` : "—"}</td>
                    <td className="px-3 py-3">{shift ? `${shift.break_minutes} min` : "—"}</td>
                    <td className="px-3 py-3">{shift ? `${shift.default_ot_minutes} min` : "—"}</td>
                    <td className="px-3 py-3">{shift?.shift_type ?? "—"}</td>
                    <td className="px-3 py-3">{mapping.active_yn.trim().toUpperCase() === "Y" ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-3"><button className="font-medium text-teal-700 hover:underline disabled:opacity-50" disabled={saving} type="button" onClick={() => void toggleMapping(mapping)}>{mapping.active_yn.trim().toUpperCase() === "Y" ? "Deactivate" : "Activate"}</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
