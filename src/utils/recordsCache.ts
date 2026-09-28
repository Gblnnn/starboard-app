// Records data caching utilities for database-component
import { supabase } from "@/lib/supabase";

const RECORDS_CACHE_KEY = "cached_records_data";
const RECORDS_CACHE_TIMESTAMP_KEY = "cached_records_timestamp";
const CACHE_EXPIRY_HOURS = 24; // Cache valid for 24 hours

export interface CachedRecordsData {
  records: any[];
  totalRecords: number;
  timestamp: number;
  dbCategory: string;
  sortby: string;
}

// Check if records cache is still valid
export const isRecordsCacheValid = (dbCategory: string): boolean => {
  try {
    const timestampKey = `${RECORDS_CACHE_TIMESTAMP_KEY}_${dbCategory}`;
    const timestamp = localStorage.getItem(timestampKey);
    if (!timestamp) return false;
    
    const cacheAge = Date.now() - parseInt(timestamp);
    const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
    
    return cacheAge < maxAge;
  } catch (e) {
    return false;
  }
};

// Get cached records data
export const getCachedRecords = (dbCategory: string): CachedRecordsData | null => {
  try {
    if (!isRecordsCacheValid(dbCategory)) {
      console.log(`Records cache expired for ${dbCategory}`);
      return null;
    }

    const cacheKey = `${RECORDS_CACHE_KEY}_${dbCategory}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log(`⚡ Records loaded from cache for ${dbCategory}`);
      return JSON.parse(cached);
    }
    return null;
  } catch (e) {
    console.error("Error reading records cache:", e);
    return null;
  }
};

// Cache records data
export const cacheRecordsData = (data: CachedRecordsData, dbCategory: string): void => {
  try {
    const cacheKey = `${RECORDS_CACHE_KEY}_${dbCategory}`;
    const timestampKey = `${RECORDS_CACHE_TIMESTAMP_KEY}_${dbCategory}`;
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(timestampKey, Date.now().toString());
    console.log(`✅ Records data cached for ${dbCategory}`);
  } catch (error) {
    console.error("Error caching records data:", error);
  }
};

// Clear records cache
export const clearRecordsCache = (dbCategory?: string): void => {
  try {
    if (dbCategory) {
      const cacheKey = `${RECORDS_CACHE_KEY}_${dbCategory}`;
      const timestampKey = `${RECORDS_CACHE_TIMESTAMP_KEY}_${dbCategory}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(timestampKey);
    } else {
      // Clear all records caches
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(RECORDS_CACHE_KEY) || key.startsWith(RECORDS_CACHE_TIMESTAMP_KEY)) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.error("Error clearing records cache:", error);
  }
};

// Fetch and cache records data from Firestore
export const fetchAndCacheRecords = async (
  dbCategory: string,
  sortby: string,
  pageSize: number
): Promise<CachedRecordsData | null> => {
  try {
    const { data: recordsData, error, count } = await supabase
      .from("employees")
      .select("*", { count: "exact" })
      .in("emp_type", [dbCategory, "omni"])
      .order(sortby)
      .limit(pageSize);

    if (error) {
      throw error;
    }

    const fetchedData: any[] = recordsData || [];

    const cacheData: CachedRecordsData = {
      records: fetchedData,
      totalRecords: count || 0,
      timestamp: Date.now(),
      dbCategory,
      sortby,
    };

    cacheRecordsData(cacheData, dbCategory);
    console.log(`✅ Records data fetched and cached for ${dbCategory}`);
    return cacheData;
  } catch (err) {
    console.error("Error fetching records data:", err);
    return null;
  }
};
