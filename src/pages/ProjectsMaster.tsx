import { useAuth } from '@/components/AuthProvider';
import CustomDropDown from '@/components/custom-dropdown';
import { ResponsiveModal } from '@/components/responsive-modal';
import {
  ChartBarIcon,
  Check,
  ChevronDown,
  Compass,
  FolderKanban,
  Laptop2,
  List,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Scan,
  Search,
  Trash2,
  X,
  CircleMinus
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { formatLocationGeofence, parseLocationGeofence } from '../lib/geofence';
import { supabase } from '../lib/supabase';

interface Project {
  id: number;
  project_code: string;
  project_name: string;
  project_location: string | null;
  project_in_time: string | null;
  project_out_time: string | null;
  focal_point_id: string | null;
  focal_point_name: string | null;
  focal_point_email: string | null;
  approver_id: string | null;
  approver_name: string | null;
  approver_email: string | null;
}

interface Device {
  id: number;
  serial_no: string;
  location: string | null;
  project_code: string | null;
}

interface ProjectForm {
  project_code: string;
  project_name: string;
  project_location: string;
  project_in_time: string;
  project_out_time: string;
  geofence_enabled: boolean;
  geofence_lat: string;
  geofence_lng: string;
  geofence_radius: string;
  focal_point_id: string;
  focal_point_name: string;
  focal_point_email: string;
  approver_id: string;
  approver_name: string;
  approver_email: string;
}

const defaultForm: ProjectForm = {
  project_code: '',
  project_name: '',
  project_location: '',
  project_in_time: '08:00',
  project_out_time: '17:00',
  geofence_enabled: false,
  geofence_lat: '',
  geofence_lng: '',
  geofence_radius: '',
  focal_point_id: '',
  focal_point_name: '',
  focal_point_email: '',
  approver_id: '',
  approver_name: '',
  approver_email: ''
};

const toISOString = (timeStr: string | null): string | null => {
  if (!timeStr) return null;
  try {
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10));
    date.setMinutes(parseInt(minutes, 10));
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date.toISOString();
  } catch (err) {
    console.error("Error parsing time to ISO:", err);
    return null;
  }
};

const formatISOToTime = (isoStr: string | null): string => {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (err) {
    console.error("Error parsing ISO to time:", err);
    return '';
  }
};

import type { EmployeeSummary } from '../types/attendance';

interface ProjectsMasterProps {
  refreshTrigger?: number;
  onLoadingChange?: (loading: boolean) => void;
  employeeSummaries?: EmployeeSummary[];
}

