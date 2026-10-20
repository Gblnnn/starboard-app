import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Loader2, Pencil, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useHTMAccess } from './useHTMAccess';
import type { HTMEmployeeConfig, HTMProjectConfig, PayCategory } from './types';
import { PAY_CATEGORY_LABELS, OT_MULTIPLIER_OPTIONS, formatOMR } from './types';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

interface FormState {
  emp_id: string;
  project_code: string;
  pay_category: PayCategory;
  monthly_salary: string;
  hourly_rate: string;
  ot_multiplier: string;
  effective_from: string;
  effective_to: string;
  active: boolean;
}

const defaultForm: FormState = {
  emp_id: '',
  project_code: '',
  pay_category: 'fixed_no_ot',
  monthly_salary: '',
  hourly_rate: '',
  ot_multiplier: '',
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: '',
  active: true,
};

export default function EmployeeConfig() {
  const { userData } = useAuth();
  const perms = useHTMAccess();
  const actor = userData?.emp_id || userData?.email || '';

  const [configs, setConfigs] = useState<HTMEmployeeConfig[]>([]);
  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [employees, setEmployees] = useState<{ emp_id: string; name: string }[]>([]);
  const [projectEmployees, setProjectEmployees] = useState<{ emp_id: string; name: string }[]>([]);
  const [loadingProjectEmployees, setLoadingProjectEmployees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [filterProject, setFilterProject] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [{ data: cfgData, error: cfgErr }, { data: projData, error: projErr }, { data: empData, error: empErr }] = await Promise.all([
        supabase.from('hourly_tm_employee_config').select('*').order('project_code').order('emp_id'),
        supabase.from('hourly_tm_project_config').select('*').eq('active', true).order('project_code'),
        supabase.from('employees').select('emp_id, name').order('name'),
      ]);
      if (cfgErr) throw cfgErr;
      if (projErr) throw projErr;
      if (empErr) throw empErr;

      const nameMap = new Map((empData ?? []).map((e) => [e.emp_id, e.name]));

      setConfigs((cfgData ?? []).map((c) => ({
        ...c,
        employee_name: nameMap.get(c.emp_id) ?? c.emp_id,
      })));
      setProjects(projData ?? []);
      setEmployees(empData ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load employee configuration');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!showForm || editId !== null || !form.project_code) {
      setProjectEmployees([]);
      setLoadingProjectEmployees(false);
      return;
    }

    let cancelled = false;
    const loadProjectEmployees = async () => {
      setProjectEmployees([]);
      setLoadingProjectEmployees(true);
      try {
        const { data: projectEmployeeRows, error: projectEmployeesError } = await supabase
          .from('v_employee_latest_project')
          .select('emp_id')
          .eq('project_code', form.project_code);
        if (projectEmployeesError) throw projectEmployeesError;

        const empIds = Array.from(new Set(
          (projectEmployeeRows ?? [])
            .map((row) => row.emp_id)
            .filter((empId): empId is string => Boolean(empId)),
        ));
        if (!empIds.length) {
          if (!cancelled) setProjectEmployees([]);
          return;
        }

        const { data: employeeRows, error: employeesError } = await supabase
          .from('employees')
          .select('emp_id, name')
          .in('emp_id', empIds)
          .order('name');
        if (employeesError) throw employeesError;
        if (!cancelled) setProjectEmployees(employeeRows ?? []);
      } catch (err: unknown) {
        if (!cancelled) {
          setProjectEmployees([]);
          toast.error(err instanceof Error ? err.message : 'Failed to load employees for this project');
        }
      } finally {
        if (!cancelled) setLoadingProjectEmployees(false);
      }
    };

    void loadProjectEmployees();
    return () => { cancelled = true; };
  }, [editId, form.project_code, showForm]);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const openEdit = (cfg: HTMEmployeeConfig) => {
    setEditId(cfg.id);
    setForm({
      emp_id: cfg.emp_id,
      project_code: cfg.project_code,
      pay_category: cfg.pay_category,
      monthly_salary: cfg.monthly_salary !== null ? String(cfg.monthly_salary) : '',
      hourly_rate: cfg.hourly_rate !== null ? String(cfg.hourly_rate) : '',
      ot_multiplier: cfg.ot_multiplier !== null ? String(cfg.ot_multiplier) : '',
      effective_from: cfg.effective_from,
      effective_to: cfg.effective_to ?? '',
      active: cfg.active,
    });
    setShowForm(true);
  };

  const validateForm = (): string | null => {
    if (!form.emp_id.trim()) return 'Employee ID is required';
    if (!form.project_code.trim()) return 'Project is required';
    if (!form.effective_from) return 'Effective from date is required';
    if (form.effective_to && form.effective_to < form.effective_from) return 'Effective to must be on or after effective from';

    if (form.pay_category === 'fixed_no_ot' || form.pay_category === 'fixed_with_ot') {
      const sal = Number(form.monthly_salary);
      if (!form.monthly_salary || isNaN(sal) || sal < 0) return 'Monthly salary is required and must be a non-negative number';
    }
    if (form.pay_category === 'hourly_pay') {
      const hr = Number(form.hourly_rate);
      if (!form.hourly_rate || isNaN(hr) || hr < 0) return 'Hourly rate is required and must be a non-negative number';
    }
    if (form.pay_category === 'fixed_with_ot') {
      if (!form.ot_multiplier) return 'OT multiplier is required for Fixed Salary with OT';
    }
    if (form.pay_category !== 'fixed_with_ot' && form.ot_multiplier) {
      return 'OT multiplier must be empty for this pay category';
    }
    return null;
  };

  const handleSave = async () => {
    const err = validateForm();
    if (err) { toast.error(err); return; }
    if (!perms.canManageEmployeeConfig) { toast.error('Permission denied'); return; }

    setSaving(true);
    try {
      const payload: any = {
        emp_id: form.emp_id.trim(),
        project_code: form.project_code.trim(),
        pay_category: form.pay_category,
        monthly_salary: (form.pay_category === 'fixed_no_ot' || form.pay_category === 'fixed_with_ot') ? Number(form.monthly_salary) : null,
        hourly_rate: form.pay_category === 'hourly_pay' ? Number(form.hourly_rate) : null,
        ot_multiplier: form.pay_category === 'fixed_with_ot' ? Number(form.ot_multiplier) : null,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        active: form.active,
        updated_by: actor,
      };

      if (editId !== null) {
        const { error } = await supabase
          .from('hourly_tm_employee_config')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editId);
        if (error) throw error;
        toast.success('Employee configuration updated');
      } else {
        const { error } = await supabase
          .from('hourly_tm_employee_config')
          .insert({ ...payload, created_by: actor });
        if (error) throw error;
        toast.success('Employee configuration added');
      }

      setShowForm(false);
      await loadData(true);
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const filtered = configs.filter((c) => {
    const matchProject = !filterProject || c.project_code === filterProject;
    const matchSearch = !search ||
      c.emp_id.toLowerCase().includes(search.toLowerCase()) ||
      (c.employee_name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchProject && matchSearch;
  });

  const payCategory = form.pay_category;
  const needsSalary = payCategory === 'fixed_no_ot' || payCategory === 'fixed_with_ot';
  const needsHourly = payCategory === 'hourly_pay';
  const needsOT = payCategory === 'fixed_with_ot';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2rem' }}>
      <Back fixed blurBG title="Employee Pay Configuration" icon={<Users width="1.1rem" />}
        extra={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => loadData(true)} disabled={refreshing} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <RefreshCw width="1rem" className={refreshing ? 'animate-spin' : ''} />
            </button>
            {perms.canManageEmployeeConfig && (
              <Button size="sm" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Plus width="0.875rem" /> Add Config
              </Button>
            )}
          </div>
        }
      />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 680, margin: '0 auto' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Input
            placeholder="Search employee ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={{ padding: '0.55rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', fontSize: '0.875rem' }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            {filtered.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                <Users width="2.5rem" style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 600 }}>No configurations found</p>
                <p style={{ fontSize: '0.8rem' }}>Add an employee pay configuration to get started.</p>
              </div>
            )}

            {filtered.map((cfg) => (
              <motion.div
                key={cfg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ ...CARD, marginBottom: '0.75rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{cfg.emp_id}</p>
                      {cfg.employee_name && <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>· {cfg.employee_name}</p>}
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '999px',
                        background: cfg.active ? '#16a34a20' : '#64748b20',
                        color: cfg.active ? '#16a34a' : '#64748b',
                      }}>
                        {cfg.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem' }}>
                      {cfg.project_code} · {PAY_CATEGORY_LABELS[cfg.pay_category]}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', fontSize: '0.75rem' }}>
                      {cfg.monthly_salary !== null && (
                        <p>Salary: <strong>{formatOMR(cfg.monthly_salary)}</strong></p>
                      )}
                      {cfg.hourly_rate !== null && (
                        <p>Rate: <strong>{formatOMR(cfg.hourly_rate)}/hr</strong></p>
                      )}
                      {cfg.ot_multiplier !== null && (
                        <p>OT Mult: <strong>×{cfg.ot_multiplier}</strong></p>
                      )}
                      <p style={{ color: '#64748b' }}>From: {cfg.effective_from}{cfg.effective_to ? ` → ${cfg.effective_to}` : ' (open)'}</p>
                    </div>
                  </div>
                  {perms.canManageEmployeeConfig && (
                    <button
                      onClick={() => openEdit(cfg)}
                      style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', color: '#94a3b8', flexShrink: 0, marginLeft: '0.75rem' }}
                    >
                      <Pencil width="0.875rem" />
                    </button>
                  )}
                </div>
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
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              overflowY: 'auto',
              backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowForm(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '1.25rem',
                padding: '1.75rem',
                width: '100%',
                maxWidth: 520,
                margin: 'auto',
                color: '#0f172a',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                  {editId !== null ? 'Edit Employee Configuration' : 'Add Employee Configuration'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' }}
                >
                  <X width="1.2rem" />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                {/* Searchable Project */}
                <div>
                  {editId !== null ? (
                    <div>
                      <label style={modalLabelStyle}>Project</label>
                      <div style={{ padding: '0.65rem 0.85rem', background: '#f1f5f9', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{form.project_code}</span>
                        {projects.find((p) => p.project_code === form.project_code)?.project_name && (
                          <span style={{ color: '#475569', marginLeft: '0.5rem' }}>
                            — {projects.find((p) => p.project_code === form.project_code)?.project_name}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <SearchableSelect
                      label="Project *"
                      placeholder="Search project by code or name..."
                      value={form.project_code}
                      onChange={(val) => setForm((f) => ({ ...f, project_code: val, emp_id: '' }))}
                      options={projects.map((p) => ({
                        value: p.project_code,
                        label: p.project_name ?? p.project_code,
                        subLabel: `${p.regular_hours}h regular`,
                      }))}
                    />
                  )}
                </div>

                {/* Searchable Employee */}
                <div>
                  {editId !== null ? (
                    <div>
                      <label style={modalLabelStyle}>Employee</label>
                      <div style={{ padding: '0.65rem 0.85rem', background: '#f1f5f9', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{form.emp_id}</span>
                        {employees.find((e) => e.emp_id === form.emp_id) && (
                          <span style={{ color: '#475569', marginLeft: '0.5rem' }}>
                            — {employees.find((e) => e.emp_id === form.emp_id)?.name}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : form.project_code ? (
                    <SearchableSelect
                      label="Employee *"
                      placeholder={loadingProjectEmployees ? 'Loading project employees...' : 'Search employee by ID or name...'}
                      value={form.emp_id}
                      onChange={(val) => setForm((f) => ({ ...f, emp_id: val }))}
                      options={projectEmployees.map((e) => ({
                        value: e.emp_id,
                        label: e.name,
                      }))}
                    />
                  ) : (
                    <div>
                      <label style={modalLabelStyle}>Employee *</label>
                      <div style={{ padding: '0.65rem 0.85rem', background: '#f1f5f9', borderRadius: '0.5rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.875rem' }}>
                        Select a project first
                      </div>
                    </div>
                  )}
                </div>

                {/* Pay Category */}
                <div>
                  <label style={modalLabelStyle}>Pay Category *</label>
                  <select
                    value={form.pay_category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pay_category: e.target.value as PayCategory,
                        ot_multiplier: '',
                      }))
                    }
                    style={modalSelectStyle}
                  >
                    {(Object.entries(PAY_CATEGORY_LABELS) as [PayCategory, string][]).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Monthly Salary */}
                {needsSalary && (
                  <div>
                    <label style={modalLabelStyle}>Monthly Salary (OMR) *</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.monthly_salary}
                      onChange={(e) => setForm((f) => ({ ...f, monthly_salary: e.target.value }))}
                      placeholder="e.g. 400.000"
                      style={modalInputStyle}
                    />
                  </div>
                )}

                {/* Hourly Rate */}
                {needsHourly && (
                  <div>
                    <label style={modalLabelStyle}>Hourly Rate (OMR) *</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.hourly_rate}
                      onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))}
                      placeholder="e.g. 1.500"
                      style={modalInputStyle}
                    />
                  </div>
                )}

                {/* OT Multiplier */}
                {needsOT && (
                  <div>
                    <label style={modalLabelStyle}>OT Multiplier *</label>
                    <select
                      value={form.ot_multiplier}
                      onChange={(e) => setForm((f) => ({ ...f, ot_multiplier: e.target.value }))}
                      style={modalSelectStyle}
                    >
                      <option value="">Select multiplier...</option>
                      {OT_MULTIPLIER_OPTIONS.map((v) => (
                        <option key={v} value={String(v)}>
                          ×{v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Effective Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={modalLabelStyle}>Effective From *</label>
                    <Input
                      type="date"
                      value={form.effective_from}
                      onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <label style={modalLabelStyle}>Effective To (open if blank)</label>
                    <Input
                      type="date"
                      value={form.effective_to}
                      onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                      style={modalInputStyle}
                    />
                  </div>
                </div>

                {/* Active */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem' }}>
                  <input
                    type="checkbox"
                    id="emp-active"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    style={{ width: '1.1rem', height: '1.1rem', accentColor: '#16a34a', cursor: 'pointer' }}
                  />
                  <label htmlFor="emp-active" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                    Active Configuration
                  </label>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    marginTop: '0.5rem',
                    background: '#1e3a5f',
                    color: '#ffffff',
                    height: '2.6rem',
                    fontWeight: 600,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {saving ? (
                    <Loader2 className="animate-spin" width="1rem" />
                  ) : (
                    <Check width="1rem" />
                  )}
                  {saving ? 'Saving...' : editId !== null ? 'Update Configuration' : 'Add Configuration'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Searchable Select Component for Modal
// ---------------------------------------------------------------------------
function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string; subLabel?: string }>;
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selected = options.find((o) => o.value === value);

  const filtered = options.filter((o) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      o.value.toLowerCase().includes(q) ||
      o.label.toLowerCase().includes(q) ||
      (o.subLabel && o.subLabel.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ position: 'relative' }} ref={containerRef}>
      <label style={modalLabelStyle}>{label}</label>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearchTerm('');
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          borderRadius: '0.5rem',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          color: selected ? '#0f172a' : '#94a3b8',
          fontSize: '0.875rem',
          cursor: 'pointer',
          textAlign: 'left',
          outline: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? (
            <span>
              <strong style={{ color: '#0f172a' }}>{selected.value}</strong>
              {selected.label && selected.label !== selected.value && (
                <span style={{ color: '#475569' }}> — {selected.label}</span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown size={16} color="#64748b" style={{ flexShrink: 0, marginLeft: '0.5rem' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '0.6rem',
            boxShadow: '0 12px 24px -4px rgba(0,0,0,0.15), 0 4px 6px -2px rgba(0,0,0,0.05)',
            padding: '0.5rem',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}
            />
            <input
              type="text"
              autoFocus
              placeholder="Type to filter..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.6rem 0.45rem 2rem',
                fontSize: '0.8rem',
                borderRadius: '0.4rem',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#0f172a',
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                No matches found
              </div>
            ) : (
              filtered.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    background: opt.value === value ? '#e0f2fe' : 'transparent',
                    color: opt.value === value ? '#0369a1' : '#1e293b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (opt.value !== value) e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    if (opt.value !== value) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>{opt.value}</span>
                    {opt.label && opt.label !== opt.value && (
                      <span style={{ marginLeft: '0.4rem', color: '#475569' }}>— {opt.label}</span>
                    )}
                  </div>
                  {opt.subLabel && (
                    <span style={{ fontSize: '0.72rem', color: '#64748b', flexShrink: 0, marginLeft: '0.5rem' }}>
                      {opt.subLabel}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const modalLabelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#475569',
  display: 'block',
  marginBottom: '0.35rem',
};

const modalSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  borderRadius: '0.5rem',
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  color: '#0f172a',
  fontSize: '0.875rem',
  outline: 'none',
};

const modalInputStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderColor: '#cbd5e1',
  color: '#0f172a',
  borderRadius: '0.5rem',
};
