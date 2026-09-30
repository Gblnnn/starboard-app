import { supabase } from "@/lib/supabase";

export interface PendingFuelLog {
  id: string;
  data: {
    date: string;
    odometer_reading: number;
    amount_spent: number;
    litres?: number;
    vehicle_number: string;
    email: string;
    employee_name: string;
    employee_code: string; // references employees.emp_id
    timestamp: number;
  };
  createdAt: number;
  retryCount: number;
}

const STORAGE_KEY = "pending_fuel_logs";
const SYNC_LOCK_KEY = "fuel_logs_sync_lock";

// Check if sync is currently in progress
function isSyncInProgress(): boolean {
  try {
    const lock = localStorage.getItem(SYNC_LOCK_KEY);
    if (!lock) return false;
    
    const lockTime = parseInt(lock);
    const now = Date.now();
    
    // Consider lock stale after 5 minutes
    if (now - lockTime > 5 * 60 * 1000) {
      localStorage.removeItem(SYNC_LOCK_KEY);
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Set sync lock
function setSyncLock(): void {
  try {
    localStorage.setItem(SYNC_LOCK_KEY, Date.now().toString());
  } catch (error) {
    console.error("Error setting sync lock:", error);
  }
}

// Clear sync lock
function clearSyncLock(): void {
  try {
    localStorage.removeItem(SYNC_LOCK_KEY);
  } catch (error) {
    console.error("Error clearing sync lock:", error);
  }
}

// Get all pending fuel logs from localStorage
export function getPendingFuelLogs(): PendingFuelLog[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error("Error reading pending fuel logs:", error);
    return [];
  }
}

// Save pending fuel logs to localStorage
function savePendingFuelLogs(logs: PendingFuelLog[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch (error) {
    console.error("Error saving pending fuel logs:", error);
  }
}

// Add a new pending fuel log
export function addPendingFuelLog(logData: PendingFuelLog["data"]): string {
  const logs = getPendingFuelLogs();
  const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newLog: PendingFuelLog = {
    id,
    data: logData,
    createdAt: Date.now(),
    retryCount: 0,
  };
  
  logs.push(newLog);
  savePendingFuelLogs(logs);
  
  return id;
}

// Remove a pending fuel log by ID
export function removePendingFuelLog(id: string): void {
  const logs = getPendingFuelLogs();
  const filtered = logs.filter(log => log.id !== id);
  savePendingFuelLogs(filtered);
}

// Update retry count for a pending log
export function incrementRetryCount(id: string): void {
  const logs = getPendingFuelLogs();
  const updated = logs.map(log => 
    log.id === id ? { ...log, retryCount: log.retryCount + 1 } : log
  );
  savePendingFuelLogs(updated);
}

// Sync a single pending fuel log to Supabase
export async function syncPendingFuelLog(log: PendingFuelLog): Promise<void> {
  try {
    const { error } = await supabase
      .from("fuel_log")
      .insert({
        ...log.data,
        created_at: new Date().toISOString(),
      });
    if (error) throw error;
    removePendingFuelLog(log.id);
  } catch (error) {
    incrementRetryCount(log.id);
    throw error;
  }
}

// Sync all pending fuel logs
export async function syncAllPendingFuelLogs(
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number; skipped: boolean }> {
  // Check if sync is already in progress
  if (isSyncInProgress()) {
    console.log("⏸️ Sync already in progress, skipping duplicate sync");
    return { success: 0, failed: 0, skipped: true };
  }
  
  // Set sync lock
  setSyncLock();
  
  try {
    const logs = getPendingFuelLogs();
    let success = 0;
    let failed = 0;
    
    for (let i = 0; i < logs.length; i++) {
      try {
        await syncPendingFuelLog(logs[i]);
        success++;
      } catch (error) {
        console.error(`Failed to sync fuel log ${logs[i].id}:`, error);
        failed++;
      }
      
      if (onProgress) {
        onProgress(i + 1, logs.length);
      }
    }
    
    return { success, failed, skipped: false };
  } finally {
    // Always clear lock when done
    clearSyncLock();
  }
}

// Check if there are pending logs
export function hasPendingFuelLogs(): boolean {
  return getPendingFuelLogs().length > 0;
}

// Get count of pending logs
export function getPendingFuelLogsCount(): number {
  return getPendingFuelLogs().length;
}
