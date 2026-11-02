const BASE = import.meta.env.BASE_URL;

export function TrackField() {
  return (
    <figure className="hero-visual">
      <img
        src={`${BASE}media/instrument.jpg`}
        srcSet={`${BASE}media/instrument-sm.jpg 1400w, ${BASE}media/instrument.jpg 2400w`}
        sizes="(max-width: 720px) 100vw, min(1180px, 92vw)"
        width={1600}
        height={900}
        alt="Navy location instrument with a champagne gold path across a dark glass panel"
        fetchPriority="high"
      />
    </figure>
  );
}
