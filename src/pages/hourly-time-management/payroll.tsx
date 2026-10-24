import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Lock,
  Printer,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { downloadPayrollExcel } from './excelUtils';
import { buildPayrollLines, generateDateRange } from './payrollEngine';
import { useHTMAccess } from './useHTMAccess';
import type {
  HTMAttendance,
  HTMEmployeeConfig,
  HTMHoliday,
  HTMPayrollPeriod,
  HTMProjectConfig,
  PayrollLineResult,
} from './types';
import { formatOMR, PAY_CATEGORY_LABELS } from './types';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

export default function PayrollTimesheet() {
  const perms = useHTMAccess();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? '');

  // Date selection
  const now = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [preset, setPreset] = useState<'current' | 'previous' | 'custom'>('current');

  // Calculation results
  const [projectConfig, setProjectConfig] = useState<HTMProjectConfig | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [lines, setLines] = useState<PayrollLineResult[]>([]);
  const [holidays, setHolidays] = useState<HTMHoliday[]>([]);
  const [periodStatus, setPeriodStatus] = useState<HTMPayrollPeriod | null>(null);

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load projects on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('hourly_tm_project_config')
        .select('*')
        .eq('active', true)
        .order('project_code');
      if (data) {
        const codes = data.map((p) => p.project_code);
        const { data: masters } = await supabase
          .from('projects')
          .select('project_code, project_name')
          .in('project_code', codes);
        const nameMap = new Map((masters ?? []).map((m) => [m.project_code, m.project_name]));
        setProjects(data.map((p) => ({ ...p, project_name: nameMap.get(p.project_code) ?? p.project_code })));
      }
    })();
  }, []);

  const handlePreset = (type: 'current' | 'previous') => {
    setPreset(type);
    const ref = type === 'current' ? new Date() : subMonths(new Date(), 1);
    setStartDate(format(startOfMonth(ref), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(ref), 'yyyy-MM-dd'));
  };

  const loadPayroll = useCallback(async () => {
    if (!selectedProject || !startDate || !endDate) return;
    if (startDate > endDate) {
      toast.error('Start date must be before or equal to end date');
      return;
    }

    setLoading(true);
    try {
      const dateRange = generateDateRange(startDate, endDate);
      setDates(dateRange);

      const projCfg = projects.find((p) => p.project_code === selectedProject) ?? null;
      setProjectConfig(projCfg);
      if (!projCfg) {
        setLoading(false);
        return;
      }

      // Check if period is finalized
      const { data: periodData } = await supabase
        .from('hourly_tm_payroll_periods')
        .select('*')
        .eq('project_code', selectedProject)
        .lte('start_date', endDate)
        .gte('end_date', startDate)
        .order('created_at', { ascending: false })
        .limit(1);
      setPeriodStatus(periodData?.[0] ?? null);

      // Load active employee configurations for project
      const { data: cfgData, error: cfgErr } = await supabase
        .from('hourly_tm_employee_config')
        .select('*')
        .eq('project_code', selectedProject)
        .eq('active', true)
        .lte('effective_from', endDate);
      if (cfgErr) throw cfgErr;

      const activeCfgs = (cfgData ?? []).filter(
        (c) => !c.effective_to || c.effective_to >= startDate,
      ) as HTMEmployeeConfig[];

      const empIds = [...new Set(activeCfgs.map((c) => c.emp_id))];

      // Load employee names
      let nameMap: Record<string, string> = {};
      if (empIds.length > 0) {
        const { data: empData } = await supabase
          .from('employees')
          .select('emp_id, name')
          .in('emp_id', empIds);
        nameMap = Object.fromEntries((empData ?? []).map((e) => [e.emp_id, e.name]));
      }

      // Load attendance in range
      const { data: attData, error: attErr } = await supabase
        .from('hourly_tm_attendance')
        .select('*')
        .eq('project_code', selectedProject)
        .in('emp_id', empIds.length > 0 ? empIds : ['__none__'])
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      if (attErr) throw attErr;

      // Load project holidays
      const { data: holData } = await supabase
        .from('hourly_tm_holidays')
        .select('*')
        .eq('project_code', selectedProject)
        .gte('holiday_date', startDate)
        .lte('holiday_date', endDate);
      setHolidays((holData ?? []) as HTMHoliday[]);

      // Run authoritative calculation engine
      const calculatedLines = buildPayrollLines({
        projectConfig: projCfg,
        employeeConfigs: activeCfgs,
        attendanceRecords: (attData ?? []) as HTMAttendance[],
        holidays: (holData ?? []) as HTMHoliday[],
        dates: dateRange,
        employeeNames: nameMap,
      });

      setLines(calculatedLines);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to calculate payroll');
    } finally {
      setLoading(false);
    }
  }, [selectedProject, startDate, endDate, projects]);

  useEffect(() => {
    if (selectedProject) {
      loadPayroll();
    }
  }, [selectedProject, startDate, endDate, loadPayroll]);

  // Export handler
  const handleExport = () => {
    if (!projectConfig || lines.length === 0) {
      toast.error('No payroll lines available to export');
      return;
    }
    const periodLabel = `${startDate}_to_${endDate}`;
    downloadPayrollExcel(
      projectConfig,
      projectConfig.project_name ?? projectConfig.project_code,
      lines,
      dates,
      periodLabel,
    );
    toast.success('Payroll spreadsheet downloaded');
  };

  // Filtered by search
  const filteredLines = lines.filter((l) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.emp_id.toLowerCase().includes(q) || l.employee_name.toLowerCase().includes(q);
  });

  // Project totals
  const totalHoursWorked = lines.reduce((s, l) => s + l.total_hours_worked, 0);
  const totalOTHours = lines.reduce((s, l) => s + l.total_ot_hours, 0);
  const totalNormalPay = lines.reduce((s, l) => s + l.normal_pay, 0);
  const totalOTPay = lines.reduce((s, l) => s + l.ot_pay, 0);
  const totalGrossPay = lines.reduce((s, l) => s + l.gross_pay, 0);

  const holidayDateSet = new Set(holidays.map((h) => h.holiday_date));

  if (!perms.canViewPayroll && !perms.isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', gap: '1rem', color: '#64748b' }}>
        <Lock size={48} style={{ opacity: 0.4 }} />
        <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>Access Denied</h2>
        <p style={{ fontSize: '0.875rem' }}>You do not have clearance to view Payroll Timesheets.</p>
      </div>
    );
  }

  return (
    <motion.div className="payroll-print-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2.5rem' }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          html, body, #root { width: 100% !important; margin: 0 !important; }
          body * { visibility: hidden !important; }
          .payroll-print-root, .payroll-print-root * { visibility: visible !important; }
          .payroll-print-root {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            color: #0f172a !important;
          }
          .payroll-no-print { display: none !important; }
          .payroll-print-content {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .payroll-print-heading { display: flex !important; }
          .payroll-print-table {
            display: block !important;
            width: 100% !important;
            overflow: visible !important;
            max-height: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .payroll-print-table > div { overflow: visible !important; max-height: none !important; }
          .payroll-print-table table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            font-size: 4.5pt !important;
          }
          .payroll-print-table th, .payroll-print-table td {
            box-sizing: border-box !important;
            min-width: 0 !important;
            padding: 1px !important;
            position: static !important;
            overflow: hidden !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            line-height: 1.1 !important;
          }
          .payroll-print-table thead, .payroll-print-table tfoot { position: static !important; }
          .payroll-print-table tr { break-inside: avoid; page-break-inside: avoid; }
          .payroll-col-emp-id { width: 5% !important; }
          .payroll-col-employee-name { width: 10% !important; }
          .payroll-day-column { width: 1.15% !important; }
          .payroll-col-total-hours, .payroll-col-ot-hours { width: 4% !important; }
          .payroll-col-category { width: 9% !important; }
          .payroll-col-ot-rate { width: 3.5% !important; }
          .payroll-col-normal-pay { width: 7% !important; }
          .payroll-col-ot-pay { width: 6.5% !important; }
          .payroll-col-allowance { width: 6% !important; }
          .payroll-col-gross-pay { width: 7% !important; }
        }
      `}</style>
      <div className="payroll-no-print">
        <Back
          fixed
          blurBG
          title="Payroll Timesheet"
          icon={<BarChart3 width="1.1rem" />}
          extra={
            lines.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Printer size={14} /> Print
                </Button>
                {perms.canExportPayroll && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Download size={14} /> Export .xlsx
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="payroll-print-content" style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        {/* Controls Card */}
        <div className="payroll-no-print" style={{ ...CARD, marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            {/* Project */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                PROJECT
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '0.6rem',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'var(--background, #0f172a)',
                  color: 'inherit',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">-- Choose Project --</option>
                {projects.map((p) => (
                  <option key={p.project_code} value={p.project_code}>
                    {p.project_code} — {p.project_name} ({p.regular_hours}h base)
                  </option>
                ))}
              </select>
            </div>

            {/* Presets */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                PERIOD PRESET
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <Button
                  size="sm"
                  variant={preset === 'current' ? 'default' : 'outline'}
                  onClick={() => handlePreset('current')}
                  style={{ flex: 1, fontSize: '0.75rem' }}
                >
                  This Month
                </Button>
                <Button
                  size="sm"
                  variant={preset === 'previous' ? 'default' : 'outline'}
                  onClick={() => handlePreset('previous')}
                  style={{ flex: 1, fontSize: '0.75rem' }}
                >
                  Last Month
                </Button>
              </div>
            </div>

            {/* Start Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                FROM DATE
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset('custom');
                }}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.6rem',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'var(--background, #0f172a)',
                  color: 'inherit',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            {/* End Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                TO DATE
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset('custom');
                }}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.6rem',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'var(--background, #0f172a)',
                  color: 'inherit',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
        </div>

        {/* Finalized Status Alert Banner */}
        {periodStatus?.status === 'finalized' && (
          <div
            className="payroll-no-print"
            style={{
              ...CARD,
              marginBottom: '1.25rem',
              borderColor: 'rgba(34,197,94,0.3)',
              background: 'rgba(34,197,94,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <CheckCircle2 color="#22c55e" size={20} />
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#22c55e' }}>
                  Finalized Period: {periodStatus.period_name}
                </span>
                <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.1rem' }}>
                  Locked on {periodStatus.finalized_at?.slice(0, 10)} by {periodStatus.finalized_by || 'Admin'}. Attendance edits are disabled.
                </p>
              </div>
            </div>

            {perms.canFinalizePayroll && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/hourly-tm/finalize?project=${selectedProject}`)}
              >
                Manage Finalization
              </Button>
            )}
          </div>
        )}

        {/* Summary Metrics Cards */}
        {lines.length > 0 && (
          <div
            className="payroll-no-print"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ ...CARD, padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', opacity: 0.65 }}>EMPLOYEES</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 700 }}>{lines.length}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Configured in period</p>
            </div>

            <div style={{ ...CARD, padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', opacity: 0.65 }}>HOURS WORKED</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 700 }}>{totalHoursWorked.toFixed(2)}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Recorded attendance</p>
            </div>

            <div style={{ ...CARD, padding: '1rem', borderColor: 'rgba(8,145,178,0.3)' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0891b2' }}>OVERTIME HOURS</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0891b2' }}>{totalOTHours.toFixed(2)}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Over daily base &amp; weekends</p>
            </div>

            <div style={{ ...CARD, padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', opacity: 0.65 }}>NORMAL PAY</p>
              <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>{formatOMR(totalNormalPay)}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Salary &amp; hourly base</p>
            </div>

            <div style={{ ...CARD, padding: '1rem', borderColor: 'rgba(217,119,6,0.3)' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: '#d97706' }}>OVERTIME PAY</p>
              <p style={{ fontSize: '1.3rem', fontWeight: 700, color: '#d97706' }}>{formatOMR(totalOTPay)}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Multiplied OT earnings</p>
            </div>

            <div style={{ ...CARD, padding: '1rem', borderColor: 'rgba(34,197,94,0.4)', background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(15,23,42,0) 100%)' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#22c55e' }}>TOTAL GROSS PAY</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>{formatOMR(totalGrossPay)}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>Normal + Overtime + Allowance</p>
            </div>
          </div>
        )}

        {/* Search Bar & Table Controls */}
        {lines.length > 0 && (
          <div className="payroll-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 'min(320px, 100%)' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type="text"
                placeholder="Search employee by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                  borderRadius: '0.6rem',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'var(--background, #0f172a)',
                  color: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {perms.canFinalizePayroll && periodStatus?.status !== 'finalized' && (
              <Button
                size="sm"
                onClick={() => navigate(`/hourly-tm/finalize?project=${selectedProject}`)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#16a34a', color: 'white' }}
              >
                <CheckCircle2 size={14} /> Finalize This Period
              </Button>
            )}
          </div>
        )}

        {/* Timesheet Data Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : !selectedProject ? (
          <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <Clock size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>Please select a project to display the payroll timesheet</p>
          </div>
        ) : lines.length === 0 ? (
          <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <AlertCircle size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>No employee pay configurations found for this project in the selected period.</p>
            <Button
              variant="outline"
              size="sm"
              style={{ marginTop: '1rem' }}
              onClick={() => navigate(`/hourly-tm/employee-config?project=${selectedProject}`)}
            >
              Configure Employees
            </Button>
          </div>
        ) : (
          <div className="payroll-print-table" style={{ ...CARD, padding: 0, overflow: 'hidden', background: '#fff', color: '#0f172a', borderColor: '#e2e8f0' }}>
            <div className="payroll-print-heading" style={{ display: 'none', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: '0.25rem', fontSize: '8pt' }}>
              <strong>{projectConfig?.project_name ?? projectConfig?.project_code} Payroll</strong>
              <span>{startDate} to {endDate}</span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 10, borderBottom: '1px solid #cbd5e1' }}>
                  <tr>
                    <th className="payroll-col-emp-id" style={{ padding: '0.7rem 0.8rem', textAlign: 'left', minWidth: 90, position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 12 }}>Emp ID</th>
                    <th className="payroll-col-employee-name" style={{ padding: '0.7rem 0.8rem', textAlign: 'left', minWidth: 160, position: 'sticky', left: 90, background: '#f1f5f9', zIndex: 12 }}>Name</th>
                    {dates.map((d) => {
                      const dayOfWeek = parseISO(d).getDay();
                      const isFri = dayOfWeek === 5;
                      const isSat = dayOfWeek === 6;
                      const isHol = holidayDateSet.has(d);
                      const bg = isHol ? '#fee2e2' : isFri ? '#e0f2fe' : isSat ? '#f1f5f9' : 'transparent';
                      return (
                        <th
                          key={d}
                          className="payroll-day-column"
                          style={{
                            padding: '0.5rem 0.4rem',
                            textAlign: 'center',
                            minWidth: 42,
                            background: bg,
                            color: isHol ? '#b91c1c' : isFri ? '#0369a1' : isSat ? '#475569' : 'inherit',
                            borderLeft: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ fontSize: '0.68rem', fontWeight: 700 }}>{d.slice(8)}</div>
                          <div style={{ fontSize: '0.6rem', opacity: 0.65 }}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dayOfWeek]}
                          </div>
                        </th>
                      );
                    })}
                    <th className="payroll-col-total-hours" style={{ padding: '0.7rem 0.6rem', textAlign: 'right', minWidth: 70 }}>Tot Hrs</th>
                    <th className="payroll-col-ot-hours" style={{ padding: '0.7rem 0.6rem', textAlign: 'right', minWidth: 65 }}>OT Hrs</th>
                    <th className="payroll-col-category" style={{ padding: '0.7rem 0.8rem', textAlign: 'left', minWidth: 130 }}>Pay Category</th>
                    <th className="payroll-col-ot-rate" style={{ padding: '0.7rem 0.6rem', textAlign: 'center', minWidth: 60 }}>OT Rate</th>
                    <th className="payroll-col-normal-pay" style={{ padding: '0.7rem 0.8rem', textAlign: 'right', minWidth: 95 }}>Normal Pay</th>
                    <th className="payroll-col-ot-pay" style={{ padding: '0.7rem 0.8rem', textAlign: 'right', minWidth: 90 }}>OT Pay</th>
                    <th className="payroll-col-allowance" style={{ padding: '0.7rem 0.8rem', textAlign: 'right', minWidth: 100 }}>Allowance</th>
                    <th className="payroll-col-gross-pay" style={{ padding: '0.7rem 0.8rem', textAlign: 'right', minWidth: 105, fontWeight: 700 }}>Gross Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map((line, idx) => (
                    <tr
                      key={line.emp_id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                      }}
                    >
                      <td className="payroll-col-emp-id" style={{ padding: '0.55rem 0.8rem', fontFamily: 'monospace', fontWeight: 600, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#f8fafc', zIndex: 2 }}>
                        {line.emp_id}
                      </td>
                      <td className="payroll-col-employee-name" style={{ padding: '0.55rem 0.8rem', fontWeight: 500, position: 'sticky', left: 90, background: idx % 2 === 0 ? '#fff' : '#f8fafc', zIndex: 2 }}>
                        {line.employee_name}
                      </td>
                      {dates.map((d) => {
                        const h = line.daily_hours[d];
                        const dayOfWeek = parseISO(d).getDay();
                        const isFri = dayOfWeek === 5;
                        const isHol = holidayDateSet.has(d);
                        return (
                          <td
                            key={d}
                            className="payroll-day-column"
                            style={{
                              padding: '0.55rem 0.35rem',
                              textAlign: 'center',
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              borderLeft: '1px solid #e2e8f0',
                              color: h === null ? '#64748b' : h > (projectConfig?.regular_hours ?? 8) || isFri || isHol ? '#0369a1' : 'inherit',
                              background: isHol ? '#fef2f2' : isFri ? '#f0f9ff' : 'transparent',
                            }}
                          >
                            {h === null ? '·' : Number(h).toFixed(1)}
                          </td>
                        );
                      })}
                      <td className="payroll-col-total-hours" style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        {line.total_hours_worked.toFixed(2)}
                      </td>
                      <td className="payroll-col-ot-hours" style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: line.total_ot_hours > 0 ? '#0e7490' : 'inherit', fontWeight: line.total_ot_hours > 0 ? 600 : 400 }}>
                        {line.total_ot_hours.toFixed(2)}
                      </td>
                      <td className="payroll-col-category" style={{ padding: '0.55rem 0.8rem', fontSize: '0.72rem' }}>
                        <span style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', background: line.pay_category === 'hourly_pay' ? '#cffafe' : '#ede9fe', color: line.pay_category === 'hourly_pay' ? '#0e7490' : '#6d28d9' }}>
                          {PAY_CATEGORY_LABELS[line.pay_category]}
                        </span>
                      </td>
                      <td className="payroll-col-ot-rate" style={{ padding: '0.55rem 0.6rem', textAlign: 'center', fontSize: '0.75rem' }}>
                        {line.ot_multiplier ? `${line.ot_multiplier}x` : '—'}
                      </td>
                      <td className="payroll-col-normal-pay" style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatOMR(line.normal_pay)}
                      </td>
                      <td className="payroll-col-ot-pay" style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontFamily: 'monospace', color: line.ot_pay > 0 ? '#b45309' : 'inherit' }}>
                        {formatOMR(line.ot_pay)}
                      </td>
                      <td className="payroll-col-allowance" style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatOMR(line.allowance_pay)}
                      </td>
                      <td className="payroll-col-gross-pay" style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#15803d' }}>
                        {formatOMR(line.gross_pay)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ position: 'sticky', bottom: 0, background: '#f1f5f9', zIndex: 10, borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                  <tr>
                    <td style={{ padding: '0.75rem 0.8rem', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 12 }}>TOTAL</td>
                    <td style={{ padding: '0.75rem 0.8rem', position: 'sticky', left: 90, background: '#f1f5f9', zIndex: 12 }}>
                      {lines.length} Employees
                    </td>
                    {dates.map((d) => (
                      <td key={d} style={{ borderLeft: '1px solid #e2e8f0' }} />
                    ))}
                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {totalHoursWorked.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: '#0e7490' }}>
                      {totalOTHours.toFixed(2)}
                    </td>
                    <td colSpan={2} />
                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatOMR(totalNormalPay)}
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', fontFamily: 'monospace', color: '#b45309' }}>
                      {formatOMR(totalOTPay)}
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatOMR(lines.reduce((s, l) => s + l.allowance_pay, 0))}
                    </td>
                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', fontFamily: 'monospace', color: '#15803d', fontSize: '0.85rem' }}>
                      {formatOMR(totalGrossPay)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
