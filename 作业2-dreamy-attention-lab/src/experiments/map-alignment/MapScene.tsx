import { useId } from 'react';
import {
  CAMPUS_BUILDINGS,
  MAP_CENTER,
  rotatePoint,
  type CampusBuilding,
  type MapTrialSpec,
} from './generator';

const TREE_TONES = ['#9CC4AB', '#86B39A', '#B3D2BC', '#78A88F'];
const BUILDING_TONES = [
  { fill: '#AFC8E6', edge: '#7F9FC4', roof: '#C9DBEF', window: '#F4FAFF' },
  { fill: '#C9BDE5', edge: '#9A88C0', roof: '#DDD3EF', window: '#FBF8FF' },
  { fill: '#F0C7B0', edge: '#C49376', roof: '#F7DDCE', window: '#FFF9F4' },
  { fill: '#B8DCCB', edge: '#79A891', roof: '#D3EBDF', window: '#F5FFF9' },
];

const TREES: Array<{ x: number; y: number; r: number; tone: number }> = [
  { x: 343, y: 115, r: 8, tone: 0 },
  { x: 372, y: 138, r: 6, tone: 2 },
  { x: 228, y: 126, r: 7, tone: 1 },
  { x: 198, y: 153, r: 5.5, tone: 3 },
  { x: 142, y: 214, r: 7, tone: 2 },
  { x: 123, y: 247, r: 5, tone: 0 },
  { x: 397, y: 335, r: 7.5, tone: 1 },
  { x: 425, y: 363, r: 5.5, tone: 0 },
  { x: 190, y: 348, r: 6.5, tone: 2 },
  { x: 221, y: 382, r: 5, tone: 3 },
  { x: 344, y: 423, r: 7, tone: 0 },
  { x: 369, y: 396, r: 5.5, tone: 1 },
  { x: 330, y: 255, r: 4.5, tone: 3 },
  { x: 216, y: 300, r: 4.5, tone: 1 },
];

