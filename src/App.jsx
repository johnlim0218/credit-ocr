/**
 * App — 메인 애플리케이션
 * 신용카드 번호 자동 인식 웹앱
 */
import { useCardScanner } from "./hooks/useCardScanner";
import LoadingScreen from "./components/LoadingScreen";
import CameraView from "./components/CameraView";
import ResultDisplay from "./components/ResultDisplay";
import { CreditCard, ShieldCheck, AlertTriangle } from "lucide-react";

function App() {
  const {
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
  } = useCardScanner();

  // OpenCV 로딩 중
  if (opencvLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <CreditCard size={24} />
            <h1>CardScan</h1>
          </div>
          <div className="header-badge">
            <ShieldCheck size={14} />
            <span>로컬 처리</span>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="app-main">
        {/* 에러 표시 */}
        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* 카메라 뷰 */}
        {opencvLoaded && (
          <CameraView
            videoRef={videoRef}
            phase={phase}
            cameraReady={cameraReady}
            onGuidelineRect={setGuidelineRect}
            onCapture={capturePhoto}
            onRetake={retake}
            onRecognize={recognize}
          />
        )}

        {/* 결과 표시 */}
        <ResultDisplay
          phase={phase}
          recognizedText={recognizedText}
          confirmedNumber={confirmedNumber}
          copied={copied}
          onReset={reset}
          onCopy={copyToClipboard}
        />
      </main>

      {/* 푸터 */}
      <footer className="app-footer">
        <p>
          모든 처리는 브라우저에서 로컬로 수행됩니다. 카드 데이터는 서버로
          전송되지 않습니다.
        </p>
      </footer>
    </div>
  );
}

export default App;
