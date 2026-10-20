import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Pencil, Plus, RefreshCw, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useHTMAccess } from './useHTMAccess';
import type { HTMProjectConfig } from './types';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

interface FormState {
  project_code: string;
  regular_hours: string;
  active: boolean;
}

const defaultForm: FormState = { project_code: '', regular_hours: '9', active: true };

export default function ProjectConfig() {
  const { userData } = useAuth();
  const perms = useHTMAccess();
  const actor = userData?.emp_id || userData?.email || '';

  const [configs, setConfigs] = useState<HTMProjectConfig[]>([]);
  const [allProjects, setAllProjects] = useState<{ project_code: string; project_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [search, setSearch] = useState('');

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [{ data: cfgData, error: cfgErr }, { data: projData, error: projErr }] = await Promise.all([
        supabase.from('hourly_tm_project_config').select('*').order('project_code'),
        supabase.from('projects').select('project_code, project_name').order('project_code'),
      ]);
      if (cfgErr) throw cfgErr;
      if (projErr) throw projErr;

      const nameMap = new Map((projData ?? []).map((p) => [p.project_code, p.project_name]));
      setConfigs((cfgData ?? []).map((c) => ({ ...c, project_name: nameMap.get(c.project_code) ?? c.project_code })));
      setAllProjects(projData ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load project configuration');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const openEdit = (cfg: HTMProjectConfig) => {
    setEditId(cfg.id);
    setForm({ project_code: cfg.project_code, regular_hours: String(cfg.regular_hours), active: cfg.active });
    setShowForm(true);
  };

  const validateForm = (): string | null => {
    if (!form.project_code.trim()) return 'Project code is required';
    const rh = Number(form.regular_hours);
    if (isNaN(rh) || rh <= 0 || rh > 24) return 'Regular hours must be a number between 0.01 and 24';
    return null;
  };

  const handleSave = async () => {
    const err = validateForm();
    if (err) { toast.error(err); return; }
    if (!perms.canManageProjectConfig) { toast.error('Permission denied'); return; }

    setSaving(true);
    try {
      const payload = {
        project_code: form.project_code.trim().toUpperCase(),
        regular_hours: Number(form.regular_hours),
        active: form.active,
        updated_by: actor,
      };

      if (editId !== null) {
        // Check if historical attendance exists before disabling
        if (!form.active) {
          const { count } = await supabase
            .from('hourly_tm_attendance')
            .select('id', { count: 'exact', head: true })
            .eq('project_code', payload.project_code);
          if ((count ?? 0) > 0) {
            const ok = confirm(`This project has ${count} attendance records. Deactivating will hide it from new entries but preserve all historical data. Continue?`);
            if (!ok) { setSaving(false); return; }
          }
        }

        const { error } = await supabase
          .from('hourly_tm_project_config')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editId);
        if (error) throw error;
        toast.success('Project configuration updated');
      } else {
        // Check project exists in master
        const { data: masterProj } = await supabase
          .from('projects')
          .select('project_code')
          .eq('project_code', payload.project_code)
          .maybeSingle();
        if (!masterProj) {
          toast.error(`Project code "${payload.project_code}" does not exist in the projects master`);
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from('hourly_tm_project_config')
          .insert({ ...payload, created_by: actor });
        if (error) throw error;
        toast.success('Project added to Hourly Time Management');
      }

      setShowForm(false);
      await loadData(true);
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const configuredCodes = new Set(configs.map((c) => c.project_code));
  const filteredConfigs = configs.filter(
    (c) =>
      !search || c.project_code.toLowerCase().includes(search.toLowerCase()) ||
      (c.project_name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2rem' }}>
      <Back fixed blurBG title="Project Configuration" icon={<Settings width="1.1rem" />}
        extra={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => loadData(true)} disabled={refreshing} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <RefreshCw width="1rem" className={refreshing ? 'animate-spin' : ''} />
            </button>
            {perms.canManageProjectConfig && (
              <Button size="sm" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Plus width="0.875rem" /> Add Project
              </Button>
            )}
          </div>
        }
      />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 680, margin: '0 auto' }}>

        {/* Info Banner */}
        <div style={{ ...CARD, marginBottom: '1rem', borderColor: '#0891b220', background: '#0891b205' }}>
          <p style={{ fontSize: '0.8rem', color: '#0891b2', lineHeight: 1.6 }}>
            <strong>Critical rule:</strong> The project's <em>Regular Hours</em> value is used as both the overtime threshold (hours above which OT begins on ordinary days) and the OT hourly-rate divisor (Salary ÷ 30 ÷ Regular Hours). These cannot be configured separately.
          </p>
        </div>

        {/* Search */}
        <Input
          placeholder="Search project code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            {filteredConfigs.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                <Settings width="2.5rem" style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 600 }}>No projects configured</p>
                <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Click "Add Project" to enable a project for Hourly Time Management.</p>
              </div>
            )}
            {filteredConfigs.map((cfg) => (
              <motion.div
                key={cfg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ ...CARD, marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{cfg.project_code}</p>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '999px',
                      background: cfg.active ? '#16a34a20' : '#64748b20',
                      color: cfg.active ? '#16a34a' : '#64748b',
                    }}>
                      {cfg.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{cfg.project_name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#0891b2', marginTop: '0.25rem' }}>
                    Regular Hours: <strong>{cfg.regular_hours}h</strong> per day
                  </p>
                </div>
                {perms.canManageProjectConfig && (
                  <button
                    onClick={() => openEdit(cfg)}
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    <Pencil width="0.875rem" />
                  </button>
                )}
              </motion.div>
            ))}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              style={{ background: 'var(--background, #0f172a)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1.25rem', padding: '1.5rem', width: '100%', maxWidth: 480 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {editId !== null ? 'Edit Project Configuration' : 'Add Project to HTM'}
                </h3>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <X width="1.1rem" />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                    Project Code *
                  </label>
                  {editId !== null ? (
                    <p style={{ fontWeight: 700, fontSize: '1rem' }}>{form.project_code}</p>
                  ) : (
                    <select
                      value={form.project_code}
                      onChange={(e) => setForm((f) => ({ ...f, project_code: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', fontSize: '0.9rem' }}
                    >
                      <option value="">Select project...</option>
                      {allProjects
                        .filter((p) => !configuredCodes.has(p.project_code))
                        .map((p) => (
                          <option key={p.project_code} value={p.project_code}>
                            {p.project_code} — {p.project_name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.35rem' }}>
                    Regular Hours per Day *
                  </label>
                  <Input
                    type="number"
                    min="0.01"
                    max="24"
                    step="0.5"
                    value={form.regular_hours}
                    onChange={(e) => setForm((f) => ({ ...f, regular_hours: e.target.value }))}
                    placeholder="e.g. 9"
                  />
                  <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem' }}>
                    This value is used as both the OT threshold and the OT hourly-rate divisor (Salary ÷ 30 ÷ Regular Hours).
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="checkbox"
                    id="proj-active"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    style={{ width: '1rem', height: '1rem' }}
                  />
                  <label htmlFor="proj-active" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    Active (visible for attendance entry)
                  </label>
                </div>

                <Button onClick={handleSave} disabled={saving} style={{ marginTop: '0.5rem' }}>
                  {saving ? <Loader2 className="animate-spin" width="1rem" /> : <Check width="1rem" />}
                  {saving ? 'Saving...' : editId !== null ? 'Update Configuration' : 'Add Project'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
