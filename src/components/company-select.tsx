import { supabase } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Company {
  company_name: string;
  alfa_code: string;
}

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export default function CompanySelect({ value = "", onChange, className }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;

    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from("company_master")
          .select("alfa_code, company_name")
          .order("company_name");

        if (error) throw error;
        if (!cancelled) setCompanies(data ?? []);
      } catch (error) {
        if (!cancelled) {
          setLoadError(true);
          toast.error(error instanceof Error ? error.message : "Unable to load companies.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchCompanies();
    return () => {
      cancelled = true;
    };
  }, []);

  const matchedCompany = companies.find(company =>
    company.alfa_code === value ||
    company.company_name.toLocaleLowerCase() === value.toLocaleLowerCase()
  );
  const selectedValue = matchedCompany?.alfa_code ?? value;

  useEffect(() => {
    if (matchedCompany && value !== matchedCompany.alfa_code) {
      onChangeRef.current?.(matchedCompany.alfa_code);
    }
  }, [matchedCompany, value]);

  return (
    <select
      value={selectedValue}
      onChange={event => onChange?.(event.target.value)}
      disabled={loading || loadError}
      className={className ?? "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"}
    >
      <option value="">
        {loadError ? "Unable to load companies" : loading ? "Loading companies…" : "Select company"}
      </option>
      {value && !matchedCompany && <option value={value}>Previously entered: {value}</option>}
      {companies.map(company => (
        <option key={company.alfa_code} value={company.alfa_code}>
          {company.company_name}
        </option>
      ))}
    </select>
  );
}
