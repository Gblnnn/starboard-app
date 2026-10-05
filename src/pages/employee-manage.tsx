import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { ChevronDown, Check, Download, Fingerprint, Loader2, Plus, Scan, Search, SquareCheck, Upload, Users, X, StickyNotes } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Avatar } from '../components/Avatar';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../components/ui/empty';
import { parsePunchLocation, parseLocationGeofence } from '../lib/geofence';
import { supabase } from '../lib/supabase';
import { useAuth } from "@/components/AuthProvider";


interface Device {
    id: number;
    serial_no: string;
    location: string | null;
    last_seen?: string | null;
}

function buildAddUserCommand(cmdId: number, pin: string, name: string): string {
    const safeName = name.replace(/\t/g, ' ').slice(0, 24);
    return `C:${cmdId}:DATA UPDATE USERINFO PIN=${pin}\tName=${safeName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=`;
}

function findValue(row: any, keys: string[]): string | null {
    const rowKeys = Object.keys(row);
    for (const k of keys) {
        const foundKey = rowKeys.find(rk => rk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, ''));
        if (foundKey !== undefined && row[foundKey] !== undefined) {
            return String(row[foundKey]).trim();
        }
    }
    return null;
}

const NATIONALITIES = [
    'omani',
    'indian',
    'pakistani',
    'bangladeshi',
    'nepalese',
    'sri lankan',
    'filipino',
    'egyptian',
    'sudanese',
    'yemeni',
    'jordanian',
    'syrian',
    'iraqi',
    'american',
    'british',
    'saudi',
    'emirati',
    'kuwaiti',
    'qatari',
    'bahraini',
];

const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'Leave', 'Long Leave', 'Cancel', 'OM50'] as const;

type EmployeeStatus = typeof EMPLOYEE_STATUSES[number];

function normalizeEmployeeStatus(value: string | null | undefined): EmployeeStatus {
    if (!value) return 'Active';
    const clean = value.trim();
    const found = EMPLOYEE_STATUSES.find(s => s.toLowerCase() === clean.toLowerCase());
    if (found) {
        return found;
    }
    return 'Active';
}

interface ManageEmployee {
    id: number;
    device_user_id: string;
    name: string;
    department: string | null;
    email: string | null;
    emp_id: string | null;
    emp_type: 'staff' | 'worker' | null;
    nationality: string | null;
    designation: string | null;
    shift?: 'day' | 'night' | null;
    fingerprint_templates?: Record<string, any> | null;
    face_templates?: Record<string, any> | null;
    created_at?: string;
    location?: string | null;
    project?: string | null;
    company?: string | null;
    civil_id?: string | null;
    doj?: string | null;
    phone?: string | null;
    cug?: string | null;
    status?: EmployeeStatus | null;
}

interface EmployeeManageProps {
    refreshTrigger?: number;
    onLoadingChange?: (loading: boolean) => void;
}

