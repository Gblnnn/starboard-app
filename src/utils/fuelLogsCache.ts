// Fuel logs caching utilities
import { supabase } from "@/lib/supabase";

const FUEL_LOGS_CACHE_KEY = "cached_fuel_logs_data";
const FUEL_LOGS_CACHE_TIMESTAMP_KEY = "cached_fuel_logs_timestamp";
const CACHE_EXPIRY_HOURS = 24; // Cache valid for 24 hours

export interface FuelLog {
  id: string;
  date: string;
  odometer_reading: number;
  amount_spent: number;
  litres?: number;
  employee_name: string;
  vehicle_number: string;
  created_at: any;
  isPending?: boolean;
}

export interface CachedFuelLogsData {
  logs: FuelLog[];
  timestamp: number;
  userEmail: string;
}

// Check if fuel logs cache is still valid
export const isFuelLogsCacheValid = (userEmail: string): boolean => {
  try {
    const timestampKey = `${FUEL_LOGS_CACHE_TIMESTAMP_KEY}_${userEmail}`;
    const timestamp = localStorage.getItem(timestampKey);
    if (!timestamp) return false;
    
    const cacheAge = Date.now() - parseInt(timestamp);
    const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    
    return cacheAge < maxAge;
  } catch (e) {
    return false;
  }
};

// Get cached fuel logs data
export const getCachedFuelLogs = (userEmail: string): FuelLog[] | null => {
  try {
    if (!isFuelLogsCacheValid(userEmail)) {
      console.log(`Fuel logs cache expired for ${userEmail}`);
      return null;
    }

    const cacheKey = `${FUEL_LOGS_CACHE_KEY}_${userEmail}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log(`⚡ Fuel logs loaded from cache`);
      const data: CachedFuelLogsData = JSON.parse(cached);
      return data.logs;
    }
    return null;
  } catch (e) {
    console.error("Error reading fuel logs cache:", e);
    return null;
  }
};

// Cache fuel logs data
export const cacheFuelLogsData = (logs: FuelLog[], userEmail: string): void => {
  try {
    const cacheKey = `${FUEL_LOGS_CACHE_KEY}_${userEmail}`;
    const timestampKey = `${FUEL_LOGS_CACHE_TIMESTAMP_KEY}_${userEmail}`;
    
    const data: CachedFuelLogsData = {
      logs,
      timestamp: Date.now(),
      userEmail
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(timestampKey, Date.now().toString());
    console.log(`✅ Fuel logs data cached`);
  } catch (error) {
    console.error("Error caching fuel logs data:", error);
  }
};

// Fetch and cache fuel logs from Supabase
export const fetchAndCacheFuelLogs = async (userEmail: string): Promise<FuelLog[]> => {
  // If offline, return cached data
  if (!navigator.onLine) {
    const cached = getCachedFuelLogs(userEmail);
    if (cached) {
      console.log("📴 Offline: Using cached fuel logs");
      return cached;
    }
    console.log("📴 Offline: No cached data available");
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from("fuel_log")
      .select("*")
      .eq("email", userEmail)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const logs: FuelLog[] = (data || []).map(d => ({
      id: d.id,
      date: d.date,
      odometer_reading: Number(d.odometer_reading) || 0,
      amount_spent: Number(d.amount_spent) || 0,
      litres: d.litres ? Number(d.litres) : undefined,
      employee_name: d.employee_name || "",
      vehicle_number: d.vehicle_number || "",
      created_at: d.created_at,
      isPending: false,
    }));
    
    cacheFuelLogsData(logs, userEmail);
    return logs;
  } catch (error) {
    console.error("Error fetching fuel logs:", error);
    // Return cached data if available on error
    const cached = getCachedFuelLogs(userEmail);
    if (cached) {
      console.log("⚠️ Error fetching, using cached fuel logs");
      return cached;
    }
    throw error;
  }
};

// Clear fuel logs cache
export const clearFuelLogsCache = (userEmail?: string): void => {
  try {
    if (userEmail) {
      const cacheKey = `${FUEL_LOGS_CACHE_KEY}_${userEmail}`;
      const timestampKey = `${FUEL_LOGS_CACHE_TIMESTAMP_KEY}_${userEmail}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(timestampKey);
    } else {
      // Clear all fuel logs caches
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(FUEL_LOGS_CACHE_KEY) || key.startsWith(FUEL_LOGS_CACHE_TIMESTAMP_KEY)) {
          localStorage.removeItem(key);
        }
      });
    }
    console.log("Fuel logs cache cleared");
  } catch (error) {
    console.error("Error clearing fuel logs cache:", error);
  }
};
