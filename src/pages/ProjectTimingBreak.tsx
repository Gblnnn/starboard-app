import Back from '@/components/back';
import { MonthPicker } from '@/components/month-picker';
import { supabase } from '@/lib/supabase';
import { Clock3, Loader2, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Project = { project_code: string; project_name: string | null };

type TimingBreakRow = {
  project_code: string;
  month: string;
  start_time: string;
  end_time: string;
  break_hours: string;
  existing: boolean;
};

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const firstOfMonth = (month: string) => `${month}-01`;
const displayTime = (value: string | null) => value ? value.slice(0, 5) : '';

export default function ProjectTimingBreak() {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [rows, setRows] = useState<TimingBreakRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const [{ data: projectData, error: projectError }, { data: breakData, error: breakError }] = await Promise.all([
        supabase.from('projects').select('project_code, project_name').eq('Active_YN', 'Yes').order('project_code'),
        supabase.from('project_timing_break').select('project_code, month, start_time, end_time, break_hours').eq('month', firstOfMonth(selectedMonth)).order('project_code'),
      ]);
      if (projectError) throw projectError;
      if (breakError) throw breakError;

      const activeProjects = (projectData || []) as Project[];
      const savedRows = (breakData || []) as Array<{
        project_code: string;
        month: string;
        start_time: string | null;
        end_time: string | null;
        break_hours: number | null;
      }>;
      const projectsByCode = new Map(activeProjects.map((project) => [project.project_code, project]));
      savedRows.forEach((row) => projectsByCode.set(row.project_code, { project_code: row.project_code, project_name: null }));

      setRows(Array.from(projectsByCode.values()).sort((left, right) => left.project_code.localeCompare(right.project_code)).map((project) => {
        const saved = savedRows.find((row) => row.project_code === project.project_code);
        return {
          project_code: project.project_code,
          month: firstOfMonth(selectedMonth),
          start_time: displayTime(saved?.start_time || null),
          end_time: displayTime(saved?.end_time || null),
          break_hours: saved?.break_hours === null || saved?.break_hours === undefined ? '' : String(saved.break_hours),
          existing: Boolean(saved),
        };
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load project break timings.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, [selectedMonth]);

  const updateRow = (projectCode: string, field: keyof Pick<TimingBreakRow, 'start_time' | 'end_time' | 'break_hours'>, value: string) => {
    setRows((currentRows) => currentRows.map((row) => row.project_code === projectCode ? { ...row, [field]: value } : row));
  };

  const saveChanges = async () => {
    const changedRows = rows.filter((row) => row.start_time || row.end_time || row.break_hours);
    for (const row of changedRows) {
      if (!row.start_time || !row.end_time || row.break_hours === '' || !Number.isFinite(Number(row.break_hours)) || Number(row.break_hours) < 0) {
        toast.error(`Complete start time, end time, and break hours for ${row.project_code}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const clearedCodes = rows.filter((row) => row.existing && !row.start_time && !row.end_time && !row.break_hours).map((row) => row.project_code);
      if (clearedCodes.length) {
        const { error } = await supabase.from('project_timing_break').delete().eq('month', firstOfMonth(selectedMonth)).in('project_code', clearedCodes);
        if (error) throw error;
      }

      if (changedRows.length) {
        const { error } = await supabase.from('project_timing_break').upsert(
          changedRows.map((row) => ({
            project_code: row.project_code,
            month: firstOfMonth(selectedMonth),
            start_time: row.start_time,
            end_time: row.end_time,
            break_hours: Number(row.break_hours),
          })),
          { onConflict: 'month,project_code' },
        );
        if (error) throw error;
      }
      toast.success('Project break timings saved successfully.');
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save project break timings.');
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  }, [selectedMonth]);

  return (
    <div className="flex min-h-full w-full flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Back title="Project Break Timings" />
        <button type="button" onClick={() => void saveChanges()} disabled={saving || loading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <main className="mx-auto w-full max-w-6xl p-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700"><Clock3 className="h-5 w-5" /></div>
            <div><h1 className="text-lg font-semibold text-slate-800">Project Break Timings</h1><p className="text-sm text-slate-500">Set the break window and break hours for each project.</p></div>
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-5">
            <label className="text-sm font-medium text-slate-700">Month <MonthPicker value={selectedMonth} onChange={setSelectedMonth} className="ml-2 h-9" /></label>
            <span className="text-sm text-slate-500">Saving as {monthLabel}, {firstOfMonth(selectedMonth)}</span>
          </div>

          {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading projects...</div> : rows.length === 0 ? <p className="py-8 text-sm text-slate-500">No active projects or saved timings found.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Month</th><th className="px-3 py-3">Project Code</th><th className="px-3 py-3">Start Time</th><th className="px-3 py-3">End Time</th><th className="px-3 py-3">Break Hours</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row.project_code} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 text-slate-600">{row.month}</td>
                  <td className="px-3 py-3 font-medium text-slate-800">{row.project_code}</td>
                  <td className="px-3 py-2"><select value={row.start_time} onChange={(event) => updateRow(row.project_code, 'start_time', event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-teal-500"><option value="">Select time</option>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</select></td>
                  <td className="px-3 py-2"><select value={row.end_time} onChange={(event) => updateRow(row.project_code, 'end_time', event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-teal-500"><option value="">Select time</option>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</select></td>
                  <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={row.break_hours} onChange={(event) => updateRow(row.project_code, 'break_hours', event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-teal-500" /></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}