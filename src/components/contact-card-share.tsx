import GridTile from "@/components/grid-tile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Building2, Contact, Download, Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const COMPANY_NAME = "SOHAR STAR UNITED LLC";
const COMPANY_ADDRESS = "PO Box: 153, PC: 322, Falaj Al Qabail Sohar, Sultanate of Oman";
const COMPANY_PHONES = ["26844289", "26842701"];

interface EmployeeContact {
  name: string;
  email: string | null;
  phone: string | null;
  cug: string | null;
  designation: string | null;
}

function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function createVCard(employee: EmployeeContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCardText(employee.name)}`,
    `N:${escapeVCardText(employee.name)};;;;`,
    `ORG:${escapeVCardText(COMPANY_NAME)}`,
    `ADR;TYPE=WORK:;;${escapeVCardText(COMPANY_ADDRESS)};;;;`,
  ];

  if (employee.designation) {
    lines.push(`TITLE:${escapeVCardText(employee.designation)}`);
  }
  if (employee.email) {
    lines.push(`EMAIL;TYPE=WORK:${escapeVCardText(employee.email)}`);
  }
  if (employee.phone) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCardText(employee.phone)}`);
  }
  if (employee.cug && employee.cug !== employee.phone) {
    lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardText(employee.cug)}`);
  }
  for (const phone of COMPANY_PHONES) {
    lines.push(`TEL;TYPE=WORK,VOICE:${phone}`);
  }
  lines.push("END:VCARD");

  return `${lines.join("\r\n")}\r\n`;
}

function downloadVCard(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContactCardShare() {
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<EmployeeContact | null>(null);

  const loadContact = async () => {
    setOpen(true);
    setEmployee(null);

    if (!userData?.email) {
      toast.error("Sign in to share your contact card.");
      return;
    }

    setLoading(true);
    try {
      let employeeData: EmployeeContact | null = null;

      if (userData.emp_id) {
        const { data, error } = await supabase
          .from("employees")
          .select("name, email, phone, cug, designation")
          .eq("emp_id", userData.emp_id)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        employeeData = data;
      }

      if (!employeeData) {
        const { data, error } = await supabase
          .from("employees")
          .select("name, email, phone, cug, designation")
          .eq("email", userData.email)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        employeeData = data;
      }

      if (!employeeData) {
        throw new Error("No employee record was found for your account.");
      }

      setEmployee(employeeData);
    } catch (error) {
      console.error("Error loading employee contact card:", error);
      toast.error(error instanceof Error ? error.message : "Could not load your employee contact card.");
    } finally {
      setLoading(false);
    }
  };

  const createContactFile = () => {
    if (!employee) return null;
    const fileName = `${employee.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "contact"}.vcf`;
    return new File([createVCard(employee)], fileName, { type: "text/vcard;charset=utf-8" });
  };

  const shareContact = async () => {
    const file = createContactFile();
    if (!file) return;

    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${employee?.name} contact`,
          text: `Contact card for ${employee?.name}`,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Error sharing employee contact card:", error);
        toast.error("Could not open the share menu. You can download the contact card instead.");
      }
      return;
    }

    downloadVCard(file);
    toast.success("Contact card downloaded. Open the vCard to add it to your contacts.");
  };

  const downloadContact = () => {
    const file = createContactFile();
    if (!file) return;
    downloadVCard(file);
    toast.success("Contact card downloaded.");
  };

  return (
    <>
      <GridTile
        title="Share Contact"
        description="Share your employee contact card"
        icon={<Contact width="2.5rem" />}
        onClick={loadContact}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Contact className="h-5 w-5" />
              Share your contact card
            </DialogTitle>
            <DialogDescription>
              Share your employee details and company contact information as a vCard.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading employee details...
            </div>
          ) : employee ? (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{employee.name}</p>
                {employee.designation && <p className="text-slate-600">{employee.designation}</p>}
                {employee.email && <p className="text-slate-600">{employee.email}</p>}
                {employee.phone && <p className="text-slate-600">{employee.phone}</p>}
                {employee.cug && employee.cug !== employee.phone && <p className="text-slate-600">CUG: {employee.cug}</p>}
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  <Building2 className="h-4 w-4" />
                  {COMPANY_NAME}
                </p>
                <p className="mt-1 text-slate-600">{COMPANY_ADDRESS}</p>
                <p className="mt-1 text-slate-600">26844289 and 26842701</p>
              </div>
            </div>
          ) : (
            <p className="py-4 text-sm text-slate-500">
              Employee details could not be loaded. Close this window and try again.
            </p>
          )}

          {employee && (
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" onClick={shareContact}>
                <Share2 />
                Share Contact
              </Button>
              <Button type="button" variant="outline" onClick={downloadContact}>
                <Download />
                Download vCard
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
