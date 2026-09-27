import fs from 'fs';
import path from 'path';

const ticketsPath = path.join(process.cwd(), 'src', 'pages', 'tickets.tsx');
let content = fs.readFileSync(ticketsPath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// Line 927ish
content = content.replace(
  `await updateDoc(doc(db, 'tickets', editingMessage.ticketId, 'messages', editingMessage.id), { text: editingMessage.text, editedAt: serverTimestamp() });`,
  `await supabase.from('messages').update({ text: editingMessage.text }).eq('id', editingMessage.id);`
);

// Line 1011ish
content = content.replace(
  `await updateDoc(doc(db, 'tickets', editingTicket.id), { title: editTicketData.title, description: editTicketData.description, priority: editTicketData.priority || 'Normal', confidential: !!editTicketData.confidential });`,
  `await supabase.from('tickets').update({ title: editTicketData.title, description: editTicketData.description, priority: editTicketData.priority || 'Normal', confidential: !!editTicketData.confidential }).eq('id', editingTicket.id);`
);

// Line 1073ish
content = content.replace(
  `await updateDoc(doc(db, 'tickets', closeDialogOpen), { status: 'closed' });`,
  `await supabase.from("tickets").update({ status: 'closed' }).eq('id', closeDialogOpen);`
);

fs.writeFileSync(ticketsPath, content);
console.log("tickets.tsx remaining TS errors fixed");
