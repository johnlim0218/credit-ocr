/**
 * Luhn 알고리즘 검증 및 카드 번호 포맷팅
 */

/**
 * Luhn 알고리즘으로 카드 번호 유효성 검증
 * @param {string} number - 숫자만 포함된 카드 번호 문자열
 * @returns {boolean}
 */
export function validateLuhn(number) {
  const digits = number.replace(/\D/g, "");

  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * 카드 번호를 4자리씩 그룹핑하여 표시
 * @param {string} number
 * @returns {string}
 */
export function formatCardNumber(number) {
  const digits = number.replace(/\D/g, "");
  return digits.match(/.{1,4}/g)?.join(" ") || digits;
}
