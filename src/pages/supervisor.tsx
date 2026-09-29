import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import IndexDropDown from "@/components/index-dropdown";
import DefaultDialog from "@/components/ui/default-dialog";
import Directive from "@/components/directive";

export default function Supervisor() {
  const { userData, logoutUser: logOut } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
const [logoutPrompt, setLogoutPrompt] = useState(false);


  useEffect(() => {
    if (!userData || userData.role !== "supervisor") {
      navigate("/");
      return;
    }

    fetchSupervisorRecords();
  }, [userData, navigate]);

  const fetchSupervisorRecords = async () => {
    if (!userData?.assignedSite || !userData?.assignedProject) return;

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("project", userData.assignedProject);

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error("Error fetching records:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "1.25rem", border:"", height:"100svh" }}>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <Back title={userData?.assignedSite} subtitle={userData?.assignedProject} noback extra={
            <div style={{ display: "flex", gap: "0.75rem", alignItems:"center" }}>
                          {/* <button style={{ paddingLeft: "1rem", paddingRight: "1rem" }}>
                            v2.0
                          </button> */}
                          <IndexDropDown onProfile={()=>{}} onLogout={() => setLogoutPrompt(true)} />
                          
                        </div>
        }/>
        <br />
        
        

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", border:"" }}>
          {loading ? (
            <p>Loading records...</p>
          ) : records.length > 0 ? (
            records.map((record) => (
                <Directive key={record.id} title={record.name} id_subtitle={record.role} />
              
            ))
          ) : (
            <p>No records found for your assigned site and project.</p>
          )}
        </div>
        <DefaultDialog
                destructive
                OkButtonText="Logout"
                title={"Confirm Logout?"}
                open={logoutPrompt}
                onCancel={() => {
                  setLogoutPrompt(false);
                  window.location.reload();
                }}
                onOk={async () => {
                  try {
                    await logOut();
                  } catch (error) {
                    console.error("Logout error:", error);
                  }
                }}
              />
      </motion.div>
    </div>
  );
}
