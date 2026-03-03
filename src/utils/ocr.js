/**
 * Tesseract.js OCR 래퍼
 * 카드 번호 인식에 최적화된 설정으로 구성
 */
import { createWorker } from "tesseract.js";

let worker = null;

/**
 * Tesseract worker 초기화 (싱글턴)
 */
async function getWorker() {
  if (!worker) {
    worker = await createWorker("eng", 1, {
      logger: () => {},
    });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "7", // Single text line
    });
  }
  return worker;
}

/**
 * 이미지 데이터에서 카드 번호 인식
 * @param {HTMLCanvasElement} canvas - OCR 대상 캔버스
 * @returns {Promise<string>} 인식된 숫자 문자열
 */
export async function recognizeCardNumber(canvas) {
  const w = await getWorker();
  const { data } = await w.recognize(canvas);
  // 숫자만 추출
  return data.text.replace(/\D/g, "");
}

/**
 * Worker 정리
 */
export async function terminateOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
