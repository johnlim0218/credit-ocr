/**
 * OpenCV.js 기반 영상 처리 파이프라인
 * 신용카드 영역 검출 및 ROI 추출
 */

// ID-1 카드 규격 비율 (가로/세로)
const CARD_ASPECT_RATIO = 85.6 / 53.98; // ≈ 1.586
const ASPECT_TOLERANCE = 0.3;

// 카드 번호 영역 (카드 높이 기준 비율)
const NUMBER_REGION_TOP = 0.28;
const NUMBER_REGION_BOTTOM = 0.75;

// OCR 최적 높이 (Tesseract는 글자 높이가 충분해야 인식률이 높음)
const OCR_TARGET_HEIGHT = 80;

/**
 * video 또는 canvas에서 프레임을 Mat으로 변환
 */
function captureFrame(cv, source) {
  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext("2d", { willReadFrequently: true });
    return cv.matFromImageData(
      ctx.getImageData(0, 0, source.width, source.height),
    );
  }
  const w = source.videoWidth;
  const h = source.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return cv.matFromImageData(ctx.getImageData(0, 0, w, h));
}

/**
 * OCR에 최적화된 전처리: grayscale → 리사이즈 → OTSU 이진화
 */
function preprocessForOCR(cv, src) {
  // 1. Grayscale
  const gray = new cv.Mat();
  if (src.channels() === 4) {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  } else if (src.channels() === 3) {
    cv.cvtColor(src, gray, cv.COLOR_RGB2GRAY);
  } else {
    src.copyTo(gray);
  }

  // 2. 리사이즈: Tesseract는 글자 높이 ~40-80px에서 최적 인식
  const scale = OCR_TARGET_HEIGHT / gray.rows;
  const resized = new cv.Mat();
  if (scale > 1) {
    cv.resize(gray, resized, new cv.Size(0, 0), scale, scale, cv.INTER_CUBIC);
  } else {
    gray.copyTo(resized);
  }

  // 3. 대비 강화
  const enhanced = new cv.Mat();
  cv.equalizeHist(resized, enhanced);

  // 4. 가우시안 블러로 노이즈 제거
  const blurred = new cv.Mat();
  cv.GaussianBlur(enhanced, blurred, new cv.Size(3, 3), 0);

  // 5. OTSU 이진화 (자동 임계값)
  const binary = new cv.Mat();
  cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

  // 6. 모폴로지: 작은 노이즈 제거
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
  cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);
  kernel.delete();

  // canvas로 출력
  const canvas = document.createElement("canvas");
  canvas.width = binary.cols;
  canvas.height = binary.rows;
  cv.imshow(canvas, binary);

  gray.delete();
  resized.delete();
  enhanced.delete();
  blurred.delete();
  binary.delete();

  return canvas;
}

/**
 * 프레임에서 카드 영역을 검출하고 번호 영역 ROI를 추출
 * @param {cv} cv - OpenCV 인스턴스
 * @param {HTMLVideoElement|HTMLCanvasElement} source - 비디오 또는 캔버스
 * @returns {HTMLCanvasElement|null} 추출된 카드 번호 영역 캔버스 또는 null
 */
export function processFrame(cv, source) {
  const src = captureFrame(cv, source);
  let roiCanvas = null;

  try {
    // 1. Grayscale 변환
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 2. Gaussian Blur — 노이즈 제거
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // 3. Adaptive Thresholding
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      11,
      2,
    );

    // 4. Morphology
    const morphed = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernel);
    kernel.delete();

    // 5. Canny Edge Detection
    const edges = new cv.Mat();
    cv.Canny(morphed, edges, 50, 150);

    const dilateKernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(3, 3),
    );
    cv.dilate(edges, edges, dilateKernel);
    dilateKernel.delete();

    // 6. findContours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const minArea = src.rows * src.cols * 0.1;
    let bestContour = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < minArea) continue;

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      if (approx.rows === 4) {
        const rect = cv.boundingRect(approx);
        const aspectRatio = rect.width / rect.height;

        if (
          Math.abs(aspectRatio - CARD_ASPECT_RATIO) < ASPECT_TOLERANCE &&
          area > bestArea
        ) {
          bestContour = approx.clone();
          bestArea = area;
        }
      }
      approx.delete();
    }

    // 카드 검출 성공 → perspective transform → 번호 영역 추출
    if (bestContour) {
      const cardCanvas = extractCardROI(cv, src, bestContour);
      // 카드 이미지에서 번호 영역만 잘라서 OCR 전처리
      const cardMat = cv.imread(cardCanvas);
      const y1 = Math.round(cardMat.rows * NUMBER_REGION_TOP);
      const y2 = Math.round(cardMat.rows * NUMBER_REGION_BOTTOM);
      const stripRect = new cv.Rect(0, y1, cardMat.cols, y2 - y1);
      const strip = cardMat.roi(stripRect);
      roiCanvas = preprocessForOCR(cv, strip);
      cardMat.delete();
      strip.delete();
      bestContour.delete();
    }

    // cleanup
    gray.delete();
    blurred.delete();
    thresh.delete();
    morphed.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  } catch (e) {
    console.error("Frame processing error:", e);
  } finally {
    src.delete();
  }

  return roiCanvas;
}

