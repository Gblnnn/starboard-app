import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";

const firebaseConfig = {
  apiKey: "AIzaSyD8LWJoohdEagKAhtVybbqlmzlJYD3w9KY",
  authDomain: "doc-record.firebaseapp.com",
  projectId: "doc-record",
  storageBucket: "doc-record.appspot.com",
  messagingSenderId: "834882723630",
  appId: "1:834882723630:web:f8efe9cbbfad7e69bd64bf",
};

const supabaseUrl = "https://layonfapjyiupkjdswbj.supabase.co/";
const supabaseAnonKey = "sb_publishable_60EgFkAFmczfEjOySTOBQQ_QYKGosa_";

// Using anon key, so RLS must be temporarily disabled on the users table!
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateUsers() {
  console.log("Fetching users from Firebase...");
  const usersSnapshot = await getDocs(collection(db, "users"));
  const users = usersSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  console.log(`Found ${users.length} users in Firebase. Moving to Supabase...`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    if (!user.email) {
        console.warn(`Skipping user missing email: ${JSON.stringify(user)}`);
        continue;
    }

    try {
      // Map Firebase fields to Supabase columns
      const supabaseUser = {
        email: user.email.toLowerCase().trim(),
        role: user.role || 'user',
        clearance: user.clearance || 'none',
        editor: user.editor === true || user.editor === 'true',
        sensitive_data: user.sensitive_data === true || user.sensitive_data === 'true',
        allocated_vehicle: user.allocated_vehicle || null,
      };

      const { error } = await supabase
        .from('users')
        .insert(supabaseUser);

      if (error) {
        console.error(`Error inserting ${user.email}:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ Migrated: ${user.email}`);
        successCount++;
      }
    } catch (e) {
      console.error(`Failed to process ${user.email}:`, e);
      errorCount++;
    }
  }

  console.log(`\nMigration Complete! ✅ ${successCount} Success | ❌ ${errorCount} Errors`);
  process.exit(0);
}

migrateUsers();
