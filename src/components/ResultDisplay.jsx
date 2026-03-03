/**
 * ResultDisplay — 인식 결과 및 액션 버튼 영역
 */
import { Copy, Check, RotateCcw, CreditCard, Loader2 } from "lucide-react";

export default function ResultDisplay({
  scanning,
  recognizedText,
  confirmedNumber,
  copied,
  onReset,
  onCopy,
}) {
  return (
    <div className="result-container">
      {/* 실시간 인식 텍스트 */}
      <div className="result-section">
        <div className="result-label">
          {scanning ? (
            <>
              <Loader2 size={16} className="spin-icon" />
              <span>인식 중...</span>
            </>
          ) : confirmedNumber ? (
            <>
              <CreditCard size={16} />
              <span>카드 번호 확인 완료</span>
            </>
          ) : (
            <>
              <CreditCard size={16} />
              <span>카드 번호 대기 중</span>
            </>
          )}
        </div>

        {scanning && recognizedText && (
          <div className="recognized-text">
            <span className="text-label">감지된 숫자</span>
            <span className="text-value">{recognizedText}</span>
          </div>
        )}
      </div>

      {/* 확정된 카드 번호 */}
      {confirmedNumber && (
        <div className="confirmed-number-card">
          <div className="card-chip"></div>
          <div className="card-number">{confirmedNumber}</div>
          <div className="card-badge">✓ Luhn 검증 완료</div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="action-buttons">
        <button className="action-btn reset-btn" onClick={onReset}>
          <RotateCcw size={18} />
          <span>다시 촬영</span>
        </button>

        <button
          className="action-btn copy-btn"
          onClick={onCopy}
          disabled={!confirmedNumber}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          <span>{copied ? "복사됨!" : "복사하기"}</span>
        </button>
      </div>
    </div>
  );
}
