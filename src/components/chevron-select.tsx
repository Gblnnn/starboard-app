import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface Option {
  value: string;
  label: string;
}

interface Props {
  title: string;
  icon: React.ReactNode;
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export default function ChevronSelect({ title, icon, options, value, onChange, placeholder = "Select option" }: Props) {
  const currentIndex = options.findIndex(opt => opt.value === value);
  const selectedLabel = currentIndex !== -1 ? options[currentIndex].label : placeholder;
  
  const handlePrevious = () => {
    if (!onChange || options.length === 0) return;
    const newIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
    onChange(options[newIndex].value);
  };
  
  const handleNext = () => {
    if (!onChange || options.length === 0) return;
    const newIndex = currentIndex >= options.length - 1 ? 0 : currentIndex + 1;
    onChange(options[newIndex].value);
  };
  
  return (
    <div
      style={{
        background: "rgba(100, 100, 100, 0.05)",
        padding: "1rem",
        borderRadius: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <div style={{ opacity: 0.7, display: "flex", alignItems: "center" }}>{icon}</div>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "600",
            opacity: 0.9,
          }}
        >
          {title}
        </label>
      </div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.5rem",
        borderRadius: "0.75rem",
        background: "rgba(100, 100, 100, 0.08)",
      }}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={handlePrevious}
          style={{
            padding: "0.5rem",
            borderRadius: "0.5rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft width="1.25rem" height="1.25rem" />
        </motion.button>
        <div style={{
          flex: 1,
          textAlign: "center",
          fontSize: "1rem",
          fontWeight: "500",
          padding: "0.375rem",
        }}>
          {selectedLabel}
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={handleNext}
          style={{
            padding: "0.5rem",
            borderRadius: "0.5rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronRight width="1.25rem" height="1.25rem" />
        </motion.button>
      </div>
    </div>
  );
}
