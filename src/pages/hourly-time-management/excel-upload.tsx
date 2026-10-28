import { useAuth } from '@/components/AuthProvider';
import Back from '@/components/back';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  downloadAttendanceTemplate,
  downloadErrorReport,
  parseAttendanceExcel,
  validateUploadRows,
  type UploadValidationRow,
} from './excelUtils';
import { useHTMAccess } from './useHTMAccess';
import type { HTMProjectConfig } from './types';
import { fetchAttendanceRecords } from './attendanceQueries';

const CARD: React.CSSProperties = {
  background: 'var(--card, rgba(255,255,255,0.04))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

export default function ExcelUpload() {
  const { userData } = useAuth();
  const perms = useHTMAccess();
  const actor = userData?.emp_id || userData?.email || '';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<HTMProjectConfig[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? '');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [validationRows, setValidationRows] = useState<UploadValidationRow[]>([]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedProject) {
      toast.error('Please select a project before uploading');
      return;
    }
    setFile(selectedFile);
    setParseError(null);
    setValidationRows([]);
    setDateRange(null);
    setLoading(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const parsed = parseAttendanceExcel(buffer);

      if (parsed.parseError) {
        setParseError(parsed.parseError);
        setLoading(false);
        return;
      }

      if (!parsed.startDate || !parsed.endDate || parsed.dates.length === 0) {
        setParseError('No dates detected in the uploaded attendance template.');
        setLoading(false);
        return;
      }

      setDateRange({ start: parsed.startDate, end: parsed.endDate });

      // Fetch active employee configs for project in range
      const { data: cfgData, error: cfgErr } = await supabase
        .from('hourly_tm_employee_config')
        .select('emp_id, effective_from, effective_to')
        .eq('project_code', selectedProject)
        .eq('active', true)
        .lte('effective_from', parsed.endDate);
      if (cfgErr) throw cfgErr;

      const validEmpIds = new Set(
        (cfgData ?? [])
          .filter((c) => !c.effective_to || c.effective_to >= parsed.startDate!)
          .map((c) => c.emp_id),
      );

      // Fetch existing attendance records
      const empIds = [...new Set(parsed.rows.map((r) => r.emp_id))];
      const attData = await fetchAttendanceRecords(
        selectedProject,
        empIds,
        parsed.startDate,
        parsed.endDate,
      );

      // Validate all cells
      const validated = validateUploadRows(
        parsed,
        validEmpIds,
        attData,
        selectedProject,
      );
      setValidationRows(validated);
    } catch (err: any) {
      setParseError(err?.message || 'Failed to process Excel file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!selectedProject) {
      toast.error('Please select a project first');
      return;
    }
    const proj = projects.find((p) => p.project_code === selectedProject);
    if (!proj) return;

    try {
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Load employees configured for project
      const { data: cfgData, error: cfgErr } = await supabase
        .from('hourly_tm_employee_config')
        .select('emp_id')
        .eq('project_code', selectedProject)
        .eq('active', true);
      if (cfgErr) throw cfgErr;
      const empIds = [...new Set((cfgData ?? []).map((c) => c.emp_id))];

      let empList: { emp_id: string; name: string }[] = [];
      if (empIds.length > 0) {
        const { data: empData, error: empErr } = await supabase
          .from('employees')
          .select('emp_id, name')
          .in('emp_id', empIds)
          .order('name');
        if (empErr) throw empErr;
        const namesById = new Map((empData ?? []).map((employee) => [employee.emp_id, employee.name]));
        empList = empIds.map((emp_id) => ({ emp_id, name: namesById.get(emp_id) ?? emp_id }));
      }

      downloadAttendanceTemplate(proj, proj.project_name ?? proj.project_code, empList, start, end);
      toast.success('Template downloaded');
    } catch (err: any) {
      toast.error('Failed to generate template: ' + (err?.message || err));
    }
  };

  // Metrics
  const validRows = validationRows.filter((r) => r.status === 'valid');
  const conflictRows = validationRows.filter((r) => r.status === 'conflict');
  const invalidRows = validationRows.filter((r) => r.status === 'invalid');
  const hasErrors = invalidRows.length > 0;

  // Import Action
  const handleImport = async () => {
    if (!dateRange) {
      toast.error('Upload and validate an attendance file before importing.');
      return;
    }

    if (hasErrors) {
      toast.error('Cannot import while there are invalid records. Please fix the errors and re-upload.');
      return;
    }

    const rowsToImport = allowOverwrite
      ? [...validRows, ...conflictRows]
      : validRows;

    if (rowsToImport.length === 0) {
      toast.error('No new valid records to import.');
      return;
    }

    setImporting(true);
    try {
      const payload = rowsToImport.map((r) => ({
        emp_id: r.emp_id,
        project_code: selectedProject,
        attendance_date: r.attendance_date,
        hours_worked: r.hours_worked ?? 0,
        updated_at: new Date().toISOString(),
        updated_by: actor,
        created_by: actor,
      }));

      // Upsert in batches of 200
      const BATCH_SIZE = 200;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('hourly_tm_attendance')
          .upsert(batch, { onConflict: 'emp_id,attendance_date' })
          .select('emp_id, attendance_date');
        if (error) throw error;
        if (data.length !== batch.length) {
          throw new Error(`Import verification failed: expected ${batch.length} records to be saved, but confirmed ${data.length}.`);
        }
      }

      toast.success(`Successfully imported ${rowsToImport.length} attendance records!`);
      const params = new URLSearchParams({
        project: selectedProject,
        start: dateRange.start,
        end: dateRange.end,
      });
      navigate(`/hourly-tm/attendance?${params.toString()}`);
    } catch (err: any) {
      toast.error('Import failed: ' + (err?.message || err));
    } finally {
      setImporting(false);
    }
  };

  if (!perms.canImportExcel && !perms.isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', gap: '1rem', color: '#64748b' }}>
        <AlertCircle size={48} style={{ opacity: 0.4 }} />
        <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>Access Denied</h2>
        <p style={{ fontSize: '0.875rem' }}>You do not have clearance to upload Excel attendance.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100svh', paddingBottom: '2.5rem' }}>
      <Back fixed blurBG title="Excel Attendance Upload" icon={<Upload width="1.1rem" />} />

      <div style={{ paddingTop: '4.5rem', padding: '4.5rem 1rem 2rem', maxWidth: 860, margin: '0 auto' }}>
        {/* Project Selector & Actions Card */}
        <div style={{ ...CARD, marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.35rem' }}>
                SELECT PROJECT
              </label>
              <select
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value);
                  setFile(null);
                  setValidationRows([]);
                  setParseError(null);
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
                    {p.project_code} — {p.project_name} ({p.regular_hours}h/day)
                  </option>
                ))}
              </select>
            </div>

            {selectedProject && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-end' }}
              >
                <Download size={14} /> Download Project Template
              </Button>
            )}
          </div>
        </div>

        {/* Upload Drop Zone Card */}
        {selectedProject && (
          <div
            style={{
              ...CARD,
              marginBottom: '1.25rem',
              border: file ? '2px dashed #0891b2' : '2px dashed rgba(255,255,255,0.15)',
              textAlign: 'center',
              padding: '2.5rem 1.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />
            <FileSpreadsheet
              size={44}
              style={{ margin: '0 auto 0.75rem', color: file ? '#0891b2' : '#64748b' }}
            />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {file ? file.name : 'Click to select or drag & drop an attendance .xlsx file'}
            </h3>
            <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB — Click to choose a different file`
                : 'Must follow the generated template column format with full dates (YYYY-MM-DD)'}
            </p>
          </div>
        )}

        {/* Parsing Error Message */}
        {parseError && (
          <div
            style={{
              ...CARD,
              marginBottom: '1.25rem',
              background: 'rgba(239,68,68,0.1)',
              borderColor: 'rgba(239,68,68,0.3)',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
            }}
          >
            <XCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <div>
              <p style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.25rem' }}>Validation Error</p>
              <p style={{ fontSize: '0.85rem' }}>{parseError}</p>
            </div>
          </div>
        )}

        {/* Validation Summary & Preview */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Loader2 className="animate-spin" size={32} />
          </div>
        )}

        {!loading && validationRows.length > 0 && (
          <div>
            {/* Stat Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ ...CARD, padding: '1rem' }}>
                <p style={{ fontSize: '0.7rem', opacity: 0.65 }}>TOTAL ENTRIES</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{validationRows.length}</p>
                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>{dateRange?.start} to {dateRange?.end}</p>
              </div>

              <div style={{ ...CARD, padding: '1rem', borderColor: 'rgba(34,197,94,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#22c55e' }}>
                  <CheckCircle2 size={16} />
                  <p style={{ fontSize: '0.7rem', fontWeight: 600 }}>NEW VALID</p>
                </div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{validRows.length}</p>
                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Ready to save</p>
              </div>

              <div style={{ ...CARD, padding: '1rem', borderColor: 'rgba(245,158,11,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b' }}>
                  <AlertTriangle size={16} />
                  <p style={{ fontSize: '0.7rem', fontWeight: 600 }}>CONFLICTS</p>
                </div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{conflictRows.length}</p>
                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Already in DB</p>
              </div>

              <div style={{ ...CARD, padding: '1rem', borderColor: hasErrors ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: hasErrors ? '#ef4444' : '#64748b' }}>
                  <XCircle size={16} />
                  <p style={{ fontSize: '0.7rem', fontWeight: 600 }}>INVALID</p>
                </div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: hasErrors ? '#ef4444' : 'inherit' }}>{invalidRows.length}</p>
                <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>Must fix to proceed</p>
              </div>
            </div>

            {/* Error Table if any */}
            {hasErrors && (
              <div style={{ ...CARD, marginBottom: '1.25rem', borderColor: 'rgba(239,68,68,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
                    <AlertCircle size={18} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {invalidRows.length} Invalid Entries Detected
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadErrorReport(invalidRows)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    <Download size={14} /> Download Error Report
                  </Button>
                </div>

                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', opacity: 0.6 }}>
                        <th style={{ padding: '0.4rem' }}>Emp ID</th>
                        <th style={{ padding: '0.4rem' }}>Name</th>
                        <th style={{ padding: '0.4rem' }}>Date</th>
                        <th style={{ padding: '0.4rem' }}>Entered</th>
                        <th style={{ padding: '0.4rem' }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invalidRows.slice(0, 50).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#fca5a5' }}>
                          <td style={{ padding: '0.4rem', fontFamily: 'monospace' }}>{r.emp_id}</td>
                          <td style={{ padding: '0.4rem' }}>{r.employee_name}</td>
                          <td style={{ padding: '0.4rem' }}>{r.attendance_date}</td>
                          <td style={{ padding: '0.4rem', fontWeight: 600 }}>{String(r.raw)}</td>
                          <td style={{ padding: '0.4rem' }}>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Conflicts Card & Options */}
            {conflictRows.length > 0 && (
              <div style={{ ...CARD, marginBottom: '1.25rem', borderColor: 'rgba(245,158,11,0.2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allowOverwrite}
                    onChange={(e) => setAllowOverwrite(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#f59e0b' }}
                  />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      Authorize overwrite of {conflictRows.length} existing record(s)
                    </span>
                    <p style={{ fontSize: '0.75rem', opacity: 0.65, marginTop: '0.15rem' }}>
                      If checked, existing hours in the database will be updated with values from this spreadsheet.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Final Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', alignItems: 'center' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setValidationRows([]);
                  setParseError(null);
                }}
                disabled={importing}
              >
                Clear
              </Button>

              <Button
                onClick={handleImport}
                disabled={importing || hasErrors || (validRows.length === 0 && !allowOverwrite)}
                style={{
                  background: hasErrors ? '#475569' : '#0891b2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.5rem',
                  fontWeight: 600,
                }}
              >
                {importing ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Importing...
                  </>
                ) : (
                  <>
                    Commit Import ({allowOverwrite ? validRows.length + conflictRows.length : validRows.length} rows)
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
