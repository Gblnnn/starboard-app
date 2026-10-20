import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Settings,
  Upload,
  Users,
  Lock,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useHTMAccess } from './useHTMAccess';
import type { HTMProjectConfig, HTMPayrollPeriod } from './types';
import { formatOMR, payrollPeriodStatusColor, payrollPeriodStatusLabel } from './types';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

export default function HourlyTMIndex() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const perms = useHTMAccess();

  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [recentPeriods, setRecentPeriods] = useState<HTMPayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  if (!perms.hasModuleAccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', gap: '1rem', color: '#64748b' }}>
        <Lock size={48} style={{ opacity: 0.4 }} />
        <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>Access Denied</h2>
        <p style={{ fontSize: '0.875rem' }}>You do not have access to the Hourly Time Management module.</p>
      </div>
    );
  }

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [{ data: projData, error: projErr }, { data: periodsData, error: periodsErr }] = await Promise.all([
        supabase.from('hourly_tm_project_config').select('*').eq('active', true).order('project_code'),
        supabase.from('hourly_tm_payroll_periods').select('*').order('created_at', { ascending: false }).limit(6),
      ]);
      if (projErr) throw projErr;
      if (periodsErr) throw periodsErr;

      // Enrich project names
      const codes = (projData ?? []).map((p) => p.project_code);
      let nameMap: Record<string, string> = {};
      if (codes.length > 0) {
        const { data: projMaster } = await supabase
          .from('projects')
          .select('project_code, project_name')
          .in('project_code', codes);
        (projMaster ?? []).forEach((p) => { nameMap[p.project_code] = p.project_name; });
      }

      setProjects((projData ?? []).map((p) => ({ ...p, project_name: nameMap[p.project_code] ?? p.project_code })));
      setRecentPeriods(periodsData ?? []);
    } catch (err: any) {
      if (!silent) toast.error(err?.message || 'Failed to load HTM data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const navItems = [
    { label: 'Project Config',     icon: <Settings width="1.2rem" />,      path: '/hourly-tm/project-config',   color: '#1e3a5f', show: perms.canViewConfig },
    { label: 'Employee Config',    icon: <Users width="1.2rem" />,          path: '/hourly-tm/employee-config',  color: '#7c3aed', show: perms.canViewConfig },
    { label: 'Attendance Entry',   icon: <Clock width="1.2rem" />,          path: '/hourly-tm/attendance',       color: '#0891b2', show: perms.canEnterAttendance },
    { label: 'Excel Upload',       icon: <Upload width="1.2rem" />,         path: '/hourly-tm/excel-upload',     color: '#059669', show: perms.canImportExcel },
    { label: 'Payroll Timesheet',  icon: <BarChart3 width="1.2rem" />,      path: '/hourly-tm/payroll',          color: '#d97706', show: perms.canViewPayroll },
    { label: 'Finalize Payroll',   icon: <CheckCircle2 width="1.2rem" />,   path: '/hourly-tm/finalize',         color: '#16a34a', show: perms.canFinalizePayroll },
    { label: 'Holidays',           icon: <Calendar width="1.2rem" />,       path: '/hourly-tm/holidays',         color: '#dc2626', show: perms.canManageHolidays },
  ].filter((item) => item.show !== false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2rem' }}>
      <Back fixed blurBG title="Hourly Time Management" icon={<FileSpreadsheet width="1.25rem" />}
        extra={
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{ padding: '0.5rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <RefreshCw width="1.125rem" className={refreshing ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 680, margin: '0 auto' }}>

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'linear-gradient(135deg, #0f2540 0%, #1e3a5f 50%, #0c4a6e 100%)',
            borderRadius: '1.25rem',
            padding: '1.75rem',
            marginBottom: '1.25rem',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: -30, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 60, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

          <p style={{ fontSize: '0.72rem', opacity: 0.65, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Active Projects
          </p>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            {loading ? '...' : projects.length}
          </h2>
          <p style={{ fontSize: '0.8rem', opacity: 0.65 }}>
            Project-based hourly payroll management
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            {perms.canEnterAttendance && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/hourly-tm/attendance')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                <Clock width="0.875rem" /> Enter Attendance
              </motion.button>
            )}
            {perms.canViewPayroll && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/hourly-tm/payroll')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                <BarChart3 width="0.875rem" /> View Payroll
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Navigation Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {navItems.map((item) => (
            <motion.button
              key={item.path}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate(item.path)}
              style={{
                ...CARD,
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                cursor: 'pointer',
                border: `1px solid ${item.color}20`,
                textAlign: 'left',
              }}
            >
              <span style={{ color: item.color, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Active Projects */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            {projects.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                <AlertCircle width="2rem" style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No Active Projects</p>
                <p style={{ fontSize: '0.8rem' }}>
                  {perms.canManageProjectConfig
                    ? 'Configure a project from the Project Config screen.'
                    : 'No projects are currently enabled for Hourly Time Management.'}
                </p>
                {perms.canManageProjectConfig && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate('/hourly-tm/project-config')}
                    style={{ marginTop: '1rem', padding: '0.6rem 1.25rem', borderRadius: '0.6rem', background: '#1e3a5f', color: 'white', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Configure Project
                  </motion.button>
                )}
              </div>
            )}

            {projects.map((proj) => (
              <motion.div
                key={proj.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ ...CARD, marginBottom: '0.75rem', cursor: 'pointer' }}
                onClick={() => perms.canEnterAttendance && navigate(`/hourly-tm/attendance?project=${proj.project_code}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{proj.project_code}</p>
                    <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{proj.project_name}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.72rem', color: '#64748b' }}>Regular Hours</p>
                    <p style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0891b2' }}>{proj.regular_hours}h</p>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Recent Payroll Periods */}
            {recentPeriods.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
                  Recent Payroll Periods
                </h3>
                {recentPeriods.map((period) => (
                  <motion.div
                    key={period.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ ...CARD, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    onClick={() => navigate(`/hourly-tm/finalize?period=${period.id}`)}
                  >
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{period.period_name}</p>
                      <p style={{ fontSize: '0.72rem', color: '#64748b' }}>{period.project_code} · {period.start_date} → {period.end_date}</p>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      padding: '0.2rem 0.6rem', borderRadius: '999px',
                      fontSize: '0.7rem', fontWeight: 600,
                      background: payrollPeriodStatusColor[period.status] + '20',
                      color: payrollPeriodStatusColor[period.status],
                    }}>
                      {period.status === 'finalized' && <Lock width="0.6rem" />}
                      {payrollPeriodStatusLabel[period.status]}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