/**
 * 검출된 카드 영역에서 perspective transform으로 정면 보정 추출
 */
function extractCardROI(cv, src, contour) {
  const points = [];
  for (let i = 0; i < 4; i++) {
    points.push({
      x: contour.data32S[i * 2],
      y: contour.data32S[i * 2 + 1],
    });
  }

  const sorted = orderPoints(points);

  const outputWidth = 600;
  const outputHeight = Math.round(outputWidth / CARD_ASPECT_RATIO);

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    sorted[0].x,
    sorted[0].y,
    sorted[1].x,
    sorted[1].y,
    sorted[2].x,
    sorted[2].y,
    sorted[3].x,
    sorted[3].y,
  ]);

  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outputWidth,
    0,
    outputWidth,
    outputHeight,
    0,
    outputHeight,
  ]);

  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(outputWidth, outputHeight));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  cv.imshow(canvas, warped);

  srcPts.delete();
  dstPts.delete();
  M.delete();
  warped.delete();

  return canvas;
}

/**
 * 4개 점을 좌상→우상→우하→좌하 순서로 정렬
 */
function orderPoints(pts) {
  const sorted = [...pts];

  const sums = sorted.map((p) => p.x + p.y);
  const diffs = sorted.map((p) => p.x - p.y);

  const topLeft = sorted[sums.indexOf(Math.min(...sums))];
  const bottomRight = sorted[sums.indexOf(Math.max(...sums))];
  const topRight = sorted[diffs.indexOf(Math.max(...diffs))];
  const bottomLeft = sorted[diffs.indexOf(Math.min(...diffs))];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

/**
 * 가이드라인 ROI 영역에서 카드 번호 영역만 추출 (카드 윤곽 검출 실패 시 대체)
 * @param {cv} cv - OpenCV 인스턴스
 * @param {HTMLVideoElement|HTMLCanvasElement} source - 비디오 또는 캔버스
 * @param {Object} roi - { x, y, width, height } 가이드라인 좌표
 * @param {Object} [dimensions] - canvas 입력 시 { clientWidth, clientHeight }
 * @returns {HTMLCanvasElement|null} OCR에 최적화된 번호 영역 캔버스
 */
export function extractGuidelineROI(cv, source, roi, dimensions = null) {
  const src = captureFrame(cv, source);

  // ROI 비율을 소스 해상도에 매핑
  const sourceW =
    source instanceof HTMLCanvasElement ? source.width : source.videoWidth;
  const sourceH =
    source instanceof HTMLCanvasElement ? source.height : source.videoHeight;
  const displayW = dimensions?.clientWidth || source.clientWidth;
  const displayH = dimensions?.clientHeight || source.clientHeight;

  const scaleX = sourceW / displayW;
  const scaleY = sourceH / displayH;

  const x = Math.round(roi.x * scaleX);
  const y = Math.round(roi.y * scaleY);
  const w = Math.round(roi.width * scaleX);
  const h = Math.round(roi.height * scaleY);

  // 카드 전체 영역에서 번호 영역(중앙 수평 스트립)만 추출
  const numberY = Math.round(y + h * NUMBER_REGION_TOP);
  const numberH = Math.round(h * (NUMBER_REGION_BOTTOM - NUMBER_REGION_TOP));

  // 안전 범위 클램핑
  const safeX = Math.max(0, Math.min(x, src.cols - 1));
  const safeY = Math.max(0, Math.min(numberY, src.rows - 1));
  const safeW = Math.min(w, src.cols - safeX);
  const safeH = Math.min(numberH, src.rows - safeY);

  if (safeW <= 0 || safeH <= 0) {
    src.delete();
    return null;
  }

  const rect = new cv.Rect(safeX, safeY, safeW, safeH);
  const cropped = src.roi(rect);

  const result = preprocessForOCR(cv, cropped);

  src.delete();
  cropped.delete();

  return result;
}
