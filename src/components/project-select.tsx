import { supabase } from "@/lib/supabase";
import { FolderKanban } from "lucide-react";
import { useEffect, useState } from "react";
import ChevronSelect from "./chevron-select";

interface Props {
  value?: string;
  onChange?: (value: string) => void;
}

// Component for selecting projects from project master
export default function ProjectSelect({ value, onChange }: Props) {
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("project_code, project_name")
        .order("project_code");

      if (error) {
        console.error("Error fetching projects:", error);
        return;
      }

      const fetchedProjects = (data || []).map((project: any) => ({
        value: project.project_code,
        label: `${project.project_code} - ${project.project_name}`
      }));
      
      setProjects(fetchedProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
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
            <FolderKanban color="mediumslateblue" width="1.125rem" height="1.125rem" />
          </div>
          <label
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              opacity: 0.9,
            }}
          >
            Project
          </label>
        </div>
        <div style={{
          padding: "1rem",
          textAlign: "center",
          fontSize: "0.875rem",
          opacity: 0.6
        }}>
          Loading projects...
        </div>
      </div>
    );
  }

  return (
    <ChevronSelect
      title="Project"
      icon={<FolderKanban color="mediumslateblue" width="1.125rem" height="1.125rem" />}
      options={projects}
      value={value}
      onChange={onChange}
      placeholder="Select Project"
    />
  );
}
