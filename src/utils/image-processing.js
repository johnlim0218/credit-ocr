/**
 * OpenCV.js 기반 영상 처리 파이프라인
 * 신용카드 영역 검출 및 ROI 추출
 */

// ID-1 카드 규격 비율 (가로/세로)
const CARD_ASPECT_RATIO = 85.6 / 53.98; // ≈ 1.586
const ASPECT_TOLERANCE = 0.3;

/**
 * 비디오 프레임에서 카드 영역을 검출하고 ROI를 추출
 * @param {cv} cv - OpenCV 인스턴스
 * @param {HTMLVideoElement} video - 비디오 요소
 * @param {HTMLCanvasElement} outputCanvas - 결과를 그릴 캔버스
 * @returns {HTMLCanvasElement|null} 추출된 카드 ROI 캔버스 또는 null
 */
export function processFrame(cv, video, outputCanvas) {
  const src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
  const cap = new cv.VideoCapture(video);
  cap.read(src);

  let roiCanvas = null;

  try {
    // 1. Grayscale 변환
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 2. Gaussian Blur — 노이즈 제거
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // 3. Adaptive Thresholding — 주변 밝기 적응형 이진화
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

    // 4. Morphology — MORPH_CLOSE (끊어진 선 연결) → MORPH_OPEN (노이즈 제거)
    const morphed = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernel);
    kernel.delete();

    // 5. Canny Edge Detection
    const edges = new cv.Mat();
    cv.Canny(morphed, edges, 50, 150);

    // 약간의 dilation으로 끊어진 엣지 연결
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

    // 면적 기준 최소 크기 (프레임의 10% 이상)
    const minArea = src.rows * src.cols * 0.1;
    let bestContour = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < minArea) continue;

      // 다각형 근사
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      if (approx.rows === 4) {
        // ID-1 비율 체크
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

    // 카드 검출 성공 → perspective transform으로 ROI 추출
    if (bestContour) {
      roiCanvas = extractCardROI(cv, src, bestContour);
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
  // 4개 꼭짓점 정렬
  const points = [];
  for (let i = 0; i < 4; i++) {
    points.push({
      x: contour.data32S[i * 2],
      y: contour.data32S[i * 2 + 1],
    });
  }

  // 좌상, 우상, 우하, 좌하 순서로 정렬
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

  // 카드 ROI를 캔버스로 변환
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
  // x+y가 가장 작은 = 좌상, 가장 큰 = 우하
  // x-y가 가장 큰 = 우상, 가장 작은 = 좌하
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
 * 가이드라인 ROI 영역에서 직접 이미지를 추출 (카드 윤곽 검출 실패 시 대체)
 * @param {cv} cv - OpenCV 인스턴스
 * @param {HTMLVideoElement} video - 비디오 요소
 * @param {Object} roi - { x, y, width, height } 가이드라인 좌표
 * @returns {HTMLCanvasElement} ROI 캔버스
 */
export function extractGuidelineROI(cv, video, roi) {
  const src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
  const cap = new cv.VideoCapture(video);
  cap.read(src);

  // ROI 비율을 비디오 해상도에 매핑
  const scaleX = video.videoWidth / video.clientWidth;
  const scaleY = video.videoHeight / video.clientHeight;

  const x = Math.round(roi.x * scaleX);
  const y = Math.round(roi.y * scaleY);
  const w = Math.round(roi.width * scaleX);
  const h = Math.round(roi.height * scaleY);

  // 안전 범위 클램핑
  const safeX = Math.max(0, Math.min(x, src.cols - 1));
  const safeY = Math.max(0, Math.min(y, src.rows - 1));
  const safeW = Math.min(w, src.cols - safeX);
  const safeH = Math.min(h, src.rows - safeY);

  const rect = new cv.Rect(safeX, safeY, safeW, safeH);
  const cropped = src.roi(rect);

  // 전처리: grayscale → contrast enhancement → threshold
  const gray = new cv.Mat();
  cv.cvtColor(cropped, gray, cv.COLOR_RGBA2GRAY);

  const enhanced = new cv.Mat();
  cv.equalizeHist(gray, enhanced);

  const blurred = new cv.Mat();
  cv.GaussianBlur(enhanced, blurred, new cv.Size(3, 3), 0);

  const thresh = new cv.Mat();
  cv.adaptiveThreshold(
    blurred,
    thresh,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY,
    15,
    4,
  );

  // 모폴로지 정리
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
  cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
  kernel.delete();

  const canvas = document.createElement("canvas");
  canvas.width = safeW;
  canvas.height = safeH;
  cv.imshow(canvas, thresh);

  // cleanup
  src.delete();
  cropped.delete();
  gray.delete();
  enhanced.delete();
  blurred.delete();
  thresh.delete();

  return canvas;
}
