import fs from 'fs';
import path from 'path';

const ticketsPath = path.join(process.cwd(), 'src', 'pages', 'tickets.tsx');
let content = fs.readFileSync(ticketsPath, 'utf8');

// 1. Imports
content = content.replace(
  `import { db } from "@/firebase";\nimport { addDoc, collection, deleteDoc, doc, getCountFromServer, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";`,
  `import { supabase } from "@/lib/supabase";`
);

// 2. Fetch Tickets Effect
content = content.replace(
  `    setLoadingTickets(true);\n    const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));\n    const unsub = onSnapshot(q, (snap) => {\n      const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Ticket));\n      setTickets(docs);\n      setLoadingTickets(false);\n    }, (err) => {\n      console.error(err); setLoadingTickets(false);\n    });\n    return unsub;`,
  `    setLoadingTickets(true);
    const fetchTickets = async () => {
      const { data, error } = await supabase.from('tickets').select('*').order('createdAt', { ascending: false });
      if (data) setTickets(data as Ticket[]);
      setLoadingTickets(false);
    };
    fetchTickets();
    const channel = supabase.channel('tickets-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(channel); };`
);

// 3. Fetch Messages Effect
content = content.replace(
  `    setMessagesLoading(true);\n    const q = query(collection(db, \`tickets/\${selectedTicket.id}/messages\`), orderBy("createdAt", "asc"));\n    const unsub = onSnapshot(q, (snap) => {\n      // ignore documents that are local pending writes; this prevents local cached writes\n      // from briefly appearing out of order before the server timestamp is assigned.\n      const msgs: Message[] = snap.docs\n        .filter(d => !(d.metadata && (d.metadata as any).hasPendingWrites))\n        .map(d => {\n          const data = d.data();\n          // normalize parentId to string or null\n          const rawParent = (data as any).parentId;\n          let parentId: string | null = null;\n          if (rawParent) {\n            if (typeof rawParent === 'string') parentId = rawParent;\n            else if ((rawParent as any).id) parentId = (rawParent as any).id;\n          }\n          return { id: d.id, ...(data as any), parentId } as Message;\n        });\n      setMessages(msgs);\n      setMessagesLoading(false);\n    }, (err) => { console.error(err); setMessagesLoading(false); });\n    return () => { try { unsub(); } catch (e) { /* ignore */ } setMessagesLoading(false); };`,
  `    setMessagesLoading(true);
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('ticketId', selectedTicket.id).order('createdAt', { ascending: true });
      if (data) setMessages(data as Message[]);
      setMessagesLoading(false);
    };
    fetchMessages();
    const channel = supabase.channel(\`messages-\${selectedTicket.id}\`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: \`ticketId=eq.\${selectedTicket.id}\` }, fetchMessages)
      .subscribe();
    return () => { supabase.removeChannel(channel); };`
);

// 4. Ticket Handler logic (replyIsHandler)
content = content.replace(
  `            const q = query(collection(db, 'users'), where('email', '==', email));\n            const snap = await getDocs(q);\n            if (!snap.empty) {\n              const data = snap.docs[0].data() as any;`,
  `            const { data: usersData } = await supabase.from('users').select('*').eq('email', email);\n            if (usersData && usersData.length > 0) {\n              const data = usersData[0];`
);

// 5. Ticket Creators Logic (ticketCreators)
content = content.replace(
  `            const q = query(collection(db, 'users'), where('email', '==', email));\n            const snap = await getDocs(q);\n            if (!snap.empty) {\n              const data = snap.docs[0].data() as any;`,
  `            const { data: usersData } = await supabase.from('users').select('*').eq('email', email);\n            if (usersData && usersData.length > 0) {\n              const data = usersData[0];`
);

// 6. Message Counts Logic
content = content.replace(
  `            const q = query(collection(db, \`tickets/\${t.id}/messages\`));\n            const snap = await getCountFromServer(q);\n            return [t.id, snap.data().count] as [string, number];`,
  `            const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('ticketId', t.id);\n            return [t.id, count || 0] as [string, number];`
);

// 7. Post Message Logic
content = content.replace(
  `      // store on server\n      await addDoc(collection(db, \`tickets/\${ticketId}/messages\`), {\n        text: plainText,\n        createdBy: activeUserEmail,\n        createdAt: serverTimestamp(),\n        parentId: parentId || null,\n      });\n      // update ticket preview\n      await updateDoc(doc(db, "tickets", ticketId), { lastMessage: text.trim(), lastMessageAt: serverTimestamp() });`,
  `      // store on server\n      await supabase.from('messages').insert({\n        ticketId: ticketId,\n        text: plainText,\n        createdBy: activeUserEmail,\n        parentId: parentId || null,\n      });\n      // update ticket preview\n      await supabase.from("tickets").update({ lastMessage: text.trim(), lastMessageAt: new Date().toISOString() }).eq('id', ticketId);`
);