export default function ProjectsMaster({ refreshTrigger, onLoadingChange, employeeSummaries }: ProjectsMasterProps = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter(p =>
      (p.project_code && p.project_code.toLowerCase().includes(q)) ||
      (p.project_name && p.project_name.toLowerCase().includes(q)) ||
      (p.project_location && p.project_location.toLowerCase().includes(q)) ||
      (p.focal_point_email && p.focal_point_email.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  // Attendance Mode States
  const [showAttendanceStats, setShowAttendanceStats] = useState(false);
  const [attendanceModal, setAttendanceModal] = useState<{
    projectCode: string;
    projectName: string;
    projectLocation: string | null;
    filterType: 'present' | 'absent' | 'total';
  } | null>(null);

  // Modal / Dialog States
  const [isAdding, setIsAdding] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deletion Confirm States
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Focal Point Dialog States
  const [focalPointProject, setFocalPointProject] = useState<Project | null>(null);
  const [focalForm, setFocalForm] = useState({
    focal_point_id: '',
    focal_point_name: '',
    focal_point_email: ''
  });

  // Focal Point Popover Search States
  const [openEmpSelect, setOpenEmpSelect] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  const selectableEmployees = useMemo(() => {
    if (!empSearch.trim()) return employeesList;
    const q = empSearch.toLowerCase().trim();
    return employeesList.filter(emp =>
      (emp.name && emp.name.toLowerCase().includes(q)) ||
      (emp.emp_id && emp.emp_id.toLowerCase().includes(q)) ||
      (emp.device_user_id && emp.device_user_id.toLowerCase().includes(q))
    );
  }, [employeesList, empSearch]);

  const selectedEmp = useMemo(() => {
    if (!focalForm.focal_point_id) return null;
    return employeesList.find(emp =>
      emp.emp_id === focalForm.focal_point_id ||
      emp.device_user_id === focalForm.focal_point_id ||
      String(emp.id) === focalForm.focal_point_id
    );
  }, [employeesList, focalForm.focal_point_id]);

  // Approver Dialog States
  const [approverPointProject, setApproverPointProject] = useState<Project | null>(null);
  const [approverForm, setApproverForm] = useState({
    approver_id: '',
    approver_name: '',
    approver_email: ''
  });

  const [openApproverSelect, setOpenApproverSelect] = useState(false);
  const [approverSearch, setApproverSearch] = useState("");

  const selectableApproverEmployees = useMemo(() => {
    if (!approverSearch.trim()) return employeesList;
    const q = approverSearch.toLowerCase().trim();
    return employeesList.filter(emp =>
      (emp.name && emp.name.toLowerCase().includes(q)) ||
      (emp.emp_id && emp.emp_id.toLowerCase().includes(q)) ||
      (emp.device_user_id && emp.device_user_id.toLowerCase().includes(q))
    );
  }, [employeesList, approverSearch]);

  const selectedApproverEmp = useMemo(() => {
    if (!approverForm.approver_id) return null;
    return employeesList.find(emp =>
      emp.emp_id === approverForm.approver_id ||
      emp.device_user_id === approverForm.approver_id ||
      String(emp.id) === approverForm.approver_id
    );
  }, [employeesList, approverForm.approver_id]);

  // Geofence Dialog States
  const [geofenceProject, setGeofenceProject] = useState<Project | null>(null);
  const [isEditingGeofence, setIsEditingGeofence] = useState(false);

  // Device Allocation States
  const [allocatingProjectId, setAllocatingProjectId] = useState<string | null>(null);
  const [selectedDeviceSerial, setSelectedDeviceSerial] = useState<string>('');
  const [allocating, setAllocating] = useState<string | null>(null);

  const { userData } = useAuth();

  const canEditAttendance = useMemo(() => {
    try {
      const permissions = JSON.parse(userData?.clearance || "{}") as Record<string, boolean>;
      const hasStructuredClearance = Object.keys(permissions).length > 0;
      const hasAttendanceModule = permissions.attendance === true;
      const hasAttendanceEdit = permissions.attendance_edit === true;
      const hasExplicitEditBlock = permissions.attendance_edit === false;

      if (hasAttendanceModule) {
        return hasAttendanceEdit;
      }

      if (permissions.attendance === false || hasExplicitEditBlock) {
        return false;
      }

      if (userData?.role === "admin" || userData?.role === "site_admin") {
        return !hasStructuredClearance;
      }

      return false;
    } catch {
      return userData?.role === "admin" || userData?.role === "site_admin";
    }
  }, [userData]);

  useEffect(() => {
    // Editors default to project details view; read-only users are kept in attendance-only mode.
    setShowAttendanceStats(!canEditAttendance);
  }, [canEditAttendance]);

  const previewLat = parseFloat(form.geofence_lat);
  const previewLng = parseFloat(form.geofence_lng);
  const showMapPreview = !isNaN(previewLat) && previewLat >= -90 && previewLat <= 90 && !isNaN(previewLng) && previewLng >= -180 && previewLng <= 180;

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch projects
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .order('project_code', { ascending: true });
      if (projErr) throw projErr;

      // Fetch devices
      const { data: devData, error: devErr } = await supabase
        .from('devices')
        .select('id, serial_no, location, project_code')
        .order('serial_no', { ascending: true });
      if (devErr) throw devErr;

      // Fetch users and map with employees for focal point assignment
      const { data: usersData } = await supabase.from('users').select('emp_id, email');
      const { data: empData, error: empErr } = await supabase.from('employees').select('id, name, email, emp_id');
      
      let mappedEmployees: any[] = [];
      if (empErr) {
        console.warn("Could not load employees for focal point:", empErr.message);
      } else if (usersData && empData) {
        const userEmpIds = usersData.map(u => String(u.emp_id)).filter(Boolean);
        mappedEmployees = empData
          .filter(emp => userEmpIds.includes(String(emp.emp_id)))
          .map(emp => {
            const userRec = usersData.find(u => String(u.emp_id) === String(emp.emp_id));
            return {
              id: emp.id,
              name: emp.name,
              email: userRec?.email || emp.email,
              emp_id: emp.emp_id
            };
          })
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      setProjects(projData || []);
      setDevices(devData || []);
      setEmployeesList(mappedEmployees || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects and devices data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const getProjectEmployees = useCallback((projectCode: string, projectName: string, projectLocation: string | null) => {
    const summaries = employeeSummaries || [];
    const codeLower = projectCode ? projectCode.toLowerCase().trim() : '';
    const nameLower = projectName ? projectName.toLowerCase().trim() : '';
    const geoName = projectLocation ? parseLocationGeofence(projectLocation).name.toLowerCase().trim() : '';

    return summaries.filter(emp => {
      // Resolve the employee's location the exact same way as EmployeeTable
      const mergedLoc = emp.isVerified ? emp.assignedLocation : (emp.location || emp.assignedLocation || null);
      const locKey = mergedLoc ? mergedLoc.toLowerCase().trim() : '';

      // Check if employee is assigned to this project using multiple fallbacks
      return (locKey && (
        locKey === codeLower ||
        locKey === nameLower ||
        (geoName && locKey === geoName) ||
        (geoName && nameLower.includes(locKey)) ||
        (locKey && nameLower.includes(locKey)) ||
        (geoName && geoName.includes(locKey))
      ));
    });
  }, [employeeSummaries]);

  const getProjectAttendanceStats = useCallback((projectCode: string, projectName: string, projectLocation: string | null) => {
    const projectEmps = getProjectEmployees(projectCode, projectName, projectLocation);
    const present = projectEmps.filter(e => e.isPresent).length;
    const absent = projectEmps.filter(e => !e.isPresent).length;
    return { present, absent };
  }, [getProjectEmployees]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadData(false);
    }
  }, [refreshTrigger, loadData]);

  useEffect(() => {
    onLoadingChange?.(loading || refreshing);
  }, [loading, refreshing, onLoadingChange]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (openEmpSelect && !target.closest('.employee-dropdown-container')) {
        setOpenEmpSelect(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openEmpSelect]);

  // Group devices by project_code for easier lookup
  const devicesByProject = useMemo(() => {
    const map: Record<string, Device[]> = {};
    devices.forEach(d => {
      if (d.project_code) {
        if (!map[d.project_code]) {
          map[d.project_code] = [];
        }
        map[d.project_code].push(d);
      }
    });
    return map;
  }, [devices]);

  // Devices that are not allocated to any project
  const unallocatedDevices = useMemo(() => {
    return devices.filter(d => !d.project_code);
  }, [devices]);

  function openAdd() {
    setIsAdding(true);
    setForm(defaultForm);
    setFormError(null);
  }

  function closeAdd() {
    setIsAdding(false);
    setFormError(null);
  }

  async function handleAdd() {
    if (!form.project_code.trim()) {
      setFormError('Project code is required.');
      return;
    }
    if (!form.project_name.trim()) {
      setFormError('Project name is required.');
      return;
    }

    // Check duplicate code locally
    const duplicate = projects.some(p => p.project_code.toLowerCase() === form.project_code.trim().toLowerCase());
    if (duplicate) {
      setFormError(`Project code "${form.project_code}" already exists.`);
      return;
    }

    // Validate geofence parameters
    let finalLocation = form.project_location.trim();
    const latStr = form.geofence_lat.trim();
    const lngStr = form.geofence_lng.trim();
    const radStr = form.geofence_radius.trim();
    const hasGeofenceInput = latStr !== '' || lngStr !== '' || radStr !== '';

    if (hasGeofenceInput) {
      const latVal = parseFloat(latStr);
      const lngVal = parseFloat(lngStr);
      const radVal = parseFloat(radStr);
      if (isNaN(latVal) || latVal < -90 || latVal > 90) {
        setFormError('Please enter a valid Latitude (-90 to 90).');
        return;
      }
      if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
        setFormError('Please enter a valid Longitude (-180 to 180).');
        return;
      }
      if (isNaN(radVal) || radVal <= 0) {
        setFormError('Please enter a valid Radius in meters (> 0).');
        return;
      }
      finalLocation = formatLocationGeofence(finalLocation, latVal, lngVal, radVal);
    }

    setSaving(true);
    setFormError(null);

    try {
      const inTimeISO = toISOString(form.project_in_time);
      const outTimeISO = toISOString(form.project_out_time);

      const { error: err } = await supabase
        .from('projects')
        .insert({
          project_code: form.project_code.trim(),
          project_name: form.project_name.trim(),
          project_location: finalLocation || null,
          project_in_time: inTimeISO,
          project_out_time: outTimeISO,
          focal_point_id: form.focal_point_id.trim() || null,
          focal_point_name: form.focal_point_name.trim() || null,
          focal_point_email: form.focal_point_email.trim() || null,
          approver_id: form.approver_id.trim() || null,
          approver_name: form.approver_name.trim() || null,
          approver_email: form.approver_email.trim() || null
        });

      if (err) throw err;

      toast.success('Project created successfully!');
      closeAdd();
      loadData(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(project: Project) {
    setEditingProject(project);
    const { name: displayName, geofence } = parseLocationGeofence(project.project_location);
    setForm({
      project_code: project.project_code,
      project_name: project.project_name,
      project_location: displayName,
      project_in_time: formatISOToTime(project.project_in_time) || '08:00',
      project_out_time: formatISOToTime(project.project_out_time) || '17:00',
      geofence_enabled: !!geofence,
      geofence_lat: geofence ? String(geofence.lat) : '',
      geofence_lng: geofence ? String(geofence.lng) : '',
      geofence_radius: geofence ? String(geofence.radius) : '',
      focal_point_id: project.focal_point_id || '',
      focal_point_name: project.focal_point_name || '',
      focal_point_email: project.focal_point_email || '',
      approver_id: project.approver_id || '',
      approver_name: project.approver_name || '',
      approver_email: project.approver_email || ''
    });
    setFormError(null);
  }

  function closeEdit() {
    setEditingProject(null);
    setFormError(null);
  }

  async function handleEdit() {
    if (!editingProject) return;
    if (!form.project_name.trim()) {
      setFormError('Project name is required.');
      return;
    }

    // Validate geofence parameters
    let finalLocation = form.project_location.trim();
    const latStr = form.geofence_lat.trim();
    const lngStr = form.geofence_lng.trim();
    const radStr = form.geofence_radius.trim();
    const hasGeofenceInput = latStr !== '' || lngStr !== '' || radStr !== '';

    if (hasGeofenceInput) {
      const latVal = parseFloat(latStr);
      const lngVal = parseFloat(lngStr);
      const radVal = parseFloat(radStr);
      if (isNaN(latVal) || latVal < -90 || latVal > 90) {
        setFormError('Please enter a valid Latitude (-90 to 90).');
        return;
      }
      if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
        setFormError('Please enter a valid Longitude (-180 to 180).');
        return;
      }
      if (isNaN(radVal) || radVal <= 0) {
        setFormError('Please enter a valid Radius in meters (> 0).');
        return;
      }
      finalLocation = formatLocationGeofence(finalLocation, latVal, lngVal, radVal);
    }

    setSaving(true);
    setFormError(null);

    try {
      const inTimeISO = toISOString(form.project_in_time);
      const outTimeISO = toISOString(form.project_out_time);

      const { data, error: err } = await supabase
        .from('projects')
        .update({
          project_name: form.project_name.trim(),
          project_location: finalLocation || null,
          project_in_time: inTimeISO,
          project_out_time: outTimeISO,
          focal_point_id: form.focal_point_id.trim() || null,
          focal_point_name: form.focal_point_name.trim() || null,
          focal_point_email: form.focal_point_email.trim() || null,
          approver_id: form.approver_id.trim() || null,
          approver_name: form.approver_name.trim() || null,
          approver_email: form.approver_email.trim() || null
        })
        .eq('project_code', editingProject.project_code)
        .select();

      if (err) throw err;
      if (!data || data.length === 0) {
        throw new Error('Update failed. This may be due to Row Level Security (RLS) policies blocking updates on the projects table.');
      }

      toast.success('Project updated successfully!');
      closeEdit();
      loadData(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm(project: Project) {
    setDeletingProject(project);
  }

  async function handleDelete() {
    if (!deletingProject) return;
    setDeleting(true);

    try {
      // 1. De-allocate devices first to maintain RLS / constraints
      const assigned = devicesByProject[deletingProject.project_code] || [];
      if (assigned.length > 0) {
        const { error: devErr } = await supabase
          .from('devices')
          .update({ project_code: null })
          .eq('project_code', deletingProject.project_code);
        if (devErr) throw devErr;
      }

      // 2. Delete the project
      const { error: projErr } = await supabase
        .from('projects')
        .delete()
        .eq('project_code', deletingProject.project_code);
      if (projErr) throw projErr;

      toast.success('Project deleted successfully!');
      setDeletingProject(null);
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project.');
    } finally {
      setDeleting(false);
    }
  }

  function openFocalPointModal(project: Project) {
    setFocalPointProject(project);
    setFocalForm({
      focal_point_id: project.focal_point_id || '',
      focal_point_name: project.focal_point_name || '',
      focal_point_email: project.focal_point_email || ''
    });
    setFormError(null);
  }

  function closeFocalPointModal() {
    setFocalPointProject(null);
    setFormError(null);
  }

  async function handleSaveFocalPoint() {
    if (!focalPointProject) return;
    setSaving(true);
    setFormError(null);

    try {
      const { data, error: err } = await supabase
        .from('projects')
        .update({
          focal_point_id: focalForm.focal_point_id.trim() || null,
          focal_point_name: focalForm.focal_point_name.trim() || null,
          focal_point_email: focalForm.focal_point_email.trim() || null
        })
        .eq('project_code', focalPointProject.project_code)
        .select();

      if (err) throw err;
      if (!data || data.length === 0) {
        throw new Error('Update failed. This may be due to Row Level Security (RLS) policies blocking updates on the projects table.');
      }

      toast.success('Focal point updated successfully!');
      closeFocalPointModal();
      loadData(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update focal point.');
    } finally {
      setSaving(false);
    }
  }

  function openApproverModal(project: Project) {
    setApproverPointProject(project);
    setApproverForm({
      approver_id: project.approver_id || '',
      approver_name: project.approver_name || '',
      approver_email: project.approver_email || ''
    });
    setFormError(null);
  }

  function closeApproverModal() {
    setApproverPointProject(null);
    setFormError(null);
  }

  async function handleSaveApprover() {
    if (!approverPointProject) return;
    setSaving(true);
    setFormError(null);

    try {
      const { data, error: err } = await supabase
        .from('projects')
        .update({
          approver_id: approverForm.approver_id.trim() || null,
          approver_name: approverForm.approver_name.trim() || null,
          approver_email: approverForm.approver_email.trim() || null
        })
        .eq('project_code', approverPointProject.project_code)
        .select();

      if (err) throw err;
      if (!data || data.length === 0) {
        throw new Error('Update failed. This may be due to Row Level Security (RLS) policies blocking updates on the projects table.');
      }

      toast.success('Timesheet approver updated successfully!');
      closeApproverModal();
      loadData(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update timesheet approver.');
    } finally {
      setSaving(false);
    }
  }

  function openGeofenceModal(project: Project) {
    setGeofenceProject(project);
    const { geofence, name: displayName } = parseLocationGeofence(project.project_location);
    setForm({
      project_code: project.project_code,
      project_name: project.project_name,
      project_location: displayName || '',
      project_in_time: project.project_in_time || '',
      project_out_time: project.project_out_time || '',
      geofence_enabled: !!geofence,
      geofence_lat: geofence?.lat ? String(geofence.lat) : '',
      geofence_lng: geofence?.lng ? String(geofence.lng) : '',
      geofence_radius: geofence?.radius ? String(geofence.radius) : '100',
      focal_point_id: project.focal_point_id || '',
      focal_point_name: project.focal_point_name || '',
      focal_point_email: project.focal_point_email || '',
      approver_id: project.approver_id || '',
      approver_name: project.approver_name || '',
      approver_email: project.approver_email || ''
    });
    setFormError(null);
    setIsEditingGeofence(true);
  }

  function closeGeofenceModal() {
    setIsEditingGeofence(false);
    setGeofenceProject(null);
    setFormError(null);
    setForm(defaultForm);
  }

  async function handleSaveGeofence() {
    if (!geofenceProject) return;

    let finalLocation = form.project_location.trim();
    const latVal = parseFloat(form.geofence_lat);
    const lngVal = parseFloat(form.geofence_lng);
    const radVal = parseFloat(form.geofence_radius);

    if (form.geofence_lat || form.geofence_lng || form.geofence_radius) {
      if (isNaN(latVal) || latVal < -90 || latVal > 90) {
        setFormError('Please enter a valid Latitude (-90 to 90).');
        return;
      }
      if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
        setFormError('Please enter a valid Longitude (-180 to 180).');
        return;
      }
      if (isNaN(radVal) || radVal <= 0) {
        setFormError('Please enter a valid Radius in meters (> 0).');
        return;
      }
      finalLocation = formatLocationGeofence(finalLocation, latVal, lngVal, radVal);
    }

    setSaving(true);
    setFormError(null);

    try {
      const { data, error: err } = await supabase
        .from('projects')
        .update({
          project_location: finalLocation || null
        })
        .eq('project_code', geofenceProject.project_code)
        .select();

      if (err) throw err;
      if (!data || data.length === 0) {
        throw new Error('Update failed. This may be due to Row Level Security (RLS) policies blocking updates on the projects table.');
      }

      toast.success('Geofence settings updated successfully!');
      closeGeofenceModal();
      loadData(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update geofence.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAllocateDevice(projectCode: string) {
    if (!selectedDeviceSerial) return;
    setAllocating(selectedDeviceSerial);

    try {
      const { error: err } = await supabase
        .from('devices')
        .update({ project_code: projectCode })
        .eq('serial_no', selectedDeviceSerial);

      if (err) throw err;

      toast.success(`Device ${selectedDeviceSerial} allocated successfully.`);
      setSelectedDeviceSerial('');
      setAllocatingProjectId(null);
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to allocate device.');
    } finally {
      setAllocating(null);
    }
  }

  async function handleDeallocateDevice(serialNo: string) {
    setAllocating(serialNo);

    try {
      const { error: err } = await supabase
        .from('devices')
        .update({ project_code: null })
        .eq('serial_no', serialNo);

      if (err) throw err;

      toast.success(`Device ${serialNo} unallocated.`);
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to unallocate device.');
    } finally {
      setAllocating(null);
    }
  }

  return (
    <div className="bg-white flex flex-col animate-fade-in" style={{ width: "100%", height: "82vh", overflow: "hidden" }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.35s ease-out forwards;
        }
        .project-card {
          background: #ffffff;
          border: 1px solid #f1f5f9;
        
          border-radius: 12px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03);
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 270px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
       
        .project-title {
          font-size: 15px;
          font-weight: 500;
          color: #0f172a;
          margin-top: 4px;
          line-height: 1.4;
        }
        .meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #475569;
        }
        .meta-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
        }
        .device-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 11px;
          font-family: monospace;
          color: #334155;
          font-weight: 500;
        }
        .device-badge:hover {
          border-color: #cbd5e1;
          background: #f1f5f9;
        }
        .link-btn {
          font-size: 11px;
          font-weight: 500;
          color: #4f46e5;
          background: #f5f3ff;
          border: 1px solid #e0e7ff;
          
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .link-btn:hover {
          background: #ede9fe;
          color: #4338ca;
        }
        .action-btn {
          padding: 6px;
          border-radius: 6px;
          color: #94a3b8;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .action-btn:hover {
          color: #475569;
          background: #f1f5f9;
        }
        .delete-btn:hover {
          color: #dc2626;
          background: #fef2f2;
        }
      `}</style>
      <div className="w-full px-4 sm:px-6 py-8 flex flex-col flex-1 overflow-hidden">

        {/* Header Toolbar */}
        <div style={{ width: "100%", justifyContent: "space-between", padding: "0rem 1rem" }} className="flex justify-between items-center mb-6" >
          <div className="flex items-center gap-2">
            <div style={{ width: '280px' }} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.25rem', paddingRight: '2rem' }}
                className="h-8 w-full border border-gray-200 rounded-lg text-xs outline-none focus:border-gray-500 transition-colors bg-white-400 font-normal"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full font-medium shrink-0">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}>
            {canEditAttendance && (
              <button
                onClick={openAdd}
                className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Project
              </button>
            )}

            {canEditAttendance && (
              <button
                onClick={() => setShowAttendanceStats(prev => !prev)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${showAttendanceStats
                  ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                title="Toggle Project Attendance Mode"
              >
                <span>{showAttendanceStats ? <List className='w-4 h-4' /> : <ChartBarIcon className='w-4 h-4' />}</span>
              </button>
            )}

            <button
              onClick={() => loadData(true)}
              disabled={loading || refreshing}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Project Content / Loading */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-gray-400 text-sm bg-white">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex-1 flex items-center justify-center border border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm m-4">
            {searchQuery ? "No projects match your search." : 'No projects registered. Click "Add Project" to register one.'}
          </div>
        ) : (
          <div style={{ border: "1px solid rgba(100 100 100/ 0.1)", width: "100%", borderRadius: "0.5rem", paddingTop: "1rem" }} className="flex-1 overflow-y-auto px-4 pb-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-1">
              {filteredProjects.map((project) => {
                const assignedDevices = devicesByProject[project.project_code] || [];
                const isAllocatingThis = allocatingProjectId === project.project_code;

                return (
                  <div key={project.id} className="project-card">
                    {/* Top Part: Info & Actions */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{
                          fontSize: '12px',

                          fontWeight: 500,
                          background: 'rgba(100 100 100/ 0.1)',

                          padding: '2px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase'
                        }}>
                          {project.project_code}
                        </span>

                        {canEditAttendance && !showAttendanceStats && (
                          <CustomDropDown
                            trigger={<button className="action-btn" onClick={(e) => e.stopPropagation()}><MoreVertical size={14} /></button>}
                            option1Text="Edit"
                            option1Icon={<Pencil className="w-3.5 h-3.5 mr-2 " />}
                            onOption1={() => openEdit(project)}
                            option2Text="Delete"
                            option2Icon={<Trash2 className="w-3.5 h-3.5 mr-2 " />}
                            onOption2={() => handleDeleteConfirm(project)}
                          />
                        )}
                      </div>

                      {!showAttendanceStats && (
                        <h3 className="project-title">{project.project_name}</h3>
                      )}
                    </div>

                    <AnimatePresence mode="wait">
                      {showAttendanceStats ? (
                        /* Attendance Summary View */
                        (() => {
                          const stats = getProjectAttendanceStats(project.project_code, project.project_name, project.project_location);
                          const total = stats.present + stats.absent;
                          const percentPresent = total > 0 ? Math.round((stats.present / total) * 100) : 0;

                          return (
                            <motion.div
                              key="attendance"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.18, ease: "easeInOut" }}
                              style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: '1rem', marginTop: '0.75rem' }}
                            >
                              <h3 className="project-title" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{project.project_name}</h3>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                                {/* Numbers block */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                                  <div
                                    onClick={() => setAttendanceModal({
                                      projectCode: project.project_code,
                                      projectName: project.project_name,
                                      projectLocation: project.project_location,
                                      filterType: 'present'
                                    })}
                                    className="cursor-pointer hover:bg-emerald-100/50 transition-colors"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.6rem', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #dcfce7' }}
                                  >
                                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#166534' }}>Present</span>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#15803d' }}>{stats.present}</span>
                                  </div>
                                  <div
                                    onClick={() => setAttendanceModal({
                                      projectCode: project.project_code,
                                      projectName: project.project_name,
                                      projectLocation: project.project_location,
                                      filterType: 'absent'
                                    })}
                                    className="cursor-pointer hover:bg-red-100/50 transition-colors"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.6rem', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fee2e2' }}
                                  >
                                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#991b1b' }}>Absent</span>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#b91c1c' }}>{stats.absent}</span>
                                  </div>
                                  <div
                                    onClick={() => setAttendanceModal({
                                      projectCode: project.project_code,
                                      projectName: project.project_name,
                                      projectLocation: project.project_location,
                                      filterType: 'total'
                                    })}
                                    className="cursor-pointer hover:bg-slate-200/50 transition-colors"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.6rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}
                                  >
                                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#475569' }}>Total</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{total}</span>
                                  </div>
                                </div>

                                {/* Donut Progress Ring */}
                                <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <svg width="80" height="80" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                                    <path
                                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                      fill="none"
                                      stroke="#f1f5f9"
                                      strokeWidth="3.5"
                                    />
                                    {total > 0 && (
                                      <path
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="#10b981"
                                        strokeWidth="3.5"
                                        strokeDasharray={`${percentPresent}, 100`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dasharray 0.4s ease-out' }}
                                      />
                                    )}
                                  </svg>
                                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', lineHeight: '1' }}>
                                      {percentPresent}%
                                    </span>
                                    <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 500, marginTop: '1px' }}>
                                      Present
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Attendance Rate Bar */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
                                  <span>Attendance Rate</span>
                                  <span>{percentPresent}%</span>
                                </div>
                                <div style={{ width: '100%', height: '5px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${percentPresent}%`, height: '100%', backgroundColor: '#10b981', borderRadius: '3px', transition: 'width 0.4s ease-out' }} />
                                </div>
                              </div>
                            </motion.div>
                          );
                        })()
                      ) : (
                        <motion.div
                          key="details"
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ duration: 0.18, ease: "easeInOut" }}
                          style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
                        >
                          {/* Middle Part: Metadata Grid */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
                            <div style={{ justifyContent: "space-between", alignItems: "center", width: "100%" }} className="meta-item flex items-center justify-between flex-wrap gap-2">
                              {(() => {
                                const { name: displayName, geofence } = parseLocationGeofence(project.project_location);
                                return (
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                                    <span className="truncate max-w-[150px]" title={displayName || "No location set"}>
                                      {displayName || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 300 }}>No location set</span>}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      {geofence ? (
                                        <button
                                          onClick={() => openGeofenceModal(project)}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors cursor-pointer"
                                          title={`Geofence Active:\nLat: ${geofence.lat}\nLng: ${geofence.lng}\nRadius: ${geofence.radius}m\nClick to modify.`}
                                        >
                                          <Scan className="w-2.5 h-2.5 text-emerald-600" />
                                          Active
                                        </button>
                                      ) : (
                                        canEditAttendance && (
                                          <button
                                            onClick={() => openGeofenceModal(project)}
                                            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer bg-transparent border-0 outline-none p-0"
                                          >
                                            Set Geofence
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="meta-item">
                              <span>
                                Shift:{' '}
                                <strong style={{ color: '#0f172a' }}>
                                  {project.project_in_time ? formatISOToTime(project.project_in_time) : '08:00'}
                                </strong>
                                {' '}-{' '}
                                <strong style={{ color: '#0f172a' }}>
                                  {project.project_out_time ? formatISOToTime(project.project_out_time) : '17:00'}
                                </strong>
                              </span>
                            </div>

                            {/* Focal Point Information */}
                            <div className="meta-item flex flex-col gap-0.5 border-t border-gray-100/80 pt-2 mt-1">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">Timesheet Focal Point</span>
                                {canEditAttendance && (
                                  <button
                                    onClick={() => openFocalPointModal(project)}
                                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer bg-transparent border-0 outline-none p-0"
                                  >
                                    {project.focal_point_name ? 'Edit' : 'Assign'}
                                  </button>
                                )}
                              </div>
                              {project.focal_point_name ? (
                                <div className="flex flex-col text-xs text-gray-700">
                                  <span className="font-semibold text-gray-900">{project.focal_point_name}</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {project.focal_point_id && <span className="text-[10px] text-gray-400 font-mono bg-gray-100/60 px-1 py-0.2 rounded">{project.focal_point_id}</span>}
                                    {project.focal_point_email && <span className="text-[10px] text-gray-500 truncate" title={project.focal_point_email}>{project.focal_point_email}</span>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic font-light">Not Assigned</span>
                              )}
                            </div>

                            {/* Timesheet Approver Information */}
                            <div className="meta-item flex flex-col gap-0.5 border-t border-gray-100/80 pt-2 mt-1">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">Timesheet Approver</span>
                                {canEditAttendance && (
                                  <button
                                    onClick={() => openApproverModal(project)}
                                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer bg-transparent border-0 outline-none p-0"
                                  >
                                    {project.approver_name ? 'Edit' : 'Assign'}
                                  </button>
                                )}
                              </div>
                              {project.approver_name ? (
                                <div className="flex flex-col text-xs text-gray-700">
                                  <span className="font-semibold text-gray-900">{project.approver_name}</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {project.approver_id && <span className="text-[10px] text-gray-400 font-mono bg-gray-100/60 px-1 py-0.2 rounded">{project.approver_id}</span>}
                                    {project.approver_email && <span className="text-[10px] text-gray-500 truncate" title={project.approver_email}>{project.approver_email}</span>}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic font-light">Not Assigned</span>
                              )}
                            </div>
                          </div>

                          {/* Bottom Part: Devices list */}
                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Laptop2 className="w-3.5 h-3.5 text-gray-400" />
                                Devices ({assignedDevices.length})
                              </span>

                              {canEditAttendance && !isAllocatingThis && (
                                <button
                                  style={{ padding: "0.1rem 0.5rem", display: "flex" }}
                                  onClick={() => {
                                    setAllocatingProjectId(project.project_code);
                                    setSelectedDeviceSerial('');
                                  }}
                                  className="link-btn"
                                >
                                  Link
                                </button>
                              )}
                            </div>

                            {/* Allocate dropdown */}
                            {isAllocatingThis && (
                              <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '6px',
                                display: 'flex',
                                gap: '6px',
                                marginBottom: '8px',
                                alignItems: 'center'
                              }}>
                                <select
                                  value={selectedDeviceSerial}
                                  onChange={(e) => setSelectedDeviceSerial(e.target.value)}
                                  style={{
                                    flex: 1,
                                    fontSize: '11px',
                                    padding: '4px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    fontFamily: 'monospace',
                                    outline: 'none'
                                  }}
                                >
                                  <option value="">-- Select --</option>
                                  {unallocatedDevices.map(d => (
                                    <option key={d.id} value={d.serial_no}>
                                      {d.serial_no}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleAllocateDevice(project.project_code)}
                                  disabled={!selectedDeviceSerial || allocating !== null}
                                  style={{
                                    background: '#4f46e5',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 500
                                  }}
                                >
                                  {allocating === selectedDeviceSerial ? 'Linking…' : 'Link'}
                                </button>
                                <button
                                  onClick={() => setAllocatingProjectId(null)}
                                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Device tags */}
                            {assignedDevices.length === 0 ? (
                              <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                No devices linked.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '60px', overflowY: 'auto' }}>
                                {assignedDevices.map(d => (
                                  <span key={d.id} className="device-badge">
                                    <span>{d.serial_no}</span>
                                    {canEditAttendance && (
                                      <button
                                        onClick={() => handleDeallocateDevice(d.serial_no)}
                                        disabled={allocating !== null}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#94a3b8',
                                          cursor: 'pointer',
                                          padding: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center'
                                        }}
                                        title="Unlink Device"
                                      >
                                        <X className="w-2.5 h-2.5 hover:text-red-500" />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ResponsiveModal
        open={isAdding}
        onOpenChange={(open) => { if (!open) closeAdd(); }}
        title=""
        description=""
        hideHeader
        contentStyle={{ padding: 0 }}
      >
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }} className="overflow-hidden">
          <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <FolderKanban className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Add Project</h2>
                <p className="text-xs text-gray-400">Register a new project site</p>
              </div>
            </div>
            <button onClick={closeAdd} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3">
            {formError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Project Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.project_code}
                onChange={(e) => setForm(f => ({ ...f, project_code: e.target.value }))}
                placeholder="e.g. VALE-01, MED#198"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Project Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => setForm(f => ({ ...f, project_name: e.target.value }))}
                placeholder="e.g. Vale Jetty Port Site"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Project Location
              </label>
              <input
                type="text"
                value={form.project_location}
                onChange={(e) => setForm(f => ({ ...f, project_location: e.target.value }))}
                placeholder="e.g. Sohar Industrial Port, Oman"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
            </div>

            <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
              <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Geofence Settings</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error("Geolocation is not supported by this browser.");
                      return;
                    }
                    toast.loading("Fetching coordinates...", { id: "gps-fetch" });
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setForm(f => ({
                          ...f,
                          geofence_lat: pos.coords.latitude.toFixed(6),
                          geofence_lng: pos.coords.longitude.toFixed(6)
                        }));
                        toast.success("Coordinates filled!", { id: "gps-fetch" });
                      },
                      (err) => {
                        toast.error(`GPS Error: ${err.message}`, { id: "gps-fetch" });
                      },
                      { enableHighAccuracy: true }
                    );
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium bg-white px-2 py-1 rounded border border-gray-200 shadow-sm transition-all"
                >
                  <Compass className="w-3 h-3 text-indigo-500" />
                  Get Current Location
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">
                    Latitude <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.geofence_lat}
                    onChange={(e) => setForm(f => ({ ...f, geofence_lat: e.target.value }))}
                    placeholder="e.g. 23.614328"
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">
                    Longitude <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.geofence_lng}
                    onChange={(e) => setForm(f => ({ ...f, geofence_lng: e.target.value }))}
                    placeholder="e.g. 58.545284"
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">
                  Radius (meters) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={form.geofence_radius}
                  onChange={(e) => setForm(f => ({ ...f, geofence_radius: e.target.value }))}
                  placeholder="e.g. 100"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
                />
              </div>
              {showMapPreview && (
                <div style={{ height: '180px', width: '100%', position: 'relative', marginTop: '12px' }} className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
                  <iframe
                    src={`https://maps.google.com/maps?q=${previewLat},${previewLng}&z=16&output=embed`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    title="Geofence Preview Map"
                  />
                  <div className="absolute bottom-1 right-1 bg-white/90 backdrop-blur-xs px-1.5 py-0.5 rounded text-[9px] font-semibold text-gray-600 border border-gray-100 shadow-xs pointer-events-none">
                    Radius: {form.geofence_radius || '100'}m
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Shift In Time
                </label>
                <input
                  type="time"
                  value={form.project_in_time}
                  onChange={(e) => setForm(f => ({ ...f, project_in_time: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Shift Out Time
                </label>
                <input
                  type="time"
                  value={form.project_out_time}
                  onChange={(e) => setForm(f => ({ ...f, project_out_time: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              style={{ flex: 1 }}
              onClick={closeAdd}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              style={{ flex: 1 }}
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Adding…' : 'Add Project'}
            </button>
          </div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={!!editingProject}
        onOpenChange={(open) => { if (!open) closeEdit(); }}
        title=""
        description=""
        hideHeader
        contentStyle={{ padding: 0 }}
      >
        {editingProject && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }} className="overflow-hidden">
            <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Edit Project</h2>
                  <p className="text-xs text-gray-400 font-mono">{editingProject.project_code}</p>
                </div>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Project Code (Read-Only)
                </label>
                <input
                  type="text"
                  value={form.project_code}
                  disabled
                  className="w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-500 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.project_name}
                  onChange={(e) => setForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g. Vale Jetty Port Site"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Project Location
                </label>
                <input
                  type="text"
                  value={form.project_location}
                  onChange={(e) => setForm(f => ({ ...f, project_location: e.target.value }))}
                  placeholder="e.g. Sohar Industrial Port, Oman"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Shift In Time
                  </label>
                  <input
                    type="time"
                    value={form.project_in_time}
                    onChange={(e) => setForm(f => ({ ...f, project_in_time: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Shift Out Time
                  </label>
                  <input
                    type="time"
                    value={form.project_out_time}
                    onChange={(e) => setForm(f => ({ ...f, project_out_time: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                style={{ flex: 1 }}
                onClick={closeEdit}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                style={{ flex: 1 }}
                onClick={handleEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Focal Point Assignment Dialog */}
      <ResponsiveModal
        open={!!focalPointProject}
        onOpenChange={(open) => { if (!open) closeFocalPointModal(); }}
        title=""
        description=""
        hideHeader
        contentStyle={{ padding: 0 }}
      >
        {focalPointProject && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }} className="overflow-hidden">
            <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Assign Focal Point</h2>
                  <p className="text-xs text-gray-400 font-mono">{focalPointProject.project_name} ({focalPointProject.project_code})</p>
                </div>
              </div>
              <button onClick={closeFocalPointModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="relative employee-dropdown-container">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Select Employee
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenEmpSelect(!openEmpSelect)}
                    className="h-10 text-sm flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between shadow-xs hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="truncate text-gray-700 capitalize">
                      {selectedEmp ? selectedEmp.name.toLowerCase() : "Select Employee (Autofills below)"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocalForm({
                        focal_point_id: '',
                        focal_point_name: '',
                        focal_point_email: ''
                      });
                      setOpenEmpSelect(false);
                      setEmpSearch("");
                    }}
                    disabled={!focalForm.focal_point_id}
                    className="h-10 w-10 flex items-center justify-center border border-gray-200 rounded-lg bg-white text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-500 disabled:hover:border-gray-200"
                    title="Clear selection"
                  >
                    <CircleMinus className="w-4 h-4" />
                  </button>
                </div>

                {openEmpSelect && (
                  <div className="absolute left-0 right-0 mt-1 p-0 bg-white border border-gray-200 shadow-md rounded-md z-[100]">
                    {/* Search Input Area */}
                    <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md">
                        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <input
                          style={{ fontSize: '1rem' }}
                          type="text"
                          placeholder="Search name or ID..."
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          className="bg-transparent border-0 outline-none w-full p-0 focus:ring-0 placeholder:text-gray-400 normal-case"
                          autoFocus
                        />
                        {empSearch && (
                          <button
                            type="button"
                            onClick={() => setEmpSearch("")}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* List Area */}
                    <div className="max-h-[220px] overflow-y-auto py-1">
                      {selectableEmployees.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-400 font-medium">
                          No results found
                        </div>
                      ) : (
                        <>
                          <div
                            style={{ justifyContent: "space-between" }}

                            onClick={() => {
                              setFocalForm({
                                focal_point_id: '',
                                focal_point_name: '',
                                focal_point_email: ''
                              });
                              setOpenEmpSelect(false);
                              setEmpSearch("");
                            }}
                            className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-50 bg-transparent text-red-600 font-semibold"
                          >
                            -- Clear Selection --
                          </div>
                          {selectableEmployees.map((emp) => {
                            const isSelected = selectedEmp?.device_user_id === emp.device_user_id || selectedEmp?.emp_id === emp.emp_id;
                            const empVal = emp.emp_id || emp.device_user_id || String(emp.id);
                            return (
                              <div
                                style={{ justifyContent: "space-between" }}
                                key={emp.id}
                                onClick={() => {
                                  setFocalForm({
                                    focal_point_id: empVal,
                                    focal_point_name: emp.name || '',
                                    focal_point_email: emp.email || ''
                                  });
                                  setOpenEmpSelect(false);
                                  setEmpSearch("");
                                }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between capitalize font-medium ${isSelected
                                  ? "bg-indigo-50 text-indigo-900"
                                  : "hover:bg-gray-50 bg-transparent"
                                  }`}
                              >
                                <div className="truncate">
                                  <div>{emp.name.toLowerCase()}</div>
                                  {emp.emp_id && (
                                    <div className="text-[10px] text-gray-400 font-normal normal-case">
                                      ID: {emp.emp_id}
                                    </div>
                                  )}
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-650 mb-1.5">
                      Focal Point Name
                    </label>
                    <input
                      type="text"
                      disabled
                      value={focalForm.focal_point_name}
                      onChange={(e) => setFocalForm(f => ({ ...f, focal_point_name: e.target.value }))}
                      placeholder="No Employee Selected"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-650 mb-1.5">
                      Focal Point Email
                    </label>
                    <input
                      type="email"
                      disabled
                      value={focalForm.focal_point_email}
                      onChange={(e) => setFocalForm(f => ({ ...f, focal_point_email: e.target.value }))}
                      placeholder="No Employee Selected"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-650 mb-1.5">
                    Focal Point ID / Employee ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={focalForm.focal_point_id}
                    onChange={(e) => setFocalForm(f => ({ ...f, focal_point_id: e.target.value }))}
                    placeholder="No Employee Selected"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none bg-gray-50 text-gray-500 cursor-not-allowed font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                style={{ flex: 1 }}
                onClick={closeFocalPointModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                style={{ flex: 1 }}
                onClick={handleSaveFocalPoint}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save Focal Point'}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Assign Timesheet Approver Dialog */}
      <ResponsiveModal
        open={!!approverPointProject}
        onOpenChange={(open) => { if (!open) closeApproverModal(); }}
        title=""
        description=""
        hideHeader
        contentStyle={{ padding: 0 }}
      >
        {approverPointProject && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }} className="overflow-hidden">
            <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Assign Timesheet Approver</h2>
                  <p className="text-xs text-gray-400 font-mono">{approverPointProject.project_name} ({approverPointProject.project_code})</p>
                </div>
              </div>
              <button onClick={closeApproverModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="relative employee-dropdown-container">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Select Employee
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenApproverSelect(!openApproverSelect)}
                    className="h-10 text-sm flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between shadow-xs hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="truncate text-gray-700 capitalize">
                      {selectedApproverEmp ? selectedApproverEmp.name.toLowerCase() : "Select Employee (Autofills below)"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApproverForm({
                        approver_id: '',
                        approver_name: '',
                        approver_email: ''
                      });
                      setOpenApproverSelect(false);
                      setApproverSearch("");
                    }}
                    disabled={!approverForm.approver_id}
                    className="h-10 w-10 flex items-center justify-center border border-gray-200 rounded-lg bg-white text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-500 disabled:hover:border-gray-200"
                    title="Clear selection"
                  >
                    <CircleMinus className="w-4 h-4" />
                  </button>
                </div>

                {openApproverSelect && (
                  <div className="absolute left-0 right-0 mt-1 p-0 bg-white border border-gray-200 shadow-md rounded-md z-[100]">
                    {/* Search Input Area */}
                    <div className="p-2 border-b border-gray-100 bg-gray-50/55 bg-gray-50/50">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md">
                        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <input
                          style={{ fontSize: '1rem' }}
                          type="text"
                          placeholder="Search name or ID..."
                          value={approverSearch}
                          onChange={(e) => setApproverSearch(e.target.value)}
                          className="bg-transparent border-0 outline-none w-full p-0 focus:ring-0 placeholder:text-gray-400 normal-case"
                          autoFocus
                        />
                        {approverSearch && (
                          <button
                            type="button"
                            onClick={() => setApproverSearch("")}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* List Area */}
                    <div className="max-h-[220px] overflow-y-auto py-1">
                      {selectableApproverEmployees.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-400 font-medium">
                          No results found
                        </div>
                      ) : (
                        <>
                          <div
                            style={{ justifyContent: "space-between" }}

                            onClick={() => {
                              setApproverForm({
                                approver_id: '',
                                approver_name: '',
                                approver_email: ''
                              });
                              setOpenApproverSelect(false);
                              setApproverSearch("");
                            }}
                            className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-50 bg-transparent text-red-600 font-semibold"
                          >
                            -- Clear Selection --
                          </div>
                          {selectableApproverEmployees.map((emp) => {
                            const isSelected = selectedApproverEmp?.device_user_id === emp.device_user_id || selectedApproverEmp?.emp_id === emp.emp_id;
                            const empVal = emp.emp_id || emp.device_user_id || String(emp.id);
                            return (
                              <div
                                style={{ justifyContent: "space-between" }}
                                key={emp.id}

                                onClick={() => {
                                  setApproverForm({
                                    approver_id: empVal,
                                    approver_name: emp.name || '',
                                    approver_email: emp.email || ''
                                  });
                                  setOpenApproverSelect(false);
                                  setApproverSearch("");
                                }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between capitalize font-medium ${isSelected
                                  ? "bg-indigo-50 text-indigo-900"
                                  : "hover:bg-gray-50 bg-transparent"
                                  }`}
                              >
                                <div className="truncate">
                                  <div>{emp.name.toLowerCase()}</div>
                                  {emp.emp_id && (
                                    <div className="text-[10px] text-gray-400 font-normal normal-case">
                                      ID: {emp.emp_id}
                                    </div>
                                  )}
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-650 mb-1.5">
                      Approver Name
                    </label>
                    <input
                      type="text"
                      disabled
                      value={approverForm.approver_name}
                      placeholder="No Employee Selected"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-650 mb-1.5">
                      Approver Email
                    </label>
                    <input
                      type="email"
                      disabled
                      value={approverForm.approver_email}
                      placeholder="No Employee Selected"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-650 mb-1.5">
                    Approver ID / Employee ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={approverForm.approver_id}
                    placeholder="No Employee Selected"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none bg-gray-50 text-gray-500 cursor-not-allowed font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                style={{ flex: 1 }}
                onClick={closeApproverModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                style={{ flex: 1 }}
                onClick={handleSaveApprover}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save Approver'}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Geofence Settings Dialog */}
      <ResponsiveModal
        open={isEditingGeofence}
        onOpenChange={(open) => { if (!open) closeGeofenceModal(); }}
        title=""
        description=""
        hideHeader
        contentStyle={{ padding: 0 }}
      >
        {geofenceProject && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }} className="overflow-hidden">
            <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Geofence Settings</h2>
                  <p className="text-xs text-gray-400 font-mono">{geofenceProject.project_name} ({geofenceProject.project_code})</p>
                </div>
              </div>
              <button onClick={closeGeofenceModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
                <div style={{ justifyContent: "space-between" }} className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Geofence Settings</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.geolocation) {
                        toast.error("Geolocation is not supported by this browser.");
                        return;
                      }
                      toast.loading("Fetching coordinates...", { id: "gps-fetch" });
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setForm(f => ({
                            ...f,
                            geofence_lat: pos.coords.latitude.toFixed(6),
                            geofence_lng: pos.coords.longitude.toFixed(6)
                          }));
                          toast.success("Coordinates filled!", { id: "gps-fetch" });
                        },
                        (err) => {
                          toast.error(`GPS Error: ${err.message}`, { id: "gps-fetch" });
                        },
                        { enableHighAccuracy: true }
                      );
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium bg-white px-2 py-1 rounded border border-gray-200 shadow-sm transition-all"
                  >
                    <Compass className="w-3 h-3 text-indigo-500" />
                    Get Current Location
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">
                      Latitude <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.geofence_lat}
                      onChange={(e) => setForm(f => ({ ...f, geofence_lat: e.target.value }))}
                      placeholder="e.g. 23.614328"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">
                      Longitude <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.geofence_lng}
                      onChange={(e) => setForm(f => ({ ...f, geofence_lng: e.target.value }))}
                      placeholder="e.g. 58.545284"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">
                    Radius (meters) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.geofence_radius}
                    onChange={(e) => setForm(f => ({ ...f, geofence_radius: e.target.value }))}
                    placeholder="e.g. 100"
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white"
                  />
                </div>
                {showMapPreview && (
                  <div style={{ height: '180px', width: '100%', position: 'relative', marginTop: '12px' }} className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
                    <iframe
                      src={`https://maps.google.com/maps?q=${previewLat},${previewLng}&z=16&output=embed`}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen
                      loading="lazy"
                      title="Geofence Preview Map"
                    />
                    <div className="absolute bottom-1 right-1 bg-white/90 backdrop-blur-xs px-1.5 py-0.5 rounded text-[9px] font-semibold text-gray-600 border border-gray-100 shadow-xs pointer-events-none">
                      Radius: {form.geofence_radius || '100'}m
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                style={{ flex: 1 }}
                onClick={closeGeofenceModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                style={{ flex: 1 }}
                onClick={handleSaveGeofence}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Delete Confirmation Dialog */}
      {deletingProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingProject(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Delete Project?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to delete project <strong>{deletingProject.project_name}</strong> ({deletingProject.project_code})?
              </p>
              <p className="text-xs text-red-500 font-medium mt-2">
                Note: All allocated devices will be unallocated. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingProject(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Modal displaying selected list of employees */}
      {(() => {
        const modalEmployees = !attendanceModal ? [] : getProjectEmployees(
          attendanceModal.projectCode,
          attendanceModal.projectName,
          attendanceModal.projectLocation
        ).filter(e => {
          if (attendanceModal.filterType === 'present') return e.isPresent;
          if (attendanceModal.filterType === 'absent') return !e.isPresent;
          return true;
        });

        return (
          <ResponsiveModal
            open={attendanceModal !== null}
            onOpenChange={(open) => {
              if (!open) setAttendanceModal(null);
            }}
            title={`${attendanceModal ? attendanceModal.projectName : ''} (${attendanceModal ? attendanceModal.projectCode : ''})`}
            description={`${attendanceModal ? attendanceModal.filterType.toUpperCase() : ''} Employees list`}
          >
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {attendanceModal?.filterType === 'present' && 'Present Today'}
                    {attendanceModal?.filterType === 'absent' && 'Absent Today'}
                    {attendanceModal?.filterType === 'total' && 'Total Allocated Staff'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">
                    Showing {modalEmployees.length} employee(s) matching this status
                  </p>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: attendanceModal?.filterType === 'present' ? '#dcfce7' : attendanceModal?.filterType === 'absent' ? '#fee2e2' : '#f1f5f9',
                  color: attendanceModal?.filterType === 'present' ? '#15803d' : attendanceModal?.filterType === 'absent' ? '#b91c1c' : '#475569'
                }}>
                  {modalEmployees.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {modalEmployees.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400 italic">
                    No employees matching this status.
                  </div>
                ) : (
                  modalEmployees.map((emp) => (
                    <div
                      key={emp.emp_id || emp.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.8rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #f1f5f9'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span className="text-xs font-semibold text-gray-950">{emp.name}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                          {emp.emp_id && <span className="font-mono bg-white px-1 py-0.2 rounded border border-gray-100">{emp.emp_id}</span>}
                          {emp.assignedLocation && <span className="truncate max-w-[120px]" title={emp.assignedLocation}>{emp.assignedLocation}</span>}
                        </div>
                      </div>

                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: emp.isPresent ? '#e8f5e9' : '#ffebee',
                        color: emp.isPresent ? '#2e7d32' : '#c62828'
                      }}>
                        {emp.isPresent ? 'Present' : 'Absent'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </ResponsiveModal>
        );
      })()}

    </div>
  );
}
