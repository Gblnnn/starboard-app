import { useAuth } from "@/components/AuthProvider";
import Back from "@/components/back";
import RefreshButton from "@/components/refresh-button";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/firebase";
import { ensureOcrWorker, getOcrLoadState, resetOcrWorker, subscribeOcrLoadState } from "@/utils/ocrWorker";
import { PSM } from "tesseract.js";
import { parseMRZ as parseFastMRZ } from "mrz-fast";
import { parse as parseMRZText } from "mrz";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where, orderBy } from "firebase/firestore";
import { motion } from "framer-motion";
import { 
  AlertTriangle, Calendar, Camera, CheckCircle2, ChevronRight, Clock, Globe,
  Loader2, PenLine, Plus, ScanLine, Trash, UserCircle, X,
  FileText, MapPin, BookMarked, Download
} from "lucide-react";
import * as XLSX from "@e965/xlsx";
import moment from "moment";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type PassportRecord = {
  id: string;
  passportNumber: string;
  fullName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  placeOfIssue: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  nationality: string;
  sex?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

// Shared input style for the form
const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(100, 100, 100, 0.18)",
  background: "rgba(100,100,100,0.04)",
  fontSize: "0.9rem",
  fontWeight: 500,
  boxSizing: "border-box",
};

// Passport Form Component
interface PassportFormContentProps {
  passportNumber: string;
  setPassportNumber: (value: string) => void;
  fullName: string;
  setFullName: (value: string) => void;
  dateOfBirth: string;
  setDateOfBirth: (value: string) => void;
  placeOfBirth: string;
  setPlaceOfBirth: (value: string) => void;
  placeOfIssue: string;
  setPlaceOfIssue: (value: string) => void;
  dateOfIssue: string;
  setDateOfIssue: (value: string) => void;
  dateOfExpiry: string;
  setDateOfExpiry: (value: string) => void;
  nationality: string;
  setNationality: (value: string) => void;
  sex: string;
  setSex: (value: string) => void;
  editingPassport: PassportRecord | null;
  submitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  onScanPassport: () => void;
}

