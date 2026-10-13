import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Company {
  id: number;
  created_at: string;
  company_name: string;
  alfa_code: string;
  num_code: number;
}

export default function CompanyMaster() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [alfaCode, setAlfaCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_master")
        .select("id, created_at, company_name, alfa_code, num_code")
        .order("company_name");
      if (error) throw error;
      setCompanies((data ?? []) as Company[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const createCompany = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = companyName.trim();
    const code = alfaCode.trim().toUpperCase();
    if (!name) {
      toast.error("Company name is required.");
      return;
    }
    if (!/^[A-Z]{2}$/.test(code)) {
      toast.error("Alpha code must contain exactly two letters.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_company_master", {
        p_company_name: name,
        p_alfa_code: code,
      });
      if (error) throw error;
      toast.success("Company created.");
      setCompanyName("");
      setAlfaCode("");
      await loadCompanies();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create company.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <form onSubmit={(event) => void createCompany(event)} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[minmax(12rem,1fr)_10rem_auto] md:items-end">
        <label className="text-sm font-medium text-slate-700">
          Company name
          <Input className="mt-1" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Alpha code
          <Input className="mt-1 uppercase" autoCapitalize="characters" maxLength={2} pattern="[A-Za-z]{2}" required value={alfaCode} onChange={(event) => setAlfaCode(event.target.value.toUpperCase())} />
        </label>
        <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Add company"}</Button>
        <p className="text-xs text-slate-500 md:col-span-3">The two-digit number code is assigned automatically. Codes 50 and 99 are reserved.</p>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Company name</th>
              <th className="px-4 py-3">Alpha code</th>
              <th className="px-4 py-3">Number code</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>Loading companies…</td></tr>
            ) : companies.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No companies found.</td></tr>
            ) : companies.map((company) => (
              <tr key={company.id} className="text-slate-700">
                <td className="px-4 py-3 font-medium">{company.company_name}</td>
                <td className="px-4 py-3">{company.alfa_code}</td>
                <td className="px-4 py-3">{company.num_code}</td>
                <td className="px-4 py-3">{new Date(company.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
