/**
 * OpenCV.js 비동기 로더
 * public/opencv.js (Emscripten 빌드)를 script 태그로 로드
 *
 * 주의: Emscripten Module 객체는 커스텀 .then()을 가지며,
 * 항상 자기 자신(Module)을 콜백에 전달한다.
 * Module이 thenable이므로 Promise.resolve(Module) 시
 * 무한 resolution 루프가 발생한다.
 * 반드시 resolve 전에 .then()을 제거해야 한다.
 */

const OPENCV_URL = "/opencv.js";
const INIT_TIMEOUT = 30000;

let loadPromise = null;

export function loadOpenCV() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // 이미 로드 완료
    if (window.cv && typeof window.cv.Mat === "function") {
      resolve(window.cv);
      return;
    }

    const timer = setTimeout(() => {
      loadPromise = null;
      reject(new Error("OpenCV.js 초기화 시간이 초과되었습니다."));
    }, INIT_TIMEOUT);

    const script = document.createElement("script");
    script.src = OPENCV_URL;
    script.async = true;

    script.onload = () => {
      const cvModule = window.cv;

      if (!cvModule) {
        clearTimeout(timer);
        loadPromise = null;
        reject(new Error("OpenCV.js 로드 후 cv 객체를 찾을 수 없습니다."));
        return;
      }

      const done = (cv) => {
        // Emscripten Module의 커스텀 .then() 제거
        // (Promise resolve 시 무한 thenable 루프 방지)
        delete cv.then;
        clearTimeout(timer);
        resolve(cv);
      };

      // WASM 빌드: 비동기 컴파일이 아직 진행 중일 수 있음
      if (typeof cvModule.Mat === "function") {
        done(cvModule);
      } else {
        // 런타임 초기화 대기
        const prevCallback = cvModule.onRuntimeInitialized;
        cvModule.onRuntimeInitialized = () => {
          if (prevCallback) prevCallback();
          done(cvModule);
        };
      }
    };

    script.onerror = () => {
      clearTimeout(timer);
      loadPromise = null;
      reject(new Error("OpenCV.js 파일을 로드할 수 없습니다."));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
