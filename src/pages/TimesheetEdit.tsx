import Back from '@/components/back';
import { DatePicker } from '@/components/date-picker';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { CalendarDays, Clock3, Loader2, Save, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Employee = {
  device_user_id: string;
  emp_id: string | null;
  name: string;
  emp_type: string | null;
};

type Project = {
  project_code: string;
  project_name: string | null;
};

type TimesheetRow = {
  employee_code: string;
  date: string;
  project_code: string | null;
  punch_in: string | null;
  punch_out: string | null;
  overtime: number | string | null;
  remarks: string | null;
  status: string | null;
};

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

function extractTime(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Dubai',
  }).format(parsed);
}

function buildTimestamp(date: string, time: string): string | null {
  return time ? `${date}T${time}:00+04:00` : null;
}

function isValidTime(value: string): boolean {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  return match;
}

function calculateTotalHours(punchIn: string, punchOut: string): string {
  if (!punchIn || !punchOut) return '';
  const [inHours, inMinutes] = punchIn.split(':').map(Number);
  const [outHours, outMinutes] = punchOut.split(':').map(Number);
  if (![inHours, inMinutes, outHours, outMinutes].every(Number.isFinite)) return '';
  let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function formatEmployee(employee: Employee): string {
  return `${employee.name}${employee.emp_id ? ` [${employee.emp_id}]` : ''}`;
}

export default function TimesheetEdit() {
  const { userData } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [employeeCode, setEmployeeCode] = useState('');
  const [date, setDate] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [punchIn, setPunchIn] = useState('');
  const [punchOut, setPunchOut] = useState('');
  const [overtime, setOvertime] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowExists, setRowExists] = useState(false);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.device_user_id === employeeCode),
    [employeeCode, employees],
  );
  const canEditOvertime = selectedEmployee?.emp_type?.toLowerCase() !== 'staff';

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) => formatEmployee(employee).toLowerCase().includes(query));
  }, [employees, search]);

  useEffect(() => {
    const loadLookups = async () => {
      setLoadingLookups(true);
      try {
        const [{ data: employeeData, error: employeeError }, { data: projectData, error: projectError }, { data: statusData, error: statusError }] = await Promise.all([
          supabase.from('employees').select('device_user_id, emp_id, name, emp_type').not('name', 'is', null).order('name'),
          supabase.from('projects').select('project_code, project_name').order('project_code'),
          supabase.from('timesheet').select('status').not('status', 'is', null),
        ]);
        if (employeeError) throw employeeError;
        if (projectError) throw projectError;
        if (statusError) throw statusError;

        setEmployees((employeeData || []) as Employee[]);
        setProjects((projectData || []) as Project[]);
        setStatuses(Array.from(new Set((statusData || []).map((row) => row.status).filter(Boolean) as string[])).sort());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load editor options.');
      } finally {
        setLoadingLookups(false);
      }
    };
    void loadLookups();
  }, []);

  useEffect(() => {
    if (!employeeCode || !date) {
      setProjectCode('');
      setPunchIn('');
      setPunchOut('');
      setOvertime('0');
      setRemarks('');
      setStatus('');
      setRowExists(false);
      return;
    }

    const loadRow = async () => {
      setLoadingRow(true);
      try {
        const { data, error } = await supabase
          .from('timesheet')
          .select('employee_code, date, project_code, punch_in, punch_out, overtime, remarks, status')
          .eq('employee_code', employeeCode)
          .eq('date', date)
          .maybeSingle();
        if (error) throw error;

        const row = data as TimesheetRow | null;
        setProjectCode(row?.project_code || '');
        setPunchIn(extractTime(row?.punch_in || null));
        setPunchOut(extractTime(row?.punch_out || null));
        setOvertime(row?.overtime === null || row?.overtime === undefined ? '0' : String(row.overtime));
        setRemarks(row?.remarks || '');
        setStatus(row?.status || '');
        setRowExists(Boolean(row));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load the timesheet transaction.');
      } finally {
        setLoadingRow(false);
      }
    };
    void loadRow();
  }, [date, employeeCode]);

  const saveChanges = async () => {
    if (!employeeCode || !date) {
      toast.error('Select an employee and date first.');
      return;
    }
    if (!rowExists) {
      toast.error('No timesheet transaction exists for this employee and date.');
      return;
    }
    const normalizedStatus = status.trim().toLowerCase();
    const allowsEmptyPunches = ['absent', 'weekend', 'holiday'].includes(normalizedStatus);
    if (!allowsEmptyPunches && (!punchIn || !punchOut)) {
      toast.error('Punch In and Punch Out are required unless status is absent, weekend, or holiday.');
      return;
    }
    if ((punchIn && !isValidTime(punchIn)) || (punchOut && !isValidTime(punchOut))) {
      toast.error('Punch In and Punch Out must use HH:MM format.');
      return;
    }
    if (canEditOvertime && (!overtime.trim() || !Number.isFinite(Number(overtime)) || Number(overtime) < 0)) {
      toast.error('Overtime must be a non-negative decimal number.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('timesheet')
        .update({
          project_code: projectCode || null,
          punch_in: buildTimestamp(date, punchIn),
          punch_out: buildTimestamp(date, punchOut),
          ...(canEditOvertime ? { overtime: Number(overtime) } : {}),
          remarks: remarks.trim() || null,
          status: status || null,
          last_updated: new Date().toISOString(),
          verify_type: 'Manual Input',
          attested_by: userData?.email || 'Manual Input',
        })
        .eq('employee_code', employeeCode)
        .eq('date', date);
      if (error) throw error;
      toast.success('Timesheet updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update the timesheet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Back title="Edit Timesheet" />
        <button type="button" onClick={() => void saveChanges()} disabled={saving || loadingRow || loadingLookups || !rowExists} className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <div className="mx-auto w-full max-w-5xl p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700"><Clock3 className="h-5 w-5" /></div>
            <div><h1 className="text-lg font-semibold text-slate-800">Edit Timesheet Transaction</h1><p className="text-sm text-slate-500">Select an employee and date to load an existing transaction.</p></div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Employee
              <div className="relative mt-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-500" /></div>
              <select value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500"><option value="">Select employee</option>{filteredEmployees.map((employee) => <option key={employee.device_user_id} value={employee.device_user_id}>{formatEmployee(employee)}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700">Date
              <div className="relative mt-1"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><DatePicker value={date} onChange={setDate} className="h-10 w-full pl-9" /></div>
            </label>
          </div>

          {loadingRow && <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading transaction...</div>}
          {!loadingRow && employeeCode && date && !rowExists && <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No transaction found for this employee and date.</p>}

          <fieldset disabled={!rowExists || loadingRow} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Project Code<select value={projectCode} onChange={(event) => setProjectCode(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500"><option value="">Select project</option>{projects.map((project) => <option key={project.project_code} value={project.project_code}>{project.project_code}{project.project_name ? ` - ${project.project_name}` : ''}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500"><option value="">Select status</option>{statuses.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Punch In<input type="text" inputMode="numeric" list="timesheet-time-options" placeholder="HH:MM" value={punchIn} onChange={(event) => setPunchIn(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500" /></label>
            <label className="text-sm font-medium text-slate-700">Punch Out<input type="text" inputMode="numeric" list="timesheet-time-options" placeholder="HH:MM" value={punchOut} onChange={(event) => setPunchOut(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500" /></label>
            <datalist id="timesheet-time-options">{timeOptions.map((option) => <option key={option} value={option} />)}</datalist>
            <label className="text-sm font-medium text-slate-700">Overtime (hours)<input type="number" min="0" step="0.01" value={overtime} disabled={!canEditOvertime} onChange={(event) => setOvertime(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" />{selectedEmployee?.emp_type?.toLowerCase() === 'staff' && <span className="mt-1 block text-xs font-normal text-slate-500">Overtime editing is disabled for staff employees.</span>}</label>
            <label className="text-sm font-medium text-slate-700">Total Working Hours<input readOnly value={calculateTotalHours(punchIn, punchOut)} placeholder="Enter Punch In and Punch Out" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none" /></label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={4} className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" /></label>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
