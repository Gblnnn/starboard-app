// Vehicle allocation caching utilities
import { supabase } from "@/lib/supabase";

const VEHICLE_CACHE_KEY = "cached_vehicle_data";
const VEHICLE_CACHE_TIMESTAMP_KEY = "cached_vehicle_timestamp";
const CACHE_EXPIRY_HOURS = 24; // Cache valid for 24 hours

export interface VehicleData {
  vehicle_number: string;
  make: string;
  model: string;
  year: string;
  type: string;
  status: string;
  registration_type?: string;
  assigned_to?: string; // emp_id from employees table
  created_at?: string;
  updated_at?: string;
}

// Check if vehicle cache is still valid
export const isVehicleCacheValid = (): boolean => {
  try {
    const timestamp = localStorage.getItem(VEHICLE_CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;
    
    const cacheAge = Date.now() - parseInt(timestamp);
    const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    
    return cacheAge < maxAge;
  } catch (e) {
    return false;
  }
};

// Get cached vehicle data
export const getCachedVehicle = (): VehicleData | null => {
  try {
    if (!isVehicleCacheValid()) {
      console.log("Vehicle cache expired");
      return null;
    }

    const cached = localStorage.getItem(VEHICLE_CACHE_KEY);
    if (cached) {
      console.log("⚡ Vehicle loaded from cache");
      return JSON.parse(cached);
    }
    return null;
  } catch (e) {
    console.error("Error reading vehicle cache:", e);
    return null;
  }
};

// Cache vehicle data
export const cacheVehicleData = (data: VehicleData): void => {
  try {
    localStorage.setItem(VEHICLE_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(VEHICLE_CACHE_TIMESTAMP_KEY, Date.now().toString());
    console.log("✅ Vehicle data cached");
  } catch (error) {
    console.error("Error caching vehicle data:", error);
  }
};

// Clear vehicle cache
export const clearVehicleCache = (): void => {
  try {
    localStorage.removeItem(VEHICLE_CACHE_KEY);
    localStorage.removeItem(VEHICLE_CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.error("Error clearing vehicle cache:", error);
  }
};

// Fetch and cache vehicle data from Supabase
export const fetchAndCacheVehicle = async (vehicleNumber: string): Promise<VehicleData | null> => {
  try {
    if (!vehicleNumber) {
      clearVehicleCache();
      return null;
    }

    const { data, error } = await supabase
      .from("vehicle_master")
      .select("*")
      .eq("vehicle_number", vehicleNumber)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        console.log("Vehicle not found in vehicle_master");
        clearVehicleCache();
        return null;
      }
      throw error;
    }

    const fullVehicleData: VehicleData = {
      vehicle_number: data.vehicle_number || '',
      make: data.make || '',
      model: data.model || '',
      year: data.year || '',
      type: data.type || '',
      status: data.status || 'Active',
      registration_type: data.registration_type || 'Private',
      assigned_to: data.assigned_to,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    cacheVehicleData(fullVehicleData);
    return fullVehicleData;
  } catch (error) {
    console.error("Error fetching vehicle:", error);
    throw error;
  }
};