export function MapScene({
  spec,
  cueSizePx = 38,
}: {
  spec: MapTrialSpec;
  cueSizePx?: number;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `map-clip-${uid}`;
  const groundId = `map-ground-${uid}`;
  const shadowId = `map-shadow-${uid}`;
  const cueScale = cueSizePx / 38;
  const rotation = spec.rotationDeg;
  const target = CAMPUS_BUILDINGS.find(
    (building) => building.id === spec.targetBuilding,
  );

  return (
    <svg
      className="map-svg"
      viewBox="0 0 560 560"
      role="img"
      aria-label={`校园地图方向固定，你正面朝${spec.facingBuildingZh}，目标建筑为${spec.targetBuildingZh}`}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={MAP_CENTER} cy={MAP_CENTER} r={250} />
        </clipPath>
        <radialGradient id={groundId} cx="48%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#F8FCF7" />
          <stop offset="62%" stopColor="#EEF6EE" />
          <stop offset="100%" stopColor="#E4F0E6" />
        </radialGradient>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="5"
            stdDeviation="6"
            floodColor="#4A5F50"
            floodOpacity="0.16"
          />
        </filter>
      </defs>

      <circle cx={MAP_CENTER} cy={MAP_CENTER} r={258} fill="#EAF3EC" />
      <circle
        cx={MAP_CENTER}
        cy={MAP_CENTER}
        r={252}
        fill={`url(#${groundId})`}
        stroke="rgba(83, 121, 96, 0.20)"
        strokeWidth="1.5"
      />

      <g clipPath={`url(#${clipId})`}>
        <g transform={`rotate(${rotation} ${MAP_CENTER} ${MAP_CENTER})`}>
          <CampusGround />
          <g filter={`url(#${shadowId})`}>
            {CAMPUS_BUILDINGS.map((building) => (
              <CampusBuildingShape
                key={building.id}
                building={building}
                targeted={building.id === spec.targetBuilding}
              />
            ))}
          </g>
        </g>

        {target && (
          <TargetRing spec={spec} building={target} />
        )}

        {CAMPUS_BUILDINGS.map((building) => (
          <BuildingLabel
            key={building.id}
            spec={spec}
            building={building}
            targeted={building.id === spec.targetBuilding}
          />
        ))}

        <CenterMarker
          cue={spec.cue}
          cueScale={cueScale}
          headingDeg={spec.personScreenHeadingDeg}
        />
      </g>

      <circle
        cx={MAP_CENTER}
        cy={MAP_CENTER}
        r={250}
        fill="none"
        stroke="rgba(70, 105, 83, 0.17)"
        strokeWidth="1"
      />
      <Compass northScreenDeg={spec.compassNorthScreenDeg} />
    </svg>
  );
}

function CampusGround() {
  return (
    <>
      <path
        d="M280 280 L280 118 M280 280 L442 280 M280 280 L280 442 M280 280 L118 280"
        stroke="#F8F2E7"
        strokeWidth="24"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M280 280 L280 118 M280 280 L442 280 M280 280 L280 442 M280 280 L118 280"
        stroke="#E6D8C4"
        strokeWidth="1.2"
        strokeDasharray="4 8"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle
        cx={MAP_CENTER}
        cy={MAP_CENTER}
        r={92}
        fill="none"
        stroke="#F7F1E5"
        strokeWidth="10"
        opacity="0.8"
      />
      <circle
        cx={MAP_CENTER}
        cy={MAP_CENTER}
        r={39}
        fill="#FBF7EE"
        stroke="rgba(120, 148, 128, 0.24)"
        strokeWidth="1.2"
      />
      <ellipse
        cx="356"
        cy="197"
        rx="31"
        ry="22"
        transform="rotate(-18 356 197)"
        fill="#CFE6EF"
        stroke="#A9CEDC"
        strokeWidth="1.2"
      />
      <ellipse
        cx="350"
        cy="193"
        rx="9"
        ry="5"
        transform="rotate(-18 350 193)"
        fill="#E7F3E9"
        opacity="0.9"
      />
      <path
        d="M85 335 Q 155 300 205 346"
        fill="none"
        stroke="#DDEBDF"
        strokeWidth="9"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M346 433 Q 405 407 465 430"
        fill="none"
        stroke="#DDEBDF"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.75"
      />
      {TREES.map((tree, index) => (
        <g key={`tree-${index}`} transform={`translate(${tree.x} ${tree.y})`}>
          <circle cx="1.5" cy="2.5" r={tree.r} fill="#7E9D87" opacity="0.15" />
          <circle
            r={tree.r}
            fill={TREE_TONES[tree.tone % TREE_TONES.length]}
            stroke="rgba(77, 116, 91, 0.16)"
            strokeWidth="0.8"
          />
          <circle
            cx={-tree.r * 0.22}
            cy={-tree.r * 0.22}
            r={tree.r * 0.46}
            fill="#FFFFFF"
            opacity="0.2"
          />
        </g>
      ))}
    </>
  );
}

function CampusBuildingShape({
  building,
  targeted,
}: {
  building: CampusBuilding;
  targeted: boolean;
}) {
  const tone = BUILDING_TONES[building.tone % BUILDING_TONES.length];
  const x = building.x - building.width / 2;
  const y = building.y - building.height / 2;
  const rows = 3;
  const columns = 4;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={building.width}
        height={building.height}
        rx={10}
        fill={tone.fill}
        stroke={targeted ? '#D9A441' : tone.edge}
        strokeWidth={targeted ? 2.4 : 1.2}
      />
      <rect
        x={x + 5}
        y={y + 5}
        width={building.width - 10}
        height={Math.max(7, building.height * 0.26)}
        rx={5}
        fill={tone.roof}
        opacity="0.82"
      />
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((__, column) => (
          <rect
            key={`window-${row}-${column}`}
            x={
              x +
              9 +
              column * ((building.width - 18) / columns)
            }
            y={y + 15 + row * ((building.height - 23) / rows)}
            width={(building.width - 24) / columns}
            height={(building.height - 28) / rows}
            rx={2.2}
            fill={tone.window}
            opacity={0.78}
          />
        )),
      )}
    </g>
  );
}

function TargetRing({
  spec,
  building,
}: {
  spec: MapTrialSpec;
  building: CampusBuilding;
}) {
  const screen = rotatePoint(spec.targetLocalX, spec.targetLocalY, spec.rotationDeg);
  const swap = spec.rotationDeg % 180 !== 0;
  const visibleWidth = swap ? building.height : building.width;
  const visibleHeight = swap ? building.width : building.height;
  return (
    <g pointerEvents="none">
      <rect
        x={screen.x - visibleWidth / 2 - 8}
        y={screen.y - visibleHeight / 2 - 8}
        width={visibleWidth + 16}
        height={visibleHeight + 16}
        rx={17}
        fill="rgba(232, 185, 92, 0.12)"
        stroke="#D9A441"
        strokeWidth="2.2"
        strokeDasharray="6 5"
      />
      <circle
        cx={screen.x}
        cy={screen.y}
        r={Math.max(visibleWidth, visibleHeight) / 2 + 15}
        fill="none"
        stroke="rgba(217, 164, 65, 0.32)"
        strokeWidth="5"
      />
    </g>
  );
}

