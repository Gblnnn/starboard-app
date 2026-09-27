import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://layonfapjyiupkjdswbj.supabase.co/";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxheW9uZmFwanlpdXBramRzd2JqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkxNjczOCwiZXhwIjoyMDk2NDkyNzM4fQ.nAb3RxHIR-NiGkhLD2EF2e1VVyEATaftw8BOEI1UWOU";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAuthUsers() {
  console.log("Fetching users from public.users...");
  const { data: users, error: fetchError } = await supabase.from('users').select('email, emp_id');
  
  if (fetchError) {
    console.error("Error fetching users:", fetchError);
    process.exit(1);
  }

  console.log(`Found ${users.length} users. Creating Auth accounts...`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    const emailToUse = user.email || `${user.emp_id}@starboard.local`;
    
    if (!emailToUse || emailToUse === 'undefined@starboard.local') {
        console.log("Skipping user with no email and no emp_id");
        continue;
    }

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: emailToUse,
        password: 'Starboard2026!',
        email_confirm: true
      });

      if (error) {
        console.error(`Error creating ${emailToUse}:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ Auth created: ${emailToUse}`);
        successCount++;
      }
    } catch (e) {
      console.error(`Failed to process ${emailToUse}:`, e);
      errorCount++;
    }
  }

  console.log(`\nAuth Creation Complete! ✅ ${successCount} Success | ❌ ${errorCount} Errors`);
  process.exit(0);
}

createAuthUsers();
