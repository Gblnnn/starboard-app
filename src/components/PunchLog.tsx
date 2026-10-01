import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from "@/components/ui/input";
import { ChevronDown, MapPin, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { formatTime, PUNCH_TYPE_LABELS, VERIFY_LABELS } from '../lib/utilis';
import type { Employee, Punch } from '../types/attendance';
import { useAuth } from './AuthProvider';
import { Avatar } from './Avatar';

const NATIONALITIES = [
  'nigerian',
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

interface PunchLogProps {
  punches: Punch[];
  employees: Employee[];
  onFilteredPunchesChange?: (punches: Punch[]) => void;
  onEmployeeAdded?: () => void;
}

export function PunchLog({ punches, employees, onFilteredPunchesChange, onEmployeeAdded }: PunchLogProps) {
  const [search, setSearch] = useState('');
  const [selectedPunchTypes, setSelectedPunchTypes] = useState<number[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
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

  // Registration Dialog state
  const [registerUserId, setRegisterUserId] = useState<string | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerDept, setRegisterDept] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerEmpId, setRegisterEmpId] = useState('');
  const [registerEmpType, setRegisterEmpType] = useState<'staff' | 'worker'>('staff');
  const [registerNationality, setRegisterNationality] = useState('');
  const [registerDesignation, setRegisterDesignation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.device_user_id, e])), [employees]);
  const empIndex = useMemo(() => Object.fromEntries(employees.map((e, i) => [e.device_user_id, i])), [employees]);

  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>();
    punches.forEach(p => {
      if (p.location) locations.add(p.location);
    });
    return Array.from(locations).sort();
  }, [punches]);

  const filtered = useMemo(() => {
    return punches.filter((p) => {
      const emp = empMap[p.user_id];
      const name = emp?.name ?? p.user_id; // Fallback to user_id if name is not available

      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        name.toLowerCase().includes(query) ||
        (emp?.emp_id && emp.emp_id.toLowerCase().includes(query)) ||
        p.user_id.toLowerCase().includes(query) ||
        (p.device_serial && p.device_serial.toLowerCase().includes(query));

      const matchesPunchType =
        selectedPunchTypes.length === 0 || selectedPunchTypes.includes(p.punch_type);
      const matchesLocation =
        selectedLocations.length === 0 || (p.location && selectedLocations.includes(p.location));

      return matchesSearch && matchesPunchType && matchesLocation;
    });
  }, [punches, search, selectedPunchTypes, selectedLocations, empMap]);

  // Call the callback whenever filtered punches change
  useEffect(() => {
    if (onFilteredPunchesChange) {
      onFilteredPunchesChange(filtered);
    }
  }, [filtered, onFilteredPunchesChange]);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerUserId) return;
    if (!registerName.trim()) {
      toast.error('Name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: insertError } = await supabase
        .from('employees')
        .insert({
          device_user_id: registerUserId.trim(),
          name: registerName.trim(),
          department: registerDept.trim() || null,
          email: registerEmail.trim() || null,
          emp_id: registerEmpId.trim() || null,
          emp_type: registerEmpType,
          nationality: registerNationality || null,
          designation: registerDesignation.trim() || null,
        });

      if (insertError) throw insertError;

      toast.success(`${registerName} added to employees successfully.`);
      setRegisterUserId(null);
      if (onEmployeeAdded) {
        onEmployeeAdded();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to add employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in" style={{ width: "100%", height: '100%', border: "", display: "flex", flexFlow: "column", justifyContent: "flex-start" }}> {/* Make PunchLog itself a flex container that takes full height and hides overflow */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.35s ease-out forwards;
        }
      ` }} />
      <div className="overflow-auto flex-1 animate-fade-in" style={{ border: "", width: "100%" }}> {/* This div now handles both vertical and horizontal scrolling, taking remaining height */}
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 z-10 shadow-[0_1px_0_rgba(0,0,0,0.05)]"> {/* Sticky relative to its new scrollable parent */}
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs uppercase tracking-wide" style={{ width: "320px" }}>
                <div className="relative flex items-center group w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-darkblue transition-colors" />
                  <input
                    type="text"
                    placeholder="Search name, code, device..."
                    value={search}
                    style={{ fontSize: "0.8rem", fontWeight: "400" }}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-6 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors tracking-wide text-gray-700"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </th>
              <th style={{ width: "120px" }} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                Time
              </th>
              <th className="text-left px-1 py-1 font-medium text-xs tracking-wide" style={{ width: "160px" }}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="h-8 text-xs bg-transparent border-0 text-gray-500 hover:bg-gray-100 transition-colors px-2 rounded-md font-medium w-full justify-between flex items-center outline-none uppercase tracking-wide">
                    <span className="truncate">
                      {selectedPunchTypes.length === 0
                        ? 'Type (All)'
                        : selectedPunchTypes.length === 1
                          ? (selectedPunchTypes[0] === 0 ? 'Check-in' : 'Check-out')
                          : `Type (${selectedPunchTypes.length})`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[140px] max-h-[300px] overflow-y-auto p-0 z-50">
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/95 backdrop-blur-xs"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedPunchTypes([0, 1]);
                        }}
                        className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left"
                        style={{ background: "none", flex: 1 }}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedPunchTypes([]);
                        }}
                        className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right"
                        style={{ background: "none", flex: 1 }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="py-1">
                      <DropdownMenuCheckboxItem
                        checked={selectedPunchTypes.includes(0)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPunchTypes([...selectedPunchTypes, 0]);
                          } else {
                            setSelectedPunchTypes(selectedPunchTypes.filter(t => t !== 0));
                          }
                        }}
                        onSelect={(e) => e.preventDefault()}
                        className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                      >
                        Check-in
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={selectedPunchTypes.includes(1)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPunchTypes([...selectedPunchTypes, 1]);
                          } else {
                            setSelectedPunchTypes(selectedPunchTypes.filter(t => t !== 1));
                          }
                        }}
                        onSelect={(e) => e.preventDefault()}
                        className="rounded-md focus:bg-gray-50 cursor-pointer text-xs"
                      >
                        Check-out
                      </DropdownMenuCheckboxItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </th>
              <th style={{ width: "120px" }} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                Verify
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
                          setSelectedLocations(uniqueLocations);
                        }}
                        className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-left"
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
                        className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 cursor-pointer text-right"
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-20 text-center text-gray-400 font-medium">
                  {search || selectedPunchTypes.length > 0 || selectedLocations.length > 0
                    ? 'No matching punches found.'
                    : 'No punches recorded for this date.'}
                </td>
              </tr>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((punch) => {
                  const emp = empMap[punch.user_id];
                  const name = emp?.name ?? punch.user_id;
                  const idx = empIndex[punch.user_id] ?? 0;
                  const isIn = punch.punch_type === 0;

                  return (
                    <motion.tr
                      key={punch.id}
                      layout="position"
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5" style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
                        <Avatar size={"md"} name={name} index={idx} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900" style={{ textTransform: "capitalize" }}>{name.toLowerCase()}</span>
                            {!emp && canEditAttendance && (
                              <button
                                style={{ padding: "0.25rem" }}
                                onClick={() => {
                                  setRegisterUserId(punch.user_id);
                                  setRegisterName('');
                                  setRegisterDept('');
                                  setRegisterEmail('');
                                  setRegisterEmpId('');
                                  setRegisterEmpType('staff');
                                  setRegisterNationality('');
                                  setRegisterDesignation('');
                                }}
                                className=""
                              >
                                <UserPlus size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {formatTime(punch.punch_time)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isIn
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-600'
                          }`}
                      >
                        <i
                          className={`ti ${isIn ? 'ti-login' : 'ti-logout'} text-[11px]`}
                          aria-hidden="true"
                        />
                        {PUNCH_TYPE_LABELS[punch.punch_type] ?? punch.punch_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {punch.verify_type === 5
                        ? 'Mobile'
                        : VERIFY_LABELS[punch.verify_type] ?? punch.verify_type}
                    </td>
                    <td className="px-4 py-3">
                      <div style={{ gap: "0.1rem" }} className="flex flex-col gap-0.5">
                        <span className="text-gray-900 font-medium truncate max-w-[200px]" title={punch.location}>
                          {punch.location}
                        </span>
                        {punch.coordinates && (
                          <a
                            href={`https://www.google.com/maps?q=${punch.coordinates}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                            {punch.coordinates}
                          </a>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={registerUserId !== null} onOpenChange={(open) => { if (!open) setRegisterUserId(null); }}>
        <DialogContent className="">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>
              Register this employee in the system. Since they already punched on the device, they will be saved to the database.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegisterSubmit} className="space-y-4 ">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Device User ID</label>
                <Input
                  type="text"
                  value={registerUserId || ''}
                  disabled
                  className="bg-gray-50 text-gray-500 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Employee ID (HR)</label>
                <Input
                  type="text"
                  value={registerEmpId}
                  onChange={(e) => setRegisterEmpId(e.target.value)}
                  placeholder="SS0001"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Full Name <span className="text-red-500">*</span></label>
              <Input
                type="text"
                required
                value={registerName.toLowerCase()}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Department</label>
                <Input
                  type="text"
                  value={registerDept}
                  onChange={(e) => setRegisterDept(e.target.value)}
                  placeholder="e.g. Operations"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Designation</label>
                <Input
                  type="text"
                  value={registerDesignation}
                  onChange={(e) => setRegisterDesignation(e.target.value)}
                  placeholder="e.g. Engineer"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Employee Type</label>
                <select
                  value={registerEmpType}
                  onChange={(e) => setRegisterEmpType(e.target.value as 'staff' | 'worker')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-white"
                >
                  <option value="staff">Staff</option>
                  <option value="worker">Worker</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Nationality</label>
                <select
                  value={registerNationality}
                  onChange={(e) => setRegisterNationality(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-white"
                >
                  <option value="">Select Nationality</option>
                  {NATIONALITIES.map((nat) => (
                    <option key={nat} value={nat.toLowerCase()}>
                      {nat.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Email</label>
              <Input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="john@company.com"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button
                style={{ flex: 1 }}
                type="button"
                variant="outline"
                onClick={() => setRegisterUserId(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button style={{ flex: 1 }} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
