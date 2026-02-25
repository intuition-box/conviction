export type SliderDirection = "support" | "oppose" | "neutral";

export function deriveDirection(value: number): SliderDirection {
  if (value < 0) return "support";
  if (value > 0) return "oppose";
  return "neutral";
}

export function deriveAmount(value: number): number {
  return Math.abs(value);
}

export function clampToStep(value: number, max = 10): number {
  return Math.round(Math.max(-max, Math.min(max, value)));
}

export function isNeutral(value: number): boolean {
  return value === 0;
}

export function formatCTA(value: number, symbol: string): string {
  const dir = deriveDirection(value);
  if (dir === "neutral") return "Where's your trust?";
  const amt = deriveAmount(value);
  return `Confirm (${amt} ⚡️${symbol})`;
}

export function formatAriaValueText(value: number): string {
  const dir = deriveDirection(value);
  if (dir === "neutral") return "Where's your trust?";
  const amt = deriveAmount(value);
  return dir === "support" ? `Support ${amt}` : `Oppose ${amt}`;
}