const PassportFormContent: React.FC<PassportFormContentProps> = ({
  passportNumber,
  setPassportNumber,
  fullName,
  setFullName,
  dateOfBirth,
  setDateOfBirth,
  placeOfBirth,
  setPlaceOfBirth,
  placeOfIssue,
  setPlaceOfIssue,
  dateOfIssue,
  setDateOfIssue,
  dateOfExpiry,
  setDateOfExpiry,
  nationality,
  setNationality,
  sex,
  setSex,
  editingPassport,
  submitting,
  handleSubmit,
  onScanPassport,
}) => {
  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", maxHeight: "85vh", width: "100%" }}>
      {/* Fixed Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "1.25rem 1.5rem 1rem",
        borderBottom: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        boxSizing: "border-box",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            background: "darkslateblue",
            padding: "0.55rem",
            borderRadius: "0.6rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <BookMarked color="white" width="1.1rem" />
          </div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
            {editingPassport ? "Edit Passport" : "Add Passport"}
          </h2>
        </div>
        {!editingPassport && (
          <button
            type="button"
            onClick={onScanPassport}
            style={{
              background: "rgba(72, 61, 139, 0.1)",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.5rem 0.75rem",
              cursor: "pointer",
              color: "darkslateblue",
              fontSize: "0.8rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <ScanLine width="0.9rem" />
            Scan MRZ
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        padding: "1.25rem 1.5rem",
        overflowY: "auto",
        minHeight: 0,
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

          {/* Passport Number + Full Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <FileText width="0.75rem" /> Passport No. *
              </label>
              <input
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="e.g. N1234567"
                required
                style={fieldStyle}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Globe width="0.75rem" /> Nationality *
              </label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="e.g. Indian"
                required
                style={fieldStyle}
              />
            </div>
          </div>

          {/* Full Name spanning full width */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <UserCircle width="0.75rem" /> Full Name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name as on passport"
              required
              style={fieldStyle}
            />
          </div>

          {/* Date of Birth + Sex */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Calendar width="0.75rem" /> Date of Birth *
              </label>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required style={fieldStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <UserCircle width="0.75rem" /> Sex
              </label>
              <select value={sex} onChange={(e) => setSex(e.target.value)} style={fieldStyle}>
                <option value="">Select</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
          </div>

          {/* Place of Birth + Place of Issue */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <MapPin width="0.75rem" /> Place of Birth
              </label>
              <input type="text" value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} placeholder="City, Country" style={fieldStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <MapPin width="0.75rem" /> Place of Issue
              </label>
              <input type="text" value={placeOfIssue} onChange={(e) => setPlaceOfIssue(e.target.value)} placeholder="Issuing location" style={fieldStyle} />
            </div>
          </div>

          {/* Date of Issue + Date of Expiry */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Calendar width="0.75rem" /> Date of Issue
              </label>
              <input type="date" value={dateOfIssue} onChange={(e) => setDateOfIssue(e.target.value)} style={fieldStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.65, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Calendar width="0.75rem" /> Date of Expiry *
              </label>
              <input type="date" value={dateOfExpiry} onChange={(e) => setDateOfExpiry(e.target.value)} required style={fieldStyle} />
            </div>
          </div>

        </div>
      </div>

      {/* Fixed Footer */}
      <div style={{
        padding: "1rem 1.5rem calc(1rem + env(safe-area-inset-bottom, 0px))",
        borderTop: "1px solid rgba(100, 100, 100, 0.1)",
        background: "var(--background)",
        boxSizing: "border-box",
        flexShrink: 0,
      }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "0.875rem",
            borderRadius: "0.75rem",
            background: submitting ? "rgba(100, 100, 100, 0.3)" : "darkslateblue",
            color: "white",
            border: "none",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" width="1rem" />
              Saving...
            </>
          ) : (
            editingPassport ? "Update Passport" : "Save Passport"
          )}
        </button>
      </div>
    </form>
  );
};

// Passport Scanner Component
interface PassportScannerProps {
  open: boolean;
  onClose: () => void;
  onDataExtracted: (data: Partial<PassportRecord>) => void;
}

const PassportScanner: React.FC<PassportScannerProps> = ({ open, onClose, onDataExtracted }) => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ocrReady, setOcrReady] = useState(() => getOcrLoadState().ready);
  const [ocrLoadProgress, setOcrLoadProgress] = useState(() => getOcrLoadState().progress);
  const [mrzStatus, setMrzStatus] = useState(() => getOcrLoadState().status);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const withTimeout = async <T,>(promiseFactory: () => Promise<T>, label: string, timeoutMs = 15000): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promiseFactory(),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  useEffect(() => {
    const current = getOcrLoadState();
    setOcrLoadProgress(current.progress);
    setOcrReady(current.ready);
    setMrzStatus(current.status);

    // Subscribe to OCR worker load progress used by scanner.
    const unsubscribe = subscribeOcrLoadState((state) => {
      setOcrLoadProgress(state.progress);
      setOcrReady(state.ready);
      setMrzStatus(state.status);
      console.log(`[Scanner worker] ${state.status} ${state.progress}%`);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (open) {
      // Preload OCR worker used for both MRZ and visual text passes.
      void ensureOcrWorker();
      if (!capturedImage) {
        startCamera();
      }
    }
    return () => {
      stopCamera();
    };
  }, [open, capturedImage]);

  const handleClose = () => {
    setCapturedImage(null);
    setProcessing(false);
    stopCamera();
    onClose();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast.error("Could not access camera");
      onClose();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Capture and immediately start processing
  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedData = canvas.toDataURL('image/png', 1.0);
    setCapturedImage(capturedData);
    stopCamera();

    await processImage(capturedData);
  };

  // ============================================================
  // IMAGE PREPROCESSING — Grayscale + Contrast
  // Let Tesseract handle binarization internally.
  // ============================================================
  const preprocessForMRZ = (
    sourceImg: HTMLImageElement,
    cropX: number, cropY: number, cropW: number, cropH: number,
    targetScale: number,
    contrastFactor: number
  ): string | null => {
    const c = document.createElement('canvas');
    c.width = Math.round(cropW * targetScale);
    c.height = Math.round(cropH * targetScale);
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImg, cropX, cropY, cropW, cropH, 0, 0, c.width, c.height);

    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const px = imgData.data;
    for (let i = 0; i < px.length; i += 4) {
      const gray = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      const adjusted = Math.min(255, Math.max(0, ((gray - 128) * contrastFactor) + 128));
      px[i] = adjusted;
      px[i + 1] = adjusted;
      px[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
    return c.toDataURL('image/png', 1.0);
  };

  // ============================================================
  // MRZ DATE CONVERSION — YYMMDD → YYYY-MM-DD
  // ============================================================
  const mrzDateToISO = (yymmdd: string, context: 'dob' | 'exp'): string | null => {
    if (!yymmdd || yymmdd.includes('<') || yymmdd.length !== 6) return null;
    const yy = parseInt(yymmdd.substring(0, 2));
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    // DOB: if yy > current 2-digit year → person was born last century
    const currentYY = new Date().getFullYear() % 100;
    const year = context === 'dob'
      ? (yy > currentYY ? 1900 + yy : 2000 + yy)
      : 2000 + yy; // expiry is always this century
    const m = moment(`${year}-${mm}-${dd}`, 'YYYY-MM-DD', true);
    return m.isValid() ? m.format('YYYY-MM-DD') : null;
  };

  // ============================================================
  // MAP mrz.parse() result → PassportRecord
  // ============================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapMRZResult = (parsed: any): Partial<PassportRecord> => {
    const data: Partial<PassportRecord> = {};
    const f = parsed.fields;
    if (!f) return data;

    const val = (field: string): string | undefined => {
      const raw = f[field];
      if (typeof raw === "string") return raw;
      if (raw && typeof raw === "object" && typeof raw.value === "string") return raw.value;
      return undefined;
    };

    // Passport number
    if (val('documentNumber')) data.passportNumber = val('documentNumber');

    // Full name — mrz parser returns lastName and firstName separately
    const last = val('lastName')?.trim() ?? '';
    const first = val('firstName')?.trim() ?? '';
    if (first && last) data.fullName = `${first} ${last}`;
    else if (first || last) data.fullName = (first || last);

    // Nationality
    if (val('nationality')) data.nationality = val('nationality');

    // Sex
    const sex = val('sex');
    if (sex === 'M' || sex === 'F') data.sex = sex;
    else if (sex === 'male') data.sex = 'M';
    else if (sex === 'female') data.sex = 'F';

    // Dates
    const dob = mrzDateToISO(val('birthDate') ?? '', 'dob');
    if (dob) data.dateOfBirth = dob;

    const exp = mrzDateToISO(val('expirationDate') ?? '', 'exp');
    if (exp) data.dateOfExpiry = exp;

    return data;
  };

  // ============================================================
  // MRZ LINE EXTRACTION — pull valid MRZ lines from OCR output
  // With mrz.traineddata, '<' is correctly recognised, so we can
  // rely on simple filtering rules without chevron normalization.
  // ============================================================
  // Correct common OCR misreads in MRZ text
  const correctOCRErrors = (text: string): string => {
    let corrected = text;
    
    // Critical: fix << (angle brackets) misreads
    corrected = corrected.replace(/LLCC/g, '<<');  // L's → <
    corrected = corrected.replace(/OO/g, '<<');    // O's → <
    corrected = corrected.replace(/11/g, '<<');    // 1's → <
    corrected = corrected.replace(/\bLL\b/g, '<<'); // Standalone LL → <
    
    // Additional common misreads
    corrected = corrected.replace(/([^<])OO([^<])/g, '$1<<$2');  // OO → << (in context)
    corrected = corrected.replace(/O0/g, '<<');     // O0 → <<
    corrected = corrected.replace(/0O/g, '<<');     // 0O → <<
    
    return corrected;
  };

  const extractMRZLines = (rawText: string): string[] => {
    return rawText
      .split('\n')
      .map((l: string) => {
        let cleaned = l.replace(/\s/g, '').replace(/[^A-Z0-9<]/gi, '').toUpperCase();
        cleaned = correctOCRErrors(cleaned);
        return cleaned;
      })
      .filter((l: string) => l.length >= 35 && l.includes('<'));
  };

  const parseMrzLines = (l1: string, l2: string): any => {
    try {
      return parseFastMRZ([l1, l2], { errorCorrection: true });
    } catch {
      return parseMRZText([l1, l2], { autocorrect: true });
    }
  };

  // ============================================================
  // MAIN PROCESSING — mrz worker for MRZ zone, ocr worker for visual text
  // ============================================================
  const processImage = async (imageData: string) => {
    setProcessing(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageData;
      });

      console.log("========== MRZ SCAN ==========");
      console.log("Image:", img.width, "x", img.height);

      // Use OCR worker for MRZ extraction path to avoid dedicated MRZ worker stalls.
      const mrzW = await withTimeout(() => ensureOcrWorker(), "Scan engine", 45000);

      // Try MRZ crops: bottom 30% (tight), 45% (generous), 60% (very generous)
      const attempts = [
        { label: "bottom-30%", topPct: 0.70, contrast: 1.5, psm: PSM.SINGLE_BLOCK },
        { label: "bottom-45%", topPct: 0.55, contrast: 1.4, psm: PSM.SINGLE_BLOCK },
        { label: "bottom-60%", topPct: 0.40, contrast: 1.3, psm: PSM.SINGLE_BLOCK },
      ];

      let bestData: Partial<PassportRecord> = {};

      for (const attempt of attempts) {
        if (Object.keys(bestData).length >= 6) break;

        const cropY = Math.floor(img.height * attempt.topPct);
        const cropH = img.height - cropY;
        const scale = Math.max(1, Math.min(3, 2000 / img.width));

        const mrzImage = preprocessForMRZ(img, 0, cropY, img.width, cropH, scale, attempt.contrast);
        if (!mrzImage) continue;

        console.log(`── Attempt: ${attempt.label}, scale=${scale.toFixed(1)} ──`);

        await mrzW.setParameters({
          tessedit_pageseg_mode: attempt.psm,
          preserve_interword_spaces: '0',
        });

        const result: any = await withTimeout(
          () => mrzW.recognize(mrzImage),
          `MRZ recognition (${attempt.label})`,
          30000
        );
        console.log("Raw MRZ text:", result.data.text);

        const mrzLines = extractMRZLines(result.data.text);
        console.log("MRZ lines:", mrzLines);
        if (mrzLines.length < 2) continue;

        // Find the line-1 / line-2 pair
        let l1 = '', l2 = '';
        for (let i = 0; i < mrzLines.length - 1; i++) {
          if (mrzLines[i].startsWith('P') && mrzLines[i].includes('<<')) {
            l1 = mrzLines[i].substring(0, 44).padEnd(44, '<');
            l2 = mrzLines[i + 1].substring(0, 44).padEnd(44, '<');
            break;
          }
        }
        if (!l1) {
          l1 = mrzLines[mrzLines.length - 2].substring(0, 44).padEnd(44, '<');
          l2 = mrzLines[mrzLines.length - 1].substring(0, 44).padEnd(44, '<');
          if (l2.startsWith('P') && l2.includes('<<')) [l1, l2] = [l2, l1];
        }
        console.log("L1:", l1);
        console.log("L2:", l2);

        try {
          const parsed = parseMrzLines(l1, l2);
          console.log("Parsed valid:", parsed.valid, parsed.fields);
          const mapped = mapMRZResult(parsed);
          if (Object.keys(mapped).length > Object.keys(bestData).length) {
            bestData = mapped;
          }
        } catch (e) {
          console.warn('mrz parse error:', e);
        }
      }

      // Full-page fallback if crops missed MRZ
      if (Object.keys(bestData).length < 3) {
        console.log("── Last resort: full page scan ──");
        const scale = img.width < 1200 ? 2 : (img.width < 2000 ? 1.5 : 1);
        const fullImg = preprocessForMRZ(img, 0, 0, img.width, img.height, scale, 1.3);
        if (fullImg) {
          await mrzW.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '0' });
          const fullResult: any = await withTimeout(
            () => mrzW.recognize(fullImg),
            "MRZ recognition (full page)",
            30000
          );
          const fullLines = extractMRZLines(fullResult.data.text);
          if (fullLines.length >= 2) {
            const l1 = fullLines[fullLines.length - 2].substring(0, 44).padEnd(44, '<');
            const l2 = fullLines[fullLines.length - 1].substring(0, 44).padEnd(44, '<');
            try {
              const parsed = parseMrzLines(l1, l2);
              const mapped = mapMRZResult(parsed);
              if (Object.keys(mapped).length > Object.keys(bestData).length) bestData = mapped;
            } catch { /* ignore */ }
          }
        }
      }

      // Expand nationality code to full name
      const nationalityMap: Record<string, string> = {
        'IND': 'INDIAN', 'USA': 'AMERICAN', 'GBR': 'BRITISH', 'PAK': 'PAKISTANI',
        'BGD': 'BANGLADESHI', 'LKA': 'SRI LANKAN', 'NPL': 'NEPALESE', 'PHL': 'FILIPINO',
        'EGY': 'EGYPTIAN', 'JOR': 'JORDANIAN', 'IRN': 'IRANIAN', 'IRQ': 'IRAQI',
        'SAU': 'SAUDI', 'ARE': 'EMIRATI', 'KWT': 'KUWAITI', 'QAT': 'QATARI',
        'OMN': 'OMANI', 'BHR': 'BAHRAINI', 'YEM': 'YEMENI', 'SYR': 'SYRIAN',
      };
      if (bestData.nationality && nationalityMap[bestData.nationality]) {
        bestData.nationality = nationalityMap[bestData.nationality];
      }

      // ── VISUAL TEXT PASS: Only for fields NOT in MRZ ──
      // placeOfBirth, placeOfIssue, dateOfIssue are NOT encoded in MRZ
      if (!bestData.placeOfBirth || !bestData.placeOfIssue || !bestData.dateOfIssue) {
        console.log("========== VISUAL TEXT PASS ==========");
        console.log("Missing:",
          !bestData.placeOfBirth ? "placeOfBirth" : "",
          !bestData.placeOfIssue ? "placeOfIssue" : "",
          !bestData.dateOfIssue ? "dateOfIssue" : ""
        );
        try {
          // Scan top 80% of passport (everything above MRZ zone)
          const topH = Math.floor(img.height * 0.80);
          const scale = img.width < 1200 ? 2 : (img.width < 2000 ? 1.5 : 1);
          const topImg = preprocessForMRZ(img, 0, 0, img.width, topH, scale, 1.4);
          if (topImg) {
            const ocrW = await withTimeout(() => ensureOcrWorker(), "OCR engine", 45000);
            await ocrW.setParameters({
              tessedit_char_whitelist: '',
              tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
              preserve_interword_spaces: '1',
            });
            const topResult: any = await withTimeout(
              () => ocrW.recognize(topImg),
              "Visual OCR recognition",
              30000
            );
            const text = topResult.data.text;
            console.log("Visual text:\n", text);

            // Normalize lines: trim, remove empty
            const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

            // Log all lines for debugging
            console.log("Visual lines:", lines.map((l: string, idx: number) => `[${idx}] ${l}`));

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const next = (i + 1 < lines.length) ? lines[i + 1] : '';
              const next2 = (i + 2 < lines.length) ? lines[i + 2] : '';
              const next3 = (i + 3 < lines.length) ? lines[i + 3] : '';

              // Helper: check if a string looks like a place name (alpha-dominant, not a label)
              const looksLikePlace = (s: string): boolean => {
                if (s.length < 2) return false;
                if (!/^[A-Za-z]/.test(s)) return false;
                if (/date|expiry|passport|sex|nationality|surname|given|type|country|code/i.test(s)) return false;
                return true;
              };

              // Helper: extract a date from a string in DD/MM/YYYY format
              const extractDate = (s: string): string | null => {
                const dm = s.match(/(\d{1,2})\s*[\/\.\-]\s*(\d{1,2})\s*[\/\.\-]\s*(\d{2,4})/);
                if (!dm) return null;
                const p = moment(`${dm[1]}/${dm[2]}/${dm[3]}`, ["DD/MM/YYYY", "DD/MM/YY", "D/M/YYYY"], false);
                if (p.isValid() && p.year() >= 1990 && p.year() <= 2040) return p.format("YYYY-MM-DD");
                return null;
              };

              // ── Date of Issue ──
              if (!bestData.dateOfIssue && /date\s*of\s*issue|issue\s*date/i.test(line)) {
                for (const src of [line, next, next2]) {
                  const d = extractDate(src);
                  if (d) {
                    const yr = moment(d).year();
                    if (yr >= 2000 && yr <= 2026) {
                      bestData.dateOfIssue = d;
                      console.log("✓ Date of Issue:", d);
                      break;
                    }
                  }
                }
              }
              // Also catch lines that just say "issue" near dates
              if (!bestData.dateOfIssue && /issue/i.test(line) && !/place/i.test(line)) {
                const d = extractDate(line);
                if (d && moment(d).year() >= 2000 && moment(d).year() <= 2026) {
                  bestData.dateOfIssue = d;
                  console.log("✓ Date of Issue (inline):", d);
                }
              }

              // ── Place of Birth ──
              if (!bestData.placeOfBirth && /place\s*of\s*birth/i.test(line)) {
                // Try: value on same line after label
                const m = line.match(/place\s*of\s*birth[:\s\/\-]*([A-Za-z][A-Za-z\s,\.\-]{1,})/i);
                if (m && looksLikePlace(m[1].trim())) {
                  bestData.placeOfBirth = m[1].trim().replace(/\s+/g, ' ').substring(0, 50);
                }
                // Try next lines
                if (!bestData.placeOfBirth) {
                  for (const candidate of [next, next2, next3]) {
                    const cleaned = candidate.replace(/[^A-Za-z\s,\.\-]/g, '').trim();
                    if (looksLikePlace(cleaned) && cleaned.length > 1 &&
                        !/place\s*of|birth|issue/i.test(cleaned)) {
                      bestData.placeOfBirth = cleaned.replace(/\s+/g, ' ').substring(0, 50);
                      break;
                    }
                  }
                }
                if (bestData.placeOfBirth) console.log("✓ Place of Birth:", bestData.placeOfBirth);
              }

              // ── Place of Issue ──
              if (!bestData.placeOfIssue) {
                // Match "Place of Issue", "place of lssue", "place of 1ssue" etc.
                const isPlaceOfIssue = /place\s*of\s*(?:issue|[il1]ssue)/i.test(line) ||
                                       /issuing\s*authority/i.test(line) ||
                                       /issued?\s*at/i.test(line);
                if (isPlaceOfIssue) {
                  // Try: value on same line after label
                  const m = line.match(/(?:place\s*of\s*(?:issue|[il1]ssue)|issuing\s*authority|issued?\s*at)[:\s\/\-]*([A-Za-z][A-Za-z\s,\.\-]{1,})/i);
                  if (m && looksLikePlace(m[1].trim()) &&
                      !/birth/i.test(m[1])) {
                    bestData.placeOfIssue = m[1].trim().replace(/\s+/g, ' ').substring(0, 50);
                  }
                  // Try next lines
                  if (!bestData.placeOfIssue) {
                    for (const candidate of [next, next2, next3]) {
                      const cleaned = candidate.replace(/[^A-Za-z\s,\.\-]/g, '').trim();
                      if (looksLikePlace(cleaned) && cleaned.length > 1 &&
                          !/place\s*of|birth|issue/i.test(cleaned)) {
                        bestData.placeOfIssue = cleaned.replace(/\s+/g, ' ').substring(0, 50);
                        break;
                      }
                    }
                  }
                  if (bestData.placeOfIssue) console.log("✓ Place of Issue:", bestData.placeOfIssue);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Visual text pass failed:", e);
        }
      }

      // Fallback: calculate expiry from issue date if MRZ missed it
      if (!bestData.dateOfExpiry && bestData.dateOfIssue) {
        const d = moment(bestData.dateOfIssue);
        if (d.isValid()) {
          bestData.dateOfExpiry = d.add(10, 'years').subtract(1, 'day').format("YYYY-MM-DD");
          console.log("✓ Expiry (calculated):", bestData.dateOfExpiry);
        }
      }

      console.log("==================== FINAL DATA ====================");
      console.log(bestData);

      if (Object.keys(bestData).length > 0) {
        onDataExtracted(bestData);
        toast.success("Passport data extracted! Review and fill in any missing fields.");
        setCapturedImage(null);
        onClose();
      } else {
        toast.error("Could not read MRZ. Ensure the bottom two lines of the passport are clearly visible and well-lit.");
      }
    } catch (error) {
      console.error("MRZ Scan error:", error);
      const message = error instanceof Error ? error.message : "Failed to scan passport";
      if (/timed out/i.test(message)) {
        // Recover from potentially stuck underlying OCR task after timeout.
        await resetOcrWorker();
        void ensureOcrWorker();
      }
      toast.error(message);
      setCapturedImage(null);
    } finally {
      setProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ maxWidth: "95vw", maxHeight: "90vh", padding: 0 }}>
        <DialogHeader style={{ padding: "1rem 1.5rem 0.5rem" }}>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ScanLine width="1.25rem" />
            MRZ Passport Scanner
          </DialogTitle>
          <DialogDescription>
            {!ocrReady 
              ? `Loading scan engine... ${ocrLoadProgress}%` 
              : processing
                ? "Reading MRZ zone..."
                : capturedImage
                  ? "Image captured. Tap Retake to try again."
                  : "Position the MRZ (bottom 2 lines of text) inside the highlighted zone"}
          </DialogDescription>
          <p style={{ fontSize: "0.78rem", opacity: 0.65, marginTop: "0.2rem" }}>
            MRZ Scan Engine Status: {mrzStatus} {ocrReady ? "(Ready)" : `(${ocrLoadProgress}%)`}
          </p>
        </DialogHeader>

        <div style={{ position: "relative", width: "100%", aspectRatio: "3/2", background: "#000", overflow: "hidden" }}>
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {/* Passport outline */}
              <div style={{
                position: "absolute",
                inset: "4%",
                border: "2px solid rgba(255, 255, 255, 0.35)",
                borderRadius: "0.5rem",
                pointerEvents: "none",
              }} />
              {/* MRZ guide zone — highlighted bottom strip */}
              <div style={{
                position: "absolute",
                left: "4%",
                right: "4%",
                bottom: "4%",
                height: "22%",
                border: "2px solid mediumslateblue",
                borderRadius: "0.25rem",
                background: "rgba(123, 104, 238, 0.12)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <span style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                  textTransform: "uppercase",
                }}>
                  MRZ Zone — Align the two bottom lines here
                </span>
              </div>
            </>
          ) : (
            <img src={capturedImage} alt="Captured" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>

        <div style={{ padding: "1rem 1.5rem", display: "flex", gap: "0.75rem" }}>
          {!capturedImage ? (
            <>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: "0.875rem",
                  borderRadius: "0.75rem",
                  background: "rgba(100, 100, 100, 0.1)",
                  border: "none",
                  fontSize: "1rem",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={captureAndProcess}
                disabled={!ocrReady || processing}
                style={{
                  flex: 2,
                  padding: "0.875rem",
                  borderRadius: "0.75rem",
                  background: (ocrReady && !processing) ? "mediumslateblue" : "rgba(100, 100, 100, 0.3)",
                  color: "white",
                  border: "none",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: (ocrReady && !processing) ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem"
                }}
              >
                {processing ? (
                  <>
                    <Loader2 className="animate-spin" width="1.25rem" />
                    Scanning MRZ...
                  </>
                ) : (
                  <>
                    <ScanLine width="1.25rem" />
                    Scan Passport
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setCapturedImage(null);
                startCamera();
              }}
              disabled={processing}
              style={{
                flex: 1,
                padding: "0.875rem",
                borderRadius: "0.75rem",
                background: processing ? "rgba(100, 100, 100, 0.3)" : "rgba(100, 100, 100, 0.1)",
                border: "none",
                fontSize: "1rem",
                fontWeight: "500",
                cursor: processing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              {processing ? (
                <>
                  <Loader2 className="animate-spin" width="1.25rem" />
                  Processing...
                </>
              ) : (
                <>
                  <Camera width="1.25rem" />
                  Retake
                </>
              )}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Small reusable cell for detail view
const DetailCell = ({ label, value, mono, large, valueColor }: { label: string; value: string; mono?: boolean; large?: boolean; valueColor?: string }) => (
  <div style={{ background: "rgba(100,100,100,0.05)", padding: "0.65rem 0.8rem", borderRadius: "0.6rem" }}>
    <div style={{ fontSize: "0.68rem", opacity: 0.5, marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    <div style={{ fontSize: large ? "1rem" : "0.875rem", fontWeight: 600, fontFamily: mono ? "monospace" : undefined, color: valueColor }}>{value}</div>
  </div>
);

// Main Passports Component
export default function Passports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCompleted, setRefreshCompleted] = useState(false);
  const [passports, setPassports] = useState<PassportRecord[]>([]);
  
  // Form states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [editingPassport, setEditingPassport] = useState<PassportRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [passportNumber, setPassportNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [placeOfIssue, setPlaceOfIssue] = useState("");
  const [dateOfIssue, setDateOfIssue] = useState("");
  const [dateOfExpiry, setDateOfExpiry] = useState("");
  const [nationality, setNationality] = useState("");
  const [sex, setSex] = useState("");
  
  // Detail view states
  const [selectedPassport, setSelectedPassport] = useState<PassportRecord | null>(null);
  const [drawerDetailOpen, setDrawerDetailOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isMobile = window.innerWidth < 768;

  const fetchPassports = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (!user?.id) return;

      const q = query(
        collection(db, "passports"),
        where("userId", "==", user.id),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      const fetchedPassports: PassportRecord[] = [];
      snapshot.forEach((doc) => {
        fetchedPassports.push({ id: doc.id, ...doc.data() } as PassportRecord);
      });

      setPassports(fetchedPassports);

      if (isManualRefresh) {
        setRefreshCompleted(true);
        setTimeout(() => setRefreshCompleted(false), 900);
      }
    } catch (error) {
      console.error("Error fetching passports:", error);
      toast.error("Failed to load passports");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchPassports();
    }
  }, [user?.id]);

  const resetForm = () => {
    setPassportNumber("");
    setFullName("");
    setDateOfBirth("");
    setPlaceOfBirth("");
    setPlaceOfIssue("");
    setDateOfIssue("");
    setDateOfExpiry("");
    setNationality("");
    setSex("");
    setEditingPassport(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setSubmitting(true);
    try {
      const passportData = {
        passportNumber,
        fullName,
        dateOfBirth,
        placeOfBirth,
        placeOfIssue,
        dateOfIssue,
        dateOfExpiry,
        nationality,
        sex,
        userId: user.id,
        updatedAt: new Date(),
      };

      if (editingPassport) {
        await updateDoc(doc(db, "passports", editingPassport.id), passportData);
        toast.success("Passport updated successfully");
      } else {
        await addDoc(collection(db, "passports"), {
          ...passportData,
          createdAt: new Date(),
        });
        toast.success("Passport added successfully");
      }

      resetForm();
      setDrawerOpen(false);
      fetchPassports();
    } catch (error) {
      console.error("Error saving passport:", error);
      toast.error("Failed to save passport");
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanPassport = () => {
    setScannerOpen(true);
  };

  const handleDataExtracted = (data: Partial<PassportRecord>) => {
    if (data.passportNumber) setPassportNumber(data.passportNumber);
    if (data.fullName) setFullName(data.fullName);
    if (data.dateOfBirth) setDateOfBirth(data.dateOfBirth);
    if (data.placeOfBirth) setPlaceOfBirth(data.placeOfBirth);
    if (data.placeOfIssue) setPlaceOfIssue(data.placeOfIssue);
    if (data.dateOfIssue) setDateOfIssue(data.dateOfIssue);
    if (data.dateOfExpiry) setDateOfExpiry(data.dateOfExpiry);
    if (data.nationality) setNationality(data.nationality);
    if (data.sex) setSex(data.sex);
    setScannerOpen(false);
  };

  const handleEdit = (passport: PassportRecord) => {
    setEditingPassport(passport);
    setPassportNumber(passport.passportNumber);
    setFullName(passport.fullName);
    setDateOfBirth(passport.dateOfBirth);
    setPlaceOfBirth(passport.placeOfBirth);
    setPlaceOfIssue(passport.placeOfIssue);
    setDateOfIssue(passport.dateOfIssue);
    setDateOfExpiry(passport.dateOfExpiry);
    setNationality(passport.nationality);
    setSex(passport.sex || "");
    setDrawerDetailOpen(false);
    setDrawerOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      await deleteDoc(doc(db, "passports", deletingId));
      toast.success("Passport deleted");
      setDeleteDialogOpen(false);
      setDrawerDetailOpen(false);
      setDeletingId(null);
      fetchPassports();
    } catch (error) {
      console.error("Error deleting passport:", error);
      toast.error("Failed to delete passport");
    }
  };

  const showDeleteConfirmation = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const downloadExcel = () => {
    if (passports.length === 0) {
      toast.error("No passport records to export");
      return;
    }

    const rows = passports.map((p) => ({
      "Passport Number": p.passportNumber,
      "Full Name": p.fullName,
      "Date of Birth": p.dateOfBirth ? moment(p.dateOfBirth).format("DD/MM/YYYY") : "",
      "Nationality": p.nationality,
      "Sex": p.sex === "M" ? "Male" : p.sex === "F" ? "Female" : p.sex || "",
      "Place of Birth": p.placeOfBirth || "",
      "Place of Issue": p.placeOfIssue || "",
      "Date of Issue": p.dateOfIssue ? moment(p.dateOfIssue).format("DD/MM/YYYY") : "",
      "Date of Expiry": p.dateOfExpiry ? moment(p.dateOfExpiry).format("DD/MM/YYYY") : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Passports");

    // Auto-size columns
    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String((r as Record<string, string>)[key] || "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `Passports_${moment().format("YYYY-MM-DD")}.xlsx`);
    toast.success("Passport list downloaded");
  };

  const isExpired = (expiryDate: string) => {
    return moment(expiryDate).isBefore(moment(), 'day');
  };

  const isExpiringSoon = (expiryDate: string) => {
    const daysUntilExpiry = moment(expiryDate).diff(moment(), 'days');
    return daysUntilExpiry > 0 && daysUntilExpiry <= 60;
  };

  const daysUntilExpiry = (expiryDate: string) => {
    return moment(expiryDate).diff(moment(), 'days');
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <Back
          fixed
          blurBG
          title="Passports"
          subtitle={passports.length}
          extra={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <RefreshButton
                onClick={() => fetchPassports(true)}
                refreshCompleted={refreshCompleted}
                fetchingData={refreshing}
              />
              {passports.length > 0 && (
                <button
                  onClick={downloadExcel}
                  style={{
                    background: "rgba(100, 100, 100, 0.08)",
                    border: "none",
                    borderRadius: "0.5rem",
                    padding: "0.5rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow:"1px 1px 5px rgba(0,0,0,0.4)",
                    height:"2.75rem",
                    width:"3rem"

                  }}
                  title="Download as Excel"
                >
                  <Download width="1.125rem" />
                </button>
              )}
            </div>
          }
        />

        <div style={{ padding: "1.25rem", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ height: "2rem" }} />

          {/* Passports List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: "5.5rem", paddingTop: "2rem" }}>
            {loading ? (
              <div style={{ 
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "70vh",
                opacity: 0.5
              }}>
                <Loader2 className="animate-spin" />
              </div>
            ) : passports.length === 0 ? (
              <Empty style={{ minHeight: "70vh" }}>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookMarked />
                  </EmptyMedia>
                  <EmptyTitle>No passports yet</EmptyTitle>
                  <EmptyDescription>Add your first passport record</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              passports.map((passport) => {
                const expired = isExpired(passport.dateOfExpiry);
                const expiringSoon = isExpiringSoon(passport.dateOfExpiry);
                const days = daysUntilExpiry(passport.dateOfExpiry);
                const statusColor = expired ? "#dc2626" : expiringSoon ? "#d97706" : "#16a34a";
                const statusBg = expired ? "rgba(220,38,38,0.08)" : expiringSoon ? "rgba(217,119,6,0.08)" : "rgba(22,163,74,0.08)";
                const StatusIcon = expired ? AlertTriangle : expiringSoon ? Clock : CheckCircle2;
                const statusLabel = expired
                  ? "Expired"
                  : expiringSoon
                    ? `${days}d left`
                    : "Valid";

                return (
                  <motion.div
                    key={passport.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => {
                      setSelectedPassport(passport);
                      setDrawerDetailOpen(true);
                    }}
                    style={{
                      background: "rgba(100, 100, 100, 0.04)",
                      borderRadius: "1rem",
                      padding: "1rem 1.1rem",
                      cursor: "pointer",
                      border: `1px solid ${expired ? "rgba(220,38,38,0.15)" : expiringSoon ? "rgba(217,119,6,0.15)" : "rgba(100,100,100,0.09)"}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.7rem",
                    }}
                  >
                    {/* Top row: icon + name + status badge + chevron */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{
                        background: expired ? "rgba(220,38,38,0.1)" : expiringSoon ? "rgba(217,119,6,0.1)" : "rgba(72,61,139,0.1)",
                        padding: "0.6rem",
                        borderRadius: "0.65rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <BookMarked
                          width="1.25rem"
                          color={expired ? "#dc2626" : expiringSoon ? "#d97706" : "darkslateblue"}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {passport.fullName}
                        </div>
                        <div style={{ fontSize: "0.78rem", opacity: 0.55, marginTop: "0.1rem" }}>
                          {passport.passportNumber} · {passport.nationality}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <span style={{
                          display: "flex", alignItems: "center", gap: "0.25rem",
                          background: statusBg,
                          color: statusColor,
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "0.25rem 0.55rem",
                          borderRadius: "999px",
                          whiteSpace: "nowrap",
                        }}>
                          <StatusIcon width="0.7rem" />
                          {statusLabel}
                        </span>
                        <ChevronRight width="1rem" style={{ opacity: 0.3 }} />
                      </div>
                    </div>

                    {/* Bottom row: expiry + DOB */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                      borderTop: "1px solid rgba(100,100,100,0.08)",
                      paddingTop: "0.65rem",
                    }}>
                      <div>
                        <div style={{ fontSize: "0.68rem", opacity: 0.5, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Expires</div>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: statusColor }}>
                          {moment(passport.dateOfExpiry).format("DD MMM YYYY")}
                        </div>
                      </div>
                      {passport.dateOfBirth && (
                        <div>
                          <div style={{ fontSize: "0.68rem", opacity: 0.5, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Date of Birth</div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                            {moment(passport.dateOfBirth).format("DD MMM YYYY")}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Add Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: isMobile ? 1 : 1.05 }}
          onClick={() => {
            resetForm();
            setDrawerOpen(true);
          }}
          style={{
            position: "fixed",
            bottom: isMobile ? "calc(1rem + env(safe-area-inset-bottom, 0px))" : "calc(2rem + env(safe-area-inset-bottom, 0px))",
            right: isMobile ? "1rem" : "1.5rem",
            left: isMobile ? "1rem" : "auto",
            width: isMobile ? "calc(100% - 2rem)" : "auto",
            height: isMobile ? "auto" : "3.25rem",
            padding: isMobile ? "0.875rem" : "0 1.25rem",
            borderRadius: "0.75rem",
            background: "darkslateblue",
            color: "white",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            zIndex: 50,
            boxShadow: "0 4px 16px rgba(72,61,139,0.35)",
          }}
        >
          <Plus width="1.125rem" strokeWidth={2.5} />
          Add Passport
        </motion.button>
      </motion.div>

      {/* Passport Form Modal */}
      <ResponsiveModal
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title=""
        description=""
      >
        <PassportFormContent
          passportNumber={passportNumber}
          setPassportNumber={setPassportNumber}
          fullName={fullName}
          setFullName={setFullName}
          dateOfBirth={dateOfBirth}
          setDateOfBirth={setDateOfBirth}
          placeOfBirth={placeOfBirth}
          setPlaceOfBirth={setPlaceOfBirth}
          placeOfIssue={placeOfIssue}
          setPlaceOfIssue={setPlaceOfIssue}
          dateOfIssue={dateOfIssue}
          setDateOfIssue={setDateOfIssue}
          dateOfExpiry={dateOfExpiry}
          setDateOfExpiry={setDateOfExpiry}
          nationality={nationality}
          setNationality={setNationality}
          sex={sex}
          setSex={setSex}
          editingPassport={editingPassport}
          submitting={submitting}
          handleSubmit={handleSubmit}
          onScanPassport={handleScanPassport}
        />
      </ResponsiveModal>

      {/* Passport Scanner */}
      <PassportScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDataExtracted={handleDataExtracted}
      />

      {/* Detail View Modal */}
      {selectedPassport && (
        <ResponsiveModal
          open={drawerDetailOpen}
          onOpenChange={setDrawerDetailOpen}
          title=""
          description=""
        >
          <div style={{ display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
            {/* Header */}
            <div style={{
              padding: "1.25rem 1.5rem 1rem",
              borderBottom: "1px solid rgba(100,100,100,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div style={{
                  background: isExpired(selectedPassport.dateOfExpiry) ? "rgba(220,38,38,0.1)" : isExpiringSoon(selectedPassport.dateOfExpiry) ? "rgba(217,119,6,0.1)" : "rgba(72,61,139,0.1)",
                  padding: "0.55rem", borderRadius: "0.6rem", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <BookMarked width="1.1rem" color={isExpired(selectedPassport.dateOfExpiry) ? "#dc2626" : isExpiringSoon(selectedPassport.dateOfExpiry) ? "#d97706" : "darkslateblue"} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>Passport Details</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.5 }}>{selectedPassport.passportNumber}</div>
                </div>
              </div>
              <button onClick={() => setDrawerDetailOpen(false)} style={{ background: "rgba(100,100,100,0.08)", border: "none", borderRadius: "0.5rem", padding: "0.4rem", cursor: "pointer", display: "flex" }}>
                <X width="1.1rem" />
              </button>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", minHeight: 0 }}>
              {(isExpired(selectedPassport.dateOfExpiry) || isExpiringSoon(selectedPassport.dateOfExpiry)) && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  background: isExpired(selectedPassport.dateOfExpiry) ? "rgba(220,38,38,0.08)" : "rgba(217,119,6,0.08)",
                  border: `1px solid ${isExpired(selectedPassport.dateOfExpiry) ? "rgba(220,38,38,0.2)" : "rgba(217,119,6,0.2)"}`,
                  color: isExpired(selectedPassport.dateOfExpiry) ? "#dc2626" : "#d97706",
                  borderRadius: "0.65rem", padding: "0.65rem 0.85rem", marginBottom: "1rem",
                  fontSize: "0.82rem", fontWeight: 600,
                }}>
                  {isExpired(selectedPassport.dateOfExpiry)
                    ? <><AlertTriangle width="0.9rem" /> This passport has expired</>
                    : <><Clock width="0.9rem" /> Expires in {daysUntilExpiry(selectedPassport.dateOfExpiry)} days</>}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <DetailCell label="Passport No." value={selectedPassport.passportNumber} mono />
                  <DetailCell label="Nationality" value={selectedPassport.nationality} />
                </div>
                <DetailCell label="Full Name" value={selectedPassport.fullName} large />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <DetailCell label="Date of Birth" value={moment(selectedPassport.dateOfBirth).format("DD MMM YYYY")} />
                  {selectedPassport.sex && <DetailCell label="Sex" value={selectedPassport.sex === 'M' ? 'Male' : 'Female'} />}
                </div>
                {(selectedPassport.placeOfBirth || selectedPassport.placeOfIssue) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    {selectedPassport.placeOfBirth && <DetailCell label="Place of Birth" value={selectedPassport.placeOfBirth} />}
                    {selectedPassport.placeOfIssue && <DetailCell label="Place of Issue" value={selectedPassport.placeOfIssue} />}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {selectedPassport.dateOfIssue && <DetailCell label="Date of Issue" value={moment(selectedPassport.dateOfIssue).format("DD MMM YYYY")} />}
                  <DetailCell
                    label="Date of Expiry"
                    value={moment(selectedPassport.dateOfExpiry).format("DD MMM YYYY")}
                    valueColor={isExpired(selectedPassport.dateOfExpiry) ? "#dc2626" : isExpiringSoon(selectedPassport.dateOfExpiry) ? "#d97706" : undefined}
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ padding: "1rem 1.5rem calc(1rem + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid rgba(100,100,100,0.1)", display: "flex", gap: "0.6rem", flexShrink: 0 }}>
              <button
                onClick={() => handleEdit(selectedPassport)}
                style={{ flex: 1, padding: "0.8rem", borderRadius: "0.65rem", background: "darkslateblue", color: "white", border: "none", fontSize: "0.9 rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
              >
                <PenLine width="0.9rem" /> Edit
              </button>
              <button
                onClick={() => showDeleteConfirmation(selectedPassport.id)}
                style={{ padding: "0.8rem 1rem", borderRadius: "0.65rem", background: "rgba(220,38,38,0.08)", color: "#dc2626",fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", flex:1 }}
              >
                <Trash width="0.9rem" /> Delete
              </button>
            </div>
          </div>
        </ResponsiveModal>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent style={{ maxWidth: "400px", padding: "1.5rem" }}>
          <DialogHeader>
            <DialogTitle>Delete Passport</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this passport record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              style={{
                flex: 1,
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "rgba(100, 100, 100, 0.1)",
                border: "none",
                fontSize: "0.95rem",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              style={{
                flex: 1,
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "rgb(220, 38, 38)",
                color: "white",
                border: "none",
                fontSize: "0.95rem",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
