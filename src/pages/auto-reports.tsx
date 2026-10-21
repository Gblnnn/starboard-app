import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Check, ChevronDown, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface AutoEmail {
  id: number;
  created_at: string;
  report_name: string;
  fequency: number;
  day_of_report: number;
  report_path: string;
}

interface AutoEmailUser {
  id: number;
  created_at: string;
  report_name: string;
  emp_id: string;
}

interface Employee {
  emp_id: string;
  name: string;
}

interface Option {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
}

const REPORT_ROUTES: Option[] = [
  { value: "/attendance", label: "Attendance Dashboard" },
  { value: "/employee-timesheet-summary", label: "Employee Timesheet Summary" },
  { value: "/hourly-tm", label: "Hourly Time Management" },
  { value: "/hourly-tm/attendance", label: "Hourly TM Attendance" },
  { value: "/hourly-tm/finalize", label: "Hourly TM Finalize" },
  { value: "/hourly-tm/payroll", label: "Hourly TM Payroll" },
  { value: "/movement-register", label: "Movement Register" },
  { value: "/shift-logs", label: "Shift Logs" },
];

function SearchableSelect({ value, options, placeholder, onChange }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.value} ${option.searchText ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((isOpen) => !isOpen);
          setQuery("");
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={selected ? "truncate text-slate-900" : "text-slate-500"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="ml-2 size-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 size-4 text-slate-400" />
            <Input
              autoFocus
              aria-label={`Search ${placeholder}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type to search…"
              className="pl-8"
            />
          </div>
          <ul role="listbox" className="mt-1 max-h-52 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <li className="px-2 py-3 text-sm text-slate-500">No matching options.</li>
            ) : filteredOptions.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-slate-100"
                >
                  <span className="truncate">{option.label}</span>
                  {value === option.value && <Check className="ml-2 size-4 shrink-0 text-teal-700" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = { report_name: "", fequency: "1", day_of_report: "0", report_path: "" };

export default function AutoReports() {
  const [schedules, setSchedules] = useState<AutoEmail[]>([]);
  const [recipients, setRecipients] = useState<AutoEmailUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [schedulesResponse, recipientsResponse, employeesResponse] = await Promise.all([
        supabase.from("auto_emails").select("id, created_at, report_name, fequency, day_of_report, report_path").order("report_name"),
        supabase.from("auto_email_users").select("id, created_at, report_name, emp_id").order("report_name"),
        supabase.from("employees").select("name, emp_id").order("name"),
      ]);
      if (schedulesResponse.error) throw schedulesResponse.error;
      if (recipientsResponse.error) throw recipientsResponse.error;
      if (employeesResponse.error) throw employeesResponse.error;
      setSchedules((schedulesResponse.data ?? []) as AutoEmail[]);
      setRecipients((recipientsResponse.data ?? []) as AutoEmailUser[]);
      setEmployees((employeesResponse.data ?? []) as Employee[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load auto report settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({
      value: employee.emp_id,
      label: `${employee.name} (${employee.emp_id})`,
      searchText: employee.emp_id,
    })),
    [employees]
  );

  const scheduleRecipientCounts = useMemo(() => {
    const counts = new Map<string, number>();
    recipients.forEach((recipient) => {
      counts.set(recipient.report_name, (counts.get(recipient.report_name) ?? 0) + 1);
    });
    return counts;
  }, [recipients]);

  const editingSchedule = schedules.find((schedule) => schedule.id === editingId);
  const canRenameEditingSchedule = !editingSchedule || (scheduleRecipientCounts.get(editingSchedule.report_name) ?? 0) === 0;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const saveSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reportName = form.report_name.trim();
    const reportPath = form.report_path.trim();
    const frequency = Number(form.fequency);
    const reportDayOffset = Number(form.day_of_report);

    if (!reportName) {
      toast.error("Report name is required.");
      return;
    }
    if (!Number.isInteger(frequency) || frequency < 1) {
      toast.error("Frequency must be a positive number of days.");
      return;
    }
    if (!Number.isInteger(reportDayOffset) || reportDayOffset < 0) {
      toast.error("Report date offset must be zero or a positive number of days.");
      return;
    }
    if (!REPORT_ROUTES.some((route) => route.value === reportPath)) {
      toast.error("Choose a valid report route from the list.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        report_name: reportName,
        fequency: frequency,
        day_of_report: reportDayOffset,
        report_path: reportPath,
      };
      const result = editingId === null
        ? await supabase.from("auto_emails").insert(values)
        : await supabase.from("auto_emails").update(values).eq("id", editingId);
      if (result.error) throw result.error;
      toast.success(editingId === null ? "Auto report created." : "Auto report updated.");
      const previousReportName = schedules.find((schedule) => schedule.id === editingId)?.report_name;
      if (previousReportName && selectedReport === previousReportName) setSelectedReport(reportName);
      resetForm();
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save auto report.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (schedule: AutoEmail) => {
    setForm({
      report_name: schedule.report_name,
      fequency: String(schedule.fequency),
      day_of_report: String(schedule.day_of_report),
      report_path: schedule.report_path,
    });
    setEditingId(schedule.id);
  };

  const deleteSchedule = async (schedule: AutoEmail) => {
    if ((scheduleRecipientCounts.get(schedule.report_name) ?? 0) > 0) {
      toast.error("Remove this report's recipients before deleting the schedule.");
      return;
    }
    if (!window.confirm(`Delete the "${schedule.report_name}" schedule?`)) return;
    try {
      const { error } = await supabase.from("auto_emails").delete().eq("id", schedule.id);
      if (error) throw error;
      toast.success("Auto report deleted.");
      if (editingId === schedule.id) resetForm();
      if (selectedReport === schedule.report_name) setSelectedReport(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete auto report.");
    }
  };

  const addRecipient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReport || !selectedEmployeeId) {
      toast.error("Select a report and an employee.");
      return;
    }
    if (recipients.some((recipient) => recipient.report_name === selectedReport && recipient.emp_id === selectedEmployeeId)) {
      toast.error("This employee is already assigned to the selected report.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("auto_email_users").insert({
        report_name: selectedReport,
        emp_id: selectedEmployeeId,
      });
      if (error) throw error;
      toast.success("Recipient added.");
      setSelectedEmployeeId("");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add recipient.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipient = async (recipient: AutoEmailUser) => {
    const employee = employees.find((item) => item.emp_id === recipient.emp_id);
    if (!window.confirm(`Remove ${employee?.name ?? recipient.emp_id} from this report?`)) return;
    try {
      const { error } = await supabase.from("auto_email_users").delete().eq("id", recipient.id);
      if (error) throw error;
      toast.success("Recipient removed.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove recipient.");
    }
  };

  const selectedRecipients = selectedReport
    ? recipients.filter((recipient) => recipient.report_name === selectedReport)
    : [];

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(32rem,1.2fr)]">
        <form onSubmit={(event) => void saveSchedule(event)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{editingId === null ? "Add auto report" : "Edit auto report"}</h2>
            <p className="mt-1 text-sm text-slate-500">Frequency is an interval in days: 1 is daily, 14 is fortnightly, and 30 is approximately monthly.</p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Report name
            <Input
              className="mt-1"
              required
              disabled={!canRenameEditingSchedule}
              value={form.report_name}
              onChange={(event) => setForm((current) => ({ ...current, report_name: event.target.value }))}
            />
            {!canRenameEditingSchedule && (
              <span className="mt-1 block text-xs font-normal text-slate-500">Remove this report's recipients before changing its name.</span>
            )}
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Frequency (days)
            <Input
              className="mt-1"
              type="number"
              min={1}
              step={1}
              required
              value={form.fequency}
              onChange={(event) => setForm((current) => ({ ...current, fequency: event.target.value }))}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Report date offset (days before sending)
            <Input
              className="mt-1"
              type="number"
              min={0}
              step={1}
              required
              value={form.day_of_report}
              onChange={(event) => setForm((current) => ({ ...current, day_of_report: event.target.value }))}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">0 = report for today; 1 = yesterday; 2 = two days ago.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Report path
            <div className="mt-1">
              <SearchableSelect
                value={form.report_path}
                options={REPORT_ROUTES}
                placeholder="Search valid report routes"
                onChange={(value) => setForm((current) => ({ ...current, report_path: value }))}
              />
            </div>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : editingId === null ? <Plus /> : <Check />}
              {editingId === null ? "Add report" : "Save changes"}
            </Button>
            {editingId !== null && (
              <Button type="button" variant="outline" onClick={resetForm}>
                <X /> Cancel
              </Button>
            )}
          </div>
        </form>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Report schedules</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Report</th>
                  <th className="px-4 py-3">Interval</th>
                  <th className="px-4 py-3">Report date</th>
                  <th className="px-4 py-3">Path</th>
                  <th className="px-4 py-3">Recipients</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Loading schedules…</td></tr>
                ) : schedules.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No auto reports configured.</td></tr>
                ) : schedules.map((schedule) => (
                  <tr key={schedule.id} className={selectedReport === schedule.report_name ? "bg-teal-50/70" : ""}>
                    <td className="px-4 py-3 font-medium text-slate-800">{schedule.report_name}</td>
                    <td className="px-4 py-3 text-slate-600">Every {schedule.fequency} days</td>
                    <td className="px-4 py-3 text-slate-600">{schedule.day_of_report} day{schedule.day_of_report === 1 ? "" : "s"} before</td>
                    <td className="px-4 py-3 text-slate-600">{schedule.report_path}</td>
                    <td className="px-4 py-3">
                      <button type="button" className="font-medium text-teal-800 hover:underline" onClick={() => setSelectedReport(schedule.report_name)}>
                        {scheduleRecipientCounts.get(schedule.report_name) ?? 0} · Manage
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${schedule.report_name}`} onClick={() => startEditing(schedule)}>
                          <Pencil />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${schedule.report_name}`} onClick={() => void deleteSchedule(schedule)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Report recipients</h2>
          <p className="mt-1 text-sm text-slate-500">Select a report and assign employees who should receive it.</p>
        </div>
        <form onSubmit={(event) => void addRecipient(event)} className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.4fr)_auto] md:items-end">
          <label className="block text-sm font-medium text-slate-700">
            Report
            <div className="mt-1">
              <SearchableSelect
                value={selectedReport ?? ""}
                options={schedules.map((schedule) => ({ value: schedule.report_name, label: schedule.report_name }))}
                placeholder="Search report names"
                onChange={setSelectedReport}
              />
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Employee
            <div className="mt-1">
              <SearchableSelect
                value={selectedEmployeeId}
                options={employeeOptions}
                placeholder="Search name or employee ID"
                onChange={setSelectedEmployeeId}
              />
            </div>
          </label>
          <Button type="submit" disabled={saving || loading || !selectedReport || !selectedEmployeeId}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            Add recipient
          </Button>
        </form>

        {!selectedReport ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">Choose a report to view and manage its recipients.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Employee ID</th><th className="px-4 py-3">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedRecipients.length === 0 ? (
                  <tr><td className="px-4 py-5 text-slate-500" colSpan={3}>No recipients assigned to {selectedReport}.</td></tr>
                ) : selectedRecipients.map((recipient) => {
                  const employee = employees.find((item) => item.emp_id === recipient.emp_id);
                  return (
                    <tr key={recipient.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{employee?.name ?? "Employee not found"}</td>
                      <td className="px-4 py-3 text-slate-600">{recipient.emp_id}</td>
                      <td className="px-4 py-3">
                        <Button type="button" size="sm" variant="outline" onClick={() => void deleteRecipient(recipient)}>
                          <Trash2 /> Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
