/**
 * CameraView — 카메라 뷰 + 카드 가이드라인 오버레이
 */
import { useEffect, useRef, useCallback } from "react";
import { Camera, RotateCcw, Loader2, ScanSearch } from "lucide-react";

export default function CameraView({
  videoRef,
  phase,
  onGuidelineRect,
  onCapture,
  onRetake,
  onRecognize,
  cameraReady,
}) {
  const containerRef = useRef(null);

  // 가이드라인 좌표를 부모 훅에 전달
  const updateGuidelineRect = useCallback(() => {
    if (!containerRef.current || !videoRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    const guideWidth = rect.width * 0.85;
    const guideHeight = guideWidth / 1.586;
    const guideX = (rect.width - guideWidth) / 2;
    const guideY = (rect.height - guideHeight) / 2;

    onGuidelineRect({
      x: guideX,
      y: guideY,
      width: guideWidth,
      height: guideHeight,
    });
  }, [onGuidelineRect, videoRef]);

  useEffect(() => {
    if (cameraReady) {
      const timer = setTimeout(updateGuidelineRect, 500);
      window.addEventListener("resize", updateGuidelineRect);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", updateGuidelineRect);
      };
    }
  }, [cameraReady, updateGuidelineRect]);

  return (
    <div className="camera-container" ref={containerRef}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="camera-video"
      />

      {/* 어두운 오버레이 + 카드 가이드라인 컷아웃 */}
      <div className="camera-overlay">
        <svg
          className="guideline-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <mask id="cardMask">
              <rect width="100" height="100" fill="white" />
              <rect
                x="7.5"
                y="20"
                width="85"
                height="60"
                rx="3"
                ry="3"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100"
            height="100"
            fill="rgba(0,0,0,0.6)"
            mask="url(#cardMask)"
          />
        </svg>

        {/* 카드 가이드라인 테두리 */}
        <div
          className={`card-guideline ${phase === "processing" ? "scanning" : ""}`}
        >
          <div className="corner corner-tl"></div>
          <div className="corner corner-tr"></div>
          <div className="corner corner-bl"></div>
          <div className="corner corner-br"></div>

          {phase === "processing" && <div className="scan-line"></div>}

          {phase === "live" && cameraReady && (
            <div className="guideline-hint">
              <Camera size={20} />
              <span>카드를 이 영역에 맞춰주세요</span>
            </div>
          )}
        </div>
      </div>

      {/* 촬영 버튼 — 라이브 모드 */}
      {cameraReady && phase === "live" && (
        <button className="capture-button" onClick={onCapture}>
          <Camera size={24} />
          <span>촬영</span>
        </button>
      )}

      {/* 프리뷰 모드 버튼 */}
      {phase === "preview" && (
        <div className="preview-actions">
          <button className="preview-btn retake-btn" onClick={onRetake}>
            <RotateCcw size={18} />
            <span>다시 촬영</span>
          </button>
          <button className="preview-btn recognize-btn" onClick={onRecognize}>
            <ScanSearch size={18} />
            <span>인식하기</span>
          </button>
        </div>
      )}

      {/* 처리 중 오버레이 */}
      {phase === "processing" && (
        <div className="processing-overlay">
          <Loader2 size={36} className="spin-icon" />
          <span>카드 번호 인식 중...</span>
        </div>
      )}
    </div>
  );
}
