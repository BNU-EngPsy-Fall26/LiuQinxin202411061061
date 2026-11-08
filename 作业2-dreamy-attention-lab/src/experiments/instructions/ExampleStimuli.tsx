import type { ExperimentId } from '@shared/types';
import { MapScene } from '@/experiments/map-alignment/MapScene';
import type { MapTrialSpec } from '@/experiments/map-alignment/generator';

export function InstructionExample({ id }: { id: ExperimentId }) {
  if (id === 'visual-search') return <VisualSearchExample />;
  if (id === 'perceptual-ordering') return <OrderingExample />;
  return <MapExample />;
}

function VisualSearchExample() {
  const letters = [
    { x: 12, y: 22, l: 'O', c: '#2a6fdb', target: false },
    { x: 31, y: 14, l: 'X', c: '#2a6fdb', target: false },
    { x: 51, y: 26, l: 'O', c: '#2a6fdb', target: false },
    { x: 71, y: 16, l: 'X', c: '#2a6fdb', target: false },
    { x: 88, y: 31, l: 'O', c: '#2a6fdb', target: false },
    { x: 18, y: 55, l: 'X', c: '#2a6fdb', target: false },
    { x: 39, y: 46, l: 'O', c: '#2a6fdb', target: false },
    { x: 82, y: 61, l: 'X', c: '#2a6fdb', target: false },
    { x: 10, y: 82, l: 'O', c: '#2a6fdb', target: false },
    { x: 32, y: 76, l: 'X', c: '#2a6fdb', target: false },
    { x: 55, y: 84, l: 'O', c: '#2a6fdb', target: false },
    { x: 73, y: 76, l: 'X', c: '#2a6fdb', target: false },
    { x: 91, y: 87, l: 'O', c: '#2a6fdb', target: false },
    { x: 62, y: 52, l: 'O', c: '#e0352b', target: true },
  ];
  return (
    <div>
      <div
        style={{
          position: 'relative',
          height: 190,
          borderRadius: 12,
          background: '#FFFFFF',
          border: '1px solid var(--line)',
          overflow: 'hidden',
        }}
        aria-label="Block 1 视觉搜索示例：蓝色 O 与蓝色 X 中有一个红色 O 目标"
      >
        {letters.map((item, index) => (
          <span
            key={`${item.x}-${index}`}
            style={{
              position: 'absolute',
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: 'translate(-50%,-50%)',
              color: item.c,
              fontSize: 20,
              fontWeight: 400,
              fontFamily: 'Arial, Helvetica, sans-serif',
              lineHeight: 1,
            }}
          >
            {item.l}
          </span>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 18,
          marginTop: 14,
          color: 'var(--muted)',
          fontSize: 10.5,
        }}
      >
        <span>
          <kbd className="keycap" style={{ marginRight: 6 }}>
            F
          </kbd>
          存在红色 O
        </span>
        <span>
          <kbd className="keycap" style={{ marginRight: 6 }}>
            J
          </kbd>
          不存在红色 O
        </span>
      </div>
      <p
        style={{
          marginTop: 8,
          textAlign: 'center',
          color: 'var(--muted-light)',
          fontSize: 10,
        }}
      >
        Block 1 示例：红色 O 为目标，蓝色 O 与蓝色 X 为干扰项；所有字母同字号、同字重。
      </p>
    </div>
  );
}

function OrderingExample() {
  const rects = [
    { w: 78, h: 49 },
    { w: 44, h: 28 },
    { w: 62, h: 39 },
    { w: 28, h: 18 },
  ];
  return (
    <div style={{ padding: '10px 0 4px' }}>
      <div
        style={{
          minHeight: 134,
          border: '1px dashed rgba(88,107,137,.2)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          flexWrap: 'wrap',
          padding: 18,
        }}
      >
        {rects.map((rect, index) => (
          <span
            key={index}
            style={{
              width: rect.w,
              height: rect.h,
              borderRadius: 5,
              background: '#A8B8D5',
              border: '1px solid #6D7F9E',
              boxShadow: '0 10px 16px -14px rgba(45,58,80,.5)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          color: 'var(--muted-light)',
          fontSize: 9,
          letterSpacing: '.13em',
          textTransform: 'uppercase',
        }}
      >
        <span>随意排列</span>
        <span>目标：小 → 大</span>
      </div>
    </div>
  );
}

const MAP_EXAMPLE: MapTrialSpec = {
  id: 'example-person-cue-heading90',
  blockId: 'ma_person_cue',
  blockType: 'extension_block',
  blockPresentationOrder: 2,
  variant: 'person_cue',
  phase: 'practice',
  alignment: 'misaligned',
  cue: 'person',
  conditionId: 'person_cue_heading90',
  heading: 'building',
  headingDeg: 90,
  headingZh: '面朝食堂',
  facingBuilding: 'cafeteria',
  facingBuildingZh: '食堂',
  facingBuildingWorldBearingDeg: 90,
  facingBuildingScreenBearingDeg: 90,
  rotationDeg: 0,
  mapRotationDeg: 0,
  compassNorthScreenDeg: 0,
  personScreenHeadingDeg: 90,
  targetBuilding: 'teaching',
  targetBuildingZh: '教学楼',
  targetDirection: 'back',
  targetDirectionZh: '后方',
  targetWorldBearingDeg: 270,
  targetScreenBearingDeg: 270,
  targetLocalX: 126,
  targetLocalY: 280,
  targetScreenX: 126,
  targetScreenY: 280,
  targetRadius: 154,
  rngSeed: 0,
};

function MapExample() {
  return (
    <div>
      <div
        style={{
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(79,112,89,.16)',
          background: '#F8FBF8',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            borderBottom: '1px solid rgba(79,112,89,.12)',
            color: 'var(--muted)',
            fontSize: 10.5,
            letterSpacing: '.02em',
          }}
        >
          <span>
            你正面朝 <strong style={{ color: 'var(--ink-soft)' }}>食堂</strong>
          </span>
          <span style={{ color: 'var(--muted-light)' }}>·</span>
          <span>地图方向固定</span>
          <span style={{ color: 'var(--muted-light)' }}>·</span>
          <span>人物线索</span>
        </div>
        <div style={{ width: 'min(100%, 330px)', margin: '0 auto' }}>
          <MapScene spec={MAP_EXAMPLE} />
        </div>
      </div>
      <p
        style={{
          marginTop: 10,
          fontSize: 10.5,
          color: 'var(--muted-light)',
          textAlign: 'center',
        }}
      >
        示例：地图方向固定。你正面朝右侧的“食堂”，小人也朝右。
        金圈标出的目标是左侧的“教学楼”，它位于你的后方。人物朝向与文字提示一致，
        建筑名称始终正立。
      </p>
    </div>
  );
}
