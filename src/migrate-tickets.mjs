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
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxheW9uZmFwanlpdXBramRzd2JqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkxNjczOCwiZXhwIjoyMDk2NDkyNzM4fQ.nAb3RxHIR-NiGkhLD2EF2e1VVyEATaftw8BOEI1UWOU";

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateTickets() {
  console.log("Fetching tickets from Firebase...");
  const ticketsSnapshot = await getDocs(collection(db, "tickets"));
  const tickets = ticketsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  console.log(`Found ${tickets.length} tickets. Moving to Supabase...`);

  let successCount = 0;
  let msgSuccessCount = 0;

  for (const t of tickets) {
    let createdAt = t.createdAt;
    if (createdAt && createdAt.toDate) createdAt = createdAt.toDate().toISOString();
    else if (createdAt) createdAt = new Date(createdAt).toISOString();
    else createdAt = new Date().toISOString();

    let lastMessageAt = t.lastMessageAt;
    if (lastMessageAt && lastMessageAt.toDate) lastMessageAt = lastMessageAt.toDate().toISOString();
    else if (lastMessageAt) lastMessageAt = new Date(lastMessageAt).toISOString();
    else lastMessageAt = null;

    try {
      const { error: ticketError } = await supabase.from('tickets').insert({
        id: t.id,
        title: t.title || 'Untitled',
        description: t.description || '',
        status: t.status || 'open',
        createdBy: t.createdBy,
        createdAt: createdAt,
        lastMessage: t.lastMessage || null,
        lastMessageAt: lastMessageAt,
        priority: t.priority || 'Normal',
        confidential: t.confidential || false
      });

      if (ticketError) {
        console.error(`Error inserting ticket ${t.id}:`, ticketError.message);
        continue;
      }
      successCount++;

      // Now fetch messages for this ticket
      const msgsSnapshot = await getDocs(collection(db, `tickets/${t.id}/messages`));
      const messages = msgsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      for (const m of messages) {
        let mCreatedAt = m.createdAt;
        if (mCreatedAt && mCreatedAt.toDate) mCreatedAt = mCreatedAt.toDate().toISOString();
        else if (mCreatedAt) mCreatedAt = new Date(mCreatedAt).toISOString();
        else mCreatedAt = new Date().toISOString();

        const { error: msgError } = await supabase.from('messages').insert({
          id: m.id,
          ticketId: t.id,
          text: m.text || '',
          createdBy: m.createdBy,
          createdAt: mCreatedAt,
          parentId: m.parentId || null
        });

        if (msgError) {
          console.error(`Error inserting message ${m.id} for ticket ${t.id}:`, msgError.message);
        } else {
          msgSuccessCount++;
        }
      }

    } catch (e) {
      console.error(`Failed to process ticket ${t.id}:`, e);
    }
  }

  console.log(`\nMigration Complete! ✅ ${successCount} Tickets | ✅ ${msgSuccessCount} Messages`);
  process.exit(0);
}

migrateTickets();
