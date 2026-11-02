import emailjs from "@emailjs/browser";
import { supabase } from "@/lib/supabase";

export interface PettyCashEmailNotice {
  empId: string;
  subject: string;
  message: string;
}

const EMAIL_FROM = "it@soharstar.com";
const SUBJECT_PREFIX = "Starboard notification:";

export async function sendPettyCashEmailNotices(
  notices: PettyCashEmailNotice[],
): Promise<number> {
  if (notices.length === 0) return 0;

  const empIds = [...new Set(notices.map((notice) => notice.empId))];
  const { data: users, error } = await supabase
    .from("users")
    .select("emp_id, email")
    .in("emp_id", empIds);
  if (error) throw error;

  const emailByEmpId = new Map(
    (users || []).map((user) => [String(user.emp_id), user.email as string | null]),
  );
  const results = await Promise.all(notices.map(async (notice) => {
    const recipient = emailByEmpId.get(notice.empId);
    if (!recipient) {
      console.error(`No email address found for petty-cash recipient ${notice.empId}`);
      return false;
    }

    try {
      await emailjs.send("service_fixajl8", "template_0f3zy3e", {
        from_email: EMAIL_FROM,
        recipient,
        subject: `${SUBJECT_PREFIX} ${notice.subject.replace(/^Starboard notification:\s*/i, "")}`,
        message: notice.message,
      });
      return true;
    } catch (sendError) {
      console.error(`Failed to email petty-cash recipient ${notice.empId}:`, sendError);
      return false;
    }
  }));

  return results.filter((sent) => !sent).length;
}
