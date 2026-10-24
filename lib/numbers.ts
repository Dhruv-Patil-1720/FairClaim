const DEVANAGARI_ZERO = "०".charCodeAt(0);

function englishDigits(text: string): string {
  return text.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - DEVANAGARI_ZERO));
}

export function numbersIn(text: string): number[] {
  const matches = englishDigits(text).match(/\d+(?:,\d+)*/g) ?? [];
  const found: number[] = [];
  for (const match of matches) {
    const value = Number(match.replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 100) found.push(value);
  }
  return found;
}

export function inventedNumbers(text: string, allowed: number[]): number[] {
  const ok = new Set(allowed);
  return numbersIn(text).filter((value) => !ok.has(value));
}
