type SentimentRingProps = {
  supportPct: number;
  size?: number;
  strokeWidth?: number;
  empty?: boolean;
  className?: string;
};

const SUPPORT_COLOR = "var(--stance-supports-text)";
const OPPOSE_COLOR = "var(--stance-refutes-text)";
const EMPTY_COLOR = "var(--border-default)";

export function SentimentRing({
  supportPct,
  size = 24,
  strokeWidth = 3,
  empty = false,
  className,
}: SentimentRingProps) {
  const clamped = Math.min(100, Math.max(0, supportPct));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const center = size / 2;

  if (empty) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={className}
        aria-label="No votes yet"
      >
        <title>No votes yet</title>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={EMPTY_COLOR}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  const supportLen = (clamped / 100) * circumference;
  const opposeLen = circumference - supportLen;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label={`${Math.round(clamped)}% support`}
    >
      <title>{Math.round(clamped)}% support</title>
      {/* Support arc (starts at 12 o'clock) */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={SUPPORT_COLOR}
        strokeWidth={strokeWidth}
        strokeDasharray={`${supportLen} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* Oppose arc (continues after support) */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={OPPOSE_COLOR}
        strokeWidth={strokeWidth}
        strokeDasharray={`${opposeLen} ${circumference}`}
        strokeDashoffset={-supportLen}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
