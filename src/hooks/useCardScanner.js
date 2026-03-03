/**
 * useCardScanner — 신용카드 스캐너 커스텀 훅
 * 카메라 → OpenCV 처리 → OCR → Luhn 검증 전체 파이프라인
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { loadOpenCV } from "../utils/opencv-loader";
import { processFrame, extractGuidelineROI } from "../utils/image-processing";
import { recognizeCardNumber, terminateOCR } from "../utils/ocr";
import { validateLuhn, formatCardNumber } from "../utils/luhn";

const SCAN_INTERVAL = 1500; // 1.5초 간격으로 스캔

export function useCardScanner() {
  const [opencvLoaded, setOpencvLoaded] = useState(false);
  const [opencvLoading, setOpencvLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [confirmedNumber, setConfirmedNumber] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const cvRef = useRef(null);
  const guidelineRef = useRef(null);
  const isProcessingRef = useRef(false);

  // OpenCV.js 로드
  useEffect(() => {
    let cancelled = false;

    loadOpenCV()
      .then((cv) => {
        if (!cancelled) {
          cvRef.current = cv;
          setOpencvLoaded(true);
          setOpencvLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError("OpenCV.js를 로드할 수 없습니다: " + err.message);
          setOpencvLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 카메라 시작
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // 후면 카메라 우선
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraReady(true);
        setError("");
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setError(
          "카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.",
        );
      } else if (err.name === "NotFoundError") {
        setError("카메라를 찾을 수 없습니다.");
      } else {
        setError("카메라 접근 오류: " + err.message);
      }
    }
  }, []);

  // OpenCV 로드 완료 시 카메라 자동 시작
  useEffect(() => {
    if (opencvLoaded) {
      startCamera();
    }
  }, [opencvLoaded, startCamera]);

  // 단일 프레임 스캔 처리
  const scanFrame = useCallback(async () => {
    const cv = cvRef.current;
    const video = videoRef.current;

    if (
      !cv ||
      !video ||
      !video.videoWidth ||
      isProcessingRef.current ||
      confirmedNumber
    ) {
      return;
    }

    isProcessingRef.current = true;

    try {
      // 1차: 윤곽선 기반 카드 검출 시도
      let roiCanvas = processFrame(cv, video, null);

      // 2차: 실패 시 가이드라인 영역을 직접 추출
      if (!roiCanvas && guidelineRef.current) {
        roiCanvas = extractGuidelineROI(cv, video, guidelineRef.current);
      }

      if (roiCanvas) {
        // OCR 실행
        const text = await recognizeCardNumber(roiCanvas);
        setRecognizedText(text || "");

        // 13~19자리 숫자 + Luhn 검증
        if (
          text &&
          text.length >= 13 &&
          text.length <= 19 &&
          validateLuhn(text)
        ) {
          setConfirmedNumber(formatCardNumber(text));
          setScanning(false);
          stopScanLoop();
        }
      }
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [confirmedNumber]);

  // 스캔 루프 시작
  const startScanning = useCallback(() => {
    if (scanning || confirmedNumber) return;

    setScanning(true);
    setRecognizedText("");

    const loop = () => {
      scanFrame();
      scanTimerRef.current = setTimeout(loop, SCAN_INTERVAL);
    };
    loop();
  }, [scanning, confirmedNumber, scanFrame]);

  // 스캔 루프 중지
  const stopScanLoop = useCallback(() => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  // 리셋
  const reset = useCallback(() => {
    stopScanLoop();
    setConfirmedNumber("");
    setRecognizedText("");
    setScanning(false);
    setCopied(false);
  }, [stopScanLoop]);

  // 클립보드 복사
  const copyToClipboard = useCallback(async () => {
    if (!confirmedNumber) return;

    try {
      await navigator.clipboard.writeText(confirmedNumber.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = confirmedNumber.replace(/\s/g, "");
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [confirmedNumber]);

  // 가이드라인 좌표 설정 (CameraView에서 호출)
  const setGuidelineRect = useCallback((rect) => {
    guidelineRef.current = rect;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stopScanLoop();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      terminateOCR();
    };
  }, [stopScanLoop]);

  return {
    // 상태
    opencvLoaded,
    opencvLoading,
    cameraReady,
    scanning,
    recognizedText,
    confirmedNumber,
    error,
    copied,

    // Refs
    videoRef,

    // 메서드
    startScanning,
    reset,
    copyToClipboard,
    setGuidelineRect,
  };
}
