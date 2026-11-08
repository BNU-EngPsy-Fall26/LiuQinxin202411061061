export function DreamBackground({ quiet = false }: { quiet?: boolean }) {
  return (
    <div
      className={`dream-background${quiet ? ' dream-background--quiet' : ''}`}
      aria-hidden="true"
    >
      {!quiet && (
        <>
          <div className="aurora aurora--one" />
          <div className="aurora aurora--two" />
          <div className="aurora aurora--three" />
          <div className="orbit-line" />
          <div className="orbit-line orbit-line--two" />
          <div className="grain-layer" />
        </>
      )}
    </div>
  );
}

export function DreamOrb() {
  return (
    <div className="dream-orb" aria-hidden="true">
      <div className="dream-orb__ring dream-orb__ring--one" />
      <div className="dream-orb__ring dream-orb__ring--two" />
      <div className="dream-orb__ring dream-orb__ring--three" />
      <div className="dream-orb__core" />
      <span className="orb-satellite orb-satellite--one" />
      <span className="orb-satellite orb-satellite--two" />
      <div className="orb-label orb-label--attention">
        <strong>Attention</strong>
        <span>看见 · 寻找</span>
      </div>
      <div className="orb-label orb-label--perception">
        <strong>Perception</strong>
        <span>比较 · 衡量</span>
      </div>
      <div className="orb-label orb-label--space">
        <strong>Spatial Cognition</strong>
        <span>定向 · 旋转</span>
      </div>
    </div>
  );
}
