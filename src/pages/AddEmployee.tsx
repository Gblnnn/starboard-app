import { AlertCircle, CheckCircle2, Loader2, Monitor } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ProjectSelect from '../components/project-select';
import CompanySelect from '../components/company-select';

interface Device {
  id: number;
  serial_no: string;
  location: string | null;
}

interface FormState {
  device_user_id: string;
  name: string;
  department: string;
  email: string;
  emp_id: string;
  emp_type: 'staff' | 'worker';
  doj: string;
  phone: string;
  cug: string;
  nationality: string;
  designation: string;
  project: string;
  ot_eligible: boolean;
  company: string;
  civil_id: string;
  status: string;
  shift: string;
}

const EMPTY_FORM: FormState = {
  device_user_id: '',
  name: '',
  department: '',
  email: '',
  emp_id: '',
  emp_type: 'staff',
  doj: '',
  phone: '',
  cug: '',
  nationality: '',
  designation: '',
  project: '',
  ot_eligible: false,
  company: '',
  civil_id: '',
  status: 'active',
  shift: '',
};

// Builds the ZKTeco ADMS "DATA UPDATE USERINFO" command string
function buildAddUserCommand(cmdId: number, pin: string, name: string): string {
  // Name field can't contain tabs; ZKTeco truncates long names on some models
  const safeName = name.replace(/\t/g, ' ').slice(0, 24);
  return `C:${cmdId}:DATA UPDATE USERINFO PIN=${pin}\tName=${safeName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=`;
}

