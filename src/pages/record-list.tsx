import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import Directive from "@/components/directive";
import InputDialog from "@/components/input-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import DefaultDialog from "@/components/ui/default-dialog";
import { LoadingOutlined } from "@ant-design/icons";
import { motion } from "framer-motion";
import { HistoryIcon, KeyRound, Laptop2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function RecordList() {
  const [requestDialog, setRequestDialog] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [valeLoginPrompt, setValeLoginPrompt] = useState(false);
  const [logoutPrompt, setLogoutPrompt] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [ssuloading, setSSULoading] = useState(false);
  const [valeloading, setValeLoading] = useState(false);
  const { userData, logoutUser: logOut } = useAuth();
  const usenavigate = useNavigate();

  useEffect(() => {
    if (!userData) {
      navigate("/");
    }
    // Show error message if redirected due to lack of clearance
    if (location.state?.error) {
      toast.error(location.state.error);
      // Clear the error from location state
      navigate(location.pathname, { replace: true });
    }
  }, [userData, navigate, location]);

  const handleLoginPrompt = async (type: "ssu" | "vale" | "subcontract" | "manpower") => {
    if (!userData) {
      toast.error("Authentication required");
      navigate("/");
      return;
    }

    try {
      switch (type) {
        case "ssu":
          setSSULoading(true);
          if (
            userData.clearance === "All" ||
            userData.clearance === "Sohar Star United"
          ) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            navigate("/records");
          } else {
            toast.error("No clearance to access");
          }
          setSSULoading(false);
          break;

        case "vale":
          setValeLoading(true);
          if (userData.clearance === "All" || userData.clearance === "Vale") {
            await new Promise((resolve) => setTimeout(resolve, 500));
            navigate("/vale-records");
          } else {
            toast.error("No clearance to access");
          }
          setValeLoading(false);
          break;

        
      }
    } catch (error) {
      console.error("Navigation error:", error);
      toast.error("Failed to navigate");
      setSSULoading(false);
      setValeLoading(false);
      
    }
  };

  const handleLogout = async () => {
    try {
      setLogoutPrompt(false); // Close the dialog first
      await logOut();
      // Clear any other state that might persist
      setRequestDialog(false);
      setLoginPrompt(false);
      setValeLoginPrompt(false);
      setVerifyDialog(false);
      setSSULoading(false);
      setValeLoading(false);
      navigate("/", { replace: true }); // Use replace to prevent back navigation
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout");
      setLogoutPrompt(false); // Make sure dialog is closed even on error
    }
  };

  const handleHistoryClick = () => {
    navigate("/history");
  };

  if (!userData) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "linear-gradient(darkslateblue, midnightblue)",
        }}
      >
        <LoadingOutlined style={{ fontSize: 24, color: "white" }} />
      </div>
    );
  }

  return (
    <>
      {/* <div style={{border:"", display:"flex", alignItems:"center", justifyContent:'center'}}>
        <ConfettiExplosion/>
        </div> */}
      <div
        style={{
          padding: "1.25rem",
          // background:
          //   "linear-gradient(rgba(18 18 80/ 65%), rgba(100 100 100/ 0%))",
          height: "100svh",
        }}
      >
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
          <Back
            title="Records"
            // icon={<FileArchive color="violet" width={"2rem"} />}
            extra={
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {/* <button onClick={()=>window.location.reload()} style={{paddingLeft:"1rem", paddingRight:"1rem", fontSize:"0.8rem"}}>
                        
                            <p style={{opacity:0.5, letterSpacing:"0.15rem"}}>
                                v1.18
                            </p>
                        </button> */}

                <button
                  className="blue-glass"
                  style={{
                    width: "",
                    paddingLeft: "1rem",
                    paddingRight: "1rem",
                  }}
                  onClick={handleHistoryClick}
                >
                  {/* <p style={{ fontSize: "0.8rem" }}></p> */}
                  <HistoryIcon width={"1.1rem"} color="mediumslateblue" />
                </button>

              </div>
            }
          />
          <br />

          <div style={{ display: "flex", flexFlow: "column", gap: "0.5rem" }}>
            <Directive
              loading={ssuloading}
              onClick={() => handleLoginPrompt("ssu")}
              title="Sohar Star United"
              icon={
                <Avatar
                  style={{ width: "1.25rem", height: "1.25rem", border: "" }}
                >
                  <AvatarImage
                    style={{ objectFit: "cover" }}
                    src={"/sohar_star_logo.png"}
                  />
                  <AvatarFallback>
                    <p style={{ paddingTop: "0.1rem" }}>{"S"}</p>
                  </AvatarFallback>
                </Avatar>
              }
            />

            

            <Directive
              loading={valeloading}
              onClick={() => handleLoginPrompt("vale")}
              title="Vale Team"
              icon={
                <Avatar
                  style={{ width: "1.25rem", height: "1.25rem", border: "" }}
                >
                  <AvatarImage
                    style={{ objectFit: "cover", paddingBottom: "0.1rem" }}
                    src={"/vale-logo.png"}
                  />

                  <AvatarFallback>
                    <p style={{ paddingTop: "0.1rem" }}>{"V"}</p>
                  </AvatarFallback>
                </Avatar>
              }
            />
            

            <Directive title={"Devices"} icon={<Laptop2 color="mediumslateblue" width={"1.25rem"}/>} onClick={() => usenavigate("/devices")}/>

            {/* <Directive
              loading={subcontractLoading}
              onClick={() => handleLoginPrompt("subcontract")}
              title="Subcontracted Workers"
              icon={
                <HardHat width={"1.25rem"} color="mediumslateblue" />
              }
            />

            <Directive
              loading={manpowerLoading}
              onClick={() => handleLoginPrompt("manpower")}
              title="Manpower Supply"
              icon={
                <Avatar
                  style={{ width: "1.25rem", height: "1.25rem", border: "" }}
                >
                  <AvatarImage
                    style={{ objectFit: "cover" }}
                    src={"/oman-logo.png"}
                  />
                  <AvatarFallback>
                    <p style={{ paddingTop: "0.1rem" }}>{"MP"}</p>
                  </AvatarFallback>
                </Avatar>
              }
            /> */}

            {/* <Directive onClick={()=>{setRequestDialog(true)}} title="Request Feature" icon={<Plus color="grey" width={"1.1rem"} height={"1.1rem"}/>}/> */}
          </div>
        </motion.div>

        <DefaultDialog
          titleIcon={<Mail />}
          title="Request Feature"
          extra={
            <p
              style={{
                fontSize: "0.85rem",
                opacity: 0.5,
                marginBottom: "0.5rem",
              }}
            >
              Reach out to the developer to request a new feature? You will be
              redirected to your e-mail client
            </p>
          }
          open={requestDialog}
          OkButtonText="Reach out"
          onCancel={() => setRequestDialog(false)}
          sendmail
        />

        <DefaultDialog
          onCancel={() => setVerifyDialog(false)}
          close
          open={verifyDialog}
          title={"Verifying"}
          titleIcon={<LoadingOutlined />}
        />

        <InputDialog
          title={"Protected Route"}
          input1Type="password"
          desc="Enter key to continue"
          titleIcon={<KeyRound color="mediumslateblue" />}
          open={loginPrompt}
          onCancel={() => setLoginPrompt(false)}
          OkButtonText="Continue"
          inputplaceholder="Password"
          onOk={() => navigate("/records")}
        />

        <InputDialog
          title={"Protected Route"}
          input1Type="password"
          desc="Enter key to continue"
          titleIcon={
            <img
              src="/vale-logo.png"
              width={"28rem"}
              style={{ paddingBottom: "0.25rem", marginRight: "0.25rem" }}
            />
          }
          open={valeLoginPrompt}
          onCancel={() => setValeLoginPrompt(false)}
          OkButtonText="Continue"
          inputplaceholder="Password"
          onOk={() => navigate("/vale-records")}
        />

        <DefaultDialog
          destructive
          OkButtonText="Logout"
          title={"Confirm Logout?"}
          open={logoutPrompt}
          onCancel={() => setLogoutPrompt(false)}
          onOk={handleLogout}
        />
      </div>
    </>
  );
}
