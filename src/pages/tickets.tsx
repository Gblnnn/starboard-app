import AddRecordButton from "@/components/add-record-button";
import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import CustomDropDown from '@/components/custom-dropdown';
import { ResponsiveModal } from "@/components/responsive-modal";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from "@/lib/supabase";
import JavascriptTimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import { ArrowDown, ArrowUp, FileX, Globe, Info, Loader2, Lock, LockKeyholeIcon, MoreVertical, Reply, Send, Ticket } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactTimeAgo from "react-time-ago";
import { toast } from "sonner";

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: "open" | "closed";
  createdBy: string;
  createdAt: any;
  lastMessage?: string;
  lastMessageAt?: any;
  priority?: string;
  confidential?: boolean;
}

interface Message {
  id: string;
  text: string;
  createdBy: string;
  createdAt: any;
  parentId?: string | null;
}

// Small rich text field using contentEditable. Keeps a minimal API: controlled HTML string.
const RichTextField: React.FC<{ value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number; style?: React.CSSProperties }> = ({ value, onChange, placeholder, minHeight = 100, style }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    // avoid moving caret when possible: only update if different
    if ((ref.current.innerHTML || '') !== (value || '')) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        style={{
          minHeight,
          padding: '0.5rem',
          outline: 'none',
          borderRadius: 8,
          background: 'rgba(100 100 100 / 10%)',
          width: '100%',
          boxSizing: 'border-box',
          ...style,
        }}
      />
      {!value && placeholder ? (
        <div style={{ position: 'absolute', left: 12, top: 8, color: '#9ca3af', pointerEvents: 'none', fontSize: '1rem' }}>{placeholder}</div>
      ) : null}
    </div>
  );
};

// Top-level composer component - defined outside to prevent recreation on every render
const TopLevelComposer: React.FC<{ posting: boolean, text: string, onTextChange: (text: string) => void, onPost: (text: string) => Promise<boolean>, onCancel?: () => void }> = ({ posting, text, onTextChange, onPost, onCancel }) => {
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; const ok = await onPost(text); if (ok) onTextChange(''); }} style={{ display: 'flex', gap: 8, flexFlow: 'column', width: '100%' }}>
      <RichTextField value={text} onChange={onTextChange} placeholder="Reply to this thread" minHeight={120} />
      <div style={{ display: 'flex', justifyContent: '', gap: 8 }}>
        {onCancel ? (
          <>
            <button type="button" onClick={() => { onTextChange(''); onCancel && onCancel(); }} style={{ padding: "0.5rem 1.5rem", background: '#eee', border: 'none', borderRadius: 8, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={posting || !text.trim()} style={{ padding: "0.5rem 1.5rem", background: '', color: '', border: 'none', borderRadius: 8, flex: 1 }}>{posting ? 'Posting...' : 'Post'}{posting ? <Loader2 className="animate-spin" size={14} /> : <Send size={15} />}</button>
          </>
        ) : (
          <button type="submit" disabled={posting || !text.trim()} style={{ padding: "0.5rem 1.5rem", flex: 1, width: "fit-content", cursor: posting || !text.trim() ? 'not-allowed' : 'pointer' }}>{posting ? <><Loader2 className="animate-spin" size={14} /> Posting...</> : <><Reply size={15} /> Reply</>}</button>
        )}
      </div>
    </form>
  );
};

// Minimal sanitizer: whitelist basic tags and remove attributes (except safe href on anchors).
const sanitizeHtml = (html: string) => {
  if (!html) return '';
  try {
    const doc = typeof window !== 'undefined' ? new DOMParser().parseFromString(html, 'text/html') : null;
    if (!doc) return '';
    const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'a', 'p', 'br', 'ul', 'ol', 'li', 'div', 'span']);
    const walk = (root: Element) => {
      const children = Array.from(root.children);
      for (const child of children) {
        const tag = child.tagName.toLowerCase();
        if (!allowed.has(tag)) {
          // unwrap the node
          const parent = child.parentNode;
          if (parent) {
            while (child.firstChild) parent.insertBefore(child.firstChild, child);
            parent.removeChild(child);
          } else {
            child.remove();
          }
        } else {
          // strip attributes except safe href on anchors
          const attrs = Array.from(child.attributes);
          for (const attr of attrs) {
            if (tag === 'a' && attr.name === 'href') {
              const v = attr.value.trim();
              if (!/^https?:\/\//.test(v) && !/^mailto:/.test(v) && !/^\//.test(v) && !/^#/.test(v)) {
                child.removeAttribute(attr.name);
              }
            } else {
              child.removeAttribute(attr.name);
            }
          }
          walk(child);
        }
      }
    };
    walk(doc.body);
    return doc.body.innerHTML;
  } catch (e) {
    return '';
  }
};

// New helper function to extract plain text from HTML
const getPlainTextFromHtml = (html: string) => {
  if (!html) return '';
  try {
    const doc = typeof window !== 'undefined' ? new DOMParser().parseFromString(html, 'text/html') : null;
    if (!doc) return '';
    return doc.body.textContent || '';
  } catch (e) {
    return '';
  }
};

