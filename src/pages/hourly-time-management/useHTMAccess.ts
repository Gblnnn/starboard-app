// =============================================================================
// Hourly Time Management — Access Control Hook
// Follows the same pattern as usePettyCashAccess.ts
// Permissions are enforced here AND in RLS policies.
// =============================================================================

import { useAuth } from '@/components/AuthProvider';

export interface HTMPermissions {
  /** User is a system admin */
  isAdmin: boolean;
  /** Can view project and employee configuration screens */
  canViewConfig: boolean;
  /** Can create/edit project configuration */
  canManageProjectConfig: boolean;
  /** Can create/edit employee pay configuration */
  canManageEmployeeConfig: boolean;
  /** Can enter and edit daily attendance */
  canEnterAttendance: boolean;
  /** Can import Excel attendance */
  canImportExcel: boolean;
  /** Can view payroll reports */
  canViewPayroll: boolean;
  /** Can export payroll to Excel */
  canExportPayroll: boolean;
  /** Can finalize a payroll period */
  canFinalizePayroll: boolean;
  /** Can reopen a finalized payroll period */
  canReopenPayroll: boolean;
  /** Can manage project holidays */
  canManageHolidays: boolean;
  /** Module is accessible at all */
  hasModuleAccess: boolean;
}

/**
 * Access Control Hook for Hourly Time Management
 * - Admin role: full access
 * - management role: view + export + finalize
 * - Clearance key 'hourly_time_management': module-level access
 *
 * Admin vs management:
 *   admin         → all permissions
 *   management    → view config, view/export/finalize payroll, enter attendance
 *   user/others   → view only (if clearance granted)
 */
export function useHTMAccess(): HTMPermissions {
  const { userData } = useAuth();

  const role = userData?.role ?? '';
  const isAdmin = role === 'admin';
  const isManagement = role === 'management';

  // Module access: admin always has it; others need clearance key
  const getModulePermissions = (): Record<string, boolean> => {
    if (!userData?.clearance) return {};
    try {
      const parsed = JSON.parse(userData.clearance);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  };

  const modulePerms = getModulePermissions();
  const hasModuleAccess = isAdmin || isManagement || Boolean(modulePerms['hourly_time_management']);

  // If no module access, return everything false
  if (!hasModuleAccess) {
    return {
      isAdmin: false,
      canViewConfig: false,
      canManageProjectConfig: false,
      canManageEmployeeConfig: false,
      canEnterAttendance: false,
      canImportExcel: false,
      canViewPayroll: false,
      canExportPayroll: false,
      canFinalizePayroll: false,
      canReopenPayroll: false,
      canManageHolidays: false,
      hasModuleAccess: false,
    };
  }

  return {
    isAdmin,
    hasModuleAccess: true,
    canViewConfig:            isAdmin || isManagement || hasModuleAccess,
    canManageProjectConfig:   isAdmin,
    canManageEmployeeConfig:  isAdmin || isManagement,
    canEnterAttendance:       isAdmin || isManagement || hasModuleAccess,
    canImportExcel:           isAdmin || isManagement || hasModuleAccess,
    canViewPayroll:           isAdmin || isManagement || hasModuleAccess,
    canExportPayroll:         isAdmin || isManagement,
    canFinalizePayroll:       isAdmin || isManagement,
    canReopenPayroll:         isAdmin,
    canManageHolidays:        isAdmin || isManagement,
  };
}