// 8. Create Ticket Logic
content = content.replace(
  `      await addDoc(collection(db, "tickets"), {\n        title: newTicket.title,\n        description: newTicket.description,\n        priority: newTicket.priority || 'Normal',\n        confidential: !!newTicket.confidential,\n        status: "open",\n        createdBy: creatorEmail,\n        createdAt: serverTimestamp(),\n        lastMessage: newTicket.description,\n        lastMessageAt: serverTimestamp(),\n      });`,
  `      await supabase.from("tickets").insert({\n        title: newTicket.title,\n        description: newTicket.description,\n        priority: newTicket.priority || 'Normal',\n        confidential: !!newTicket.confidential,\n        status: "open",\n        createdBy: creatorEmail,\n        lastMessage: newTicket.description,\n        lastMessageAt: new Date().toISOString(),\n      });`
);

// 9. Delete Ticket Logic
content = content.replace(
  `    try { await deleteDoc(doc(db, "tickets", id)); toast.success("Ticket deleted"); }`,
  `    try { await supabase.from("tickets").delete().eq('id', id); toast.success("Ticket deleted"); }`
);

// 10. Toggle Confidential Logic
content = content.replace(
  `      await updateDoc(doc(db, 'tickets', ticketId), { confidential: !current });`,
  `      await supabase.from('tickets').update({ confidential: !current }).eq('id', ticketId);`
);

// 11. Delete Message Logic
content = content.replace(
  `                        await deleteDoc(doc(db, 'tickets', ticketId, 'messages', node.id));`,
  `                        await supabase.from('messages').delete().eq('id', node.id);`
);

// 12. Edit Ticket Logic (update)
content = content.replace(
  `await updateDoc(doc(db, 'tickets', editingTicket.id), {\n        title: editTicketData.title,\n        description: editTicketData.description,\n        priority: editTicketData.priority || 'Normal',\n        confidential: !!editTicketData.confidential\n      });`,
  `await supabase.from('tickets').update({\n        title: editTicketData.title,\n        description: editTicketData.description,\n        priority: editTicketData.priority || 'Normal',\n        confidential: !!editTicketData.confidential\n      }).eq('id', editingTicket.id);`
);

// 13. Edit Message Logic (update)
content = content.replace(
  `await updateDoc(doc(db, 'tickets', editingMessage.ticketId, 'messages', editingMessage.id), { text: editingMessage.text });`,
  `await supabase.from('messages').update({ text: editingMessage.text }).eq('id', editingMessage.id);`
);

// 14. Close Ticket Logic (update status)
content = content.replace(
  `await updateDoc(doc(db, "tickets", id), { status: "closed" });`,
  `await supabase.from("tickets").update({ status: "closed" }).eq('id', id);`
);

fs.writeFileSync(ticketsPath, content);
console.log("tickets.tsx refactored successfully.");

// Now AuthProvider.tsx Ticket listener
const authPath = path.join(process.cwd(), 'src', 'components', 'AuthProvider.tsx');
let authContent = fs.readFileSync(authPath, 'utf8');

const authTicketStart = `  // Global notification listener for ticket replies\n  useEffect(() => {\n    if (!user?.email || typeof window === 'undefined') return;\n    if ('Notification' in window && Notification.permission !== 'granted') return;\n\n    let mounted = true;`;
const authTicketEnd = `  }, [user?.email]);`;
const idxStart = authContent.indexOf(authTicketStart);
const idxEnd = authContent.indexOf(authTicketEnd, idxStart) + authTicketEnd.length;

const newAuthTicketLogic = `  // Global notification listener for ticket replies
  useEffect(() => {
    if (!user?.email || typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission !== 'granted') return;

    let mounted = true;
    let channel: any = null;

    const setupTicketNotifications = async () => {
      try {
        const { data: userTickets } = await supabase
          .from("tickets")
          .select("id")
          .eq("createdBy", user.email);

        if (!mounted || !userTickets || userTickets.length === 0) return;

        const ticketIds = userTickets.map(t => t.id);
        console.log(\`🔔 Global notification listener: monitoring \${ticketIds.length} tickets\`);

        channel = supabase.channel('global-ticket-notifications')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const message = payload.new as any;
            if (ticketIds.includes(message.ticketId) && message.createdBy !== user.email) {
               try {
                 const notification = new Notification('New Reply to Your Ticket', {
                   body: \`\${message.createdBy} replied: \${message.text?.substring(0, 100)}\${message.text && message.text.length > 100 ? '...' : ''}\`,
                   icon: '/favicon.ico',
                   tag: \`ticket-\${message.ticketId}\`,
                   requireInteraction: false,
                   silent: false
                 });
                 notification.onclick = () => {
                   window.focus();
                   window.location.href = '/tickets';
                   notification.close();
                 };
                 setTimeout(() => notification.close(), 6000);
               } catch (err) {
                 console.error('Failed to show notification:', err);
               }
            }
          })
          .subscribe();
      } catch (error) {
        console.error('Failed to set up ticket notifications:', error);
      }
    };

    setupTicketNotifications();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.email]);`;

authContent = authContent.substring(0, idxStart) + newAuthTicketLogic + authContent.substring(idxEnd);
fs.writeFileSync(authPath, authContent);
console.log("AuthProvider.tsx ticket listener refactored successfully.");