function BuildingLabel({
  spec,
  building,
  targeted,
}: {
  spec: MapTrialSpec;
  building: CampusBuilding;
  targeted: boolean;
}) {
  const screen = rotatePoint(building.x, building.y, spec.rotationDeg);
  const dx = screen.x - MAP_CENTER;
  const dy = screen.y - MAP_CENTER;
  const length = Math.max(1, Math.hypot(dx, dy));
  const swap = spec.rotationDeg % 180 !== 0;
  const visibleWidth = swap ? building.height : building.width;
  const visibleHeight = swap ? building.width : building.height;
  const offset =
    Math.max(visibleWidth, visibleHeight) / 2 + (targeted ? 22 : 18);
  const labelX = screen.x + (dx / length) * offset;
  const labelY = screen.y + (dy / length) * offset;
  const text = targeted ? `目标 · ${building.zh}` : building.zh;
  const width = targeted ? text.length * 12 + 18 : 68;

  return (
    <g
      transform={`translate(${labelX} ${labelY})`}
      pointerEvents="none"
    >
      <rect
        x={-width / 2}
        y={-10.5}
        width={width}
        height={21}
        rx={10.5}
        fill={targeted ? 'rgba(255, 248, 230, 0.96)' : 'rgba(255, 255, 255, 0.88)'}
        stroke={targeted ? '#D9A441' : 'rgba(87, 117, 97, 0.18)'}
        strokeWidth={targeted ? 1.5 : 1}
      />
      <text
        x={0}
        y={0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={targeted ? 11.5 : 12}
        fontWeight={targeted ? 700 : 600}
        fill={targeted ? '#8B641F' : '#52695B'}
        letterSpacing="0.02em"
      >
        {text}
      </text>
    </g>
  );
}

function CenterMarker({
  cue,
  cueScale,
  headingDeg,
}: {
  cue: MapTrialSpec['cue'];
  cueScale: number;
  headingDeg: number;
}) {
  return (
    <g transform={`translate(${MAP_CENTER} ${MAP_CENTER})`} pointerEvents="none">
      <circle r="29" fill="rgba(255, 255, 255, 0.72)" />
      <circle
        r="25"
        fill="none"
        stroke={cue === 'person' ? 'rgba(97, 132, 112, 0.34)' : 'rgba(190, 98, 92, 0.26)'}
        strokeWidth="1.4"
      />
      {cue === 'none' ? (
        <>
          <circle r="10" fill="rgba(198, 92, 86, 0.16)" />
          <circle r="5.4" fill="#C65C56" stroke="#FFFFFF" strokeWidth="2.2" />
          <circle r="1.7" fill="#FFFFFF" />
        </>
      ) : (
        <g transform={`rotate(${headingDeg}) scale(${cueScale})`}>
          <ellipse cx="0" cy="16" rx="16" ry="6" fill="rgba(54, 78, 64, 0.16)" />
          <path
            d="M-11 9 Q-11 0 0 0 Q11 0 11 9 L11 18 Q11 23 6 23 L-6 23 Q-11 23 -11 18 Z"
            fill="#7FA68E"
            stroke="#FFFFFF"
            strokeWidth="2.2"
          />
          <path
            d="M-7 8 Q0 3 7 8"
            fill="none"
            stroke="#5F816C"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.55"
          />
          <circle
            cx="0"
            cy="-7"
            r="7.2"
            fill="#F0D3BD"
            stroke="#FFFFFF"
            strokeWidth="2.2"
          />
          <path
            d="M-6 -8 Q-4 -14 2 -14 Q7 -14 7 -8 Q4 -11 1 -11 Q-3 -11 -6 -8 Z"
            fill="#655A50"
          />
          <path
            d="M0 -21 L3.4 -16 L0 -17.4 L-3.4 -16 Z"
            fill="#6F947E"
            opacity="0.55"
          />
        </g>
      )}
    </g>
  );
}

function Compass({ northScreenDeg }: { northScreenDeg: number }) {
  const cx = 488;
  const cy = 72;
  const radians = (northScreenDeg * Math.PI) / 180;
  const tipX = cx + Math.sin(radians) * 22;
  const tipY = cy - Math.cos(radians) * 22;
  return (
    <g aria-hidden="true">
      <circle
        cx={cx}
        cy={cy}
        r="32"
        fill="rgba(255, 255, 255, 0.9)"
        stroke="rgba(91, 119, 100, 0.22)"
        strokeWidth="1.2"
      />
      <g transform={`rotate(${northScreenDeg} ${cx} ${cy})`}>
        <path
          d={`M${cx} ${cy - 18} L${cx + 6} ${cy + 2} L${cx} ${cy - 2} L${cx - 6} ${cy + 2} Z`}
          fill="#C97B6D"
        />
        <path
          d={`M${cx} ${cy + 18} L${cx + 6} ${cy + 2} L${cx} ${cy + 4} L${cx - 6} ${cy + 2} Z`}
          fill="#AEBBAF"
        />
        <circle cx={cx} cy={cy} r="2.6" fill="#FFFFFF" />
      </g>
      <text
        x={tipX}
        y={tipY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="#A8675B"
      >
        北
      </text>
    </g>
  );
}