export default function Tickets() {
  const { userData, user } = useAuth();
  const activeUserEmail = user?.email || userData?.email || '';
  const [isDesktop, setIsDesktop] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  const hasTicketHandler = useMemo(() => {
    try {
      const c = userData?.clearance || '{}';
      const parsed = typeof c === 'string' ? JSON.parse(c) : c;
      return !!parsed?.tickets_handler;
    } catch (e) { return false; }
  }, [userData?.clearance]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyIsHandler, setReplyIsHandler] = useState<Record<string, boolean>>({});
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const [newTicket, setNewTicket] = useState({ title: "", description: "", priority: 'Normal', confidential: false });
  const [showNewModal, setShowNewModal] = useState(false);
  const newDescRef = useRef<HTMLTextAreaElement | null>(null);
  const editDescRef = useRef<HTMLTextAreaElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [overrideDeleteEnabled, setOverrideDeleteEnabled] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const openOrScrollNewCard = () => {
    setShowNewModal(true);
  };
  const [sending, setSending] = useState(false);
  const [topComposerOpen, setTopComposerOpen] = useState<Record<string, boolean>>({});
  const [composerClosing, setComposerClosing] = useState<Record<string, boolean>>({});
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  // removed optimistic pending messages: we will not render replies until server confirms
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState<string | null>(null);
  const [profileDialogEmail, setProfileDialogEmail] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editTicketData, setEditTicketData] = useState({ title: '', description: '', priority: 'Normal', confidential: false });
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string; ticketId: string } | null>(null);
  const [ticketCreators, setTicketCreators] = useState<Record<string, string>>({});

  // helper: build message tree (roots array) from flat messages



  const avatarColor = (seed?: string) => {
    const palette = ["#6b73ff", "#34d399", "#f59e0b", "#fb7185", "#60a5fa", "#a78bfa"];
    if (!seed) return palette[0];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
    return palette[Math.abs(h) % palette.length];
  };

  // Workaround for old iOS Safari: remove transforms while any textarea is focused
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || (target as HTMLElement).closest && (target as HTMLElement).closest('textarea'))) {
        document.body.classList.add('textarea-focused');
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'TEXTAREA') {
        // slight delay to allow focus to move to another textarea
        setTimeout(() => { if (!document.activeElement || document.activeElement.tagName !== 'TEXTAREA') document.body.classList.remove('textarea-focused'); }, 50);
      }
    };
    document.addEventListener('focusin', onFocusIn as any);
    document.addEventListener('focusout', onFocusOut as any);
    return () => {
      document.removeEventListener('focusin', onFocusIn as any);
      document.removeEventListener('focusout', onFocusOut as any);
      document.body.classList.remove('textarea-focused');
    };
  }, []);

  useEffect(() => {
    setLoadingTickets(true);
    const fetchTickets = async () => {
      const { data } = await supabase.from('tickets').select('*').order('createdAt', { ascending: false });
      if (data) setTickets(data as Ticket[]);
      setLoadingTickets(false);
    };
    fetchTickets();
    const channel = supabase.channel('tickets-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeUserEmail]);

  // when a ticket is selected, stream its messages
  useEffect(() => {
    if (!selectedTicket) return;
    setMessagesLoading(true);
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('ticketId', selectedTicket.id).order('createdAt', { ascending: true });
      if (data) setMessages(data as Message[]);
      setMessagesLoading(false);
    };
    fetchMessages();
    const channel = supabase.channel(`messages-${selectedTicket.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `ticketId=eq.${selectedTicket.id}` }, fetchMessages)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket]);

  // fetch handler status for message authors so we can label replies
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const emails = Array.from(new Set(messages.map(m => m.createdBy).filter(Boolean)));
        if (emails.length === 0) {
          if (mounted) setReplyIsHandler({});
          return;
        }
        const pairs = await Promise.all(emails.map(async (email) => {
          try {
            const { data: usersData } = await supabase.from('users').select('*').eq('email', email);
            if (usersData && usersData.length > 0) {
              const data = usersData[0];
              const c = data.clearance || '{}';
              const parsed = typeof c === 'string' ? JSON.parse(c || '{}') : c;
              return [email, !!parsed?.tickets_handler] as [string, boolean];
            }
            return [email, false] as [string, boolean];
          } catch (e) { return [email, false] as [string, boolean]; }
        }));
        if (!mounted) return;
        const map: Record<string, boolean> = {};
        pairs.forEach(([email, val]) => { map[email] = val; });
        setReplyIsHandler(map);
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [messages]);

  // fetch display names for ticket creators so we can show their name instead of email when available
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const emails = Array.from(new Set([
          ...tickets.map(t => t.createdBy).filter(Boolean),
          ...messages.map(m => m.createdBy).filter(Boolean),
        ]));
        if (emails.length === 0) {
          if (mounted) setTicketCreators({});
          return;
        }
        const map: Record<string, string> = {};
        await Promise.all(emails.map(async (email) => {
          try {
            const { data: usersData } = await supabase.from('users').select('*').eq('email', email);
            if (usersData && usersData.length > 0) {
              const data = usersData[0];
              map[email] = data.name || data.displayName || data.fullName || email;
            } else {
              map[email] = email;
            }
          } catch (e) {
            map[email] = email;
          }
        }));
        if (mounted) setTicketCreators(map);
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [tickets, messages]);

  // fetch message counts for each ticket (uses aggregation count API)
  useEffect(() => {
    if (!tickets || tickets.length === 0) return;
    let mounted = true;
    (async () => {
      try {
        const entries = await Promise.all(tickets.map(async (t) => {
          try {
            const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('ticketId', t.id);
            return [t.id, count || 0] as [string, number];
          } catch (e) {
            console.error('count error', e);
            return [t.id, 0] as [string, number];
          }
        }));
        if (!mounted) return;
        const map: Record<string, number> = {};
        entries.forEach(([id, count]) => { map[id] = count; });
        setMessageCounts(map);
      } catch (err) { console.error(err); }
    })();
    return () => { mounted = false; };
  }, [tickets]);

  // helper: build message tree (roots array) from flat messages
  const messageRoots = useMemo(() => {
    // Build tree only from server messages. We will not render optimistic pending messages.
    const byId = new Map<string, Message & { children: Message[] }>();
    messages.forEach(m => byId.set(m.id, { ...m, children: [] }));
    const roots: (Message & { children: Message[] })[] = [];
    const sorted = Array.from(byId.values()).sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime());
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime());
      return ta - tb;
    });
    sorted.forEach(node => {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [messages, selectedTicket]);

  // filter tickets based on confidentiality and handler permission
  const [searchQuery, setSearchQuery] = useState('');

  // helper: escape regex
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // extract meaningful keywords from a sentence: tokenize, lowercase, remove stopwords and short words
  const getKeywordsFromQuery = (q: string) => {
    if (!q) return [] as string[];
    const stopwords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'for', 'to', 'in', 'of', 'with', 'that', 'this', 'it', 'by', 'from', 'as', 'are', 'be', 'was', 'were', 'or', 'but', 'have', 'has', 'had',
      'i', 'you', 'we', 'they', 'he', 'she', 'my', 'your',
      // common verbs/fillers often not useful as keywords
      'want', 'wants', 'wanted', 'need', 'needs', 'needed', 'like', 'likes', 'liked', 'get', 'gets', 'got', 'make', 'makes', 'made', 'using', 'use', 'used', 'trying', 'try', 'tried', 'help', 'please', 'how', 'can', 'could', 'would', 'should'
    ]);
    return q
      .toLowerCase()
      .replace(/[\p{P}$+<>=~`^|\[\]{}\(\)\\]/gu, ' ')
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s.length > 2 && !stopwords.has(s));
  };

  const keywords = useMemo(() => getKeywordsFromQuery(searchQuery), [searchQuery]);

  const highlightText = (text: string, kws: string[]) => {
    if (!text) return '';
    if (!kws || kws.length === 0) return text;
    const pattern = kws.map(k => escapeRegExp(k)).join('|');
    const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
    return parts.map((part, i) => {
      if (part.match(new RegExp(`^(${pattern})$`, 'i'))) {
        return <mark key={i} style={{ background: '#fff59d', padding: '0 2px', borderRadius: 3 }}>{part}</mark>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // filter tickets based on confidentiality, handler permission, and search keywords
  const visibleTickets = useMemo(() => {
    const list = (tickets || []).filter(t => {
      // Ensure consistent case for email comparison
      const ticketCreatorEmail = t.createdBy?.toLowerCase();
      const currentUserEmail = activeUserEmail.toLowerCase();

      if (t.confidential && !hasTicketHandler && ticketCreatorEmail !== currentUserEmail) return false;
      return true;
    }).map(t => {
      const hay = `${t.title || ''} ${t.description || ''} ${t.lastMessage || ''}`.toLowerCase();
      const score = keywords.length === 0 ? 0 : keywords.reduce((acc, k) => acc + (hay.indexOf(k) !== -1 ? 1 : 0), 0);
      const statusScore = t.status === 'open' ? 1 : 0;
      return { t, score, statusScore };
    });

    // if no keywords, preserve original sort (recent first)
    if (keywords.length === 0) {
      return list.sort((a, b) => {
        if (b.statusScore !== a.statusScore) return b.statusScore - a.statusScore;
        const ta = (a.t.lastMessageAt || a.t.createdAt) as any;
        const tb = (b.t.lastMessageAt || b.t.createdAt) as any;
        const na = ta && (ta.toDate ? ta.toDate().getTime() : (typeof ta === 'number' ? ta : new Date(ta).getTime()));
        const nb = tb && (tb.toDate ? tb.toDate().getTime() : (typeof tb === 'number' ? tb : new Date(tb).getTime()));
        return (nb || 0) - (na || 0);
      }).map(x => x.t);
    }

    // sort by status (open first), then by score (desc), then by recent activity
    return list.sort((a, b) => {
      if (b.statusScore !== a.statusScore) return b.statusScore - a.statusScore;
      if (b.score !== a.score) return b.score - a.score;
      const ta = (a.t.lastMessageAt || a.t.createdAt) as any;
      const tb = (b.t.lastMessageAt || b.t.createdAt) as any;
      const na = ta && (ta.toDate ? ta.toDate().getTime() : (typeof ta === 'number' ? ta : new Date(ta).getTime()));
      const nb = tb && (tb.toDate ? tb.toDate().getTime() : (typeof tb === 'number' ? tb : new Date(tb).getTime()));
      return (nb || 0) - (na || 0);
    }).map(x => x.t);
  }, [tickets, hasTicketHandler, keywords]);

  // control fade-in show class so transition always runs after loading completes
  const [ticketsFadeShow, setTicketsFadeShow] = useState(false);
  useEffect(() => {
    let id: any;
    if (!loadingTickets && visibleTickets.length > 0) {
      // delay a tick so the class is added after mount to trigger transition
      id = setTimeout(() => setTicketsFadeShow(true), 40);
    } else {
      setTicketsFadeShow(false);
    }
    return () => { if (id) clearTimeout(id); };
  }, [loadingTickets, visibleTickets.length]);

  // no per-item JS stagger; CSS handles stagger via --i custom property

  // post: do not append anything locally until server confirms. Return boolean success.
  const postMessage = async (ticketId: string, text: string, parentId?: string | null): Promise<boolean> => {
    const plainText = getPlainTextFromHtml(text).trim();
    if (!plainText || !activeUserEmail) return false;
    setSending(true);
    try {
      // store on server
      await supabase.from('messages').insert({
        ticketId: ticketId,
        text: plainText,
        createdBy: activeUserEmail,
        parentId: parentId || null,
      });
      // update ticket preview
      await supabase.from("tickets").update({ lastMessage: text.trim(), lastMessageAt: new Date().toISOString() }).eq('id', ticketId);
      // optimistically update message count for the ticket
      setMessageCounts(prev => ({ ...prev, [ticketId]: (prev[ticketId] || 0) + 1 }));

      // Do not append locally; rely on Firestore snapshot (ordered by server timestamp)

      return true;
    } catch (err) {
      console.error(err);
      toast.error("Failed to post message");
      return false;
    } finally { setSending(false); }
  };

  const handleCreateTicket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const creatorEmail = activeUserEmail || null;
    if (!newTicket.title || !newTicket.description || !creatorEmail) {
      toast.error('Unable to determine your email address. Please refresh or check your profile.');
      return;
    }
    setSending(true);
    try {
      await supabase.from("tickets").insert({
        title: newTicket.title,
        description: newTicket.description,
        priority: newTicket.priority || 'Normal',
        confidential: !!newTicket.confidential,
        status: "open",
        createdBy: creatorEmail,
        lastMessage: newTicket.description,
        lastMessageAt: new Date().toISOString(),
      });
      setNewTicket({ title: "", description: "", priority: 'Normal', confidential: false });
      setShowNewModal(false);
      toast.success("Ticket created");
    } catch (err) { console.error(err); toast.error("Failed to create ticket"); }
    finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try { await supabase.from("tickets").delete().eq('id', id); toast.success("Ticket deleted"); }
    catch (err) { console.error(err); toast.error("Failed to delete ticket"); }
    finally { setDeleting(false); setDeleteDialogOpen(null); }
  };

  const handleToggleConfidential = async (ticketId: string, current: boolean) => {
    try {
      // optimistic update
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, confidential: !current } : t));
      await supabase.from('tickets').update({ confidential: !current }).eq('id', ticketId);
      toast.success(!current ? 'Switched to private' : 'Switched to public');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update confidentiality');
      // rollback on error
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, confidential: current } : t));
    }
  };

  // UI render helpers
  const RenderNode: React.FC<{ node: Message & { children: Message[] }, depth?: number, ticketId: string }> = ({ node, depth = 0, ticketId }) => {
    const [openReply, setOpenReply] = useState(false);
    const [text, setText] = useState("");
    const [collapsed, setCollapsed] = useState(false);
    const [replyClosing, setReplyClosing] = useState(false);
    return (
      <div style={{ marginLeft: depth * 16, padding: "8px 0", }}>
        <div style={{ display: 'flex', gap: 8 }}>



          <div style={{ flex: 1, border: "", padding: "0.5rem" }}>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(node.createdBy), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                {(() => {
                  const dn = ticketCreators[node.createdBy] || node.createdBy || 'U'; const parts = dn.split(/\s+/).filter(Boolean);
                  const initials = parts.length === 1 ? parts[0].slice(0, 2) : (parts[0][0] + (parts[1][0] || '')).slice(0, 2); return (initials || 'U').toUpperCase();
                })()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{ticketCreators[node.createdBy] || (node.createdBy && node.createdBy.split('@')[0])}</div>
                  {replyIsHandler[node.createdBy] && (
                    <div style={{ fontSize: "0.76rem", padding: '0.06rem 0.32rem', borderRadius: 6, background: '#eef2ff', color: '#3730a3', fontWeight: 600, marginLeft: 4 }}>Handler</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>{node.createdBy}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>·</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}><ReactTimeAgo timeStyle={"twitter"} date={getDate(node.createdAt)} /></div>
                </div>
              </div>


              {(() => {
                const canEdit = !!(userData?.role === 'admin' || (activeUserEmail && node.createdBy === activeUserEmail));
                return (
                  <CustomDropDown
                    className=""
                    trigger={<MoreVertical onClick={(e: any) => e.stopPropagation()} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 18, padding: 6, borderRadius: 6 }} />}
                    option1Text={canEdit ? 'Edit' : (selectedTicket?.status === 'open' ? 'Reply' : 'View')}
                    onOption1={() => { if (canEdit) { setEditingMessage({ id: node.id, text: node.text, ticketId }); } else if (selectedTicket?.status === 'open') { setOpenReply(v => !v); } }}
                    option2Text={canEdit ? 'Delete' : ''}
                    onOption2={async () => {
                      if (!canEdit) return;
                      if (!confirm('Delete this reply?')) return;
                      try {
                        await supabase.from('messages').delete().eq('id', node.id);
                        // update local count
                        setMessageCounts(prev => ({ ...prev, [ticketId]: Math.max(0, (prev[ticketId] || 1) - 1) }));
                        toast.success('Reply deleted');
                      } catch (err) { console.error(err); toast.error('Failed to delete reply'); }
                    }}
                    onClear={undefined}
                  />
                );
              }
              )()}

            </div>
            <div style={{ height: "0.5rem" }} />
            <div style={{ marginTop: 6, fontSize: "0.95rem", textAlign: "left" }}>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.text || '') }} />
            </div>

            <div style={{ marginTop: 8 }}>

              {node.children && node.children.length > 0 && (
                <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', color: '#666', marginLeft: 8 }}>{collapsed ? `Show ${node.children.length} replies` : `Hide ${node.children.length} replies`}</button>
              )}
            </div>
            {openReply && (
              <div className={replyClosing ? 'composer-animate-out' : 'composer-animate-in'} style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <RichTextField value={text} onChange={setText} placeholder="Reply..." minHeight={64} style={{ padding: 8 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={async () => { const plainText = getPlainTextFromHtml(text).trim(); if (!plainText) return; const payload = text; const ok = await postMessage(ticketId, payload, node.id); if (ok) { setText(''); setReplyClosing(true); setTimeout(() => { setOpenReply(false); setReplyClosing(false); }, 180); } }} disabled={sending || !getPlainTextFromHtml(text).trim()} style={{ padding: '0.5rem 0.8rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8 }}>{sending ? <><Loader2 className="animate-spin" size={14} /> </> : 'Post'}</button>
                  <button onClick={() => { setReplyClosing(true); setTimeout(() => { setOpenReply(false); setReplyClosing(false); setText(''); }, 180); }} style={{ padding: '0.4rem 0.6rem', background: '#eee', border: 'none', borderRadius: 8 }}>Cancel</button>
                </div>
              </div>
            )}
            {node.children && node.children.length > 0 && !collapsed && (
              <div style={{ marginTop: 8 }}>
                {node.children.map((c: any) => <RenderNode key={c.id} node={c} depth={(depth || 0) + 1} ticketId={ticketId} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Back
        blurBG
        fixed
        title={""}
        extra={<div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
          <div className="back-search" style={{ border: "", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", width: isDesktop ? 'calc(100vw - 80px)' : 'calc(100% - 24px)', maxWidth: isDesktop ? '1400px' : undefined, margin: '0 auto', borderRadius: "1rem" }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tickets..." className="back-search-input" />
            {searchQuery ? <button className="back-search-clear" onClick={() => setSearchQuery('')}>Clear</button> : null}
            {hasTicketHandler && (
              <button title={overrideDeleteEnabled ? 'Override delete: ON' : 'Override delete: OFF'} onClick={() => setOverrideDeleteEnabled(v => !v)} className="back-search-override">
                <FileX size={16} />
              </button>
            )}
          </div>
          {/* <button 
            onClick={() => {
              if ('Notification' in window && Notification.permission === 'granted') {
                try {
                  const notif = new Notification('Test Notification', {
                    body: 'This is a test notification! Your notification system is working. 🎉',
                    icon: '/favicon.ico'
                  });
                  console.log('✅ Test notification sent');
                  setTimeout(() => notif.close(), 5000);
                  toast.success('Test notification sent!');
                } catch (err) {
                  console.error('❌ Test notification failed:', err);
                  toast.error('Failed to send test notification');
                }
              } else {
                toast.error('Notification permission not granted');
              }
            }}
            style={{ padding: '0.5rem', fontSize: '0.75rem', background: '#eef2ff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, cursor: 'pointer' }}
            title="Test notifications"
          >
            Test 🔔
          </button> */}

          {/* <RefreshButton onClick={() => {} } fetchingData={loadingTickets} refreshCompleted={false} /> */}

        </div>}
      />

      <div className="back-search-wrapper" style={{ paddingTop: "0.75rem" }}>

      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, paddingTop: '7rem' }}>
        {
          tickets && tickets.length > 0 && (
            <>
              {/* <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding:"0.5rem", justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, padding: '0.25rem 0.6rem', borderRadius: "0.5rem",  fontWeight: 600, background: '#fff1f2', color: '#dc2626' }}>OPEN {(tickets || []).filter(t => !t.confidential || hasTicketHandler).filter(t => t.status === 'open').length}</div>
                <div style={{ fontSize: 13, padding: '0.25rem 0.6rem', borderRadius: "0.5rem",
                  background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>CLOSED {(tickets || []).filter(t => !t.confidential || hasTicketHandler).filter(t => t.status !== 'open').length}</div>
            </div> */}

            </>)
        }

        {visibleTickets.length === 0 && !loadingTickets ? (
          <Empty style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Ticket color="darkblue" size={36} /></EmptyMedia>
              <EmptyTitle>No Tickets</EmptyTitle>
              <EmptyDescription>Create a new ticket to start a thread.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : loadingTickets ? (
          <div style={{ display: 'flex', justifyContent: 'center', border: "", position: "absolute", width: '100%', height: '100%', left: 0, top: 0, alignItems: "center" }}><Loader2 className="animate-spin" /></div>
        ) : (
          <div className={`tickets-fade ${ticketsFadeShow ? 'show' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 12, border: "", paddingBottom: "6rem" }}>
            {visibleTickets.map((t, idx) => {
              const expanded = selectedTicket?.id === t.id;
              return (
                <div key={t.id} className="ticket-item" data-id={t.id} style={{ ['--i' as any]: idx }}>
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      gap: 12,
                      padding: 14,
                      borderRadius: 10,
                      background: '#fff',
                      border: '1px solid rgba(16,24,40,0.06)',
                      boxShadow: expanded ? '0 6px 18px rgba(16,24,40,0.06)' : 'none',
                      alignItems: 'flex-start',
                      transition: 'box-shadow 180ms ease, transform 120ms ease',
                      transform: expanded ? 'translateY(-2px)' : 'none',
                      flex: 1
                    }}
                  >

                    <div style={{ display: "flex", border: "", flex: 1, minWidth: 0, flexFlow: "column", gap: "0.25rem" }}>
                      <div style={{ display: "flex", border: "", flex: 1, justifyContent: "space-between", alignItems: "center", }}>
                        <div id="header-section" style={{ display: "flex", border: " " }}>
                          <button onClick={(e) => { e.stopPropagation(); setProfileDialogEmail(t.createdBy); }} style={{ width: 65, height: 65, borderRadius: 12, background: avatarColor(t.createdBy), color: 'white', border: 'none', fontWeight: 700 }}>
                            {<Ticket />}
                          </button>
                          <div style={{ display: "flex", flexFlow: "column", border: " ", minWidth: 0, marginLeft: 8, gap: "0.15rem" }}>
                            <p style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "1rem", fontWeight: "600", padding: 0, border: "" }}>
                              {ticketCreators[t.createdBy] || t.id}
                            </p>

                            <div style={{ fontSize: 12, color: 'darkblue', fontWeight: "500" }}>{t.createdBy} · <ReactTimeAgo timeStyle={"twitter"} date={getDate(t.createdAt)} /></div>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

                              <div style={{ width: "fit-content", fontSize: 12, padding: '0.15rem 0.5rem', borderRadius: 999, background: t.status === 'open' ? '#fff1f2' : '#ecfdf5', color: t.status === 'open' ? '#dc2626' : '#059669', fontWeight: 600 }}>{t.status.toUpperCase()}</div>

                              <div style={{ textTransform: "capitalize", width: "fit-content", fontSize: 12, padding: '0.15rem 0.5rem', borderRadius: 999, background: (t.priority === 'High' ? '#fff1f2' : (t.priority === 'Low' ? '#ecfdf5' : '#eef2ff')), color: (t.priority === 'High' ? '#b91c1c' : (t.priority === 'Low' ? '#059669' : '#3730a3')), fontWeight: 600 }}>{(t.priority || 'Normal')}</div>



                            </div>
                          </div>

                        </div>
                        {(t.createdBy === activeUserEmail || (overrideDeleteEnabled && hasTicketHandler)) && (
                          <CustomDropDown
                            trigger={<MoreVertical size={15} />}
                            option1Text={'Edit'}
                            onOption1={() => { setEditingTicket(t); setEditTicketData({ title: t.title, description: t.description, priority: (t as any).priority || 'Normal', confidential: !!(t as any).confidential }); }}
                            option2Text={'Delete'}
                            onOption2={() => { setDeleteDialogOpen(t.id); }}
                            onClear={undefined}
                          />
                        )}
                      </div>

                      <div style={{ marginTop: 6, color: '#374151', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: "0.25rem" }}>


                        <p style={{ fontWeight: "500", marginBottom: "0.5rem", lineHeight: "1.25rem", fontSize: "1rem", textAlign: "left" }}>{highlightText(t.title || '', keywords)}</p>
                        <p style={{ fontSize: "1rem", textAlign: "left", fontWeight: "400" }}>{highlightText(t.description || '', keywords)}</p>
                      </div>
                      <br />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                        <p onClick={() => setSelectedTicket(expanded ? null : t)} style={{ cursor: 'pointer', fontWeight: "600", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "darkblue", margin: 0, border: "" }}>
                          {expanded ? <ArrowUp size={15} /> : <ArrowDown size={15} />} {expanded ? "Hide Replies " : "Replies "} ({messageCounts[t.id] ?? 0})
                        </p>

                        {(t.createdBy === activeUserEmail || hasTicketHandler) ? (
                          <button onClick={(e) => { e.stopPropagation(); handleToggleConfidential(t.id, !!t.confidential); }} title={t.confidential ? 'Private' : 'Public'} style={{ background: t.createdBy === activeUserEmail ? "#eef2ff" : "none", border: '', padding: "0.5rem", cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, marginRight: "0.75rem" }}>
                            <p>{t.confidential ? <Lock color="darkblue" size={12} /> : <Globe color="darkblue" size={12} />}</p>
                            {/* <p>{t.confidential ? 'Private Thread' : 'Public Thread'}</p> */}
                            {/* <ChevronRight size={12} style={{ marginLeft: 4, opacity: 0.6 }} /> */}
                          </button>
                        ) : (
                          <div title={t.confidential ? 'Private' : 'Public'} style={{ background: t.createdBy === activeUserEmail ? "#eef2ff" : "none", border: '', padding: "0.5rem", borderRadius: 6, fontSize: 12, color: "", opacity: 0.8, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: t.createdBy === activeUserEmail ? 'pointer' : "", marginRight: "0.75rem", fontWeight: "500", }}>
                            {t.confidential ? <Lock color="darkblue" size={12} /> : <Globe color="darkblue" size={12} />}
                            {/* <span style={{ fontSize: 12 }}>{t.confidential ? 'Private' : 'Public Thread'}</span> */}
                          </div>
                        )}
                      </div>

                      <div style={{
                        overflow: 'hidden',
                        transition: 'max-height 260ms ease, opacity 220ms ease',
                        maxHeight: expanded ? 1200 : 0,
                        opacity: expanded ? 1 : 0,
                        marginTop: 8
                      }}>
                        <div style={{ padding: '', background: '', borderRadius: 8, border: '' }}>
                          {/* <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Replies </div> */}
                          <div style={{ padding: "0.5rem" }}>
                            {messagesLoading && expanded ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Loader2 className="animate-spin" /></div>
                            ) : (messageRoots.length === 0 ? <div style={{ color: '#666' }}>No messages yet.</div> : messageRoots.map(r => <RenderNode key={r.id} node={r} depth={0} ticketId={t.id} />))}
                          </div>
                          {t.status === 'open' && (
                            <div style={{ marginTop: 12 }}>
                              <div className="ticket-actions-inline">
                                {!topComposerOpen[t.id] ? (
                                  <button onClick={(e) => { e.stopPropagation(); setTopComposerOpen(prev => ({ ...prev, [t.id]: true })); }} style={{ padding: "0.5rem 1rem", background: '', color: '', border: 'none', borderRadius: 8, flex: 1 }}><Reply size={15} />Reply</button>
                                ) : (
                                  <div className={composerClosing[t.id] ? "composer-animate-out" : "composer-animate-in"}>
                                    <TopLevelComposer
                                      posting={sending}
                                      text={draftTexts[t.id] || ''} // Pass the HTML string
                                      onTextChange={(newText) => setDraftTexts(prev => ({ ...prev, [t.id]: newText }))}
                                      onPost={async (text: string) => {
                                        // do not clear draft until post completes; show loader on button
                                        const ok = await postMessage(t.id, text, null);
                                        if (ok) {
                                          setComposerClosing(prev => ({ ...prev, [t.id]: true }));
                                          await new Promise(res => setTimeout(res, 180));
                                          setComposerClosing(prev => ({ ...prev, [t.id]: false }));
                                          setTopComposerOpen(prev => ({ ...prev, [t.id]: false }));
                                          return true;
                                        }
                                        return false;
                                      }}
                                      onCancel={() => {
                                        setDraftTexts(prev => ({ ...prev, [t.id]: '' }));
                                        setComposerClosing(prev => ({ ...prev, [t.id]: true }));
                                        setTimeout(() => {
                                          setTopComposerOpen(prev => ({ ...prev, [t.id]: false }));
                                          setComposerClosing(prev => ({ ...prev, [t.id]: false }));
                                        }, 180);
                                      }}
                                    />
                                  </div>
                                )}

                                {hasTicketHandler && !topComposerOpen[t.id] && (
                                  <button onClick={(e) => { e.stopPropagation(); setCloseDialogOpen(t.id); }} style={{ background: '', color: 'crimson', padding: '0.5rem 1rem', border: 'none', borderRadius: 8, flex: 1 }}><Ticket size={18} />Close </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* <div style={{display:"flex", flexFlow:"column", border:"solid", width:"100%"}}>

                            <div style={{display:"flex", gap:6, alignItems:"center", border:"solid red"}}>

                                <button onClick={(e) => { e.stopPropagation(); setProfileDialogEmail(t.createdBy); }} style={{ width: 48, height: 48, borderRadius: 12, background: avatarColor(t.createdBy), color: 'white', border: 'none', fontWeight: 700 }}>
                                       {<Ticket/>}
                                </button>

                                <div style={{display:"flex", flexFlow:"column", border:"solid", minWidth:0}}>

                                    <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {t.title}
                                    </div>

                                <div style={{ fontSize: 12, color: '#6b7280' }}>{ticketCreators[t.createdBy] || t.createdBy} · <ReactTimeAgo timeStyle={"twitter"} date={getDate(t.createdAt)} /></div>
                                <div style={{ width:"fit-content",fontSize: 12, padding: '0.15rem 0.5rem', borderRadius: 999, background: t.status === 'open' ? '#ecfdf5' : '#fff1f2', color: t.status === 'open' ? '#059669' : '#dc2626', fontWeight: 700 }}>{t.status}</div>
                                </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border:"solid blue" }}>
                          
                          {((t.createdBy === user?.email) || (userData?.role === 'admin' || t.createdBy === user?.email)) && (
                            <CustomDropDown
                              trigger={<button onClick={(e:any) => e.stopPropagation()} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 18, padding: 6 }}>⋯</button>}
                              option1Text={t.createdBy === user?.email ? 'Edit' : ''}
                              onOption1={() => { if (t.createdBy !== user?.email) return; setEditingTicket(t); setEditTicketData({ title: t.title, description: t.description, priority: (t as any).priority || 'Normal', confidential: !!(t as any).confidential }); }}
                              option2Text={(userData?.role === 'admin' || t.createdBy === user?.email) ? 'Delete' : ''}
                              onOption2={() => { if (!(userData?.role === 'admin' || t.createdBy === user?.email)) return; setDeleteDialogOpen(t.id); }}
                              onClear={undefined}
                            />
                          )}
                        </div>
                            </div>
                         <div style={{ marginTop: 6, color: '#374151', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', border:"solid" }}>{t.description}</div>  
                        </div> */}

                  </div>


                </div>
              );
            })}
          </div>
        )}



        {/* Inline edit card replaces modal; no modal fallback */}

        <ResponsiveModal title="Edit Reply" open={!!editingMessage} onOpenChange={(v) => !v && setEditingMessage(null)} hideHeader>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 16 }}>
            <h3 style={{ margin: 0, marginBottom: 8, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}><Reply size={18} />Edit Reply</h3>
            <RichTextField value={editingMessage?.text || ''} onChange={(html) => setEditingMessage(editingMessage ? { ...editingMessage, text: html } : null)} minHeight={160} style={{ padding: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditingMessage(null)} style={{ flex: 1, padding: 10, background: '#eee', border: 'none' }}>Cancel</button>
              <button onClick={async () => { if (!editingMessage) return; try { await supabase.from('messages').update({ text: editingMessage.text }).eq('id', editingMessage.id); toast.success('Reply updated'); setEditingMessage(null); } catch (err) { console.error(err); toast.error('Failed to update reply'); } }} style={{ flex: 1, padding: 10, background: 'darkblue', color: 'white', border: 'none' }}>Save</button>
            </div>
          </div>
        </ResponsiveModal>

        <ResponsiveModal title="New Ticket" open={showNewModal} onOpenChange={(v) => { if (!v) { setShowNewModal(false); setNewTicket({ title: '', description: '', priority: 'Normal', confidential: false }); } }} hideHeader>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <button onClick={(e) => { e.stopPropagation(); }} style={{ width: 62, height: 62, borderRadius: 12, background: avatarColor(activeUserEmail || ''), color: 'white', border: 'none', fontWeight: 700 }}>
                <Ticket />
              </button>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '1rem', fontWeight: 500 }}>New Ticket</div>
                <div style={{ fontSize: 12, color: 'darkblue', fontWeight: '500' }}>{activeUserEmail}</div>
              </div>
            </div>

            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <Select value={newTicket.title} onValueChange={(v: string) => setNewTicket({ ...newTicket, title: v })}>
                  <SelectTrigger style={{ height: 40, display: 'flex', alignItems: 'center' }}>
                    <SelectValue placeholder="Select request type" />
                  </SelectTrigger>
                  <SelectContent style={{ fontSize: '1rem' }}>
                    <SelectItem value="Request for software installation">Request for software installation</SelectItem>
                    <SelectItem value="Request for Printer support">Request for Printer support</SelectItem>
                    <SelectItem value="Request for Troubleshooting">Autocad License Issue</SelectItem>
                    <SelectItem value="Request for Technical support">Request for Technical support</SelectItem>
                    <SelectItem value="Request for debugging">Request for debugging</SelectItem>
                    <SelectItem value="Feature request">Feature request</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Select value={newTicket.priority} onValueChange={(v: string) => setNewTicket({ ...newTicket, priority: v })}>
                    <SelectTrigger style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low Priority</SelectItem>
                      <SelectItem value="Normal">Normal Priority</SelectItem>
                      <SelectItem value="High">High Priority</SelectItem>
                      <SelectItem value="Critical">Critical Priority</SelectItem>
                    </SelectContent>
                  </Select>
                  <button type="button" onClick={() => setNewTicket({ ...newTicket, confidential: !newTicket.confidential })} style={{ width: 140, flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem', borderRadius: 8, background: newTicket.confidential ? '#f3f4f6' : '#fff', border: '1px solid rgba(0,0,0,0.04)' }}>
                    {newTicket.confidential ? <LockKeyholeIcon size={14} /> : <Globe size={14} />}
                    {newTicket.confidential ? 'Private' : 'Public'}
                  </button>
                </div>
              </div>

              <textarea ref={newDescRef} placeholder="Description" value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })} required style={{ padding: '1rem', minHeight: 140, width: '100%' }} />
              <div style={{ display: "flex", padding: "0.5rem 1rem", gap: "0.75rem", fontSize: "0.7rem", fontWeight: "500", alignItems: "center" }}>
                <Info style={{ color: "darkblue" }} size={35} />
                <p style={{ margin: 0, color: "#333" }}>
                  Public tickets are visible to all users, while private tickets are only visible to handlers and the IT Department.
                </p>

              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => { setShowNewModal(false); setNewTicket({ title: '', description: '', priority: 'Normal', confidential: false }); }} style={{ padding: 10, background: '#eee', border: 'none', flex: 1 }}>Cancel</button>
                <button type="submit" disabled={sending} style={{ padding: 10, background: 'darkblue', color: 'white', border: 'none', flex: 1 }}>{sending ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </ResponsiveModal>
        <ResponsiveModal title="Edit Ticket" open={!!editingTicket} onOpenChange={(v) => { if (!v) { setEditingTicket(null); setEditTicketData({ title: '', description: '', priority: 'Normal', confidential: false }); } }} hideHeader>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <button onClick={(e) => { e.stopPropagation(); }} style={{ width: 62, height: 62, borderRadius: 12, background: avatarColor(editingTicket?.createdBy || ''), color: 'white', border: 'none', fontWeight: 700 }}>
                <Ticket />
              </button>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>Edit Ticket</div>
                <div style={{ fontSize: 12, color: 'darkblue', fontWeight: '500' }}>{editingTicket?.createdBy}</div>
              </div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!editingTicket) return;
              try {
                await supabase.from('tickets').update({ title: editTicketData.title, description: editTicketData.description, priority: editTicketData.priority || 'Normal', confidential: !!editTicketData.confidential }).eq('id', editingTicket.id);
                toast.success('Ticket updated');
                setEditingTicket(null);
                setEditTicketData({ title: '', description: '', priority: 'Normal', confidential: false });
              } catch (err) { console.error(err); toast.error('Failed to update ticket'); }
            }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={editTicketData.title} onChange={e => setEditTicketData({ ...editTicketData, title: e.target.value })} placeholder="Title" required style={{ padding: 10 }} />

              <div style={{ display: 'flex', gap: 8 }}>
                <Select value={editTicketData.priority} onValueChange={(v: string) => setEditTicketData({ ...editTicketData, priority: v })}>
                  <SelectTrigger style={{ height: 40, display: 'flex', alignItems: 'center', flex: 1 }}>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low Priority</SelectItem>
                    <SelectItem value="Normal">Normal Priority</SelectItem>
                    <SelectItem value="High">High Priority</SelectItem>
                    <SelectItem value="Critical">Critical Priority</SelectItem>
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => setEditTicketData({ ...editTicketData, confidential: !editTicketData.confidential })} style={{ width: 140, flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem', borderRadius: 8, background: editTicketData.confidential ? '#f3f4f6' : '#fff', border: '1px solid rgba(0,0,0,0.04)' }}>
                  {editTicketData.confidential ? <LockKeyholeIcon size={14} /> : <Globe size={14} />}
                  {editTicketData.confidential ? 'Private' : 'Public'}
                </button>
              </div>

              <textarea ref={editDescRef} value={editTicketData.description} onChange={e => setEditTicketData({ ...editTicketData, description: e.target.value })} placeholder="Description" required style={{ padding: '1rem', minHeight: 140, width: '100%' }} />

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => { setEditingTicket(null); setEditTicketData({ title: '', description: '', priority: 'Normal', confidential: false }); }} style={{ padding: 10, background: '#eee', border: 'none', flex: 1 }}>Cancel</button>
                <button type="submit" disabled={sending} style={{ padding: 10, background: 'darkblue', color: 'white', border: 'none', flex: 1 }}>{sending ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </ResponsiveModal>
        <AddRecordButton icon={<Ticket color="darkblue" />} onClick={openOrScrollNewCard} title="New Ticket" />

        <ResponsiveModal title="Delete Ticket?" open={!!deleteDialogOpen} onOpenChange={(v) => !v && setDeleteDialogOpen(null)} hideHeader>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 16, }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 500 }}>Delete Ticket?</div>
              <div style={{ fontSize: 13, color: '#555' }}>This action cannot be undone.</div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setDeleteDialogOpen(null)} disabled={deleting} style={{ padding: 10, background: '#eee', border: 'none', flex: 1, opacity: deleting ? 0.6 : 1 }}>Cancel</button>
              <button type="button" disabled={deleting} onClick={async () => { if (deleteDialogOpen) await handleDelete(deleteDialogOpen); }} style={{ padding: 10, background: 'crimson', color: 'white', border: 'none', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                {deleting ? <Loader2 className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </ResponsiveModal>

        <ResponsiveModal title="Close Ticket?" open={!!closeDialogOpen} onOpenChange={(v) => !v && setCloseDialogOpen(null)} hideHeader>
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 500 }}>Close Ticket?</div>
              <div style={{ fontSize: 13, color: '#555' }}>This will mark the thread as closed and prevent further replies.</div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setCloseDialogOpen(null)} disabled={closing} style={{ padding: 10, background: '#eee', border: 'none', flex: 1, opacity: closing ? 0.6 : 1 }}>Cancel</button>
              <button type="button" disabled={closing} onClick={async () => { if (!closeDialogOpen) return; setClosing(true); try { await supabase.from("tickets").update({ status: 'closed' }).eq('id', closeDialogOpen); toast.success('Ticket closed'); } catch (err) { console.error(err); toast.error('Failed to close ticket'); } finally { setClosing(false); setCloseDialogOpen(null); } }} style={{ padding: 10, background: 'crimson', color: 'white', border: 'none', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                {closing ? <Loader2 className="animate-spin" /> : 'Close Ticket'}
              </button>
            </div>
          </div>
        </ResponsiveModal>

        <Dialog open={!!profileDialogEmail} onOpenChange={(v) => !v && setProfileDialogEmail(null)}>
          <DialogContent><DialogHeader><DialogTitle>User</DialogTitle><DialogDescription>User info</DialogDescription></DialogHeader>
            <div style={{ padding: 8 }}><div style={{ fontWeight: 700 }}>{profileDialogEmail}</div></div>
            <DialogFooter><DialogClose asChild><button style={{ padding: 8, background: '#eee' }}>Close</button></DialogClose></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mobile bottom action bar: shows Reply and Close actions when a ticket is selected (hidden if composer open) */}
        {selectedTicket && selectedTicket.status === 'open' && !topComposerOpen[selectedTicket.id] && (
          <div className="ticket-actions-bottom-bar">
            <button onClick={() => setTopComposerOpen(prev => ({ ...prev, [selectedTicket.id]: true }))} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: '#eef2ff', color: '#3730a3', fontWeight: 700 }}><Reply size={16} /> Reply</button>
            {hasTicketHandler && <button onClick={() => setCloseDialogOpen(selectedTicket.id)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: '#fff1f2', color: '#b91c1c', fontWeight: 700 }}><Ticket size={16} /> Close</button>}
          </div>
        )}

        {/* Back to top floating button (bottom-left) */}
        <div style={{ position: 'fixed', left: 18, bottom: 18, zIndex: 9999 }}>
          {showBackToTop && (
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.75rem', borderRadius: 10, background: '#fff', boxShadow: '0 6px 20px rgba(2,6,23,0.12)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// (Moved earlier)

// register time-ago locale once
try { JavascriptTimeAgo.addDefaultLocale(en); } catch (e) { /* ignore if already added */ }

const getDate = (ts: any) => {
  if (!ts) return new Date();
  if (ts.toDate) return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  return new Date(ts);
};
