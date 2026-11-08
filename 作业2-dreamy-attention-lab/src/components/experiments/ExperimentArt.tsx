import type { ExperimentId } from '@shared/types';

const vsLetters = [
  ['O', 16, 24, 13, '#2a6fdb'],
  ['X', 33, 14, 11, '#2a6fdb'],
  ['O', 52, 20, 12, '#2a6fdb'],
  ['X', 78, 15, 10, '#2a6fdb'],
  ['O', 88, 35, 12, '#2a6fdb'],
  ['X', 9, 49, 11, '#2a6fdb'],
  ['O', 24, 44, 10, '#2a6fdb'],
  ['X', 44, 38, 13, '#2a6fdb'],
  ['O', 68, 34, 11, '#2a6fdb'],
  ['X', 82, 57, 13, '#2a6fdb'],
  ['O', 17, 68, 12, '#2a6fdb'],
  ['X', 35, 77, 11, '#2a6fdb'],
  ['O', 54, 66, 10, '#2a6fdb'],
  ['X', 71, 79, 12, '#2a6fdb'],
  ['O', 91, 74, 11, '#2a6fdb'],
  ['X', 8, 86, 10, '#2a6fdb'],
  ['O', 46, 90, 12, '#2a6fdb'],
] as const;

function VisualSearchArt() {
  return (
    <div className="art-frame" aria-hidden="true">
      <span className="vs-art-orbit" />
      <span className="vs-art-orbit" style={{ width: 94, height: 94, opacity: 0.7 }} />
      <span className="vs-art-sweep" />
      {vsLetters.map(([letter, left, top, size, color], index) => (
        <span
          key={`${left}-${top}-${index}`}
          className="vs-art-letter"
          style={{ left: `${left}%`, top: `${top}%`, fontSize: size, color }}
        >
          {letter}
        </span>
      ))}
      <span
        className="vs-art-letter is-target"
        style={{ left: '61%', top: '51%', fontSize: 17, color: '#e0352b' }}
      >
        O
      </span>
      <span
        style={{
          position: 'absolute',
          left: '58%',
          top: '48%',
          width: 42,
          height: 42,
          border: '1px solid rgba(185,74,78,.22)',
          borderRadius: '50%',
          transform: 'translate(-50%,-50%)',
        }}
      />
    </div>
  );
}

function OrderingArt() {
  const sizes = [
    { w: 30, h: 25 },
    { w: 41, h: 33 },
    { w: 53, h: 41 },
    { w: 67, h: 49 },
    { w: 82, h: 59 },
  ];
  return (
    <div className="ordering-art" aria-hidden="true">
      {sizes.map((size, index) => (
        <span
          key={size.w}
          className="ordering-rect"
          style={{
            width: size.w,
            height: size.h,
            opacity: 0.62 + index * 0.075,
            transform: `rotate(${(index - 2) * 0.7}deg)`,
          }}
        />
      ))}
      <span
        style={{
          position: 'absolute',
          bottom: 6,
          fontSize: 8,
          letterSpacing: '0.18em',
          color: 'rgba(102,117,141,.5)',
          textTransform: 'uppercase',
        }}
      >
        small — large
      </span>
    </div>
  );
}

function MapArt() {
  return (
    <div className="map-art" aria-hidden="true">
      <span
        className="map-art-road"
        style={{ left: '45%', top: '-5%', width: '12%', height: '110%', transform: 'rotate(12deg)' }}
      />
      <span
        className="map-art-road"
        style={{ left: '-8%', top: '43%', width: '120%', height: '11%', transform: 'rotate(-8deg)' }}
      />
      <span
        className="map-art-road"
        style={{ left: '12%', top: '72%', width: '70%', height: '6%', transform: 'rotate(32deg)' }}
      />
      <span className="map-art-building" style={{ left: '18%', top: '18%', width: 32, height: 24 }} />
      <span className="map-art-building" style={{ left: '60%', top: '16%', width: 24, height: 30 }} />
      <span className="map-art-building" style={{ left: '59%', top: '60%', width: 34, height: 25 }} />
      <span className="map-art-building" style={{ left: '21%', top: '61%', width: 19, height: 18 }} />
      <span
        style={{
          position: 'absolute',
          left: '47%',
          top: '49%',
          width: 21,
          height: 21,
          borderRadius: '50%',
          background: 'rgba(255,255,255,.9)',
          border: '1px solid rgba(87,125,100,.5)',
          boxShadow: '0 5px 12px -6px rgba(54,94,68,.5)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: '47%',
          top: '49%',
          width: 13,
          height: 4,
          borderRadius: 2,
          background: '#5f8770',
          transformOrigin: 'left center',
          transform: 'rotate(-28deg) translate(2px,-2px)',
        }}
      />
      <span className="map-art-compass">N ↑</span>
    </div>
  );
}

export function ExperimentArt({ id }: { id: ExperimentId }) {
  if (id === 'visual-search') return <VisualSearchArt />;
  if (id === 'perceptual-ordering') return <OrderingArt />;
  return <MapArt />;
}
