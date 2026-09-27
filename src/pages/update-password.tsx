import { supabase } from "@/lib/supabase";
import { message } from "antd";
import { motion } from "framer-motion";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingOutlined } from "@ant-design/icons";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Optional: We can listen to auth state changes to ensure we are in a recovery session,
    // but typically Supabase automatically logs the user in when they click the recovery link.
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        message.error("Invalid or expired password reset link.");
        navigate("/");
      }
    };
    checkSession();
  }, [navigate]);

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      message.error("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      message.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      console.error(error);
      message.error(error.message);
      setLoading(false);
    } else {
      message.success("Password updated successfully.");
      setLoading(false);
      navigate("/"); // Redirect to login or home
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100svh",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <div
          style={{
            display: "flex",
            width: "32ch",
            border: "1px solid rgba(100 100 100/ 50%)",
            borderRadius: "1.75rem",
            padding: "1.45rem",
            flexFlow: "column",
            gap: "1.25rem",
          }}
        >
          <p
            style={{
              fontSize: "1.35rem",
              textTransform: "uppercase",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <KeyRound color="mediumslateblue" />
            New Password
          </p>
          <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            Please enter your new password below.
          </p>

          <div style={{ position: "relative", width: "100%" }}>
            <input
              type={showPassword ? "text" : "password"}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New Password"
              value={password}
              style={{ width: "100%", paddingRight: "2.5rem" }}
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              type="button"
            >
              {showPassword ? <EyeOff size={18} color="gray" /> : <Eye size={18} color="gray" />}
            </button>
          </div>

          <input
            type={showPassword ? "text" : "password"}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm Password"
            value={confirmPassword}
            style={{ width: "100%" }}
          />

          <button
            onClick={handleUpdatePassword}
            disabled={!password || !confirmPassword || loading}
            style={{
              background: "midnightblue",
              color: "white",
              height: "2.5rem",
              fontSize: "0.9rem",
              opacity: (!password || !confirmPassword || loading) ? 0.6 : 1,
              cursor: (!password || !confirmPassword || loading) ? "not-allowed" : "pointer",
            }}
          >
            {loading ? <LoadingOutlined /> : "Update Password"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
