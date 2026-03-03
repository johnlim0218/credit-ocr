/**
 * LoadingScreen — OpenCV.js 로딩 화면
 */
import { Cpu } from "lucide-react";

export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-icon-wrapper">
          <Cpu size={48} className="loading-icon" />
          <div className="loading-ring"></div>
        </div>
        <h2 className="loading-title">엔진 초기화 중</h2>
        <p className="loading-subtitle">OpenCV.js를 로드하고 있습니다...</p>
        <div className="loading-bar-track">
          <div className="loading-bar-fill"></div>
        </div>
      </div>
    </div>
  );
}