export default function EmployeeManage({ refreshTrigger, onLoadingChange }: EmployeeManageProps = {}) {
    const { userData } = useAuth();
    const [employees, setEmployees] = useState<ManageEmployee[]>([]);
    const [employeeLocations, setEmployeeLocations] = useState<Record<string, string>>({});
    const [verifiedLocations, setVerifiedLocations] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
    const [selectedDesignations, setSelectedDesignations] = useState<string[]>([]);
    const [deptDesignationFilterTab, setDeptDesignationFilterTab] = useState<'department' | 'designation'>('department');
    const [typeNationalityFilterTab, setTypeNationalityFilterTab] = useState<'type' | 'nationality'>('type');
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedNationalities, setSelectedNationalities] = useState<string[]>([]);
    const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
    const [selectedShifts, setSelectedShifts] = useState<Array<'day' | 'night'>>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<EmployeeStatus[]>([]);
    const [selectedBiometricFilters, setSelectedBiometricFilters] = useState<Array<'Finger' | 'Face' | 'No Finger' | 'No face' | 'None'>>([]);
    const [selectedEmpPrefixes, setSelectedEmpPrefixes] = useState<string[]>([]);
    const [showDuplicateNamesOnly, setShowDuplicateNamesOnly] = useState(false);

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

    // Pagination / Rendering Limit state
    const [renderLimit, setRenderLimit] = useState(100);

    useEffect(() => {
        setRenderLimit(100);
    }, [search, selectedDepartments, selectedDesignations, selectedLocations, selectedTypes, selectedNationalities, selectedCompanies, selectedShifts, selectedStatuses, selectedBiometricFilters, selectedEmpPrefixes]);

    useEffect(() => {
        if (!canEditAttendance) {
            setIsSelectionMode(false);
            setSelectedEmployeeIds(new Set());
        }
    }, [canEditAttendance]);

    // Selection and bulk states
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
    const [isBulkDeptOpen, setIsBulkDeptOpen] = useState(false);
    const [bulkDeptValue, setBulkDeptValue] = useState('');
    const [isBulkTypeOpen, setIsBulkTypeOpen] = useState(false);
    const [bulkTypeValue, setBulkTypeValue] = useState<'staff' | 'worker'>('staff');
    const [isBulkCompanyOpen, setIsBulkCompanyOpen] = useState(false);
    const [bulkCompanyValue, setBulkCompanyValue] = useState('');
    const [isBulkDesignationOpen, setIsBulkDesignationOpen] = useState(false);
    const [bulkDesignationValue, setBulkDesignationValue] = useState('');
    const [isBulkShiftOpen, setIsBulkShiftOpen] = useState(false);
    const [bulkShiftValue, setBulkShiftValue] = useState<'day' | 'night'>('day');
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [isBulkNationalityOpen, setIsBulkNationalityOpen] = useState(false);
    const [bulkNationalityValue, setBulkNationalityValue] = useState('');

    // Bulk push states
    const [isBulkPushOpen, setIsBulkPushOpen] = useState(false);
    const [selectedBulkPushDevices, setSelectedBulkPushDevices] = useState<Set<string>>(new Set());
    const [isBulkPushing, setIsBulkPushing] = useState(false);
    const [bulkSyncAction, setBulkSyncAction] = useState<'push' | 'fetch'>('push');
    const [bulkPushType, setBulkPushType] = useState<'all' | 'user_info' | 'finger' | 'face'>('all');

    useEffect(() => {
        if (isBulkPushOpen) {
            setSelectedBulkPushDevices(new Set());
            setBulkSyncAction('push');
            setBulkPushType('all');
        }
    }, [isBulkPushOpen]);

    const toggleSelectEmployee = (id: number) => {
        setSelectedEmployeeIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Edit states
    const [editingEmployee, setEditingEmployee] = useState<ManageEmployee | null>(null);
    const [activeTab, setActiveTab] = useState<'profile' | 'sync'>('profile');
    const [syncAction, setSyncAction] = useState<'push' | 'fetch'>('push');
    const [editName, setEditName] = useState('');
    const [editDeviceUserId, setEditDeviceUserId] = useState('');
    const [editDept, setEditDept] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editEmpId, setEditEmpId] = useState('');
    const [editEmpType, setEditEmpType] = useState<'staff' | 'worker'>('staff');
    const [editShift, setEditShift] = useState<'day' | 'night'>('day');
    const [editStatus, setEditStatus] = useState<EmployeeStatus>('Active');
    const [editNationality, setEditNationality] = useState('');
    const [editCivilId, setEditCivilId] = useState('');
    const [editDoj, setEditDoj] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editCug, setEditCug] = useState('');
    const [editDesignation, setEditDesignation] = useState('');
    const [editCompany, setEditCompany] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Selective individual push/fetch states and handler
    const [selectedPushDevices, setSelectedPushDevices] = useState<Set<string>>(new Set());
    const [isPushing, setIsPushing] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [pushType, setPushType] = useState<'all' | 'user_info' | 'finger' | 'face'>('all');

    useEffect(() => {
        if (editingEmployee) {
            setSelectedPushDevices(new Set());
            setSyncAction('push');
            setPushType('all');
            setActiveTab('profile');
        }
    }, [editingEmployee]);

    const insertCommandsSequentially = async (commands: any[]) => {
        for (const cmd of commands) {
            const { error } = await supabase.from('device_commands').insert(cmd);
            if (error) throw error;
            await new Promise(resolve => setTimeout(resolve, 80));
        }
    };

    const handleFetchBiometrics = async () => {
        if (!editingEmployee || selectedPushDevices.size === 0) {
            toast.error('Please select at least one device to fetch from');
            return;
        }

        setIsFetching(true);
        try {
            const empId = editingEmployee.id;
            const pin = editingEmployee.device_user_id.trim();

            const commandsToInsert: any[] = [];
            for (const deviceSerial of Array.from(selectedPushDevices)) {
                commandsToInsert.push(
                    {
                        device_serial: deviceSerial,
                        command: `DATA QUERY USERINFO PIN=${pin}`,
                        command_type: 'QUERY_USERINFO',
                        employee_id: empId,
                        status: 'pending'
                    },
                    {
                        device_serial: deviceSerial,
                        command: `DATA QUERY FINGERTMP PIN=${pin}`,
                        command_type: 'QUERY_FINGERTMP',
                        employee_id: empId,
                        status: 'pending'
                    },
                    {
                        device_serial: deviceSerial,
                        command: `DATA QUERY FACE PIN=${pin}`,
                        command_type: 'QUERY_FACE',
                        employee_id: empId,
                        status: 'pending'
                    }
                );
            }

            await insertCommandsSequentially(commandsToInsert);

            toast.success(`Successfully queued biometrics query from selected device(s). Templates will sync automatically when devices process the commands.`);
            setSelectedPushDevices(new Set());
        } catch (err: any) {
            toast.error(err.message || 'Failed to queue fetch commands.');
        } finally {
            setIsFetching(false);
        }
    };

    const handleIndividualPush = async () => {
        if (!editingEmployee || selectedPushDevices.size === 0) {
            toast.error('Please select at least one device');
            return;
        }

        setIsPushing(true);
        try {
            const empId = editingEmployee.id;
            const pin = editDeviceUserId.trim() || editingEmployee.device_user_id;
            const name = editName.trim() || editingEmployee.name;

            // Construct user update command text
            const userCmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name.replace(/\t/g, ' ').slice(0, 24)}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000`;

            const commandsToInsert: any[] = [];

            const fingerTemplates = editingEmployee.fingerprint_templates || {};
            const faceTemplates = editingEmployee.face_templates || {};

            [...selectedPushDevices].forEach(serial => {
                // User info update command
                if (pushType === 'all' || pushType === 'user_info') {
                    commandsToInsert.push({
                        device_serial: serial,
                        command: userCmd,
                        command_type: 'ADD_USER',
                        employee_id: empId,
                        status: 'pending'
                    });
                }

                // Fingerprints
                if (pushType === 'all' || pushType === 'finger') {
                    Object.entries(fingerTemplates).forEach(([fid, val]: [string, any]) => {
                        if (val && val.template) {
                            commandsToInsert.push({
                                device_serial: serial,
                                command: `DATA UPDATE FINGERTMP PIN=${pin}\tFID=${fid}\tSize=${val.size ?? 0}\tValid=${val.valid ?? 1}\tTMP=${val.template}`,
                                command_type: 'UPDATE_FINGERTMP',
                                employee_id: empId,
                                status: 'pending'
                            });
                        }
                    });
                }

                // Faces
                if (pushType === 'all' || pushType === 'face') {
                    Object.entries(faceTemplates).forEach(([key, val]: [string, any]) => {
                        if (val && val.template) {
                            if (key.startsWith('face-')) {
                                const fid = key.replace('face-', '');
                                commandsToInsert.push({
                                    device_serial: serial,
                                    command: `DATA UPDATE FACE PIN=${pin}\tFID=${fid}\tSize=${val.size ?? val.template.length}\tValid=${val.valid ?? 1}\tTMP=${val.template}`,
                                    command_type: 'UPDATE_FACE',
                                    employee_id: empId,
                                    status: 'pending'
                                });
                            } else {
                                const [type, no] = key.split('-');
                                commandsToInsert.push({
                                    device_serial: serial,
                                    command: `DATA UPDATE BIODATA Pin=${pin}\tType=${type || 9}\tNo=${no || 0}\tIndex=${val.index ?? 0}\tFormat=${val.format ?? 0}\tMajorVer=${val.major_ver ?? 10}\tMinorVer=${val.minor_ver ?? 0}\tTmp=${val.template}`,
                                    command_type: 'UPDATE_BIODATA',
                                    employee_id: empId,
                                    status: 'pending'
                                });
                            }
                        }
                    });
                }
            });

            await insertCommandsSequentially(commandsToInsert);

            toast.success(`Successfully queued profile and biometrics sync for ${name} to ${selectedPushDevices.size} device(s).`);
            setSelectedPushDevices(new Set());
        } catch (err: any) {
            toast.error(err.message || 'Failed to queue push commands.');
        } finally {
            setIsPushing(false);
        }
    };

    // Excel Upload states & handlers
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [uploadState, setUploadState] = useState<'idle' | 'preview' | 'uploading' | 'completed'>('idle');
    const [parsedEmployees, setParsedEmployees] = useState<any[]>([]);
    const [duplicateEmployees, setDuplicateEmployees] = useState<any[]>([]);
    const [uploadPushToDevices, setUploadPushToDevices] = useState(false);
    const [uploadSelectedDevices, setUploadSelectedDevices] = useState<Set<string>>(new Set());
    const [uploadFileName, setUploadFileName] = useState('');
    const [uploadCurrentIndex, setUploadCurrentIndex] = useState(0);
    const [uploadTotalCount, setUploadTotalCount] = useState(0);
    const [uploadPreviewPage, setUploadPreviewPage] = useState(1);

    const uploadPreviewPageSize = 50;
    const uploadPreviewPageCount = Math.max(1, Math.ceil(parsedEmployees.length / uploadPreviewPageSize));
    const paginatedPreviewEmployees = useMemo(() => {
        const startIndex = (uploadPreviewPage - 1) * uploadPreviewPageSize;
        return parsedEmployees.slice(startIndex, startIndex + uploadPreviewPageSize);
    }, [parsedEmployees, uploadPreviewPage]);

    const handleResetUpload = () => {
        setUploadState('idle');
        setParsedEmployees([]);
        setDuplicateEmployees([]);
        setUploadFileName('');
        setUploadCurrentIndex(0);
        setUploadTotalCount(0);
        setUploadPreviewPage(1);
        setUploadPushToDevices(false);
        setUploadSelectedDevices(new Set());
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleExportExcel = () => {
        try {
            if (filteredEmployees.length === 0) {
                toast.error('No employee records available to export.');
                return;
            }

            // Map employees list to excel friendly format
            const exportData = filteredEmployees.map((emp) => ({
                'Device User ID': emp.device_user_id,
                'Name': emp.name,
                'Employee ID': emp.emp_id || '',
                'Type': emp.emp_type || '',
                'Shift': emp.shift || 'day',
                'Status': emp.status || 'Active',
                'Department': emp.department || '',
                'Designation': emp.designation || '',
                'Nationality': emp.nationality || '',
                'Email': emp.email || '',
                'Project': emp.project || '',
                'Company': emp.company || '',
                'Civil ID': emp.civil_id || '',
            }));

            // Create workbook and worksheet
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');

            // Generate buffer and save
            XLSX.writeFile(workbook, `Employees_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
            toast.success('Employee list exported successfully.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to export Excel file.');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadFileName(file.name);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet) as any[];

                if (rows.length === 0) {
                    toast.error('The selected Excel file is empty.');
                    handleResetUpload();
                    return;
                }

                const employeesList: any[] = [];
                const localDuplicates: any[] = [];
                const seenExcelEmpIds = new Set();

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];

                    const name = findValue(row, ['name', 'employeename', 'emp_name', 'employee_name', 'full_name', 'fullname']);
                    const emp_id = findValue(row, ['emp_id', 'empid', 'hr_id', 'hrid', 'employee_id', 'employeeid', 'id']);

                    if (!name || !emp_id) {
                        continue; // Skip invalid rows
                    }

                    const pin = findValue(row, ['device_user_id', 'deviceuserid', 'pin', 'userid', 'user_id', 'device_id', 'deviceid']);
                    const rawType = findValue(row, ['emp_type', 'emptype', 'employee_type', 'employeetype', 'type']) || '';
                    let emp_type: 'staff' | 'worker' = 'staff';
                    if (rawType.toLowerCase().startsWith('work')) {
                        emp_type = 'worker';
                    }
                    const rawShift = (findValue(row, ['shift', 'work_shift', 'duty_shift']) || '').toLowerCase().trim();
                    const shift: 'day' | 'night' = rawShift === 'night' ? 'night' : 'day';

                    const department = findValue(row, ['department', 'dept', 'department_name', 'dept_name']);
                    const designation = findValue(row, ['designation', 'design', 'job_title', 'jobtitle', 'role']);
                    const nationality = findValue(row, ['nationality', 'nation', 'country']);
                    const email = findValue(row, ['email', 'email_address', 'emailaddress']);
                    const project = findValue(row, ['project', 'proj', 'project_name', 'projectname', 'assigned_project', 'assignedproject']);
                    const company = findValue(row, ['company', 'comp', 'company_name', 'companyname', 'employer']);
                    const civil_id = findValue(row, ['civil_id', 'civilid', 'civil_number', 'civilnumber', 'id_number', 'idnumber', 'national_id', 'nationalid']);

                    const newEmp = {
                        device_user_id: pin,
                        name,
                        emp_id,
                        emp_type,
                        shift,
                        department,
                        designation,
                        nationality,
                        email,
                        project,
                        company,
                        civil_id
                    };

                    if (seenExcelEmpIds.has(emp_id.trim().toLowerCase())) {
                        localDuplicates.push(newEmp);
                    } else {
                        seenExcelEmpIds.add(emp_id.trim().toLowerCase());
                        employeesList.push(newEmp);
                    }
                }

                if (employeesList.length === 0) {
                    toast.error('No valid employee rows found. Each row must have a Name and Employee ID.');
                    handleResetUpload();
                    return;
                }

                // Check for duplicates locally against already loaded employees (matching by emp_id)
                const dbEmpMap = new Map(
                    employees
                        .filter(emp => emp.emp_id)
                        .map(emp => [emp.emp_id!.trim().toLowerCase(), emp])
                );

                const helperIsValueChanged = (excelVal: any, dbVal: any) => {
                    const normExcel = excelVal === undefined || excelVal === null ? '' : String(excelVal).trim();
                    const normDb = dbVal === undefined || dbVal === null ? '' : String(dbVal).trim();
                    return normExcel !== normDb;
                };

                const newEmployees: any[] = [];
                const updatedEmployees: any[] = [];
                const unchangedEmployees: any[] = [];

                for (const excelEmp of employeesList) {
                    const dbEmp = dbEmpMap.get(excelEmp.emp_id.trim().toLowerCase());
                    if (!dbEmp) {
                        newEmployees.push({ ...excelEmp, action: 'create' });
                    } else {
                        // Check if any field changed
                        const isChanged =
                            helperIsValueChanged(excelEmp.name, dbEmp.name) ||
                            helperIsValueChanged(excelEmp.device_user_id, dbEmp.device_user_id) ||
                            helperIsValueChanged(excelEmp.emp_type, dbEmp.emp_type) ||
                            helperIsValueChanged(excelEmp.shift, dbEmp.shift || 'day') ||
                            helperIsValueChanged(excelEmp.department, dbEmp.department) ||
                            helperIsValueChanged(excelEmp.designation, dbEmp.designation) ||
                            helperIsValueChanged(excelEmp.nationality, dbEmp.nationality) ||
                            helperIsValueChanged(excelEmp.email, dbEmp.email) ||
                            helperIsValueChanged(excelEmp.project, dbEmp.project) ||
                            helperIsValueChanged(excelEmp.company, dbEmp.company) ||
                            helperIsValueChanged(excelEmp.civil_id, dbEmp.civil_id);

                        if (isChanged) {
                            updatedEmployees.push({ ...excelEmp, action: 'update', dbId: dbEmp.id });
                        } else {
                            unchangedEmployees.push(excelEmp);
                        }
                    }
                }

                const allDuplicates = [...localDuplicates, ...unchangedEmployees];

                if (newEmployees.length === 0 && updatedEmployees.length === 0) {
                    toast.error(`All ${employeesList.length} employees in the Excel file are already registered and up-to-date.`);
                    handleResetUpload();
                    return;
                }

                setParsedEmployees([...newEmployees, ...updatedEmployees]);
                setDuplicateEmployees(allDuplicates);
                setUploadTotalCount(newEmployees.length + updatedEmployees.length);
                setUploadCurrentIndex(0);
                setUploadPreviewPage(1);
                setUploadState('preview');
            } catch (err: any) {
                toast.error(err.message || 'Failed to parse Excel file.');
                handleResetUpload();
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleConfirmUpload = async () => {
        if (parsedEmployees.length === 0) return;
        setUploadState('uploading');
        setUploadCurrentIndex(0);

        const newDuplicates: any[] = [];

        try {
            for (let i = 0; i < parsedEmployees.length; i++) {
                const emp = parsedEmployees[i];
                let success = false;
                let employeeId = null;
                let employeeName = null;

                if (emp.action === 'update') {
                    // Update existing employee record
                    // Strip the temporary 'action' and 'dbId' fields before saving to DB
                    const { action, dbId, ...updateFields } = emp;

                    const { data: updatedData, error: updateErr } = await supabase
                        .from('employees')
                        .update(updateFields)
                        .eq('id', dbId)
                        .select('id, device_user_id, name')
                        .maybeSingle();

                    if (updateErr) {
                        toast.error(`Failed to update ${emp.name}: ${updateErr.message}`);
                    } else if (updatedData) {
                        success = true;
                        employeeId = updatedData.id;
                        employeeName = updatedData.name;
                    }
                } else {
                    // Insert new employee record
                    // Double check DB duplicate before insert to avoid conflicts
                    const { data: existing } = await supabase
                        .from('employees')
                        .select('id')
                        .eq('emp_id', emp.emp_id)
                        .maybeSingle();

                    if (existing) {
                        newDuplicates.push(emp);
                        setUploadCurrentIndex(i + 1);
                        continue;
                    }

                    // Strip action field from new employee object
                    const { action, ...insertFields } = emp;

                    const { data: insertedData, error: insertErr } = await supabase
                        .from('employees')
                        .insert(insertFields)
                        .select('id, device_user_id, name')
                        .single();

                    if (insertErr) {
                        toast.error(`Failed to import ${emp.name}: ${insertErr.message}`);
                    } else if (insertedData) {
                        success = true;
                        employeeId = insertedData.id;
                        employeeName = insertedData.name;
                    }
                }

                // Queue device commands if option selected and db op succeeded
                if (success && employeeId && uploadPushToDevices && uploadSelectedDevices.size > 0) {
                    const commands = [...uploadSelectedDevices].map(serial => ({
                        device_serial: serial,
                        command: buildAddUserCommand(Date.now() + Math.floor(Math.random() * 100000), emp.device_user_id, employeeName || emp.name),
                        command_type: 'ADD_USER',
                        employee_id: employeeId,
                        status: 'pending',
                    }));

                    try {
                        await insertCommandsSequentially(commands);
                    } catch (cmdErr: any) {
                        console.error(`Failed to queue commands for ${employeeName || emp.name}: ${cmdErr.message}`);
                    }
                }

                setUploadCurrentIndex(i + 1);
            }

            if (newDuplicates.length > 0) {
                setDuplicateEmployees(prev => [...prev, ...newDuplicates]);
            }

            setUploadState('completed');
            fetchEmployees();
        } catch (err: any) {
            toast.error(err.message || 'Failed to complete import.');
            setUploadState('preview');
        }
    };

    // Add states
    const [isAdding, setIsAdding] = useState(false);
    const [addActiveTab, setAddActiveTab] = useState<'profile' | 'sync'>('profile');
    const [addName, setAddName] = useState('');
    const [addDeviceUserId, setAddDeviceUserId] = useState('');
    const [addDept, setAddDept] = useState('');
    const [addEmail, setAddEmail] = useState('');
    const [addEmpId, setAddEmpId] = useState('');
    const [addEmpType, setAddEmpType] = useState<'staff' | 'worker'>('staff');
    const [addShift, setAddShift] = useState<'day' | 'night'>('day');
    const [addStatus, setAddStatus] = useState<EmployeeStatus>('Active');
    const [addNationality, setAddNationality] = useState('');
    const [addCivilId, setAddCivilId] = useState('');
    const [addDoj, setAddDoj] = useState('');
    const [addPhone, setAddPhone] = useState('');
    const [addCug, setAddCug] = useState('');
    const [addDesignation, setAddDesignation] = useState('');
    const [addCompany, setAddCompany] = useState('');
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
    const [loadingDevices, setLoadingDevices] = useState(false);

    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [empRes, devRes, transRes] = await Promise.all([
                supabase.from('employees').select('*').order('name', { ascending: true }),
                supabase.from('devices').select('serial_no, location, project_code'),
                supabase.from('transfers').select('*')
            ]);

            if (empRes.error) throw empRes.error;
            if (devRes.error) throw devRes.error;
            if (transRes.error) throw transRes.error;

            const loadedTransfers = transRes?.data || [];
            const verifiedLocsMap: Record<number, string> = {};
            (empRes.data || []).forEach(emp => {
                const empTrans = loadedTransfers.filter(t => t.emp_id === emp.emp_id || t.emp_id === String(emp.id));
                if (empTrans.length > 0) {
                    empTrans.sort((a, b) => new Date(b.transfer_date).getTime() - new Date(a.transfer_date).getTime() || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    verifiedLocsMap[emp.id] = empTrans[0].to_project;
                }
            });

            const devData = devRes.data || [];
            const deviceMap = Object.fromEntries(
                devData.map(d => [d.serial_no, d.location])
            );

            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth();
            const pad = (n: number) => String(n).padStart(2, '0');
            const startOfMonthStr = `${year}-${pad(month + 1)}-01T00:00:00`;

            // Fetch the punches for the current month to determine the most frequent location for each employee
            const { data: punchData, error: punchError } = await supabase
                .from('punches')
                .select('user_id, device_serial, mobile_location')
                .gte('punch_time', startOfMonthStr)
                .order('punch_time', { ascending: false })
                .limit(10000);

            if (punchError) throw punchError;

            // Fetch all projects to build a project_name to location display name mapping
            const { data: projData } = await supabase.from('projects').select('project_name, project_location, project_code, focal_point_email');
            const projLocationMap: Record<string, string> = {};
            (projData ?? []).forEach(p => {
                const { name } = parseLocationGeofence(p.project_location);
                if (p.project_name && name) {
                    projLocationMap[p.project_name.toLowerCase().trim()] = name;
                }
            });

            // Normalize transfer locations and set verifiedLocations state
            Object.keys(verifiedLocsMap).forEach((idKey) => {
                const id = Number(idKey);
                let toProj = verifiedLocsMap[id];
                if (toProj) {
                    const key = toProj.toLowerCase().trim();
                    if (projLocationMap[key]) {
                        verifiedLocsMap[id] = projLocationMap[key];
                    }
                }
            });
            setVerifiedLocations(verifiedLocsMap);

            // Map each user to their most frequent and latest punch locations
            const latestPunchLocs: Record<string, string> = {};
            const userLocationCounts: Record<string, Record<string, number>> = {};

            if (punchData) {
                punchData.forEach(p => {
                    const devLoc = deviceMap[p.device_serial];
                    let { location: loc } = parsePunchLocation(p.mobile_location, devLoc);
                    if (loc) {
                        const key = loc.toLowerCase().trim();
                        if (projLocationMap[key]) {
                            loc = projLocationMap[key];
                        }
                    }
                    const isRealLocation = loc && loc !== '—' && loc !== 'Un-Mapped';
                    if (isRealLocation) {
                        if (!userLocationCounts[p.user_id]) {
                            userLocationCounts[p.user_id] = {};
                        }
                        userLocationCounts[p.user_id][loc] = (userLocationCounts[p.user_id][loc] || 0) + 1;

                        // Since punches query is DESC (newest first), the first punch we find for a user is their latest.
                        if (!latestPunchLocs[p.user_id]) {
                            latestPunchLocs[p.user_id] = loc;
                        }
                    }
                });
            }

            const primLocs: Record<string, string> = {};
            Object.entries(userLocationCounts).forEach(([userId, counts]) => {
                let mostFrequentLoc = '';
                let maxCount = 0;
                Object.entries(counts).forEach(([loc, count]) => {
                    if (count > maxCount) {
                        maxCount = count;
                        mostFrequentLoc = loc;
                    }
                });
                if (mostFrequentLoc) {
                    primLocs[userId] = mostFrequentLoc;
                }
            });

            // Combine latest punch location and most frequent punch location
            const empLocs: Record<string, string> = {};
            (empRes.data || []).forEach(emp => {
                const uid = emp.device_user_id;
                const locVal = latestPunchLocs[uid] || primLocs[uid] || '';
                if (locVal) {
                    empLocs[uid] = locVal;
                }
            });

            setEmployeeLocations(empLocs);

            // Determine if focal point filter is active
            let focalProjectCodes: string[] = [];
            let focalProjectLocations: string[] = [];
            let isFocalFiltered = false;

            if (userData?.role !== 'admin' && userData?.role !== 'site_admin' && userData?.email) {
                const focalProjects = (projData ?? []).filter(p => p.focal_point_email === userData.email);

                if (focalProjects.length > 0) {
                    focalProjectCodes = focalProjects.map(p => p.project_code).filter(Boolean);
                    focalProjectLocations = focalProjects
                        .map(p => parseLocationGeofence(p.project_location).name.toLowerCase().trim())
                        .filter(Boolean);
                    isFocalFiltered = true;
                }
            }

            let filteredEmployees = empRes.data || [];
            if (isFocalFiltered) {
                const normalizeString = (str: string) => {
                    if (!str) return '';
                    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
                };

                const findProjectCode = (currentProject: string | null | undefined, projectList: any[]): string => {
                    if (!currentProject || currentProject === 'No Project Assigned') return '';
                    const normCp = normalizeString(currentProject);
                    let bestMatch = null;
                    let bestScore = 0;

                    for (const p of projectList) {
                        const normCode = normalizeString(p.project_code);
                        const normName = normalizeString(p.project_name);
                        const normLoc = p.project_location ? normalizeString(parseLocationGeofence(p.project_location).name) : '';

                        let score = 0;

                        // 1. Exact Match (Score: 100)
                        if (normCode === normCp || normName === normCp || (normLoc && normLoc === normCp)) {
                            score = 100;
                        } else {
                            // Tokenize for word-boundary matches
                            const cpTokens = currentProject.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                            const codeTokens = p.project_code.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                            const nameTokens = p.project_name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
                            const locTokens = p.project_location ? parseLocationGeofence(p.project_location).name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];

                            const hasCodeToken = codeTokens.length > 0 && codeTokens.every((t: string) => cpTokens.includes(t));
                            const hasNameToken = nameTokens.length > 0 && nameTokens.every((t: string) => cpTokens.includes(t));
                            const hasLocToken = locTokens.length > 0 && locTokens.every((t: string) => cpTokens.includes(t));

                            // 2. Token-level/Word-level match (Score: 80)
                            if (hasCodeToken || hasNameToken || hasLocToken) {
                                score = 80;
                            } else {
                                // 3. Substring match (Score: 50, but ignore short codes < 3 chars to prevent false positives like 'ng')
                                const isCodeMatch = normCode.includes(normCp) || normCp.includes(normCode);
                                const isNameMatch = normName.includes(normCp) || normCp.includes(normName);
                                const isLocMatch = normLoc && (normLoc.includes(normCp) || normCp.includes(normLoc));

                                if (isCodeMatch || isNameMatch || isLocMatch) {
                                    let isTooShort = false;
                                    if (isCodeMatch && normCode.length < 3) isTooShort = true;
                                    if (isNameMatch && normName.length < 3) isTooShort = true;
                                    if (isLocMatch && normLoc.length < 3) isTooShort = true;

                                    if (!isTooShort) {
                                        score = 50;
                                    }
                                }
                            }
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = p;
                        }
                    }

                    return bestMatch ? bestMatch.project_code : '';
                };

                // 1. Resolve matching project device serials
                const projectDeviceSerials = devData
                    .filter(d => d.project_code && focalProjectCodes.includes(d.project_code))
                    .map(d => d.serial_no);

                // 2. Resolve associated employee IDs
                const allowedEmpIds = new Set<number>();
                const allowedDeviceUserIds = new Set<string>();

                if (projectDeviceSerials.length > 0) {
                    // Fetch employee IDs from device_commands on project devices
                    const { data: cmdData } = await supabase
                        .from('device_commands')
                        .select('employee_id')
                        .in('device_serial', projectDeviceSerials);

                    if (cmdData) {
                        cmdData.forEach(c => {
                            if (c.employee_id) allowedEmpIds.add(c.employee_id);
                        });
                    }

                    // Fetch employee device_user_ids from punches on project devices
                    const { data: punchUserIds } = await supabase
                        .from('punches')
                        .select('user_id')
                        .in('device_serial', projectDeviceSerials)
                        .limit(5000);

                    if (punchUserIds) {
                        punchUserIds.forEach(p => {
                            if (p.user_id) allowedDeviceUserIds.add(p.user_id);
                        });
                    }
                }

                // 3. Filter employees list
                filteredEmployees = filteredEmployees.filter(emp => {
                    const hasCommand = allowedEmpIds.has(emp.id);
                    const hasPunch = allowedDeviceUserIds.has(emp.device_user_id);
                    const hasLocationMatch = emp.location && focalProjectLocations.includes(emp.location.toLowerCase().trim());
                    // Also check if their most recent calculated location (from empLocs) matches focal location
                    const calculatedLoc = verifiedLocsMap[emp.id] || empLocs[emp.device_user_id];
                    const hasCalculatedLocMatch = calculatedLoc && focalProjectLocations.includes(calculatedLoc.toLowerCase().trim());
                    
                    const resolvedProjCode = calculatedLoc ? findProjectCode(calculatedLoc, projData || []) : '';
                    const hasProjectMatch = resolvedProjCode && focalProjectCodes.includes(resolvedProjCode);

                    const belongsToProject = hasLocationMatch || hasCalculatedLocMatch || hasProjectMatch;
                    if (belongsToProject) return true;

                    const empLocProjCode = emp.location ? findProjectCode(emp.location, projData || []) : '';
                    const hasDifferentProjectAssigned = (empLocProjCode && !focalProjectCodes.includes(empLocProjCode)) ||
                                                        (resolvedProjCode && !focalProjectCodes.includes(resolvedProjCode));
                    if (hasDifferentProjectAssigned) {
                        return false;
                    }

                    return hasCommand || hasPunch;
                });
            }

            setEmployees(filteredEmployees);
        } catch (e: any) {
            setError(e.message || 'Failed to load employees');
        } finally {
            setLoading(false);
        }
    }, [userData?.email, userData?.role]);

    const fetchDevices = useCallback(async () => {
        setLoadingDevices(true);
        const { data, error: err } = await supabase
            .from('devices')
            .select('id, serial_no, location, last_seen, project_code')
            .order('id', { ascending: true });
        if (!err) {
            let devList = data ?? [];
            if (userData?.role !== 'admin' && userData?.role !== 'site_admin' && userData?.email) {
                const { data: focalProjects } = await supabase
                    .from('projects')
                    .select('project_code')
                    .eq('focal_point_email', userData.email);

                if (focalProjects && focalProjects.length > 0) {
                    const codes = focalProjects.map(p => p.project_code).filter(Boolean);
                    devList = devList.filter(d => d.project_code && codes.includes(d.project_code));
                }
            }
            setDevices(devList);
        }
        setLoadingDevices(false);
    }, [userData?.email, userData?.role]);



    const handleAddSubmit = async (e: React.FormEvent, pushToDevices: boolean) => {
        e.preventDefault();
        if (!addName.trim()) {
            toast.error('Name is required');
            return;
        }
        if (!addDeviceUserId.trim()) {
            toast.error('Device User ID is required');
            return;
        }
        if (pushToDevices && selectedDevices.size === 0) {
            toast.error('Please select at least one device to push to');
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Insert employee
            const { data: empData, error: empErr } = await supabase
                .from('employees')
                .insert({
                    device_user_id: addDeviceUserId.trim(),
                    name: addName.trim(),
                    department: addDept.trim() || null,
                    email: addEmail.trim() || null,
                    emp_id: addEmpId.trim() || null,
                    emp_type: addEmpType,
                    shift: addShift,
                    status: normalizeEmployeeStatus(addStatus),
                    nationality: addNationality || null,
                    civil_id: addCivilId.trim() || null,
                    doj: addDoj || null,
                    phone: addPhone.trim() || null,
                    cug: addCug.trim() || null,
                    designation: addDesignation.trim() || null,
                    company: addCompany.trim() || null,
                })
                .select()
                .single();

            if (empErr) throw empErr;

            // 2. If pushToDevices is true, insert device commands
            if (pushToDevices && selectedDevices.size > 0) {
                const commands = [...selectedDevices].map(serial => ({
                    device_serial: serial,
                    command: buildAddUserCommand(Date.now() + Math.floor(Math.random() * 1000), addDeviceUserId.trim(), addName.trim()),
                    command_type: 'ADD_USER',
                    employee_id: empData.id,
                    status: 'pending',
                }));

                await insertCommandsSequentially(commands);
            }

            toast.success(pushToDevices
                ? `Employee added and queued for ${selectedDevices.size} device(s).`
                : 'Employee saved successfully without pushing.'
            );

            // Reset form
            setAddName('');
            setAddDeviceUserId('');
            setAddDept('');
            setAddEmail('');
            setAddEmpId('');
            setAddEmpType('staff');
            setAddShift('day');
            setAddStatus('Active');
            setAddNationality('');
            setAddCivilId('');
            setAddDoj('');
            setAddPhone('');
            setAddCug('');
            setAddDesignation('');
            setAddCompany('');
            setSelectedDevices(new Set());
            setIsAdding(false);
            fetchEmployees();
        } catch (err: any) {
            toast.error(err.message || 'Failed to add employee');
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
        fetchDevices();
    }, [fetchEmployees, fetchDevices]);

    useEffect(() => {
        if (refreshTrigger && refreshTrigger > 0) {
            fetchEmployees();
            fetchDevices();
        }
    }, [refreshTrigger, fetchEmployees, fetchDevices]);

    useEffect(() => {
        onLoadingChange?.(loading || loadingDevices);
    }, [loading, loadingDevices, onLoadingChange]);

    // Compile unique departments for filtering
    const uniqueDepartments = useMemo(() => {
        const depts = new Set<string>();
        employees.forEach((emp) => {
            if (emp.department) depts.add(emp.department);
        });
        const sorted = Array.from(depts).sort();
        const hasBlank = employees.some(emp => !emp.department || emp.department.trim() === '');
        if (hasBlank) {
            sorted.push('(Blank)');
        }
        return sorted;
    }, [employees]);

    const uniqueDesignations = useMemo(() => {
        const designations = new Set<string>();
        employees.forEach((emp) => {
            if (emp.designation && emp.designation.trim()) designations.add(emp.designation.trim());
        });
        const sorted = Array.from(designations).sort();
        const hasBlank = employees.some(emp => !emp.designation || emp.designation.trim() === '');
        if (hasBlank) {
            sorted.push('(Blank)');
        }
        return sorted;
    }, [employees]);

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEmployee) return;
        if (!editName.trim()) {
            toast.error('Name is required');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error: updateError } = await supabase
                .from('employees')
                .update({
                    device_user_id: editDeviceUserId.trim(),
                    name: editName.trim(),
                    department: editDept.trim() || null,
                    email: editEmail.trim() || null,
                    emp_id: editEmpId.trim() || null,
                    emp_type: editEmpType,
                    shift: editShift,
                    status: normalizeEmployeeStatus(editStatus),
                    nationality: editNationality || null,
                    civil_id: editCivilId.trim() || null,
                    doj: editDoj || null,
                    phone: editPhone.trim() || null,
                    cug: editCug.trim() || null,
                    designation: editDesignation.trim() || null,
                    company: editCompany.trim() || null,
                })
                .eq('id', editingEmployee.id);

            if (updateError) throw updateError;

            toast.success('Employee updated successfully');
            setEditingEmployee(null);
            fetchEmployees(); // Refresh data
        } catch (err: any) {
            toast.error(err.message || 'Failed to update employee');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkDeptSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .update({ department: bulkDeptValue.trim() || null })
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully updated department for ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkDeptOpen(false);
            setBulkDeptValue('');
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk update department');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkCompanySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .update({ company: bulkCompanyValue.trim() || null })
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully updated company for ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkCompanyOpen(false);
            setBulkCompanyValue('');
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk update company');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkDesignationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .update({ designation: bulkDesignationValue.trim() || null })
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully updated designation for ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkDesignationOpen(false);
            setBulkDesignationValue('');
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk update designation');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkTypeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .update({ emp_type: bulkTypeValue })
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully updated employee type for ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkTypeOpen(false);
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk update employee type');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkShiftSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .update({ shift: bulkShiftValue })
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully updated shift for ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkShiftOpen(false);
            setBulkShiftValue('day');
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk update shift');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkNationalitySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .update({ nationality: bulkNationalityValue || null })
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully updated nationality for ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkNationalityOpen(false);
            setBulkNationalityValue('');
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk update nationality');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkDeleteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) return;
        setIsSubmitting(true);
        try {
            const { error: err } = await supabase
                .from('employees')
                .delete()
                .in('id', Array.from(selectedEmployeeIds));

            if (err) throw err;

            toast.success(`Successfully deleted ${selectedEmployeeIds.size} employee(s)`);
            setIsBulkDeleteOpen(false);
            setSelectedEmployeeIds(new Set());
            setIsSelectionMode(false);
            fetchEmployees();
        } catch (error: any) {
            toast.error(error.message || 'Failed to bulk delete employees');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkPushSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedEmployeeIds.size === 0) {
            toast.error('No employees selected');
            return;
        }
        if (selectedBulkPushDevices.size === 0) {
            toast.error('Please select at least one device');
            return;
        }

        setIsBulkPushing(true);
        try {
            const empIds = Array.from(selectedEmployeeIds);

            // Construct insert batch
            const commandsToInsert: any[] = [];

            for (const empId of empIds) {
                const emp = employees.find(e => e.id === empId);
                if (!emp) continue;

                const pin = emp.device_user_id;
                const name = emp.name;

                const userCmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name.replace(/\t/g, ' ').slice(0, 24)}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000`;

                [...selectedBulkPushDevices].forEach(serial => {
                    if (bulkSyncAction === 'push') {
                        // USERINFO update command
                        if (bulkPushType === 'all' || bulkPushType === 'user_info') {
                            commandsToInsert.push({
                                device_serial: serial,
                                command: userCmd,
                                command_type: 'ADD_USER',
                                employee_id: empId,
                                status: 'pending'
                            });
                        }

                        // Fingerprint templates from JSONB
                        if (bulkPushType === 'all' || bulkPushType === 'finger') {
                            const fingerTemplates = emp.fingerprint_templates || {};
                            Object.entries(fingerTemplates).forEach(([fid, val]: [string, any]) => {
                                if (val && val.template) {
                                    commandsToInsert.push({
                                        device_serial: serial,
                                        command: `DATA UPDATE FINGERTMP PIN=${pin}\tFID=${fid}\tSize=${val.size ?? 0}\tValid=${val.valid ?? 1}\tTMP=${val.template}`,
                                        command_type: 'UPDATE_FINGERTMP',
                                        employee_id: empId,
                                        status: 'pending'
                                    });
                                }
                            });
                        }

                        // Face templates from JSONB
                        if (bulkPushType === 'all' || bulkPushType === 'face') {
                            const faceTemplates = emp.face_templates || {};
                            Object.entries(faceTemplates).forEach(([key, val]: [string, any]) => {
                                if (val && val.template) {
                                    if (key.startsWith('face-')) {
                                        const fid = key.replace('face-', '');
                                        commandsToInsert.push({
                                            device_serial: serial,
                                            command: `DATA UPDATE FACE PIN=${pin}\tFID=${fid}\tSize=${val.size ?? val.template.length}\tValid=${val.valid ?? 1}\tTMP=${val.template}`,
                                            command_type: 'UPDATE_FACE',
                                            employee_id: empId,
                                            status: 'pending'
                                        });
                                    } else {
                                        const [type, no] = key.split('-');
                                        commandsToInsert.push({
                                            device_serial: serial,
                                            command: `DATA UPDATE BIODATA Pin=${pin}\tType=${type || 9}\tNo=${no || 0}\tIndex=${val.index ?? 0}\tFormat=${val.format ?? 0}\tMajorVer=${val.major_ver ?? 10}\tMinorVer=${val.minor_ver ?? 0}\tTmp=${val.template}`,
                                            command_type: 'UPDATE_BIODATA',
                                            employee_id: empId,
                                            status: 'pending'
                                        });
                                    }
                                }
                            });
                        }
                    } else {
                        // Fetch biometrics queries from device
                        commandsToInsert.push(
                            {
                                device_serial: serial,
                                command: `DATA QUERY USERINFO PIN=${pin}`,
                                command_type: 'QUERY_USERINFO',
                                employee_id: empId,
                                status: 'pending'
                            },
                            {
                                device_serial: serial,
                                command: `DATA QUERY FINGERTMP PIN=${pin}`,
                                command_type: 'QUERY_FINGERTMP',
                                employee_id: empId,
                                status: 'pending'
                            },
                            {
                                device_serial: serial,
                                command: `DATA QUERY FACE PIN=${pin}`,
                                command_type: 'QUERY_FACE',
                                employee_id: empId,
                                status: 'pending'
                            }
                        );
                    }
                });
            }

            if (commandsToInsert.length > 0) {
                await insertCommandsSequentially(commandsToInsert);

                if (bulkSyncAction === 'push') {
                    toast.success(`Successfully queued profile push for ${selectedEmployeeIds.size} employee(s) to selected devices.`);
                } else {
                    toast.success(`Successfully queued biometrics query/fetch for ${selectedEmployeeIds.size} employee(s) from selected devices.`);
                }
                setSelectedBulkPushDevices(new Set());
                setIsBulkPushOpen(false);
                setSelectedEmployeeIds(new Set());
                setIsSelectionMode(false);
            } else {
                toast.info('No commands to queue.');
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to sync with devices.');
        } finally {
            setIsBulkPushing(false);
        }
    };
    // Compile unique emp_id prefixes for filtering
    const empCodePrefixes = useMemo(() => {
        const prefixes = new Set<string>();
        employees.forEach((emp) => {
            if (emp.emp_id && emp.emp_id.length >= 2) {
                prefixes.add(emp.emp_id.slice(0, 2).toUpperCase());
            }
        });
        return Array.from(prefixes).sort();
    }, [employees]);

    // Compile unique nationalities for filtering
    const uniqueNationalities = useMemo(() => {
        const nats = new Set<string>();
        employees.forEach((emp) => {
            if (emp.nationality) nats.add(emp.nationality.toLowerCase());
        });
        return Array.from(nats).sort();
    }, [employees]);

    // Compile unique companies for filtering
    const uniqueCompanies = useMemo(() => {
        const compSet = new Set<string>();
        employees.forEach((emp) => {
            if (emp.company && emp.company.trim()) compSet.add(emp.company.trim());
        });
        const sorted = Array.from(compSet).sort();
        const hasBlank = employees.some(emp => !emp.company || emp.company.trim() === '');
        if (hasBlank) sorted.push('(Blank)');
        return sorted;
    }, [employees]);

    const uniqueShifts = useMemo(() => {
        const shiftSet = new Set<'day' | 'night'>();
        employees.forEach((emp) => {
            const shiftVal = (emp.shift || 'day').toLowerCase();
            if (shiftVal === 'night') shiftSet.add('night');
            else shiftSet.add('day');
        });
        return Array.from(shiftSet).sort();
    }, [employees]);

    const uniqueStatuses = useMemo(() => {
        const statusSet = new Set<EmployeeStatus>();
        employees.forEach((emp) => {
            statusSet.add(normalizeEmployeeStatus(emp.status));
        });
        return EMPLOYEE_STATUSES.filter((status) => statusSet.has(status));
    }, [employees]);

    // Compile unique locations for filtering
    const uniqueLocations = useMemo(() => {
        const locSet = new Set<string>();
        employees.forEach((emp) => {
            const loc = (verifiedLocations[emp.id] || employeeLocations[emp.device_user_id]) ?? emp.location;
            if (loc) locSet.add(loc);
        });
        const sorted = Array.from(locSet).sort();
        const hasBlank = employees.some(emp => {
            const loc = (verifiedLocations[emp.id] || employeeLocations[emp.device_user_id]) ?? emp.location;
            return !loc || loc.trim() === '';
        });
        if (hasBlank) {
            sorted.push('(Blank)');
        }
        return sorted;
    }, [employees, employeeLocations, verifiedLocations]);

    // Filtered employees logic
    const duplicateNameKeys = useMemo(() => {
        const counts = new Map<string, number>();

        employees.forEach((emp) => {
            const key = emp.name.trim().toLowerCase();
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return new Set(
            Array.from(counts.entries())
                .filter(([, count]) => count > 1)
                .map(([key]) => key)
        );
    }, [employees]);

    const filteredEmployees = useMemo(() => {
        return employees.filter((emp) => {
            const nameMatch = emp.name.toLowerCase().includes(search.toLowerCase());
            const hrIdMatch = emp.emp_id ? emp.emp_id.toLowerCase().includes(search.toLowerCase()) : false;
            const deviceIdMatch = emp.device_user_id ? emp.device_user_id.toLowerCase().includes(search.toLowerCase()) : false;
            const designationMatch = emp.designation ? emp.designation.toLowerCase().includes(search.toLowerCase()) : false;

            const matchesSearch = nameMatch || hrIdMatch || deviceIdMatch || designationMatch;

            const matchesDept =
                selectedDepartments.length === 0 ||
                (emp.department && selectedDepartments.includes(emp.department)) ||
                ((!emp.department || emp.department.trim() === '') && selectedDepartments.includes('(Blank)'));

            const matchesDesignation =
                selectedDesignations.length === 0 ||
                (emp.designation && selectedDesignations.includes(emp.designation.trim())) ||
                ((!emp.designation || emp.designation.trim() === '') && selectedDesignations.includes('(Blank)'));

            const matchesType =
                selectedTypes.length === 0 ||
                (emp.emp_type && selectedTypes.includes(emp.emp_type));

            const matchesNationality =
                selectedNationalities.length === 0 ||
                (emp.nationality && selectedNationalities.includes(emp.nationality.toLowerCase()));

            const empLoc = (verifiedLocations[emp.id] || employeeLocations[emp.device_user_id]) ?? emp.location;
            const matchesLocation =
                selectedLocations.length === 0 ||
                (empLoc && selectedLocations.includes(empLoc)) ||
                ((!empLoc || empLoc.trim() === '') && selectedLocations.includes('(Blank)'));

            const matchesCompany =
                selectedCompanies.length === 0 ||
                (emp.company && emp.company.trim() && selectedCompanies.includes(emp.company.trim())) ||
                ((!emp.company || emp.company.trim() === '') && selectedCompanies.includes('(Blank)'));

            const shiftValue: 'day' | 'night' = (emp.shift || 'day') === 'night' ? 'night' : 'day';
            const matchesShift =
                selectedShifts.length === 0 ||
                selectedShifts.includes(shiftValue);

            const statusValue = normalizeEmployeeStatus(emp.status);
            const matchesStatus =
                selectedStatuses.length === 0 ||
                selectedStatuses.includes(statusValue);

            const hasFinger = !!(emp.fingerprint_templates && Object.keys(emp.fingerprint_templates).length > 0);
            const hasFace = !!(emp.face_templates && Object.keys(emp.face_templates).length > 0);
            const matchesBiometric =
                selectedBiometricFilters.length === 0 ||
                selectedBiometricFilters.some((rule) => {
                    if (rule === 'Finger') return hasFinger;
                    if (rule === 'Face') return hasFace;
                    if (rule === 'No Finger') return !hasFinger;
                    if (rule === 'No face') return !hasFace;
                    if (rule === 'None') return !hasFinger && !hasFace;
                    return false;
                });

            const matchesPrefix =
                selectedEmpPrefixes.length === 0 ||
                (emp.emp_id && emp.emp_id.length >= 2 && selectedEmpPrefixes.includes(emp.emp_id.slice(0, 2).toUpperCase()));

            const matchesDuplicateName =
                !showDuplicateNamesOnly ||
                duplicateNameKeys.has(emp.name.trim().toLowerCase());

            return matchesSearch && matchesDept && matchesDesignation && matchesType && matchesNationality && matchesLocation && matchesCompany && matchesShift && matchesStatus && matchesBiometric && matchesPrefix && matchesDuplicateName;
        });
    }, [employees, search, selectedDepartments, selectedDesignations, selectedLocations, selectedTypes, selectedNationalities, selectedCompanies, selectedShifts, selectedStatuses, selectedBiometricFilters, selectedEmpPrefixes, employeeLocations, verifiedLocations, showDuplicateNamesOnly, duplicateNameKeys]);

    // Stats calculation commented out because cards are disabled
    /*
    const stats = useMemo(() => {
        const total = filteredEmployees.length;
        const staff = filteredEmployees.filter(emp => emp.emp_type === 'staff').length;
        const workers = filteredEmployees.filter(emp => emp.emp_type === 'worker').length;
        return { total, staff, workers };
    }, [filteredEmployees]);
    */

    const allFilteredSelected = useMemo(() => {
        return filteredEmployees.length > 0 && filteredEmployees.every(emp => selectedEmployeeIds.has(emp.id));
    }, [filteredEmployees, selectedEmployeeIds]);

    const someFilteredSelected = useMemo(() => {
        return filteredEmployees.some(emp => selectedEmployeeIds.has(emp.id)) && !allFilteredSelected;
    }, [filteredEmployees, selectedEmployeeIds, allFilteredSelected]);

    const handleSelectAllToggle = () => {
        if (allFilteredSelected) {
            setSelectedEmployeeIds(prev => {
                const next = new Set(prev);
                filteredEmployees.forEach(emp => next.delete(emp.id));
                return next;
            });
        } else {
            setSelectedEmployeeIds(prev => {
                const next = new Set(prev);
                filteredEmployees.forEach(emp => next.add(emp.id));
                return next;
            });
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white animate-fade-in" style={{ width: "100%" }}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fadeIn {
                  from { opacity: 0; transform: translateY(4px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                  animation: fadeIn 0.35s ease-out forwards;
                }
            ` }} />


            {/* Toolbar: Search and Filters */}
            <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-100 bg-white sticky top-0 z-20" style={{ width: "100%" }}>
                {/* Selection toggle button on the left */}
                {canEditAttendance && (
                    <Button
                        style={{ border: "none" }}
                        variant="outline"
                        onClick={() => {
                            setIsSelectionMode(!isSelectionMode);
                            setSelectedEmployeeIds(new Set());
                        }}
                        className={`h-10 w-10 p-0 rounded-xl shrink-0 transition-all ${isSelectionMode
                            ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100/80 hover:text-indigo-700 shadow-xs'
                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            }`}
                        title="Toggle Selection Mode"
                    >
                        <SquareCheck className="w-4 h-4" />
                    </Button>
                )}

                <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-darkblue transition-colors" />
                    <input
                        style={{ fontSize: "1rem" }}
                        type="text"
                        placeholder="Search name, HR ID, Device ID, or designation..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-gray-50 border-none rounded-xl outline-none focus:ring-1 focus:ring-gray-200 transition-all"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* "With Selected" bulk actions button on the right */}
                <div
                    className="overflow-hidden transition-all duration-300 ease-in-out flex items-center shrink-0"
                    style={{
                        width: canEditAttendance && isSelectionMode ? "150px" : "0px",
                        opacity: canEditAttendance && isSelectionMode ? 1 : 0,
                        marginLeft: canEditAttendance && isSelectionMode ? "8px" : "0px",
                        pointerEvents: canEditAttendance && isSelectionMode ? "auto" : "none"
                    }}
                >
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                style={{ backgroundColor: "rgba(100 100 100/ 0.1)", color: "black", fontSize: "0.8rem" }}
                                disabled={selectedEmployeeIds.size === 0}
                                className="h-10 px-4 rounded-xl font-medium disabled:opacity-50 w-[150px] justify-center flex items-center gap-1.5 shrink-0"
                            >
                                <span className="truncate">Selected ({selectedEmployeeIds.size})</span>
                                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[180px] bg-white border border-gray-100 shadow-xl rounded-lg p-1 z-50">
                            <DropdownMenuItem
                                onClick={() => setIsBulkDeptOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer"
                            >
                                Change Department
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setIsBulkTypeOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer"
                            >
                                Change Type
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setIsBulkCompanyOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer"
                            >
                                Change Company
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setIsBulkDesignationOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer"
                            >
                                Change Designation
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setIsBulkShiftOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer"
                            >
                                Change Shift
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setIsBulkNationalityOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer"
                            >
                                Change Nationality
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1 border-gray-100" />
                            <DropdownMenuItem
                                style={{ fontWeight: 500 }}
                                onClick={() => setIsBulkPushOpen(true)}
                                className="rounded-md focus:bg-gray-50 cursor-pointer text-indigo-600 focus:text-indigo-700 font-semibold"
                            >
                                Device Sync
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1 border-gray-100" />
                            <DropdownMenuItem
                                style={{ fontWeight: 500 }}
                                onClick={() => setIsBulkDeleteOpen(true)}
                                className="rounded-md focus:bg-gray-50 text-red-600 focus:text-red-700 cursor-pointer"
                            >
                                Delete Selected
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                {canEditAttendance && (
                    <Button
                        onClick={() => {
                            setIsAdding(true);
                            setAddActiveTab('profile');
                            setAddName('');
                            setAddDeviceUserId('');
                            setAddDept('');
                            setAddEmail('');
                            setAddEmpId('');
                            setAddEmpType('staff');
                            setAddShift('day');
                            setAddStatus('Active');
                            setAddNationality('');
                            setAddCivilId('');
                            setAddDoj('');
                            setAddPhone('');
                            setAddCug('');
                            setAddDesignation('');
                            setAddCompany('');
                            setSelectedDevices(new Set());
                        }}
                        className="h-10 px-4 rounded-xl text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors flex items-center gap-1.5 shrink-0"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Employee
                    </Button>
                )}
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileChange}
                />
                {canEditAttendance && (
                    <Button
                        onClick={() => {
                            handleResetUpload();
                            setUploadModalOpen(true);
                        }}
                        variant="outline"
                        className="h-10 w-10 p-0 rounded-xl bg-gray-50 border-none text-gray-500 hover:bg-gray-100 transition-colors shrink-0 flex items-center justify-center"
                        title="Upload Employees from Excel"
                    >
                        <Upload className="w-4 h-4" />
                    </Button>
                )}
                <Button
                    onClick={handleExportExcel}
                    variant="outline"
                    className="h-10 w-10 p-0 rounded-xl bg-gray-50 border-none text-gray-500 hover:bg-gray-100 transition-colors shrink-0 flex items-center justify-center"
                    title="Export Employees to Excel"
                >
                    <Download className="w-4 h-4" />
                </Button>
            </div>

            {/* Error State */}
            {error && (
                <div className="mx-3 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex-shrink-0">
                    {error}
                </div>
            )}

            {/* Table Section */}
            <div className="overflow-auto flex-1" style={{ width: "100%" }}>
                {loading && employees.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 h-full text-gray-400 text-sm">
                        <Loader2 className="w-5 h-full animate-spin" />
                        Loading employees…
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-12 text-sm" style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Users />
                                </EmptyMedia>
                                <EmptyTitle>No employees found</EmptyTitle>
                                <EmptyDescription>
                                    {search || selectedDepartments.length > 0 || selectedDesignations.length > 0 || selectedLocations.length > 0 || selectedTypes.length > 0 || selectedNationalities.length > 0 || selectedCompanies.length > 0 || selectedShifts.length > 0 || selectedBiometricFilters.length > 0 || selectedEmpPrefixes.length > 0 || showDuplicateNamesOnly
                                        ? 'No matching employees found with current filters.'
                                        : 'Get started by adding employee records.'}
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : (
                    <table className="w-full text-sm animate-fade-in" style={{ tableLayout: "fixed" }}>
                        <thead className="sticky top-0 bg-gray-50 z-10 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                            <tr className="border-b border-gray-100">
                                <th
                                    className="transition-[width,opacity] duration-200 ease-in-out overflow-hidden text-left p-0"
                                    style={{
                                        width: isSelectionMode ? "48px" : "0px",
                                        opacity: isSelectionMode ? 1 : 0,
                                        pointerEvents: isSelectionMode ? "auto" : "none"
                                    }}
                                >
                                    <div className="w-12 h-10 flex items-center justify-center overflow-hidden">
                                        <Checkbox
                                            checked={someFilteredSelected ? 'indeterminate' : allFilteredSelected}
                                            onCheckedChange={handleSelectAllToggle}
                                            className="w-4 h-4 rounded border-gray-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus-visible:ring-indigo-500 cursor-pointer"
                                        />
                                    </div>
                                </th>
                                <th className="text-left px-2 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide" style={{ width: "88px" }}>
                                    <div className="flex items-center gap-1">
                                        <span>#</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowDuplicateNamesOnly((prev) => !prev)}
                                            className={`h-6 px-2 rounded-md border text-[10px] tracking-normal normal-case transition-colors cursor-pointer ${showDuplicateNamesOnly
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                                }`}
                                            title="Filter duplicate names"
                                        >
                                            <StickyNotes size={12} />
                                        </button>
                                    </div>
                                </th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide" style={{ width: "240px" }}>Employee</th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "160px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className={`h-8 text-xs border transition-colors px-2 rounded-md font-semibold flex items-center gap-1 outline-none uppercase tracking-wide w-full shrink-0 ${selectedEmpPrefixes.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-transparent border-0 text-gray-500 hover:bg-gray-100'}`}>
                                            <span className="truncate">
                                                {selectedEmpPrefixes.length === 0
                                                    ? 'IDs (All)'
                                                    : selectedEmpPrefixes.length === 1
                                                        ? `ID: ${selectedEmpPrefixes[0]}`
                                                        : `IDs (${selectedEmpPrefixes.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0 ml-0.5" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[180px] max-h-[300px] overflow-y-auto p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedEmpPrefixes(empCodePrefixes);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left bg-transparent border-none"
                                                    style={{ flex: 1 }}
                                                >
                                                    All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedEmpPrefixes([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right bg-transparent border-none"
                                                    style={{ flex: 1 }}
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <div className="py-1">
                                                {empCodePrefixes.map(prefix => {
                                                    const isChecked = selectedEmpPrefixes.includes(prefix);
                                                    return (
                                                        <DropdownMenuCheckboxItem
                                                            key={prefix}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedEmpPrefixes([...selectedEmpPrefixes, prefix]);
                                                                } else {
                                                                    setSelectedEmpPrefixes(selectedEmpPrefixes.filter(item => item !== prefix));
                                                                }
                                                            }}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                        >
                                                            {prefix}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "180px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedBiometricFilters.length === 0
                                                    ? 'Biometrics (All)'
                                                    : selectedBiometricFilters.length === 1
                                                        ? selectedBiometricFilters[0]
                                                        : `Bio (${selectedBiometricFilters.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedBiometricFilters(['Finger', 'Face', 'No Finger', 'No face', 'None']);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedBiometricFilters([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div className="py-1">
                                                {(['Finger', 'Face', 'No Finger', 'No face', 'None'] as const).map((item) => {
                                                    const isChecked = selectedBiometricFilters.includes(item);
                                                    return (
                                                        <DropdownMenuCheckboxItem
                                                            key={item}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedBiometricFilters([...selectedBiometricFilters, item]);
                                                                } else {
                                                                    setSelectedBiometricFilters(selectedBiometricFilters.filter(v => v !== item));
                                                                }
                                                            }}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                        >
                                                            {item}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "180px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedLocations.length === 0
                                                    ? 'Location (All)'
                                                    : selectedLocations.length === 1
                                                        ? selectedLocations[0]
                                                        : `Loc (${selectedLocations.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[180px] max-h-[300px] overflow-y-auto p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedLocations(uniqueLocations);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-855 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedLocations([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-855 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div className="py-1">
                                                {uniqueLocations.map(loc => {
                                                    const isChecked = selectedLocations.includes(loc);
                                                    return (
                                                        <DropdownMenuCheckboxItem
                                                            key={loc}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedLocations([...selectedLocations, loc]);
                                                                } else {
                                                                    setSelectedLocations(selectedLocations.filter(item => item !== loc));
                                                                }
                                                            }}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                        >
                                                            {loc}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "150px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedDepartments.length === 0 && selectedDesignations.length === 0
                                                    ? 'Department (All)'
                                                    : selectedDepartments.length + selectedDesignations.length === 1
                                                        ? selectedDepartments[0]
                                                            ? `Dept: ${selectedDepartments[0]}`
                                                            : `Desig: ${selectedDesignations[0]}`
                                                        : `Dept/Desig (${selectedDepartments.length + selectedDesignations.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[240px] max-h-[320px] overflow-hidden p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedDepartments(uniqueDepartments);
                                                        setSelectedDesignations(uniqueDesignations);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedDepartments([]);
                                                        setSelectedDesignations([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div onClick={(e) => e.stopPropagation()} className="p-2 pb-1">
                                                <Tabs
                                                    value={deptDesignationFilterTab}
                                                    onValueChange={(value) => setDeptDesignationFilterTab(value as 'department' | 'designation')}
                                                    className="w-full"
                                                >
                                                    <TabsList style={{ border: "", padding: "0.25rem 0.5rem" }} className="grid grid-cols-2 h-10 rounded-xl bg-gray-100/80 w-full relative">
                                                        <TabsTrigger
                                                            style={{ margin: 0 }}
                                                            value="department"
                                                            className="relative text-xs font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                                                        >
                                                            <span className="relative z-10">Department</span>
                                                            {deptDesignationFilterTab === 'department' && (
                                                                <motion.div
                                                                    layoutId="activeTabBackgroundDeptDesigFilter"
                                                                    className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                                                />
                                                            )}
                                                        </TabsTrigger>
                                                        <TabsTrigger
                                                            style={{ margin: 0 }}
                                                            value="designation"
                                                            className="relative text-xs font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                                                        >
                                                            <span className="relative z-10">Designation</span>
                                                            {deptDesignationFilterTab === 'designation' && (
                                                                <motion.div
                                                                    layoutId="activeTabBackgroundDeptDesigFilter"
                                                                    className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                                                />
                                                            )}
                                                        </TabsTrigger>
                                                    </TabsList>

                                                    <TabsContent value="department" className="mt-2 max-h-[220px] overflow-y-auto pr-1">
                                                        <div className="py-1">
                                                            {uniqueDepartments.map(dept => {
                                                                const isChecked = selectedDepartments.includes(dept);
                                                                return (
                                                                    <DropdownMenuCheckboxItem
                                                                        key={dept}
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedDepartments([...selectedDepartments, dept]);
                                                                            } else {
                                                                                setSelectedDepartments(selectedDepartments.filter(item => item !== dept));
                                                                            }
                                                                        }}
                                                                        onSelect={(e) => e.preventDefault()}
                                                                        className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                                    >
                                                                        {dept}
                                                                    </DropdownMenuCheckboxItem>
                                                                );
                                                            })}
                                                        </div>
                                                    </TabsContent>

                                                    <TabsContent value="designation" className="mt-2 max-h-[220px] overflow-y-auto pr-1">
                                                        <div className="py-1">
                                                            {uniqueDesignations.map(designation => {
                                                                const isChecked = selectedDesignations.includes(designation);
                                                                return (
                                                                    <DropdownMenuCheckboxItem
                                                                        key={designation}
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedDesignations([...selectedDesignations, designation]);
                                                                            } else {
                                                                                setSelectedDesignations(selectedDesignations.filter(item => item !== designation));
                                                                            }
                                                                        }}
                                                                        onSelect={(e) => e.preventDefault()}
                                                                        className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                                    >
                                                                        {designation}
                                                                    </DropdownMenuCheckboxItem>
                                                                );
                                                            })}
                                                        </div>
                                                    </TabsContent>
                                                </Tabs>
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "150px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedTypes.length === 0 && selectedNationalities.length === 0
                                                    ? 'Type/Nat (All)'
                                                    : selectedTypes.length + selectedNationalities.length === 1
                                                        ? selectedTypes[0]
                                                            ? `Type: ${selectedTypes[0].toUpperCase()}`
                                                            : `Nat: ${selectedNationalities[0].toUpperCase()}`
                                                        : `Type/Nat (${selectedTypes.length + selectedNationalities.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[240px] max-h-[320px] overflow-hidden p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedTypes(['staff', 'worker']);
                                                        setSelectedNationalities(uniqueNationalities);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedTypes([]);
                                                        setSelectedNationalities([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div onClick={(e) => e.stopPropagation()} className="p-2 pb-1">
                                                <Tabs
                                                    value={typeNationalityFilterTab}
                                                    onValueChange={(value) => setTypeNationalityFilterTab(value as 'type' | 'nationality')}
                                                    className="w-full"
                                                >
                                                    <TabsList style={{ border: "", padding: "0.25rem 0.5rem" }} className="grid grid-cols-2 h-10 rounded-xl bg-gray-100/80 w-full relative">
                                                        <TabsTrigger
                                                            style={{ margin: 0 }}
                                                            value="type"
                                                            className="relative text-xs font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                                                        >
                                                            <span className="relative z-10">Type</span>
                                                            {typeNationalityFilterTab === 'type' && (
                                                                <motion.div
                                                                    layoutId="activeTabBackgroundTypeNatFilter"
                                                                    className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                                                />
                                                            )}
                                                        </TabsTrigger>
                                                        <TabsTrigger
                                                            style={{ margin: 0 }}
                                                            value="nationality"
                                                            className="relative text-xs font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                                                        >
                                                            <span className="relative z-10">Nationality</span>
                                                            {typeNationalityFilterTab === 'nationality' && (
                                                                <motion.div
                                                                    layoutId="activeTabBackgroundTypeNatFilter"
                                                                    className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                                                />
                                                            )}
                                                        </TabsTrigger>
                                                    </TabsList>

                                                    <TabsContent value="type" className="mt-2 max-h-[220px] overflow-y-auto pr-1">
                                                        <div className="py-1">
                                                            <DropdownMenuCheckboxItem
                                                                checked={selectedTypes.includes('staff')}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedTypes([...selectedTypes, 'staff']);
                                                                    } else {
                                                                        setSelectedTypes(selectedTypes.filter(t => t !== 'staff'));
                                                                    }
                                                                }}
                                                                onSelect={(e) => e.preventDefault()}
                                                                className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                            >
                                                                STAFF
                                                            </DropdownMenuCheckboxItem>
                                                            <DropdownMenuCheckboxItem
                                                                checked={selectedTypes.includes('worker')}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedTypes([...selectedTypes, 'worker']);
                                                                    } else {
                                                                        setSelectedTypes(selectedTypes.filter(t => t !== 'worker'));
                                                                    }
                                                                }}
                                                                onSelect={(e) => e.preventDefault()}
                                                                className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                            >
                                                                WORKER
                                                            </DropdownMenuCheckboxItem>
                                                        </div>
                                                    </TabsContent>

                                                    <TabsContent value="nationality" className="mt-2 max-h-[220px] overflow-y-auto pr-1">
                                                        <div className="py-1">
                                                            {uniqueNationalities.map(nat => {
                                                                const isChecked = selectedNationalities.includes(nat);
                                                                return (
                                                                    <DropdownMenuCheckboxItem
                                                                        key={nat}
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedNationalities([...selectedNationalities, nat]);
                                                                            } else {
                                                                                setSelectedNationalities(selectedNationalities.filter(item => item !== nat));
                                                                            }
                                                                        }}
                                                                        onSelect={(e) => e.preventDefault()}
                                                                        className="rounded-md focus:bg-gray-50 cursor-pointer text-xs uppercase"
                                                                    >
                                                                        {nat}
                                                                    </DropdownMenuCheckboxItem>
                                                                );
                                                            })}
                                                        </div>
                                                    </TabsContent>
                                                </Tabs>
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "110px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedShifts.length === 0
                                                    ? 'Shift (All)'
                                                    : selectedShifts.length === 1
                                                        ? selectedShifts[0].toUpperCase()
                                                        : `Shift (${selectedShifts.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[160px] max-h-[220px] overflow-y-auto p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedShifts(uniqueShifts);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedShifts([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div className="py-1">
                                                {uniqueShifts.map((shift) => {
                                                    const isChecked = selectedShifts.includes(shift);
                                                    return (
                                                        <DropdownMenuCheckboxItem
                                                            key={shift}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedShifts([...selectedShifts, shift]);
                                                                } else {
                                                                    setSelectedShifts(selectedShifts.filter(v => v !== shift));
                                                                }
                                                            }}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs uppercase"
                                                        >
                                                            {shift}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "120px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedStatuses.length === 0
                                                    ? 'Status (All)'
                                                    : selectedStatuses.length === 1
                                                        ? selectedStatuses[0].toUpperCase()
                                                        : `Status (${selectedStatuses.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[170px] max-h-[220px] overflow-y-auto p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedStatuses(uniqueStatuses);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedStatuses([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div className="py-1">
                                                {uniqueStatuses.map((status) => {
                                                    const isChecked = selectedStatuses.includes(status);
                                                    return (
                                                        <DropdownMenuCheckboxItem
                                                            key={status}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedStatuses([...selectedStatuses, status]);
                                                                } else {
                                                                    setSelectedStatuses(selectedStatuses.filter((value) => value !== status));
                                                                }
                                                            }}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs uppercase"
                                                        >
                                                            {status}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "200px" }}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                                            <span className="truncate">
                                                {selectedCompanies.length === 0
                                                    ? 'Company (All)'
                                                    : selectedCompanies.length === 1
                                                        ? selectedCompanies[0]
                                                        : `Co. (${selectedCompanies.length})`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[200px] max-h-[300px] overflow-y-auto p-0 z-50">
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedCompanies(uniqueCompanies);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-left"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setSelectedCompanies([]);
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-500 hover:text-gray-850 cursor-pointer text-right"
                                                    style={{ background: "none", flex: 1 }}
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                            <div className="py-1">
                                                {uniqueCompanies.map(comp => {
                                                    const isChecked = selectedCompanies.includes(comp);
                                                    return (
                                                        <DropdownMenuCheckboxItem
                                                            key={comp}
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedCompanies([...selectedCompanies, comp]);
                                                                } else {
                                                                    setSelectedCompanies(selectedCompanies.filter(item => item !== comp));
                                                                }
                                                            }}
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                                                        >
                                                            {comp}
                                                        </DropdownMenuCheckboxItem>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </th>
                                {/* <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actions</th> */}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredEmployees.slice(0, renderLimit).map((emp, idx) => (
                                <tr
                                    onClick={() => {
                                        if (isSelectionMode) {
                                            toggleSelectEmployee(emp.id);
                                        } else if (canEditAttendance) {
                                            setEditingEmployee(emp);
                                            setEditName(emp.name);
                                            setEditDeviceUserId(emp.device_user_id);
                                            setEditDept(emp.department || '');
                                            setEditEmail(emp.email || '');
                                            setEditEmpId(emp.emp_id || '');
                                            setEditEmpType(emp.emp_type || 'staff');
                                            setEditShift(emp.shift || 'day');
                                            setEditStatus(normalizeEmployeeStatus(emp.status));
                                            setEditNationality(emp.nationality || '');
                                            setEditCivilId(emp.civil_id || '');
                                            setEditDoj(emp.doj || '');
                                            setEditPhone(emp.phone || '');
                                            setEditCug(emp.cug || '');
                                            setEditDesignation(emp.designation || '');
                                            setEditCompany(emp.company || '');
                                        }
                                    }}
                                    key={emp.id} className={`hover:bg-gray-50 transition-colors ${isSelectionMode || canEditAttendance ? 'cursor-pointer' : 'cursor-default'}`}>
                                    <td
                                        className="transition-[width,opacity] duration-200 ease-in-out overflow-hidden p-0"
                                        style={{
                                            width: isSelectionMode ? "48px" : "0px",
                                            opacity: isSelectionMode ? 1 : 0,
                                            pointerEvents: isSelectionMode ? "auto" : "none"
                                        }}
                                    >
                                        <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
                                            <Checkbox
                                                checked={selectedEmployeeIds.has(emp.id)}
                                                onCheckedChange={() => toggleSelectEmployee(emp.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-4 h-4 rounded border-gray-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus-visible:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                    </td>
                                    {/* S.No. */}
                                    <td className="px-4 py-3 text-xs text-gray-400 font-medium">
                                        {idx + 1}
                                    </td>
                                    {/* Name and Email */}
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2.5" style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
                                            <Avatar size={"md"} name={emp.name} index={idx} />
                                            <div style={{ display: "flex", flexFlow: "column" }}>
                                                <div className="font-medium text-gray-900" style={{ textAlign: "left", textTransform: "capitalize" }}>{emp.name.toLowerCase()}</div>
                                                {/* {emp.email && (
                                                    <div className="text-xs text-gray-400">{emp.email}</div>
                                                )} */}
                                            </div>
                                        </div>
                                    </td>
                                    {/* IDs */}
                                    <td className="px-4 py-3">
                                        <div style={{ display: "flex", flexFlow: "column", gap: "2px" }}>
                                            <div className="text-xs text-gray-500">ID: <span className="font-medium text-gray-800">{emp.emp_id ?? '—'}</span></div>
                                            <div className="text-xs text-gray-400">Device ID: <span className="font-mono text-gray-700">{emp.device_user_id}</span></div>
                                        </div>
                                    </td>
                                    {/* Biometrics */}
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1.5" style={{ border: "", justifyContent: "flex-start" }}>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium  ${(emp.fingerprint_templates && Object.keys(emp.fingerprint_templates).length > 0) ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                <Fingerprint className="w-3.5 h-3.5" /> Finger
                                            </span>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium  ${(emp.face_templates && Object.keys(emp.face_templates).length > 0) ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                <Scan className="w-3.5 h-3.5" /> Face
                                            </span>
                                        </div>
                                    </td>
                                    {/* Location */}
                                    <td className="px-4 py-3 text-gray-500 font-medium">
                                        {verifiedLocations[emp.id] ? (
                                            <div className="flex items-center gap-1 text-emerald-700"
                                                style={{ display: "flex", alignItems: "center", gap: "0.25rem", justifyContent: "flex-start" }}>
                                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                <span>{verifiedLocations[emp.id]}</span>
                                            </div>
                                        ) : (
                                            employeeLocations[emp.device_user_id] ?? emp.location ?? '—'
                                        )}
                                    </td>
                                    {/* Dept and Designation */}
                                    <td className="px-4 py-3">
                                        <div style={{ display: "flex", flexFlow: "column", gap: "2px" }}>
                                            <div className="text-sm font-medium text-gray-800">{emp.department ?? '—'}</div>
                                            <div className="text-xs text-gray-500">{emp.designation ?? '—'}</div>
                                        </div>
                                    </td>
                                    {/* Type and Nationality */}
                                    <td className="px-4 py-3">
                                        <div style={{ display: "flex", flexFlow: "column", gap: "4px", justifyContent: "center", alignItems: "center" }}>
                                            <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-xs font-medium ${emp.emp_type === 'staff'
                                                ? 'bg-blue-50 text-blue-700'
                                                : emp.emp_type === 'worker'
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                {emp.emp_type ? emp.emp_type.toUpperCase() : '—'}
                                            </span>
                                            <div className="text-xs text-gray-500">{emp.nationality ?? '—'}</div>
                                        </div>
                                    </td>
                                    {/* Shift */}
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-xs font-medium ${((emp.shift || 'day') === 'night')
                                            ? 'bg-slate-100 text-slate-700'
                                            : 'bg-emerald-50 text-emerald-700'
                                            }`}>
                                            {(emp.shift || 'day').toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const status = normalizeEmployeeStatus(emp.status);
                                            return (
                                                <span style={{ textTransform: status === 'OM50' ? 'none' : 'capitalize' }} className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-xs font-medium ${status === 'Active'
                                                    ? 'bg-teal-50 text-teal-700'
                                                    : status === 'Inactive'
                                                        ? 'bg-rose-50 text-rose-700'
                                                        : status === 'Leave'
                                                            ? 'bg-amber-50 text-amber-700'
                                                            : status === 'Long Leave'
                                                                ? 'bg-orange-50 text-orange-700'
                                                                : status === 'OM50'
                                                                    ? 'bg-sky-50 text-sky-700'
                                                                    : 'bg-rose-50 text-rose-700'
                                                    }`}>
                                                    {status === 'OM50' ? 'OM50' : status}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    {/* Company */}
                                    <td className="px-4 py-3 text-xs text-gray-700 font-medium">
                                        {emp.company ?? '—'}
                                    </td>
                                    {/* Actions */}
                                    {/* <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                setEditingEmployee(emp);
                                                setEditName(emp.name);
                                                setEditDeviceUserId(emp.device_user_id);
                                                setEditDept(emp.department || '');
                                                setEditEmail(emp.email || '');
                                                setEditEmpId(emp.emp_id || '');
                                                setEditEmpType(emp.emp_type || 'staff');
                                                setEditNationality(emp.nationality || '');
                                                setEditDesignation(emp.designation || '');
                                                setEditCompany(emp.company || '');
                                            }}
                                            className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                                            title="Edit Employee"
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                    </td> */}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {filteredEmployees.length > renderLimit && (
                    <div className="p-4 border-t border-gray-50 flex items-center justify-center gap-4 bg-white/80 backdrop-blur-xs sticky bottom-0 z-10">
                        <span className="text-xs text-gray-500 font-medium text-center">
                            Showing {renderLimit} of {filteredEmployees.length} employees
                        </span>
                        <Button
                            variant="outline"
                            onClick={() => setRenderLimit(prev => prev + 100)}
                            className="text-xs font-semibold h-9 rounded-xl hover:bg-gray-50 border-gray-150 transition-colors shadow-xs px-4"
                        >
                            Load More
                        </Button>
                    </div>
                )}
            </div>

            <ResponsiveModal
                open={editingEmployee !== null}
                onOpenChange={(open) => { if (!open) setEditingEmployee(null); }}
                title="Edit Employee"
                description="Modify employee details or synchronize templates to biometric terminals."
                hideHeader
                contentStyle={{ padding: 0, width: "100%", maxWidth: "500px" }}
            >
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'profile' | 'sync')} className="flex flex-col h-[650px] max-h-[92vh] overflow-hidden bg-white md:rounded-2xl w-full">
                    <div className="p-6 pb-4 border-b border-gray-50 shrink-0">
                        <h3 style={{ fontWeight: "600" }} className="text-lg font-bold text-gray-900">Edit Employee</h3>

                    </div>

                    {/* Tabs Header */}
                    <div style={{ width: "100%" }} className="px-6 py-3 bg-gray-50/30 border-b border-gray-100 shrink-0">
                        <TabsList style={{ border: "", padding: "0.1rem 0.5rem" }} className="grid grid-cols-2 h-12 rounded-xl bg-gray-100/80 w-full relative">
                            <TabsTrigger
                                style={{ margin: 0 }}
                                value="profile"
                                className="relative font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                            >
                                <span className="relative z-10">Profile Details</span>
                                {activeTab === 'profile' && (
                                    <motion.div
                                        layoutId="activeTabBackgroundEdit"
                                        className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                style={{ margin: 0 }}
                                value="sync"
                                className="relative font-semibold rounded-lg text-gray-555 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                            >
                                <span className="relative z-10">Device Sync</span>
                                {activeTab === 'sync' && (
                                    <motion.div
                                        layoutId="activeTabBackgroundEdit"
                                        className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="profile" className="h-[500px] mt-0 overflow-hidden w-full">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col h-full w-full overflow-hidden"
                        >
                            <form onSubmit={handleEditSubmit} className="flex flex-col h-full justify-between overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-550 block">Device User ID</label>
                                            <Input
                                                type="text"
                                                value={editDeviceUserId}
                                                onChange={(e) => setEditDeviceUserId(e.target.value)}
                                                className="font-mono text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Employee ID (HR)</label>
                                            <Input
                                                type="text"
                                                value={editEmpId}
                                                onChange={(e) => setEditEmpId(e.target.value)}
                                                placeholder="SS0001"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">Civil ID</label>
                                        <Input
                                            type="text"
                                            value={editCivilId}
                                            onChange={(e) => setEditCivilId(e.target.value)}
                                            placeholder="Enter Civil ID"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Date of Joining</label>
                                            <Input
                                                type="date"
                                                value={editDoj}
                                                onChange={(e) => setEditDoj(e.target.value)}
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Phone</label>
                                            <Input
                                                type="tel"
                                                value={editPhone}
                                                onChange={(e) => setEditPhone(e.target.value)}
                                                placeholder="Enter phone number"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">CUG</label>
                                        <Input
                                            type="tel"
                                            value={editCug}
                                            onChange={(e) => setEditCug(e.target.value)}
                                            placeholder="Enter CUG number"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">Full Name <span className="text-red-500">*</span></label>
                                        <Input
                                            type="text"
                                            required
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            placeholder="e.g. John Smith"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Department</label>
                                            <Input
                                                type="text"
                                                value={editDept}
                                                onChange={(e) => setEditDept(e.target.value)}
                                                placeholder="e.g. Operations"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Designation</label>
                                            <Input
                                                type="text"
                                                value={editDesignation}
                                                onChange={(e) => setEditDesignation(e.target.value)}
                                                placeholder="e.g. Engineer"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Employee Type</label>
                                            <Select value={editEmpType} onValueChange={(e) => setEditEmpType(e as 'staff' | 'worker')}>
                                                <SelectTrigger className="text-sm bg-gray-50 border-gray-100 rounded-xl">
                                                    <SelectValue placeholder="Select Employee Type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="staff">Staff</SelectItem>
                                                    <SelectItem value="worker">Worker</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Shift</label>
                                            <Select value={editShift} onValueChange={(e) => setEditShift(e as 'day' | 'night')}>
                                                <SelectTrigger className="text-sm bg-gray-50 border-gray-100 rounded-xl">
                                                    <SelectValue placeholder="Select Shift" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="day">Day</SelectItem>
                                                    <SelectItem value="night">Night</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Status</label>
                                            <Select value={editStatus} onValueChange={(value) => setEditStatus(value as EmployeeStatus)}>
                                                <SelectTrigger className="text-sm bg-gray-50 border-gray-100 rounded-xl">
                                                    <SelectValue placeholder="Select Status" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                                     {EMPLOYEE_STATUSES.map((status) => (
                                                         <SelectItem key={status} value={status} className="rounded-md focus:bg-gray-50 cursor-pointer">{status.toUpperCase()}</SelectItem>
                                                     ))}
                                                 </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Nationality</label>
                                            <Select value={editNationality} onValueChange={(e) => setEditNationality(e)}>
                                                <SelectTrigger className="text-sm bg-gray-50 border-gray-100 rounded-xl">
                                                    <SelectValue placeholder="Select Nationality" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {NATIONALITIES.map((nat) => (
                                                        <SelectItem key={nat} value={nat}>
                                                            {nat.toUpperCase()}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">Company</label>
                                        <Input
                                            type="text"
                                            value={editCompany}
                                            onChange={(e) => setEditCompany(e.target.value)}
                                            placeholder="e.g. Acme Corp"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">Email</label>
                                        <Input
                                            type="email"
                                            value={editEmail}
                                            onChange={(e) => setEditEmail(e.target.value)}
                                            placeholder="john@company.com"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl"
                                        />
                                    </div>
                                </div>

                                <div className="p-6 border-t border-gray-50 bg-white shrink-0 flex gap-3 w-full">
                                    <Button
                                        className="flex-1 h-10 rounded-xl"
                                        type="button"
                                        variant="outline"
                                        onClick={() => setEditingEmployee(null)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button className="flex-1 h-10 rounded-xl" type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </TabsContent>

                    <TabsContent style={{ width: "100%" }} value="sync" className="h-[500px] mt-0 overflow-hidden w-full">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col h-full w-full overflow-hidden"
                        >
                            <div className="flex-grow overflow-y-auto p-6 space-y-5 w-full">
                                <div className="space-y-1.5 w-full">
                                    <label className="text-xs font-semibold text-gray-500 block">Device Action</label>
                                    <Select value={syncAction} onValueChange={(val) => setSyncAction(val as 'push' | 'fetch')}>
                                        <SelectTrigger className=" bg-gray-50 border-gray-105 rounded-xl h-10 w-full focus:bg-white transition-all">
                                            <SelectValue placeholder="Select Action" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                            <SelectItem value="push" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                Push to Device(s)
                                            </SelectItem>
                                            <SelectItem value="fetch" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                Fetch from Device(s)
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {syncAction === 'push' && (
                                    <div className="space-y-1.5 w-full">
                                        <label className="text-xs font-semibold text-gray-500 block">Select Data to Push</label>
                                        <Select value={pushType} onValueChange={(val) => setPushType(val as 'all' | 'user_info' | 'finger' | 'face')}>
                                            <SelectTrigger className=" bg-gray-50 border-gray-105 rounded-xl h-10 w-full focus:bg-white transition-all">
                                                <SelectValue placeholder="Select Data Type" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                                <SelectItem value="all" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                    All together
                                                </SelectItem>
                                                <SelectItem value="user_info" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                    User Info Only
                                                </SelectItem>
                                                <SelectItem value="finger" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                    Fingerprint Only
                                                </SelectItem>
                                                <SelectItem value="face" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                    Face Only
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Common Device Selector */}
                                <div className="space-y-2.5 w-full">
                                    <div style={{ justifyContent: "space-between", border: "", height: "2rem" }} className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-gray-550 block">Select Devices</label>
                                        {selectedPushDevices.size > 0 && (
                                            <button
                                                style={{ padding: "0.1rem 0.5rem", borderRadius: "0.25rem" }}
                                                type="button"
                                                onClick={() => setSelectedPushDevices(new Set())}
                                                className="text-[10px] text-gray-400 hover:text-indigo-600 transition-all font-medium"
                                            >
                                                Clear Selection
                                            </button>
                                        )}
                                    </div>

                                    {loadingDevices ? (
                                        <div className="text-xs text-gray-400 flex items-center gap-2 py-4 justify-center">
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Loading devices...
                                        </div>
                                    ) : devices.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-4 text-center">No registered devices found.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1 w-full">
                                            {devices.map(device => {
                                                const isChecked = selectedPushDevices.has(device.serial_no);
                                                const isOnline = device.last_seen
                                                    ? (new Date().getTime() - new Date(device.last_seen).getTime()) < 90000
                                                    : false;
                                                return (
                                                    <div
                                                        key={device.id}
                                                        onClick={() => {
                                                            setSelectedPushDevices(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(device.serial_no)) next.delete(device.serial_no);
                                                                else next.add(device.serial_no);
                                                                return next;
                                                            });
                                                        }}
                                                        className={`flex items-center gap-2 p-2.5 px-2.5 rounded-lg border cursor-pointer select-none transition-all ${isChecked
                                                            ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                                                            : 'border-gray-100 hover:border-gray-200 bg-white'
                                                            }`}
                                                    >
                                                        <div
                                                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all shrink-0 ${isChecked
                                                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                                                : 'border-gray-300 bg-white'
                                                                }`}
                                                        >
                                                            {isChecked && (
                                                                <svg className="w-2 h-2 fill-current" viewBox="0 0 20 20">
                                                                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                                            <div className="min-w-0 flex-1">
                                                                <span style={{ fontWeight: 500 }} className=" text-[11px] text-gray-850 truncate block leading-tight">
                                                                    {device.serial_no}
                                                                </span>
                                                                {device.location && (
                                                                    <span className="text-[12px] text-gray-400 truncate block leading-tight">
                                                                        {device.location}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-50 bg-white shrink-0 w-full">
                                {syncAction === 'push' ? (
                                    <div className="flex gap-3">
                                        <Button
                                            className="flex-1 h-10 rounded-xl"
                                            type="button"
                                            variant="outline"
                                            onClick={() => setEditingEmployee(null)}
                                            disabled={isPushing}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={isPushing || selectedPushDevices.size === 0 || !editingEmployee}
                                            onClick={handleIndividualPush}
                                            className="flex-1 h-10 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl transition-all flex items-center justify-center gap-1.5"
                                        >
                                            {isPushing ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    Pushing...
                                                </>
                                            ) : (
                                                <>
                                                    Push to Devices ({selectedPushDevices.size})
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex gap-3">
                                        <Button
                                            className="flex-1 h-10 rounded-xl"
                                            type="button"
                                            variant="outline"
                                            onClick={() => setEditingEmployee(null)}
                                            disabled={isFetching}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={isFetching || selectedPushDevices.size === 0 || !editingEmployee}
                                            onClick={handleFetchBiometrics}
                                            className="flex-1 h-10 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl transition-all flex items-center justify-center gap-1.5"
                                        >
                                            {isFetching ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    Requesting Fetch...
                                                </>
                                            ) : (
                                                <>
                                                    Fetch Biometrics ({selectedPushDevices.size})
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </TabsContent>
                </Tabs>
            </ResponsiveModal>

            {/* Add Employee Dialog */}
            <ResponsiveModal
                open={isAdding}
                onOpenChange={setIsAdding}
                title="Add Employee"
                description="Create a new employee record and optionally push it to biometric devices."
                hideHeader
                contentStyle={{ padding: 0, width: "100%", maxWidth: "500px" }}
            >
                <Tabs value={addActiveTab} onValueChange={(val) => setAddActiveTab(val as 'profile' | 'sync')} className="flex flex-col h-[650px] max-h-[92vh] overflow-hidden bg-white md:rounded-2xl w-full">
                    <div className="p-6 pb-4 border-b border-gray-50 shrink-0 bg-white">
                        <h3 style={{ fontWeight: "600" }} className="text-lg font-bold text-gray-900">Add Employee</h3>
                    </div>

                    {/* Tabs Header */}
                    <div style={{ width: "100%" }} className="px-6 py-3 bg-gray-50/30 border-b border-gray-100 shrink-0">
                        <TabsList style={{ border: "", padding: "0.1rem 0.5rem" }} className="grid grid-cols-2 h-12 rounded-xl bg-gray-100/80 w-full relative">
                            <TabsTrigger
                                style={{ margin: 0 }}
                                value="profile"
                                className="relative font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                            >
                                <span className="relative z-10">Profile Details</span>
                                {addActiveTab === 'profile' && (
                                    <motion.div
                                        layoutId="activeTabBackgroundAdd"
                                        className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                style={{ margin: 0 }}
                                value="sync"
                                className="relative font-semibold rounded-lg text-gray-500 data-[state=active]:text-gray-900 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 cursor-pointer z-10"
                            >
                                <span className="relative z-10">Device Sync</span>
                                {addActiveTab === 'sync' && (
                                    <motion.div
                                        layoutId="activeTabBackgroundAdd"
                                        className="absolute inset-0 bg-white rounded-lg shadow-xs z-0"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="profile" className="h-[500px] mt-0 overflow-hidden w-full">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col h-full w-full overflow-hidden"
                        >
                            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col h-full justify-between overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-550 block">Device User ID <span className="text-red-500">*</span></label>
                                            <Input
                                                type="text"
                                                required
                                                value={addDeviceUserId}
                                                onChange={(e) => setAddDeviceUserId(e.target.value)}
                                                placeholder="e.g. 110525"
                                                className="font-mono text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-550 block">Employee ID (HR)</label>
                                            <Input
                                                type="text"
                                                value={addEmpId}
                                                onChange={(e) => setAddEmpId(e.target.value)}
                                                placeholder="e.g. EMP-045"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">Civil ID</label>
                                        <Input
                                            type="text"
                                            value={addCivilId}
                                            onChange={(e) => setAddCivilId(e.target.value)}
                                            placeholder="Enter Civil ID"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Date of Joining</label>
                                            <Input
                                                type="date"
                                                value={addDoj}
                                                onChange={(e) => setAddDoj(e.target.value)}
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Phone</label>
                                            <Input
                                                type="tel"
                                                value={addPhone}
                                                onChange={(e) => setAddPhone(e.target.value)}
                                                placeholder="Enter phone number"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">CUG</label>
                                        <Input
                                            type="tel"
                                            value={addCug}
                                            onChange={(e) => setAddCug(e.target.value)}
                                            placeholder="Enter CUG number"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Full Name <span className="text-red-500">*</span></label>
                                            <Input
                                                type="text"
                                                required
                                                value={addName}
                                                onChange={(e) => setAddName(e.target.value)}
                                                placeholder="e.g. John Smith"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Email</label>
                                            <Input
                                                type="email"
                                                value={addEmail}
                                                onChange={(e) => setAddEmail(e.target.value)}
                                                placeholder="john@company.com"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Department</label>
                                            <Input
                                                type="text"
                                                value={addDept}
                                                onChange={(e) => setAddDept(e.target.value)}
                                                placeholder="e.g. Operations"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Designation</label>
                                            <Input
                                                type="text"
                                                value={addDesignation}
                                                onChange={(e) => setAddDesignation(e.target.value)}
                                                placeholder="e.g. Engineer"
                                                className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Employee Type</label>
                                            <Select value={addEmpType} onValueChange={(e) => setAddEmpType(e as 'staff' | 'worker')}>
                                                <SelectTrigger className="text-xs bg-gray-50 border-gray-100 rounded-xl h-10 w-full focus:bg-white transition-all">
                                                    <SelectValue placeholder="Select Employee Type" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                                    <SelectItem value="staff" className="rounded-md focus:bg-gray-50 cursor-pointer">Staff</SelectItem>
                                                    <SelectItem value="worker" className="rounded-md focus:bg-gray-50 cursor-pointer">Worker</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Shift</label>
                                            <Select value={addShift} onValueChange={(e) => setAddShift(e as 'day' | 'night')}>
                                                <SelectTrigger className="text-xs bg-gray-50 border-gray-100 rounded-xl h-10 w-full focus:bg-white transition-all">
                                                    <SelectValue placeholder="Select Shift" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                                    <SelectItem value="day" className="rounded-md focus:bg-gray-50 cursor-pointer">Day</SelectItem>
                                                    <SelectItem value="night" className="rounded-md focus:bg-gray-50 cursor-pointer">Night</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Status</label>
                                            <Select value={addStatus} onValueChange={(value) => setAddStatus(value as EmployeeStatus)}>
                                                <SelectTrigger className="text-xs bg-gray-50 border-gray-100 rounded-xl h-10 w-full focus:bg-white transition-all">
                                                    <SelectValue placeholder="Select Status" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                                    {EMPLOYEE_STATUSES.map((status) => (
                                                        <SelectItem key={status} value={status} className="rounded-md focus:bg-gray-50 cursor-pointer">{status.toUpperCase()}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-gray-555 block">Nationality</label>
                                            <Select value={addNationality} onValueChange={(e) => setAddNationality(e)}>
                                                <SelectTrigger className="text-xs bg-gray-50 border-gray-100 rounded-xl h-10 w-full focus:bg-white transition-all">
                                                    <SelectValue placeholder="Select Nationality" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                                    {NATIONALITIES.map((nat) => (
                                                        <SelectItem key={nat} value={nat} className="rounded-md focus:bg-gray-50 cursor-pointer">
                                                            {nat.toUpperCase()}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-gray-555 block">Company</label>
                                        <Input
                                            type="text"
                                            value={addCompany}
                                            onChange={(e) => setAddCompany(e.target.value)}
                                            placeholder="e.g. Acme Corp"
                                            className="text-sm bg-gray-50 border-gray-100 focus:bg-white transition-all rounded-xl h-10 w-full"
                                        />
                                    </div>
                                </div>

                                <div className="p-6 border-t border-gray-50 bg-white shrink-0 flex gap-3 w-full">
                                    <Button
                                        className="flex-1 h-10 rounded-xl"
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsAdding(false)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 h-10 rounded-xl bg-gray-900 text-white hover:bg-gray-700 transition-all font-semibold"
                                        type="button"
                                        onClick={() => setAddActiveTab('sync')}
                                    >
                                        Next: Device Sync
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </TabsContent>

                    <TabsContent value="sync" className="h-[500px] mt-0 overflow-hidden w-full">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col h-full w-full overflow-hidden"
                        >
                            <div className="flex-grow overflow-y-auto p-6 space-y-5 w-full">
                                {/* Device Selection Grid */}
                                <div className="space-y-2.5 w-full">
                                    <div style={{ justifyContent: "space-between", height: "2rem" }} className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-gray-550 block">Push to biometric devices</label>
                                        {selectedDevices.size > 0 && (
                                            <button
                                                style={{ padding: "0.1rem 0.5rem", borderRadius: "0.25rem" }}
                                                type="button"
                                                onClick={() => setSelectedDevices(new Set())}
                                                className="text-[10px] text-gray-400 hover:text-indigo-600 transition-all font-medium"
                                            >
                                                Clear Selection
                                            </button>
                                        )}
                                    </div>

                                    {loadingDevices ? (
                                        <div className="text-xs text-gray-400 flex items-center gap-2 py-4 justify-center">
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Loading devices...
                                        </div>
                                    ) : devices.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-4 text-center">No registered devices found.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1 w-full">
                                            {devices.map(device => {
                                                const isChecked = selectedDevices.has(device.serial_no);
                                                const isOnline = device.last_seen
                                                    ? (new Date().getTime() - new Date(device.last_seen).getTime()) < 90000
                                                    : false;
                                                return (
                                                    <div
                                                        key={device.id}
                                                        onClick={() => {
                                                            setSelectedDevices(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(device.serial_no)) next.delete(device.serial_no);
                                                                else next.add(device.serial_no);
                                                                return next;
                                                            });
                                                        }}
                                                        className={`flex items-center gap-2 p-2.5 px-2.5 rounded-lg border border-gray-100 cursor-pointer select-none transition-all ${isChecked
                                                            ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                                                            : ''
                                                            }`}
                                                    >
                                                        <div
                                                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isChecked
                                                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                                                : 'border-gray-300 bg-white'
                                                                }`}
                                                        >
                                                            {isChecked && (
                                                                <svg className="w-2 h-2 fill-current" viewBox="0 0 20 20">
                                                                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                                            <div className="min-w-0 flex-1">
                                                                <span style={{ fontWeight: 600 }} className=" text-[11px] text-gray-850 truncate block leading-tight">
                                                                    {device.serial_no}
                                                                </span>
                                                                {device.location && (
                                                                    <span className="text-[12px] text-gray-400 truncate block leading-tight">
                                                                        {device.location}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-50 bg-white shrink-0 w-full flex gap-3">
                                <Button
                                    className="flex-1 h-10 rounded-xl"
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsAdding(false)}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 h-10 rounded-xl"
                                    type="button"
                                    variant="secondary"
                                    onClick={(e) => handleAddSubmit(e, false)}
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Saving...' : 'Save only'}
                                </Button>
                                <Button
                                    className="flex-1 h-10 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 transition-all font-semibold"
                                    type="button"
                                    onClick={(e) => handleAddSubmit(e, true)}
                                    disabled={isSubmitting || selectedDevices.size === 0}
                                >
                                    {isSubmitting ? 'Saving...' : `Save & Push (${selectedDevices.size})`}
                                </Button>
                            </div>
                        </motion.div>
                    </TabsContent>
                </Tabs>
            </ResponsiveModal>

            {/* Bulk Change Department Dialog */}
            <Dialog open={isBulkDeptOpen} onOpenChange={(open) => { if (!open) setIsBulkDeptOpen(false); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Bulk Update Department</DialogTitle>
                        <DialogDescription>
                            Enter a new department for the {selectedEmployeeIds.size} selected employee(s).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkDeptSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-600 block">New Department</label>
                            <Input
                                type="text"
                                value={bulkDeptValue}
                                onChange={(e) => setBulkDeptValue(e.target.value)}
                                placeholder="e.g. Sales, Operations"
                            />
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkDeptOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Updating...' : 'Update Department'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Change Company Dialog */}
            <Dialog open={isBulkCompanyOpen} onOpenChange={(open) => { if (!open) setIsBulkCompanyOpen(false); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Bulk Update Company</DialogTitle>
                        <DialogDescription>
                            Enter a new company for the {selectedEmployeeIds.size} selected employee(s).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkCompanySubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-600 block">Company</label>
                            <Input
                                type="text"
                                value={bulkCompanyValue}
                                onChange={(e) => setBulkCompanyValue(e.target.value)}
                                placeholder="e.g. Acme Corp"
                            />
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkCompanyOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Updating...' : 'Update Company'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Change Employee Type Dialog */}
            <Dialog open={isBulkTypeOpen} onOpenChange={(open) => { if (!open) setIsBulkTypeOpen(false); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Bulk Update Employee Type</DialogTitle>
                        <DialogDescription>
                            Select the new employee type for the {selectedEmployeeIds.size} selected employee(s).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkTypeSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-600 block">Employee Type</label>
                            <Select value={bulkTypeValue} onValueChange={(e) => setBulkTypeValue(e as 'staff' | 'worker')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Employee Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="staff">Staff</SelectItem>
                                    <SelectItem value="worker">Worker</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkTypeOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Updating...' : 'Update Type'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Change Designation Dialog */}
            <Dialog open={isBulkDesignationOpen} onOpenChange={(open) => { if (!open) setIsBulkDesignationOpen(false); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Bulk Update Designation</DialogTitle>
                        <DialogDescription>
                            Enter a new designation for the {selectedEmployeeIds.size} selected employee(s).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkDesignationSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-600 block">Designation</label>
                            <Input
                                type="text"
                                value={bulkDesignationValue}
                                onChange={(e) => setBulkDesignationValue(e.target.value)}
                                placeholder="e.g. Supervisor, Technician"
                            />
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkDesignationOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Updating...' : 'Update Designation'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Change Shift Dialog */}
            <Dialog open={isBulkShiftOpen} onOpenChange={(open) => { if (!open) setIsBulkShiftOpen(false); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Bulk Update Shift</DialogTitle>
                        <DialogDescription>
                            Select the new shift for the {selectedEmployeeIds.size} selected employee(s).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkShiftSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-600 block">Shift</label>
                            <Select value={bulkShiftValue} onValueChange={(e) => setBulkShiftValue(e as 'day' | 'night')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Shift" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="day">Day</SelectItem>
                                    <SelectItem value="night">Night</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkShiftOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Updating...' : 'Update Shift'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Change Nationality Dialog */}
            <Dialog open={isBulkNationalityOpen} onOpenChange={(open) => { if (!open) setIsBulkNationalityOpen(false); }}>
                <DialogContent className="sm:max-w-[425px] bg-white border border-gray-100 shadow-xl rounded-lg p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-gray-900">Bulk Update Nationality</DialogTitle>
                        <DialogDescription className="text-sm text-gray-555">
                            Select a new nationality for the {selectedEmployeeIds.size} selected employee(s).
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkNationalitySubmit} className="space-y-4 mt-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-600 block">New Nationality</label>
                            <Select value={bulkNationalityValue} onValueChange={(e) => setBulkNationalityValue(e)}>
                                <SelectTrigger className="text-sm bg-gray-50 border-gray-100 rounded-xl w-full">
                                    <SelectValue placeholder="Select Nationality" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg max-h-[220px] overflow-y-auto">
                                    {NATIONALITIES.map((nat) => (
                                        <SelectItem key={nat} value={nat} className="rounded-md focus:bg-gray-50 cursor-pointer">
                                            {nat.toUpperCase()}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter className="pt-4 flex gap-2">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkNationalityOpen(false)}
                                disabled={isSubmitting}
                                className="rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting} className="rounded-xl bg-gray-900 text-white hover:bg-gray-800">
                                {isSubmitting ? 'Updating...' : 'Update Nationality'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Delete Dialog */}
            <Dialog open={isBulkDeleteOpen} onOpenChange={(open) => { if (!open) setIsBulkDeleteOpen(false); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Delete Employees in Bulk</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete the {selectedEmployeeIds.size} selected employee(s)? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkDeleteSubmit} className="space-y-4">
                        <DialogFooter className="pt-4">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkDeleteOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button style={{ flex: 1 }} variant="destructive" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Deleting...' : `Yes, Delete ${selectedEmployeeIds.size} Employees`}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Device Sync Dialog */}
            <Dialog open={isBulkPushOpen} onOpenChange={(open) => { if (!open) setIsBulkPushOpen(false); }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Bulk Device Sync</DialogTitle>
                        <DialogDescription>
                            You have selected {selectedEmployeeIds.size} employee(s). Choose target biometric devices to queue user profile and templates sync.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkPushSubmit} className="space-y-4">
                        <div className="space-y-4">
                            <div className="space-y-1.5 w-full">
                                <label className="text-xs font-semibold text-gray-500 block">Device Action</label>
                                <Select value={bulkSyncAction} onValueChange={(val) => setBulkSyncAction(val as 'push' | 'fetch')}>
                                    <SelectTrigger className=" bg-gray-50 border-gray-105 rounded-xl h-10 w-full focus:bg-white transition-all">
                                        <SelectValue placeholder="Select Action" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                        <SelectItem value="push" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                            Push to Device(s)
                                        </SelectItem>
                                        <SelectItem value="fetch" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                            Fetch from Device(s)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {bulkSyncAction === 'push' && (
                                <div className="space-y-1.5 w-full">
                                    <label className="text-xs font-semibold text-gray-500 block">Select Data to Push</label>
                                    <Select value={bulkPushType} onValueChange={(val) => setBulkPushType(val as 'all' | 'user_info' | 'finger' | 'face')}>
                                        <SelectTrigger className=" bg-gray-50 border-gray-105 rounded-xl h-10 w-full focus:bg-white transition-all">
                                            <SelectValue placeholder="Select Data Type" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-lg">
                                            <SelectItem value="all" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                All together
                                            </SelectItem>
                                            <SelectItem value="user_info" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                User Info Only
                                            </SelectItem>
                                            <SelectItem value="finger" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                Fingerprint Only
                                            </SelectItem>
                                            <SelectItem value="face" className=" rounded-md focus:bg-gray-50 cursor-pointer">
                                                Face Only
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Devices List */}
                            <div className="space-y-2.5 w-full">
                                <div style={{ justifyContent: "space-between", height: "2rem" }} className="flex justify-between items-center">
                                    <label className="text-xs font-semibold text-gray-550 block">Select Devices</label>
                                    {selectedBulkPushDevices.size > 0 && (
                                        <button
                                            style={{ padding: "0.1rem 0.5rem", borderRadius: "0.25rem" }}
                                            type="button"
                                            onClick={() => setSelectedBulkPushDevices(new Set())}
                                            className="text-[10px] text-gray-400 hover:text-indigo-600 transition-all font-medium"
                                        >
                                            Clear Selection
                                        </button>
                                    )}
                                </div>

                                {loadingDevices ? (
                                    <div className="text-xs text-gray-400 flex items-center justify-center gap-1.5 py-4">
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Loading devices...
                                    </div>
                                ) : devices.length === 0 ? (
                                    <div className="text-xs text-gray-400 py-4 text-center">No registered devices found.</div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                                        {devices.map(device => {
                                            const isChecked = selectedBulkPushDevices.has(device.serial_no);
                                            const isOnline = device.last_seen
                                                ? (new Date().getTime() - new Date(device.last_seen).getTime()) < 90000
                                                : false;
                                            return (
                                                <div
                                                    key={device.id}
                                                    onClick={() => {
                                                        setSelectedBulkPushDevices(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(device.serial_no)) next.delete(device.serial_no);
                                                            else next.add(device.serial_no);
                                                            return next;
                                                        });
                                                    }}
                                                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all duration-200 ${isChecked
                                                        ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                                                        : 'border-gray-100 hover:border-gray-200 bg-white'
                                                        }`}
                                                >
                                                    <div className="pt-0.5">
                                                        <div
                                                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked
                                                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                : 'border-gray-300 bg-white'
                                                                }`}
                                                        >
                                                            {isChecked && (
                                                                <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 20 20">
                                                                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="font-mono text-[11px] font-semibold text-gray-800 truncate">
                                                                {device.serial_no}
                                                            </span>
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                                                        </div>
                                                        {device.location && (
                                                            <div className="text-[11px] text-gray-500 font-sans truncate">
                                                                {device.location}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter className="pt-4 border-t border-gray-100">
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setIsBulkPushOpen(false)}
                                disabled={isBulkPushing}
                            >
                                Cancel
                            </Button>
                            <Button
                                style={{ flex: 1 }}
                                type="submit"
                                disabled={isBulkPushing || selectedBulkPushDevices.size === 0}
                                className="bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                                {isBulkPushing ? 'Queuing...' : bulkSyncAction === 'push' ? `Push to ${selectedBulkPushDevices.size} Device(s)` : `Fetch from ${selectedBulkPushDevices.size} Device(s)`}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Excel Upload Confirmation Dialog */}
            <Dialog open={uploadModalOpen} onOpenChange={(open) => {
                if (uploadState === 'uploading') return; // Prevent closing while uploading
                setUploadModalOpen(open);
            }}>
                <DialogContent className="sm:max-w-[550px] bg-white border border-gray-105 shadow-2xl rounded-2xl p-6">
                    <DialogHeader className="space-y-1">
                        <DialogTitle className="text-lg text-gray-900 flex items-center gap-2">

                            Import Employees from Excel
                        </DialogTitle>
                        <DialogDescription className="text-xs text-gray-505">
                            {uploadState === 'idle' && "Upload a spreadsheet file to batch import employees."}
                            {uploadState === 'preview' && `Review data parsed from "${uploadFileName}".`}
                            {uploadState === 'uploading' && "Importing employees. Please do not close this window."}
                            {uploadState === 'completed' && "Import completed successfully."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Step 1: Choose File */}
                    {uploadState === 'idle' && (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="my-6 border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-50/50 hover:border-indigo-300 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-indigo-50/50 transition-colors">
                                <Upload className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                            </div>
                            <div className="text-center">
                                <span className="text-sm font-semibold text-gray-805 block mb-0.5">Click to upload or drag & drop</span>
                                <span className="text-xs text-gray-400">Excel files (.xlsx, .xls) only</span>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Preview & Confirm */}
                    {uploadState === 'preview' && (
                        <div className="space-y-4 my-2">
                            {/* Summary Info */}
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex gap-4 text-xs font-medium">
                                {(() => {
                                    const newCount = parsedEmployees.filter(emp => emp.action === 'create').length;
                                    const updateCount = parsedEmployees.filter(emp => emp.action === 'update').length;
                                    return (
                                        <>
                                            {newCount > 0 && (
                                                <div className="flex-1">
                                                    <span className="text-emerald-600 block mb-0.5">New Employees</span>
                                                    <span className="text-emerald-700 text-lg font-bold">{newCount}</span>
                                                </div>
                                            )}
                                            {updateCount > 0 && (
                                                <div className={`flex-1 ${newCount > 0 ? 'border-l border-slate-200 pl-4' : ''}`}>
                                                    <span className="text-blue-600 block mb-0.5">To Update</span>
                                                    <span className="text-blue-700 text-lg font-bold">{updateCount}</span>
                                                </div>
                                            )}
                                            {duplicateEmployees.length > 0 && (
                                                <div className="flex-1 border-l border-slate-200 pl-4">
                                                    <span className="text-gray-500 block mb-0.5">Skipped / Unchanged</span>
                                                    <span className="text-gray-655 text-lg font-bold">{duplicateEmployees.length}</span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Preview list */}
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <h4 className="text-xs font-semibold text-gray-700">Employees Preview</h4>
                                    <span className="text-[11px] text-gray-500">
                                        Showing {parsedEmployees.length === 0 ? 0 : ((uploadPreviewPage - 1) * uploadPreviewPageSize) + 1}
                                        {' '}-{' '}
                                        {Math.min(uploadPreviewPage * uploadPreviewPageSize, parsedEmployees.length)} of {parsedEmployees.length}
                                    </span>
                                </div>
                                <div className="min-w-0 w-full overflow-hidden rounded-xl border border-gray-100">
                                    <div className="max-h-[240px] overflow-y-auto">
                                        <table className="w-full table-fixed text-left text-xs text-gray-600">
                                            <thead className="sticky top-0 border-b border-gray-100 bg-gray-50 font-semibold text-gray-500">
                                                <tr>
                                                    <th className="w-[18%] px-2 py-2 sm:px-3">User ID</th>
                                                    <th className="w-[28%] px-2 py-2 sm:px-3">Name</th>
                                                    <th className="w-[12%] px-2 py-2 sm:px-3">Type</th>
                                                    <th className="w-[22%] px-2 py-2 sm:px-3">Department</th>
                                                    <th className="hidden px-2 py-2 sm:table-cell sm:w-[20%] sm:px-3">Project</th>
                                                    <th className="hidden px-2 py-2 md:table-cell md:w-[20%] md:px-3">Company</th>
                                                    <th className="hidden px-2 py-2 lg:table-cell lg:w-[18%] lg:px-3">Civil ID</th>
                                                    <th className="w-[20%] px-2 py-2 text-right sm:w-[14%] sm:px-3">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 bg-white">
                                                {paginatedPreviewEmployees.map((emp, index) => (
                                                    <tr key={index}>
                                                        <td className="break-words px-2 py-2 font-mono text-[11px] text-gray-900 sm:px-3">{emp.device_user_id || '—'}</td>
                                                        <td className="break-words px-2 py-2 text-[11px] font-medium capitalize text-gray-900 sm:px-3">{emp.name.toLowerCase()}</td>
                                                        <td className="px-2 py-2 text-[10px] font-semibold uppercase text-gray-400 sm:px-3">{emp.emp_type}</td>
                                                        <td className="break-words px-2 py-2 text-[11px] sm:px-3">{emp.department || '—'}</td>
                                                        <td className="hidden break-words px-2 py-2 text-[11px] text-gray-500 sm:table-cell sm:px-3">{emp.project || '—'}</td>
                                                        <td className="hidden break-words px-2 py-2 text-[11px] text-gray-500 md:table-cell md:px-3">{emp.company || '—'}</td>
                                                        <td className="hidden break-words px-2 py-2 font-mono text-[11px] text-gray-500 lg:table-cell lg:px-3">{emp.civil_id || '—'}</td>
                                                        <td className="px-2 py-2 text-right sm:px-3">
                                                            {emp.action === 'create' ? (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-705 border border-emerald-100">
                                                                    New
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-705 border border-blue-100">
                                                                    Update
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                {uploadPreviewPageCount > 1 && (
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-[11px] text-gray-500">Page {uploadPreviewPage} of {uploadPreviewPageCount}</span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setUploadPreviewPage((prev) => Math.max(1, prev - 1))}
                                                disabled={uploadPreviewPage === 1}
                                            >
                                                Previous
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setUploadPreviewPage((prev) => Math.min(uploadPreviewPageCount, prev + 1))}
                                                disabled={uploadPreviewPage === uploadPreviewPageCount}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Push to Devices Toggle Option */}
                            <div className="border-t border-gray-100 pt-3">
                                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={uploadPushToDevices}
                                        onChange={(e) => setUploadPushToDevices(e.target.checked)}
                                        className="w-4 h-4 rounded accent-indigo-600"
                                    />
                                    Also push these new/updated employees to attendance devices
                                </label>

                                {uploadPushToDevices && (
                                    <div className="mt-3 bg-gray-50/50 border border-gray-100 rounded-xl p-3.5 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Select Devices</h5>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (uploadSelectedDevices.size === devices.length) {
                                                        setUploadSelectedDevices(new Set());
                                                    } else {
                                                        setUploadSelectedDevices(new Set(devices.map(d => d.serial_no)));
                                                    }
                                                }}
                                                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700"
                                            >
                                                {uploadSelectedDevices.size === devices.length ? 'Select None' : 'Select All'}
                                            </button>
                                        </div>

                                        {devices.length === 0 ? (
                                            <div className="text-xs text-gray-400 text-center py-4 bg-white border border-gray-100 rounded-lg">
                                                No registered devices found.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                                                {devices.map(device => {
                                                    const isChecked = uploadSelectedDevices.has(device.serial_no);
                                                    const isOnline = device.last_seen
                                                        ? (new Date().getTime() - new Date(device.last_seen).getTime()) < 90000
                                                        : false;
                                                    return (
                                                        <div

                                                            key={device.id}
                                                            onClick={() => {
                                                                setUploadSelectedDevices(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(device.serial_no)) next.delete(device.serial_no);
                                                                    else next.add(device.serial_no);
                                                                    return next;
                                                                });
                                                            }}
                                                            className={`flex items-center gap-2.5 p-2 px-3 rounded-lg border cursor-pointer select-none transition-all ${isChecked
                                                                ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                                                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => { }} // Controlled by onClick
                                                                className="w-3.5 h-3.5 accent-indigo-600 pointer-events-none"
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1 mb-0.5">
                                                                    <span className="font-mono text-[10px] font-semibold text-gray-805 truncate">
                                                                        {device.serial_no}
                                                                    </span>
                                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                                                                </div>
                                                                {device.location && (
                                                                    <div className="text-[9px] text-gray-500 truncate leading-none">
                                                                        {device.location}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Progress & Uploading */}
                    {uploadState === 'uploading' && (
                        <div className="my-8 space-y-4 flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-1" />
                            <div className="w-full text-center">
                                <span className="text-sm font-semibold text-gray-850 block mb-1">
                                    Processing employees ({uploadCurrentIndex} of {uploadTotalCount})
                                </span>
                                <span className="text-xs text-gray-400">
                                    {uploadTotalCount - uploadCurrentIndex} remaining...
                                </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-200 ease-out"
                                    style={{ width: `${(uploadCurrentIndex / uploadTotalCount) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 4: Completed */}
                    {uploadState === 'completed' && (
                        <div className="my-8 flex flex-col items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 animate-bounce">
                                <SquareCheck className="w-6 h-6 text-emerald-600" />
                            </div>
                            <div className="text-center">
                                <span className="text-sm font-semibold text-gray-800 block mb-0.5">Import & update completed successfully!</span>
                                <span className="text-xs text-gray-400">Processed {uploadTotalCount} employee records (added new and updated existing).</span>
                            </div>
                        </div>
                    )}

                    {/* Modal Footer (conditional based on step) */}
                    <DialogFooter className="pt-4 border-t border-gray-100 flex gap-2">
                        {uploadState === 'idle' && (
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                variant="outline"
                                onClick={() => setUploadModalOpen(false)}
                            >
                                Cancel
                            </Button>
                        )}
                        {uploadState === 'preview' && (
                            <>
                                <Button
                                    style={{ flex: 1 }}
                                    type="button"
                                    variant="outline"
                                    onClick={handleResetUpload}
                                >
                                    Select Another File
                                </Button>
                                <Button
                                    style={{ flex: 1 }}
                                    type="button"
                                    onClick={handleConfirmUpload}
                                    disabled={uploadPushToDevices && uploadSelectedDevices.size === 0}
                                    className="bg-indigo-600 text-white hover:bg-indigo-700 font-semibold"
                                >
                                    Import & Update {parsedEmployees.length} Employees
                                </Button>
                            </>
                        )}
                        {uploadState === 'uploading' && (
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                disabled
                                className="bg-gray-100 text-gray-450 cursor-not-allowed"
                            >
                                Importing in progress...
                            </Button>
                        )}
                        {uploadState === 'completed' && (
                            <Button
                                style={{ flex: 1 }}
                                type="button"
                                onClick={() => {
                                    setUploadModalOpen(false);
                                    handleResetUpload();
                                }}
                                className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
                            >
                                Close
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
