export function TrackField() {
  return (
    <div className="track-field" aria-hidden="true">
      <svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice">
        <rect width="640" height="420" fill="#172016" />
        <g fill="none" stroke="#3d5a32" strokeWidth="1">
          <ellipse cx="320" cy="220" rx="280" ry="170" />
          <ellipse cx="320" cy="220" rx="210" ry="128" />
          <ellipse cx="320" cy="220" rx="140" ry="84" />
          <ellipse cx="320" cy="220" rx="70" ry="42" />
        </g>
        <path
          d="M72 310 C 140 290, 160 240, 210 228 S 300 250, 330 190 S 390 90, 470 120 S 540 210, 580 168"
          fill="none"
          stroke="#c4dc62"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="580" cy="168" r="7" fill="#c4dc62" />
        <circle cx="580" cy="168" r="16" fill="none" stroke="#c4dc62" strokeOpacity="0.45" />
        <circle cx="72" cy="310" r="4" fill="#9ad0b0" />
      </svg>
      <div className="track-meta">
        28.6139 N 77.2090 E
        <br />
        queued until 2xx
      </div>
    </div>
  );
}
