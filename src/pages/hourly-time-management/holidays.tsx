import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Info,
  Loader2,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useHTMAccess } from './useHTMAccess';
import type { HTMHoliday, HTMProjectConfig } from './types';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProjectHolidays() {
  const { userData } = useAuth();
  const perms = useHTMAccess();
  const actor = userData?.emp_id || userData?.email || 'admin';
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? '');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const [holidays, setHolidays] = useState<HTMHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holidayName, setHolidayName] = useState('');
  const [applyToAllProjects, setApplyToAllProjects] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load active projects on mount
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

  // Load holidays
  const loadHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      let query = supabase
        .from('hourly_tm_holidays')
        .select('*')
        .gte('holiday_date', startDate)
        .lte('holiday_date', endDate)
        .order('holiday_date');

      if (selectedProject) {
        query = query.eq('project_code', selectedProject);
      }

      const { data, error } = await query;
      if (error) throw error;
      setHolidays(data ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  }, [selectedProject, selectedYear]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  // Add holiday handler
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate || !holidayName.trim()) {
      toast.error('Date and holiday name are required');
      return;
    }

    if (!selectedProject && !applyToAllProjects) {
      toast.error('Please select a project or check "Apply to all projects"');
      return;
    }

    setSaving(true);
    try {
      const targets = applyToAllProjects
        ? projects.map((p) => p.project_code)
        : [selectedProject];

      const payload = targets.map((code) => ({
        project_code: code,
        holiday_date: holidayDate,
        holiday_name: holidayName.trim(),
        created_by: actor,
      }));

      const { error } = await supabase
        .from('hourly_tm_holidays')
        .upsert(payload, { onConflict: 'project_code,holiday_date' });
      if (error) throw error;

      toast.success(
        `Added "${holidayName.trim()}" on ${holidayDate} for ${targets.length} project(s)`,
      );
      setShowAddModal(false);
      setHolidayName('');
      loadHolidays();
    } catch (err: any) {
      toast.error('Failed to add holiday: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Delete holiday
  const handleDeleteHoliday = async (h: HTMHoliday) => {
    const confirm = window.confirm(
      `Remove holiday "${h.holiday_name}" on ${h.holiday_date} for project ${h.project_code}?`,
    );
    if (!confirm) return;

    setDeletingId(h.id);
    try {
      const { error } = await supabase
        .from('hourly_tm_holidays')
        .delete()
        .eq('id', h.id);
      if (error) throw error;

      toast.success('Holiday removed');
      setHolidays((prev) => prev.filter((item) => item.id !== h.id));
    } catch (err: any) {
      toast.error('Failed to remove holiday: ' + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  if (!perms.canManageHolidays && !perms.isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', gap: '1rem', color: '#64748b' }}>
        <Lock size={48} style={{ opacity: 0.4 }} />
        <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>Access Denied</h2>
        <p style={{ fontSize: '0.875rem' }}>You do not have clearance to manage Project Holidays.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2.5rem' }}>
      <Back
        fixed
        blurBG
        title="Project Holidays"
        icon={<Calendar width="1.1rem" />}
        extra={
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#dc2626', color: 'white' }}
          >
            <Plus size={14} /> Add Holiday
          </Button>
        }
      />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 860, margin: '0 auto' }}>
        {/* Info Banner */}
        <div
          style={{
            ...CARD,
            marginBottom: '1.25rem',
            background: 'rgba(56,189,248,0.06)',
            borderColor: 'rgba(56,189,248,0.2)',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
          }}
        >
          <Info size={20} color="#38bdf8" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
            <p style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '0.2rem' }}>
              Holiday Payroll Rules
            </p>
            <p style={{ opacity: 0.8 }}>
              For <strong>Fixed Salary</strong> employees, public holidays count as a <strong>payable day</strong> regardless of whether hours are worked.
              Any actual hours worked on a holiday are calculated as <strong>Overtime</strong>.
              If a holiday coincides with a Friday or Saturday, hours are never double-counted.
            </p>
          </div>
        </div>

        {/* Filters Card */}
        <div style={{ ...CARD, marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                FILTER BY PROJECT
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
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.project_code} value={p.project_code}>
                    {p.project_code} — {p.project_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                CALENDAR YEAR
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
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
                {['2024', '2025', '2026', '2027', '2028'].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Holidays List */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : holidays.length === 0 ? (
          <div style={{ ...CARD, textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <Calendar size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No holidays configured for {selectedYear}</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '1rem' }}>
              Add national or project-specific public holidays affecting payroll calculations.
            </p>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus size={14} style={{ marginRight: '0.3rem' }} /> Add Holiday
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {holidays.map((h) => {
              const dow = DOW_NAMES[parseISO(h.holiday_date).getDay()];
              return (
                <div
                  key={h.id}
                  style={{
                    ...CARD,
                    padding: '0.9rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.6rem',
                        background: 'rgba(220,38,38,0.12)',
                        border: '1px solid rgba(220,38,38,0.25)',
                        textAlign: 'center',
                        minWidth: 70,
                      }}
                    >
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f87171', display: 'block', lineHeight: 1.1 }}>
                        {h.holiday_date.slice(8)}
                      </span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.75, textTransform: 'uppercase' }}>
                        {format(parseISO(h.holiday_date), 'MMM')}
                      </span>
                    </div>

                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.15rem' }}>
                        {h.holiday_name}
                      </h4>
                      <p style={{ fontSize: '0.75rem', opacity: 0.65 }}>
                        {dow} • {h.holiday_date} • Project: <span style={{ fontFamily: 'monospace' }}>{h.project_code}</span>
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === h.id}
                    onClick={() => handleDeleteHoliday(h)}
                    style={{ color: '#ef4444', padding: '0.4rem 0.6rem' }}
                  >
                    {deletingId === h.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Holiday Modal */}
        <AnimatePresence>
          {showAddModal && (
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
                  width: 'min(440px, 100%)',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  color: '#111827',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Add Project Holiday</h3>
                  <button
                    onClick={() => setShowAddModal(false)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleAddHoliday}>
                  <div style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                      PROJECT
                    </label>
                    <select
                      value={selectedProject}
                      disabled={applyToAllProjects}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.6rem',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        color: '#111827',
                        fontSize: '0.85rem',
                        opacity: applyToAllProjects ? 0.4 : 1,
                      }}
                    >
                      <option value="">-- Choose Project --</option>
                      {projects.map((p) => (
                        <option key={p.project_code} value={p.project_code}>
                          {p.project_code} — {p.project_name}
                        </option>
                      ))}
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={applyToAllProjects}
                        onChange={(e) => setApplyToAllProjects(e.target.checked)}
                      />
                      Apply to all {projects.length} active projects
                    </label>
                  </div>

                  <div style={{ marginBottom: '0.9rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                      HOLIDAY DATE
                    </label>
                    <input
                      type="date"
                      value={holidayDate}
                      onChange={(e) => setHolidayDate(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.6rem',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        color: '#111827',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                      HOLIDAY NAME
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., National Day, Eid Al Fitr, New Year"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.6rem',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        color: '#111827',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <Button variant="outline" type="button" onClick={() => setShowAddModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving} style={{ background: '#dc2626', color: 'white' }}>
                      {saving ? <Loader2 className="animate-spin" size={16} /> : 'Save Holiday'}
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
