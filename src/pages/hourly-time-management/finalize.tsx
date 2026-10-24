import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Lock,
  Plus,
  Unlock,
  X,
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
  HTMPayrollSnapshot,
  HTMProjectConfig,
  PayrollLineResult,
} from './types';
import {
  formatOMR,
  PAY_CATEGORY_LABELS,
  payrollPeriodStatusColor,
  payrollPeriodStatusLabel,
} from './types';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

export default function FinalizePayroll() {
  const { userData } = useAuth();
  const perms = useHTMAccess();
  const actor = userData?.emp_id || userData?.email || 'admin';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? '');
  const [periods, setPeriods] = useState<HTMPayrollPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeTarget, setFinalizeTarget] = useState<HTMPayrollPeriod | null>(null);

  // New period modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const now = new Date();
  const [newPeriodName, setNewPeriodName] = useState(`${format(now, 'MMMM yyyy')} Payroll`);
  const [newStartDate, setNewStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [newEndDate, setNewEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));

  // Reopen modal
  const [reopenTarget, setReopenTarget] = useState<HTMPayrollPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  // Snapshot viewer
  const [viewingPeriod, setViewingPeriod] = useState<HTMPayrollPeriod | null>(null);
  const [snapshots, setSnapshots] = useState<HTMPayrollSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Load active projects
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

  // Load periods for selected project
  const loadPeriods = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hourly_tm_payroll_periods')
        .select('*')
        .eq('project_code', selectedProject)
        .order('start_date', { ascending: false });
      if (error) throw error;
      setPeriods(data ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load payroll periods');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  // Create Period handler
  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newPeriodName || !newStartDate || !newEndDate) {
      toast.error('All fields are required');
      return;
    }
    if (newStartDate > newEndDate) {
      toast.error('Start date cannot be after end date');
      return;
    }

    try {
      const { error } = await supabase.from('hourly_tm_payroll_periods').insert([
        {
          project_code: selectedProject,
          period_name: newPeriodName,
          start_date: newStartDate,
          end_date: newEndDate,
          status: 'draft',
          created_by: actor,
        },
      ]);
      if (error) throw error;

      toast.success('Payroll period created successfully');
      setShowCreateModal(false);
      loadPeriods();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create period');
    }
  };

  // Finalize & Lock Period handler
  const handleFinalize = async () => {
    const period = finalizeTarget;
    if (!period) return;

    const proj = projects.find((p) => p.project_code === period.project_code);
    if (!proj) {
      toast.error('Project configuration not found');
      return;
    }

    setFinalizing(true);
    try {
      const dates = generateDateRange(period.start_date, period.end_date);

      // Load active employee configurations
      const { data: cfgData, error: cfgErr } = await supabase
        .from('hourly_tm_employee_config')
        .select('*')
        .eq('project_code', period.project_code)
        .eq('active', true)
        .lte('effective_from', period.end_date);
      if (cfgErr) throw cfgErr;

      const activeCfgs = (cfgData ?? []).filter(
        (c) => !c.effective_to || c.effective_to >= period.start_date,
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

      // Load attendance records
      const { data: attData, error: attErr } = await supabase
        .from('hourly_tm_attendance')
        .select('*')
        .eq('project_code', period.project_code)
        .in('emp_id', empIds.length > 0 ? empIds : ['__none__'])
        .gte('attendance_date', period.start_date)
        .lte('attendance_date', period.end_date);
      if (attErr) throw attErr;

      // Load project holidays
      const { data: holData } = await supabase
        .from('hourly_tm_holidays')
        .select('*')
        .eq('project_code', period.project_code)
        .gte('holiday_date', period.start_date)
        .lte('holiday_date', period.end_date);

      // Calculate authoritative payroll lines
      const calculated = buildPayrollLines({
        projectConfig: proj,
        employeeConfigs: activeCfgs,
        attendanceRecords: (attData ?? []) as HTMAttendance[],
        holidays: (holData ?? []) as HTMHoliday[],
        dates,
        employeeNames: nameMap,
      });

      // Clear any prior snapshot for this period (in case of re-finalization)
      await supabase
        .from('hourly_tm_payroll_snapshot')
        .delete()
        .eq('payroll_period_id', period.id);

      // Build snapshots payload
      const snapshotRows = calculated.map((line) => {
        // Build daily hours JSON without nulls
        const cleanHours: Record<string, number> = {};
        for (const [d, val] of Object.entries(line.daily_hours)) {
          if (val !== null && val !== undefined) cleanHours[d] = Number(val);
        }

        return {
          payroll_period_id: period.id,
          emp_id: line.emp_id,
          project_code: period.project_code,
          start_date: period.start_date,
          end_date: period.end_date,
          pay_category: line.pay_category,
          monthly_salary: line.monthly_salary,
          allowance: line.allowance,
          hourly_rate: line.hourly_rate,
          ot_multiplier: line.ot_multiplier,
          regular_hours: line.regular_hours,
          payable_days: line.payable_days,
          total_hours_worked: line.total_hours_worked,
          total_ot_hours: line.total_ot_hours,
          normal_pay: line.normal_pay,
          ot_pay: line.ot_pay,
          allowance_pay: line.allowance_pay,
          gross_pay: line.gross_pay,
          daily_hours_json: cleanHours,
          finalized_at: new Date().toISOString(),
          finalized_by: actor,
        };
      });

      // Insert snapshots in batches
      const BATCH = 150;
      for (let i = 0; i < snapshotRows.length; i += BATCH) {
        const slice = snapshotRows.slice(i, i + BATCH);
        const { error: insErr } = await supabase.from('hourly_tm_payroll_snapshot').insert(slice);
        if (insErr) throw insErr;
      }

      // Update period status
      const { error: updErr } = await supabase
        .from('hourly_tm_payroll_periods')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          finalized_by: actor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', period.id);
      if (updErr) throw updErr;

      toast.success(`Successfully finalized "${period.period_name}" with ${snapshotRows.length} employee lines!`);
      setFinalizeTarget(null);
      loadPeriods();
    } catch (err: any) {
      toast.error('Finalization failed: ' + (err?.message || err));
    } finally {
      setFinalizing(false);
    }
  };

  // Reopen period handler
  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget || !reopenReason.trim()) {
      toast.error('A mandatory justification reason is required to reopen finalized payroll');
      return;
    }

    try {
      const { error } = await supabase
        .from('hourly_tm_payroll_periods')
        .update({
          status: 'reopened',
          reopened_at: new Date().toISOString(),
          reopened_by: actor,
          reopen_reason: reopenReason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', reopenTarget.id);
      if (error) throw error;

      toast.success(`Payroll period "${reopenTarget.period_name}" reopened for corrections.`);
      setReopenTarget(null);
      setReopenReason('');
      loadPeriods();
    } catch (err: any) {
      toast.error('Failed to reopen period: ' + (err?.message || err));
    }
  };

  // View snapshot records for finalized period
  const handleViewSnapshot = async (period: HTMPayrollPeriod) => {
    setViewingPeriod(period);
    setLoadingSnapshots(true);
    try {
      const { data, error } = await supabase
        .from('hourly_tm_payroll_snapshot')
        .select('*')
        .eq('payroll_period_id', period.id)
        .order('emp_id');
      if (error) throw error;

      // Join employee names
      const empIds = [...new Set((data ?? []).map((s) => s.emp_id))];
      let nameMap: Record<string, string> = {};
      if (empIds.length > 0) {
        const { data: empData } = await supabase
          .from('employees')
          .select('emp_id, name')
          .in('emp_id', empIds);
        nameMap = Object.fromEntries((empData ?? []).map((e) => [e.emp_id, e.name]));
      }

      setSnapshots(
        (data ?? []).map((s) => ({
          ...s,
          employee_name: nameMap[s.emp_id] ?? s.emp_id,
        })),
      );
    } catch (err: any) {
      toast.error('Failed to load snapshot lines: ' + (err?.message || err));
    } finally {
      setLoadingSnapshots(false);
    }
  };

  // Export Snapshot to Excel
  const handleExportSnapshot = () => {
    if (!viewingPeriod || snapshots.length === 0) return;
    const proj = projects.find((p) => p.project_code === viewingPeriod.project_code);
    if (!proj) return;

    const dates = generateDateRange(viewingPeriod.start_date, viewingPeriod.end_date);
    const lines: PayrollLineResult[] = snapshots.map((s) => ({
      emp_id: s.emp_id,
      employee_name: s.employee_name ?? s.emp_id,
      project_code: s.project_code,
      pay_category: s.pay_category,
      monthly_salary: s.monthly_salary,
      allowance: s.allowance,
      hourly_rate: s.hourly_rate,
      ot_multiplier: s.ot_multiplier as any,
      regular_hours: s.regular_hours,
      daily_hours: s.daily_hours_json ?? {},
      payable_days: s.payable_days,
      total_hours_worked: s.total_hours_worked,
      total_ot_hours: s.total_ot_hours,
      normal_pay: s.normal_pay,
      ot_pay: s.ot_pay,
      allowance_pay: s.allowance_pay,
      gross_pay: s.gross_pay,
    }));

    downloadPayrollExcel(
      proj,
      proj.project_name ?? proj.project_code,
      lines,
      dates,
      `Finalized_${viewingPeriod.period_name}`,
    );
  };

  if (!perms.canFinalizePayroll && !perms.isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', gap: '1rem', color: '#64748b' }}>
        <Lock size={48} style={{ opacity: 0.4 }} />
        <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>Access Denied</h2>
        <p style={{ fontSize: '0.875rem' }}>You do not have clearance to finalize payroll periods.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2.5rem' }}>
      <Back
        fixed
        blurBG
        title="Finalize Payroll"
        icon={<CheckCircle2 width="1.1rem" />}
        extra={
          selectedProject ? (
            <Button
              size="sm"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#16a34a', color: 'white' }}
            >
              <Plus size={14} /> New Period
            </Button>
          ) : undefined
        }
      />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 960, margin: '0 auto' }}>
        {/* Project Selector Card */}
        <div style={{ ...CARD, marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
            SELECT PROJECT
          </label>
          <select
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setViewingPeriod(null);
            }}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '0.6rem',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'var(--background, #0f172a)',
              color: 'inherit',
              fontSize: '0.9rem',
            }}
          >
            <option value="">-- Choose Project --</option>
            {projects.map((p) => (
              <option key={p.project_code} value={p.project_code}>
                {p.project_code} — {p.project_name} ({p.regular_hours}h regular hours)
              </option>
            ))}
          </select>
        </div>

        {/* Periods List */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : !selectedProject ? (
          <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <CheckCircle2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>Select a project above to manage payroll finalization periods.</p>
          </div>
        ) : periods.length === 0 ? (
          <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <Calendar size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No payroll periods defined yet</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '1rem' }}>
              Create your first payroll period to generate draft timesheets and lock finalized payroll.
            </p>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={14} style={{ marginRight: '0.3rem' }} /> Create Period
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {periods.map((p) => {
              const isFinalized = p.status === 'finalized';
              const isReopened = p.status === 'reopened';
              const color = payrollPeriodStatusColor[p.status];

              return (
                <div key={p.id} style={{ ...CARD, borderColor: isFinalized ? 'rgba(34,197,94,0.3)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.period_name}</span>
                        <span
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '0.4rem',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: `${color}20`,
                            color: color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {payrollPeriodStatusLabel[p.status]}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                        {p.start_date} to {p.end_date}
                      </p>

                      {isFinalized && p.finalized_at && (
                        <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.3rem' }}>
                          Locked on {p.finalized_at.slice(0, 10)} by {p.finalized_by || 'Admin'}
                        </p>
                      )}

                      {isReopened && p.reopened_at && (
                        <p style={{ fontSize: '0.75rem', color: '#c084fc', marginTop: '0.3rem' }}>
                          Reopened on {p.reopened_at.slice(0, 10)} by {p.reopened_by || 'Admin'}. Reason: "{p.reopen_reason}"
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/hourly-tm/payroll?project=${selectedProject}&start=${p.start_date}&end=${p.end_date}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}
                      >
                        <FileSpreadsheet size={14} /> Timesheet
                      </Button>

                      {isFinalized ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSnapshot(p)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}
                          >
                            <Eye size={14} /> View Snapshot
                          </Button>

                          {(perms.canReopenPayroll || perms.isAdmin) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReopenTarget(p);
                                setReopenReason('');
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: '#c084fc', color: '#c084fc', fontSize: '0.78rem' }}
                            >
                              <Unlock size={14} /> Reopen
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setFinalizeTarget(p)}
                          disabled={finalizing}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#16a34a', color: 'white', fontSize: '0.78rem' }}
                        >
                          <Lock size={14} /> Finalize &amp; Lock
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Snapshot Viewer Modal */}
        <AnimatePresence>
          {viewingPeriod && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backdropFilter: 'blur(6px)',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{
                  ...CARD,
                  width: 'min(980px, 100%)',
                  maxHeight: '85vh',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  background: '#fff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                      Finalized Snapshot: {viewingPeriod.period_name}
                    </h3>
                    <p style={{ fontSize: '0.75rem', opacity: 0.65 }}>
                      {viewingPeriod.start_date} to {viewingPeriod.end_date} • Immutable Snapshot
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Button size="sm" variant="outline" onClick={handleExportSnapshot}>
                      <Download size={14} style={{ marginRight: '0.3rem' }} /> Export .xlsx
                    </Button>
                    <button
                      onClick={() => setViewingPeriod(null)}
                      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.4rem' }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {loadingSnapshots ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
                    <Loader2 className="animate-spin" size={32} />
                  </div>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                        <tr style={{ textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem 0.6rem' }}>Emp ID</th>
                          <th style={{ padding: '0.5rem 0.6rem' }}>Name</th>
                          <th style={{ padding: '0.5rem 0.6rem' }}>Category</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Hours</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>OT Hours</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Normal Pay</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>OT Pay</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Allowance</th>
                          <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700 }}>Gross Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.map((s, idx) => (
                          <tr
                            key={s.id}
                            style={{
                              borderBottom: '1px solid #e2e8f0',
                              background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                            }}
                          >
                            <td style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', fontWeight: 600 }}>{s.emp_id}</td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{s.employee_name}</td>
                            <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.72rem' }}>
                              {PAY_CATEGORY_LABELS[s.pay_category]}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                              {Number(s.total_hours_worked).toFixed(2)}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: s.total_ot_hours > 0 ? '#0e7490' : 'inherit' }}>
                              {Number(s.total_ot_hours).toFixed(2)}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                              {formatOMR(s.normal_pay)}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', color: s.ot_pay > 0 ? '#b45309' : 'inherit' }}>
                              {formatOMR(s.ot_pay)}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                              {formatOMR(s.allowance_pay)}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#15803d' }}>
                              {formatOMR(s.gross_pay)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9', fontWeight: 700 }}>
                        <tr>
                          <td colSpan={3} style={{ padding: '0.6rem' }}>TOTAL ({snapshots.length} lines)</td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                            {snapshots.reduce((acc, s) => acc + Number(s.total_hours_worked), 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'monospace', color: '#0e7490' }}>
                            {snapshots.reduce((acc, s) => acc + Number(s.total_ot_hours), 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                            {formatOMR(snapshots.reduce((acc, s) => acc + Number(s.normal_pay), 0))}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'monospace', color: '#b45309' }}>
                            {formatOMR(snapshots.reduce((acc, s) => acc + Number(s.ot_pay), 0))}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>
                            {formatOMR(snapshots.reduce((acc, s) => acc + Number(s.allowance_pay), 0))}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'monospace', color: '#15803d' }}>
                            {formatOMR(snapshots.reduce((acc, s) => acc + Number(s.gross_pay), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Period Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backdropFilter: 'blur(6px)',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ ...CARD, width: 'min(440px, 100%)', background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>New Payroll Period</h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleCreatePeriod}>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                      PERIOD NAME
                    </label>
                    <input
                      type="text"
                      value={newPeriodName}
                      onChange={(e) => setNewPeriodName(e.target.value)}
                      required
                      placeholder="e.g., October 2026 Payroll"
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.6rem',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#0f172a',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                        START DATE
                      </label>
                      <input
                        type="date"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.75rem',
                          borderRadius: '0.6rem',
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          color: '#0f172a',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                        END DATE
                      </label>
                      <input
                        type="date"
                        value={newEndDate}
                        onChange={(e) => setNewEndDate(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.75rem',
                          borderRadius: '0.6rem',
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          color: '#0f172a',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <Button variant="outline" type="button" onClick={() => setShowCreateModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" style={{ background: '#16a34a', color: 'white' }}>
                      Create Draft Period
                    </Button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Finalize Confirmation Modal */}
        <AnimatePresence>
          {finalizeTarget && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backdropFilter: 'blur(6px)',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ ...CARD, width: 'min(460px, 100%)', background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Finalize Payroll Period</h3>
                  <button
                    type="button"
                    onClick={() => setFinalizeTarget(null)}
                    disabled={finalizing}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: finalizing ? 'not-allowed' : 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Are you sure you want to finalize and lock <strong>{finalizeTarget.period_name}</strong>?
                </p>
                <p style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '1.25rem' }}>
                  {finalizeTarget.start_date} to {finalizeTarget.end_date}. This creates an immutable payroll snapshot and locks attendance edits for this date range.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <Button variant="outline" onClick={() => setFinalizeTarget(null)} disabled={finalizing}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleFinalize}
                    disabled={finalizing}
                    style={{ background: '#16a34a', color: 'white' }}
                  >
                    {finalizing ? 'Finalizing...' : 'Finalize & Lock'}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Reopen Modal */}
        <AnimatePresence>
          {reopenTarget && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backdropFilter: 'blur(6px)',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ ...CARD, width: 'min(460px, 100%)', background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#7c3aed' }}>
                    Reopen Finalized Payroll Period
                  </h3>
                  <button
                    onClick={() => setReopenTarget(null)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '1rem' }}>
                  Reopening "{reopenTarget.period_name}" will unlock attendance records and allow corrections.
                  An audit entry will record your justification.
                </p>

                <form onSubmit={handleReopen}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                      MANDATORY REOPEN REASON / JUSTIFICATION
                    </label>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      required
                      rows={3}
                      placeholder="State the reason why attendance or payroll must be corrected..."
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.6rem',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#0f172a',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <Button variant="outline" type="button" onClick={() => setReopenTarget(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" style={{ background: '#7c3aed', color: 'white' }}>
                      Confirm Reopen
                    </Button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
