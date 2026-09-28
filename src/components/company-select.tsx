import { supabase } from "@/lib/supabase";
import { Building } from "lucide-react";
import { useEffect, useState } from "react";
import ChevronSelect from "./chevron-select";

interface Props {
  value?: string;
  onChange?: (value: string) => void;
}

// Component for selecting companies from company master
export default function CompanySelect({ value, onChange }: Props) {
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("company_master")
        .select("alfa_code, company_name")
        .order("company_name");

      if (error) {
        console.error("Error fetching companies:", error);
        return;
      }

      const fetchedCompanies = (data || []).map((company: any) => ({
        value: company.alfa_code,
        label: company.company_name
      }));

      setCompanies(fetchedCompanies);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          background: "rgba(100, 100, 100, 0.05)",
          padding: "1rem",
          borderRadius: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div style={{ opacity: 0.7, display: "flex", alignItems: "center" }}>
            <Building color="mediumslateblue" width="1.125rem" height="1.125rem" />
          </div>
          <label
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              opacity: 0.9,
            }}
          >
            Company
          </label>
        </div>
        <div style={{
          padding: "1rem",
          textAlign: "center",
          fontSize: "0.875rem",
          opacity: 0.6
        }}>
          Loading companies...
        </div>
      </div>
    );
  }

  return (
    <ChevronSelect
      title="Company Name"
      icon={<Building color="mediumslateblue" width="1.125rem" height="1.125rem" />}
      options={companies}
      value={value}
      onChange={onChange}
      placeholder="Select Company"
    />
  );
}
