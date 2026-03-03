/**
 * useCardScanner — 신용카드 스캐너 커스텀 훅
 * 카메라 → 촬영 → OpenCV 처리 → OCR → Luhn 검증
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { loadOpenCV } from "../utils/opencv-loader";
import { processFrame, extractGuidelineROI } from "../utils/image-processing";
import { recognizeCardNumber, terminateOCR } from "../utils/ocr";
import { validateLuhn, formatCardNumber } from "../utils/luhn";

export function useCardScanner() {
  const [opencvLoaded, setOpencvLoaded] = useState(false);
  const [opencvLoading, setOpencvLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState("live"); // 'live' | 'preview' | 'processing' | 'result'
  const [recognizedText, setRecognizedText] = useState("");
  const [confirmedNumber, setConfirmedNumber] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cvRef = useRef(null);
  const guidelineRef = useRef(null);
  const capturedCanvasRef = useRef(null);
  const capturedDimensionsRef = useRef(null);

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

  // OpenCV 로드 완료 시 카메라 자동 시작
  useEffect(() => {
    if (!opencvLoaded) return;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setCameraReady(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.name === "NotAllowedError") {
          setError(
            "카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.",
          );
        } else if (err.name === "NotFoundError") {
          setError("카메라를 찾을 수 없습니다.");
        } else {
          setError("카메라 접근 오류: " + err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opencvLoaded]);

  // 사진 촬영
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // 현재 프레임을 캔버스에 스냅샷
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    capturedCanvasRef.current = canvas;
    capturedDimensionsRef.current = {
      clientWidth: video.clientWidth,
      clientHeight: video.clientHeight,
    };

    // 비디오 일시정지 → 프리뷰로 표시
    video.pause();
    setPhase("preview");
    setError("");
  }, []);

  // 다시 촬영
  const retake = useCallback(() => {
    capturedCanvasRef.current = null;
    capturedDimensionsRef.current = null;
    setRecognizedText("");
    setConfirmedNumber("");
    setError("");
    setCopied(false);

    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
    setPhase("live");
  }, []);

  // 인식 실행
  const recognize = useCallback(async () => {
    const cv = cvRef.current;
    const canvas = capturedCanvasRef.current;
    const dims = capturedDimensionsRef.current;

    if (!cv || !canvas) return;

    setPhase("processing");
    setRecognizedText("");
    setError("");

    try {
      // 1차: 윤곽선 기반 카드 검출
      let roiCanvas = processFrame(cv, canvas);

      // 2차: 가이드라인 ROI 영역 추출
      if (!roiCanvas && guidelineRef.current && dims) {
        roiCanvas = extractGuidelineROI(cv, canvas, guidelineRef.current, dims);
      }

      if (roiCanvas) {
        const text = await recognizeCardNumber(roiCanvas);
        setRecognizedText(text || "");

        if (
          text &&
          text.length >= 13 &&
          text.length <= 19 &&
          validateLuhn(text)
        ) {
          setConfirmedNumber(formatCardNumber(text));
          setPhase("result");
          return;
        }
      }

      setPhase("preview");
      setError("카드 번호를 인식하지 못했습니다. 다시 촬영해주세요.");
    } catch (err) {
      console.error("Recognition error:", err);
      setPhase("preview");
      setError("인식 중 오류가 발생했습니다.");
    }
  }, []);

  // 리셋 (결과 화면에서 처음으로)
  const reset = useCallback(() => {
    capturedCanvasRef.current = null;
    capturedDimensionsRef.current = null;
    setConfirmedNumber("");
    setRecognizedText("");
    setError("");
    setCopied(false);

    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
    setPhase("live");
  }, []);

  // 클립보드 복사
  const copyToClipboard = useCallback(async () => {
    if (!confirmedNumber) return;

    try {
      await navigator.clipboard.writeText(confirmedNumber.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      terminateOCR();
    };
  }, []);

  return {
    opencvLoaded,
    opencvLoading,
    cameraReady,
    phase,
    recognizedText,
    confirmedNumber,
    error,
    copied,
    videoRef,
    capturePhoto,
    retake,
    recognize,
    reset,
    copyToClipboard,
    setGuidelineRect,
  };
}
