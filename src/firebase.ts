import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD8LWJoohdEagKAhtVybbqlmzlJYD3w9KY",
  authDomain: "doc-record.firebaseapp.com",
  projectId: "doc-record",
  messagingSenderId: "834882723630",
  appId: "1:834882723630:web:f8efe9cbbfad7e69bd64bf",
};

// Lazy initialization - only runs when needed (during login)
let _app: ReturnType<typeof initializeApp> | null = null;
let _auth: ReturnType<typeof getAuth> | null = null;
let _db: ReturnType<typeof initializeFirestore> | null = null;
let _initializing = false;

const initializeFirebase = () => {
  // Prevent double initialization
  if (_app && _auth && _db) return;
  if (_initializing) {
    console.warn("Firebase initialization already in progress");
    return;
  }
  
  _initializing = true;
  console.log("🔄 Initializing Firebase...");
  const startTime = performance.now();
  
  try {
    // Initialize app
    _app = initializeApp(firebaseConfig, {
      automaticDataCollectionEnabled: false,
    });
    
    // Initialize auth
    _auth = getAuth(_app);
    setPersistence(_auth, browserLocalPersistence).catch((err) => {
      console.error("Error setting auth persistence:", err);
    });
    
    // Initialize Firestore
    _db = initializeFirestore(_app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: 50 * 1024 * 1024,
      }),
      experimentalForceLongPolling: false,
    });
    
    console.log("✅ Firebase initialized in " + Math.round(performance.now() - startTime) + "ms");
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
    // Reset on error so retry is possible
    _app = null;
    _auth = null;
    _db = null;
    throw error;
  } finally {
    _initializing = false;
  }
};

// Export getters that initialize on demand
export function getFirebaseApp() {
  if (!_app) {
    initializeFirebase();
  }
  if (!_app) {
    throw new Error("Firebase app failed to initialize");
  }
  return _app;
}

export function getFirebaseAuth() {
  if (!_auth) {
    initializeFirebase();
  }
  if (!_auth) {
    throw new Error("Firebase auth failed to initialize");
  }
  return _auth;
}

export function getFirebaseDb() {
  if (!_db) {
    initializeFirebase();
  }
  if (!_db) {
    throw new Error("Firebase database failed to initialize");
  }
  return _db;
}

// Backward compatible direct exports - initialize immediately when accessed
// These must return actual instances, not functions
export let app: ReturnType<typeof initializeApp>;
export let auth: ReturnType<typeof getAuth>;
export let db: ReturnType<typeof initializeFirestore>;

// Initialize instances for direct exports
try {
  app = getFirebaseApp();
  auth = getFirebaseAuth();
  db = getFirebaseDb();
} catch (error) {
  console.error("Failed to initialize Firebase exports:", error);
  // Will throw when actually used
}
