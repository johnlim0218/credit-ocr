/**
 * OpenCV.js 비동기 로더
 * CDN에서 WebAssembly 버전을 동적으로 로드합니다.
 */

const OPENCV_URL = "https://docs.opencv.org/4.9.0/opencv.js";

let loadPromise = null;

export function loadOpenCV() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // 이미 로드된 경우
    if (window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    // OpenCV가 준비되면 호출되는 콜백
    window.Module = {
      onRuntimeInitialized: () => {
        resolve(window.cv);
      },
    };

    const script = document.createElement("script");
    script.src = OPENCV_URL;
    script.async = true;

    script.onload = () => {
      // onRuntimeInitialized가 이미 호출되었을 수도 있으므로 대기
      if (window.cv && window.cv.Mat) {
        resolve(window.cv);
      }
      // 아직 초기화 중이면 onRuntimeInitialized 콜백이 resolve 처리
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error("OpenCV.js 로드에 실패했습니다."));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
