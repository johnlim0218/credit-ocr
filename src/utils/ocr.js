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
      tessedit_char_whitelist: "0123456789 ",
      tessedit_pageseg_mode: "6", // Uniform block of text
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

  // 숫자만 추출하고 13자리 이상 연속 숫자열 찾기
  const allDigits = data.text.replace(/\D/g, "");

  // 전체가 13~19자리이면 그대로 반환
  if (allDigits.length >= 13 && allDigits.length <= 19) {
    return allDigits;
  }

  // 텍스트에서 4자리 그룹 패턴 (XXXX XXXX XXXX XXXX) 찾기
  const groups = data.text.match(/\d{4}/g);
  if (groups && groups.length >= 3) {
    const joined = groups.join("");
    if (joined.length >= 13 && joined.length <= 19) {
      return joined;
    }
  }

  return allDigits;
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
