import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Clock, Download, Loader2, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useHTMAccess } from './useHTMAccess';
import type { HTMProjectConfig, HTMEmployeeConfig, HTMAttendance, HTMHoliday } from './types';
import { validateDecimalHours, generateDateRange, findEffectiveConfig } from './payrollEngine';
import { downloadAttendanceTemplate } from './excelUtils';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

interface AttendanceCell {
  emp_id: string;
  employee_name: string;
  hours: string; // text input value
  originalHours: number | null; // what's in DB (null = not entered)
  isDirty: boolean;
  validationError: string | null;
  hasConfig: boolean;
}

export default function AttendanceEntry() {
  const { userData } = useAuth();
  const perms = useHTMAccess();
  const actor = userData?.emp_id || userData?.email || '';
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? '');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dates, setDates] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ emp_id: string; name: string }[]>([]);
  const [empConfigs, setEmpConfigs] = useState<HTMEmployeeConfig[]>([]);
  const [attendance, setAttendance] = useState<HTMAttendance[]>([]);
  const [holidays, setHolidays] = useState<HTMHoliday[]>([]);
  const [cells, setCells] = useState<Record<string, AttendanceCell>>({}); // key: `${emp_id}::${date}`
  const [lockedDates, setLockedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [projectConfig, setProjectConfig] = useState<HTMProjectConfig | null>(null);

  // Load projects on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('hourly_tm_project_config').select('*').eq('active', true).order('project_code');
      if (data) {
        const codes = data.map((p) => p.project_code);
        const { data: masters } = await supabase.from('projects').select('project_code, project_name').in('project_code', codes);
        const nameMap = new Map((masters ?? []).map((m) => [m.project_code, m.project_name]));
        setProjects(data.map((p) => ({ ...p, project_name: nameMap.get(p.project_code) ?? p.project_code })));
      }
    })();
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!selectedProject || !startDate || !endDate) return;
    if (startDate > endDate) { toast.error('Start date must be before end date'); return; }

    setLoading(true);
    setLoaded(false);
    try {
      const dateRange = generateDateRange(startDate, endDate);
      setDates(dateRange);

      const projCfg = projects.find((p) => p.project_code === selectedProject) ?? null;
      setProjectConfig(projCfg);

      // Load employees with active config in range
      const { data: cfgData, error: cfgErr } = await supabase
        .from('hourly_tm_employee_config')
        .select('*')
        .eq('project_code', selectedProject)
        .eq('active', true)
        .lte('effective_from', endDate);
      if (cfgErr) throw cfgErr;

      // Filter: effective_to is null OR >= startDate
      const activeCfgs = (cfgData ?? []).filter(
        (c) => !c.effective_to || c.effective_to >= startDate,
      );
      setEmpConfigs(activeCfgs);

      const empIds = [...new Set(activeCfgs.map((c) => c.emp_id))];

      // Load employee names
      let empList: { emp_id: string; name: string }[] = [];
      if (empIds.length > 0) {
        const { data: empData } = await supabase
          .from('employees')
          .select('emp_id, name')
          .in('emp_id', empIds);
        empList = empData ?? [];
      }
      setEmployees(empList);

      // Load existing attendance
      const { data: attData, error: attErr } = await supabase
        .from('hourly_tm_attendance')
        .select('*')
        .in('emp_id', empIds.length > 0 ? empIds : ['__none__'])
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      if (attErr) throw attErr;
      setAttendance(attData ?? []);

      // Load holidays
      const { data: holData } = await supabase
        .from('hourly_tm_holidays')
        .select('*')
        .eq('project_code', selectedProject)
        .gte('holiday_date', startDate)
        .lte('holiday_date', endDate);
      setHolidays(holData ?? []);

      // Check for finalized periods locking dates
      const { data: periodsData } = await supabase
        .from('hourly_tm_payroll_periods')
        .select('start_date, end_date')
        .eq('project_code', selectedProject)
        .eq('status', 'finalized');

      const locked = new Set<string>();
      for (const period of periodsData ?? []) {
        for (const d of dateRange) {
          if (d >= period.start_date && d <= period.end_date) locked.add(d);
        }
      }
      setLockedDates(locked);

      // Build cells
      const attMap = new Map<string, HTMAttendance>();
      for (const rec of attData ?? []) {
        attMap.set(`${rec.emp_id}::${rec.attendance_date}`, rec);
      }

      const empNameMap = new Map(empList.map((e) => [e.emp_id, e.name]));
      const newCells: Record<string, AttendanceCell> = {};

      for (const empId of empIds) {
        for (const date of dateRange) {
          const key = `${empId}::${date}`;
          const existing = attMap.get(key);
          const empCfgsForEmp = activeCfgs.filter((c) => c.emp_id === empId);
          const effectiveCfg = findEffectiveConfig(empCfgsForEmp, date);

          newCells[key] = {
            emp_id: empId,
            employee_name: empNameMap.get(empId) ?? empId,
            hours: existing !== undefined ? String(existing.hours_worked) : '',
            originalHours: existing !== undefined ? existing.hours_worked : null,
            isDirty: false,
            validationError: null,
            hasConfig: effectiveCfg !== null,
          };
        }
      }
      setCells(newCells);
      setLoaded(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [selectedProject, startDate, endDate, projects]);

  const handleCellChange = (empId: string, date: string, value: string) => {
    const key = `${empId}::${date}`;
    if (lockedDates.has(date)) return; // blocked

    const validation = validateDecimalHours(value === '' ? null : value);
    setCells((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        hours: value,
        isDirty: true,
        validationError: validation.valid ? null : (validation.error ?? 'Invalid'),
      },
    }));
  };

  const dirtyCount = Object.values(cells).filter((c) => c.isDirty).length;

  const handleSave = async () => {
    if (!perms.canEnterAttendance) { toast.error('Permission denied'); return; }

    const dirtyCells = Object.values(cells).filter((c) => c.isDirty);
    if (dirtyCells.length === 0) { toast.info('No changes to save'); return; }

    // Validate all dirty cells
    const invalid = dirtyCells.filter((c) => c.validationError);
    if (invalid.length > 0) {
      toast.error(`${invalid.length} cell(s) have validation errors. Fix them before saving.`);
      return;
    }

    // Check locked dates
    const lockedCells = dirtyCells.filter((c) => lockedDates.has(dates.find((d) => `${c.emp_id}::${d}` === Object.keys(cells).find((k) => cells[k] === c)) ?? ''));
    if (lockedCells.length > 0) {
      toast.error('Some cells are in a finalized payroll period and cannot be edited');
      return;
    }

    setSaving(true);
    try {
      // Build records for RPC (skip blank cells = not entered)
      const records = dirtyCells
        .filter((c) => c.hours !== '') // blank = skip
        .map((c) => {
          const key = Object.keys(cells).find((k) => cells[k] === c)!;
          const [emp_id, date] = key.split('::');
          return {
            emp_id,
            project_code: selectedProject,
            attendance_date: date,
            hours_worked: Number(c.hours),
            remarks: null,
          };
        });

      if (records.length === 0) {
        toast.info('Only blank cells in selection — nothing to save (blank = not entered)');
        setSaving(false);
        return;
      }

      const { error } = await supabase.rpc('htm_bulk_upsert_attendance', {
        p_records: records,
        p_actor: actor,
      });
      if (error) throw error;

      toast.success(`Saved ${records.length} attendance record(s)`);
      await loadAttendance();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (!projectConfig) return;
    const projName = projectConfig.project_name ?? projectConfig.project_code;
    const empList = employees.map((e) => ({ emp_id: e.emp_id, name: e.name }));
    downloadAttendanceTemplate(projectConfig, projName, empList, startDate, endDate);
  };

  const holidaySet = new Set(holidays.map((h) => h.holiday_date));
  const isFriday = (d: string) => new Date(d).getDay() === 5;
  const isSaturday = (d: string) => new Date(d).getDay() === 6;
  const isWeekend = (d: string) => isFriday(d) || isSaturday(d);
  const isHoliday = (d: string) => holidaySet.has(d);

  const empIds = [...new Set(employees.map((e) => e.emp_id))];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2rem' }}>
      <Back fixed blurBG title="Attendance Entry" icon={<Clock width="1.1rem" />}
        extra={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {loaded && dirtyCount > 0 && (
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#d97706', background: '#d9770620', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
                {dirtyCount} unsaved
              </span>
            )}
            {loaded && (
              <Button size="sm" variant="outline" onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                <Download width="0.8rem" /> Template
              </Button>
            )}
            {loaded && perms.canEnterAttendance && (
              <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {saving ? <Loader2 className="animate-spin" width="0.875rem" /> : <Save width="0.875rem" />}
                Save
              </Button>
            )}
          </div>
        }
      />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: '100%', margin: '0 auto' }}>

        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select project...</option>
              {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Start Date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 148 }} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 148 }} />
          </div>
          <Button onClick={loadAttendance} disabled={loading || !selectedProject} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {loading ? <Loader2 className="animate-spin" width="0.875rem" /> : <RefreshCw width="0.875rem" />}
            Load
          </Button>
        </div>

        {/* Legend */}
        {loaded && (
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#64748b' }}>
            <span>🟦 Friday</span>
            <span>🟪 Saturday</span>
            <span>🟨 Holiday</span>
            <span>🔒 Locked (finalized)</span>
            <span style={{ color: '#d97706' }}>⚠ No config</span>
          </div>
        )}

        {/* Attendance Grid */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <Loader2 className="animate-spin" />
          </div>
        )}

        {loaded && empIds.length === 0 && (
          <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
            <AlertCircle width="2rem" style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>No employees assigned to this project</p>
            <p style={{ fontSize: '0.8rem' }}>Add employee configurations for project {selectedProject} first.</p>
          </div>
        )}

        {loaded && empIds.length > 0 && (
          <div style={{ overflowX: 'auto', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={thStyle}>Employee ID</th>
                  <th style={thStyle}>Name</th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      style={{
                        ...thStyle,
                        background: lockedDates.has(d) ? 'rgba(100,116,139,0.15)'
                          : isHoliday(d) ? 'rgba(234,179,8,0.1)'
                          : isFriday(d) ? 'rgba(59,130,246,0.1)'
                          : isSaturday(d) ? 'rgba(168,85,247,0.1)'
                          : 'transparent',
                        minWidth: 88,
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1 }}>
                        {format(new Date(d + 'T00:00:00'), 'EEE')}
                      </div>
                      <div style={{ fontWeight: 700 }}>{d.slice(5)}</div>
                      {lockedDates.has(d) && <div style={{ fontSize: '0.55rem', color: '#94a3b8' }}>🔒</div>}
                      {isHoliday(d) && <div style={{ fontSize: '0.55rem', color: '#ca8a04' }}>Holiday</div>}
                    </th>
                  ))}
                  <th style={thStyle}>Total Hrs</th>
                </tr>
              </thead>
              <tbody>
                {empIds.map((empId) => {
                  const emp = employees.find((e) => e.emp_id === empId);
                  let rowTotal = 0;
                  return (
                    <tr key={empId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={tdStyle}>{empId}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp?.name ?? empId}
                      </td>
                      {dates.map((date) => {
                        const key = `${empId}::${date}`;
                        const cell = cells[key];
                        if (!cell) return <td key={date} style={tdStyle} />;

                        const locked = lockedDates.has(date);
                        const hours = cell.hours === '' ? null : Number(cell.hours);
                        if (hours !== null && !isNaN(hours)) rowTotal += hours;

                        const cellBg = locked ? 'rgba(100,116,139,0.08)'
                          : isHoliday(date) ? 'rgba(234,179,8,0.06)'
                          : isFriday(date) ? 'rgba(59,130,246,0.06)'
                          : isSaturday(date) ? 'rgba(168,85,247,0.06)'
                          : 'transparent';

                        return (
                          <td key={date} style={{ ...tdStyle, background: cellBg, padding: '0.25rem' }}>
                            {!cell.hasConfig && (
                              <div title="No pay configuration for this date" style={{ fontSize: '0.65rem', color: '#d97706', textAlign: 'center' }}>⚠</div>
                            )}
                            {locked ? (
                              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                                {cell.originalHours !== null ? cell.originalHours : '—'}
                              </div>
                            ) : (
                              <div>
                                <input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.25"
                                  value={cell.hours}
                                  onChange={(e) => handleCellChange(empId, date, e.target.value)}
                                  disabled={!perms.canEnterAttendance}
                                  placeholder="—"
                                  style={{
                                    width: '100%',
                                    padding: '0.3rem 0.35rem',
                                    borderRadius: '0.35rem',
                                    border: cell.validationError ? '1px solid #dc2626' : cell.isDirty ? '1px solid #d97706' : '1px solid rgba(255,255,255,0.1)',
                                    background: 'transparent',
                                    color: 'inherit',
                                    fontSize: '0.82rem',
                                    textAlign: 'center',
                                    outline: 'none',
                                  }}
                                />
                                {cell.validationError && (
                                  <div style={{ fontSize: '0.58rem', color: '#dc2626', textAlign: 'center', marginTop: '0.1rem' }} title={cell.validationError}>!</div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#0891b2' }}>
                        {rowTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Validation error summary */}
        {loaded && Object.values(cells).some((c) => c.validationError) && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: '#dc262612', border: '1px solid #dc262640' }}>
            <p style={{ fontWeight: 600, fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.4rem' }}>
              <AlertCircle width="0.875rem" style={{ display: 'inline', marginRight: '0.3rem' }} />
              Validation errors
            </p>
            {Object.entries(cells)
              .filter(([, c]) => c.validationError)
              .map(([key, c]) => {
                const [empId, date] = key.split('::');
                return (
                  <p key={key} style={{ fontSize: '0.75rem', color: '#f87171' }}>
                    {empId} / {date}: {c.validationError}
                  </p>
                );
              })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.3rem',
};
const selectStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', fontSize: '0.875rem',
};
const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.78rem',
  whiteSpace: 'nowrap', color: '#94a3b8',
};
const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem', textAlign: 'center', verticalAlign: 'middle',
};
