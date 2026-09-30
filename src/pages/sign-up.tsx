import Back from "@/components/back";
import { message } from "antd";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { useState } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const usenavigate = useNavigate();

  const ResetPassword = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      message.success("Password recovery mail sent.");
      usenavigate("/");
    } catch (error: any) {
      console.log(error);
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          border: "",
          height: "100svh",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            border: "",
            position: "absolute",
            top: 0,
            left: 0,
            margin: "2rem",
          }}
        >
          <Back />
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
          <div
            style={{
              display: "flex",
              width: "32ch",
              height: "",
              border: "1px solid rgba(100 100 100/ 50%)",
              borderRadius: "1.75rem",
              padding: "1.45rem",
              flexFlow: "column",
              gap: "1.75rem",
            }}
          >
            <p
              style={{
                fontSize: "1.35rem",
                textTransform: "uppercase",
                fontWeight: "600",
              }}
            >
              Request Access
            </p>
            <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
              Your request will be reviewed and verified by the organization
              before granting you access.
            </p>

            <div
              style={{ display: "flex", flexFlow: "column", gap: "0.75rem" }}
            >
              {/* <input
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="Enter Full Name"
              ></input> */}

              <input
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="Enter Employee Code"
              ></input>

              <p style={{ fontSize: "0.6rem", opacity: 0.5 }}>
                Please consult the HR Department to acquire or enquire about
                your employee code{" "}
              </p>
            </div>

            <button
              onClick={ResetPassword}
              className={email != "" ? "" : "disabled"}
              style={{
                background: "midnightblue",
                height: "2.5rem",
                fontSize: "0.9rem",
              }}
            >
              {loading ? <LoadingOutlined /> : "Request Access"}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