export default function AddEmployee() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    const { data, error: err } = await supabase
      .from('devices')
      .select('id, serial_no, location')
      .order('id', { ascending: true });
    if (!err) setDevices(data ?? []);
    setLoadingDevices(false);
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  function toggleDevice(serial: string) {
    setSelectedDevices(prev => {
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial);
      else next.add(serial);
      return next;
    });
  }

  function toggleAll() {
    if (selectedDevices.size === devices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(devices.map(d => d.serial_no)));
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    if (!form.device_user_id.trim()) {
      setError('Device User ID is required — this must match the ID used on the biometric device.');
      return;
    }
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (selectedDevices.size === 0) {
      setError('Select at least one device to push this user to (or save without pushing).');
      return;
    }

    setSaving(true);

    try {
      // 1. Insert employee into Supabase
      const { data: empData, error: empErr } = await supabase
        .from('employees')
        .insert({
          device_user_id: form.device_user_id.trim(),
          name: form.name.trim(),
          department: form.department.trim() || null,
          email: form.email.trim() || null,
          emp_id: form.emp_id.trim() || null,
          emp_type: form.emp_type,
          doj: form.doj || null,
          phone: form.phone.trim() || null,
          cug: form.cug.trim() || null,
          nationality: form.nationality.trim() || null,
          designation: form.designation.trim() || null,
          project: form.project.trim() || null,
          ot_eligible: form.ot_eligible,
          company: form.company.trim() || null,
          civil_id: form.civil_id.trim() || null,
          status: form.status || 'active',
          shift: form.shift.trim() || null,
        })
        .select()
        .single();

      if (empErr) throw new Error(empErr.message);

      // 2. Queue a command for each selected device
      const commands = [...selectedDevices].map(serial => ({
        device_serial: serial,
        command: buildAddUserCommand(Date.now() + Math.floor(Math.random() * 1000), form.device_user_id.trim(), form.name.trim()),
        command_type: 'ADD_USER',
        employee_id: empData.id,
        status: 'pending',
      }));

      for (const cmd of commands) {
        const { error: cmdErr } = await supabase.from('device_commands').insert(cmd);
        if (cmdErr) throw new Error(`Employee saved, but failed to queue device commands: ${cmdErr.message}`);
        await new Promise(resolve => setTimeout(resolve, 80));
      }

      setSuccess(`${form.name} added and queued for ${selectedDevices.size} device(s). The command will be sent next time the device checks in (usually within ~15 seconds).`);
      setForm(EMPTY_FORM);
      setSelectedDevices(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOnly() {
    setError(null);
    setSuccess(null);

    if (!form.device_user_id.trim()) {
      setError('Device User ID is required.');
      return;
    }
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      const { error: empErr } = await supabase
        .from('employees')
        .insert({
          device_user_id: form.device_user_id.trim(),
          name: form.name.trim(),
          department: form.department.trim() || null,
          email: form.email.trim() || null,
          emp_id: form.emp_id.trim() || null,
          emp_type: form.emp_type,
          doj: form.doj || null,
          phone: form.phone.trim() || null,
          cug: form.cug.trim() || null,
          nationality: form.nationality.trim() || null,
          designation: form.designation.trim() || null,
          project: form.project.trim() || null,
          ot_eligible: form.ot_eligible,
          company: form.company.trim() || null,
          civil_id: form.civil_id.trim() || null,
          status: form.status || 'active',
          shift: form.shift.trim() || null,
        });

      if (empErr) throw new Error(empErr.message);

      setSuccess(`${form.name} saved to the employee master. No device commands were queued.`);
      setForm(EMPTY_FORM);
      setSelectedDevices(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div className="max-w-xl mx-auto w-full px-4 py-6">
        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Employee ID (HR)
              </label>
              <input
                type="text"
                value={form.emp_id}
                onChange={e => update('emp_id', e.target.value)}
                placeholder="e.g. EMP-045"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Full name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Date of Join</label>
              <input
                type="date"
                value={form.doj}
                onChange={e => update('doj', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="e.g. +971501234567"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">CUG</label>
              <input
                type="number"
                value={form.cug}
                onChange={e => update('cug', e.target.value)}
                placeholder="Enter CUG Number"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                placeholder="e.g. john@company.com"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={e => update('department', e.target.value)}
                placeholder="e.g. Operations"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Employee Type</label>
              <select
                value={form.emp_type}
                onChange={e => update('emp_type', e.target.value as 'staff' | 'worker')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors bg-white"
              >
                <option value="staff">Staff</option>
                <option value="worker">Worker</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nationality</label>
              <input
                type="text"
                value={form.nationality}
                onChange={e => update('nationality', e.target.value)}
                placeholder="Enter Nationality"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Designation</label>
              <input
                type="text"
                value={form.designation}
                onChange={e => update('designation', e.target.value)}
                placeholder="Enter Designation"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Civil ID</label>
              <input
                type="text"
                value={form.civil_id}
                onChange={e => update('civil_id', e.target.value)}
                placeholder="Enter Civil ID"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Shift</label>
              <input
                type="text"
                value={form.shift}
                onChange={e => update('shift', e.target.value)}
                placeholder="Enter Shift"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => update('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors bg-white"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="add_ot_eligible"
                checked={form.ot_eligible}
                onChange={e => update('ot_eligible', e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="add_ot_eligible" className="text-sm font-medium text-gray-700 cursor-pointer">
                OT Eligible
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Project</label>
              <ProjectSelect
                value={form.project}
                onChange={(v) => update('project', v)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Company Name</label>
              <CompanySelect
                value={form.company}
                onChange={(v) => update('company', v)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Device User ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.device_user_id}
                onChange={e => update('device_user_id', e.target.value)}
                placeholder="e.g. 110525"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">This must match the ID used on the biometric device.</p>
            </div>
          </div>

          {/* Device selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5 mt-2">
              <label className="block text-xs font-medium text-gray-600">
                Push to devices
              </label>
              {devices.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-gray-400 hover:text-gray-700"
                >
                  {selectedDevices.size === devices.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {loadingDevices ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading devices…
              </div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">No devices registered.</div>
            ) : (
              <div className="space-y-2">
                {devices.map(d => (
                  <label
                    key={d.id}
                    className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${selectedDevices.has(d.serial_no)
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDevices.has(d.serial_no)}
                      onChange={() => toggleDevice(d.serial_no)}
                      className="w-4 h-4 accent-gray-900"
                    />
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Monitor className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{d.location ?? 'Unnamed location'}</div>
                      <div className="text-xs text-gray-400 font-mono">{d.serial_no}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1.5">
              The command is queued and sent the next time the device checks in (~15s).
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={handleSaveOnly}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Save without pushing
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Saving…' : `Save & Push to ${selectedDevices.size || 0} device(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
