import { P, pts, up } from "@/lib/stageGeometry";
import { IsoBox } from "@/lib/isoShapes";
import type { RoomConfig } from "@/lib/officeConfig";

// Dipindahkan dari fungsi `roomSvg()` pada prototipe.
export function RoomShape({
  room,
  selected,
  onSelect,
}: {
  room: RoomConfig;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const c = room.color;
  const s = 5;
  const x0 = room.x;
  const y0 = room.y;
  const H = 34;
  const A = P(x0, y0);
  const B = P(x0 + s, y0);
  const C = P(x0 + s, y0 + s);
  const D = P(x0, y0 + s);

  const gridLines: React.ReactElement[] = [];
  for (let i = 1; i < s; i++) {
    const a1 = P(x0 + i, y0);
    const a2 = P(x0 + i, y0 + s);
    const b1 = P(x0, y0 + i);
    const b2 = P(x0 + s, y0 + i);
    gridLines.push(
      <line key={`a-${i}`} x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} stroke={c} strokeOpacity={0.18} />
    );
    gridLines.push(
      <line key={`b-${i}`} x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} stroke={c} strokeOpacity={0.18} />
    );
  }

  const lw = room.name.length * 8.4 + 18;
  const top = up(A, H + 16);

  const q1 = P(x0 + 0.8, y0);
  const q2 = P(x0 + 4.2, y0);

  return (
    <g
      className={`room hit${selected ? " sel" : ""}`}
      id={`rm-${room.id}`}
      data-room={room.id}
      style={{ "--c": c } as React.CSSProperties}
      onClick={() => onSelect(room.id)}
    >
      <polygon points={pts([D, A, up(A, H), up(D, H)])} fill={c} fillOpacity={0.1} stroke={c} strokeOpacity={0.5} />
      <polygon points={pts([A, B, up(B, H), up(A, H)])} fill={c} fillOpacity={0.16} stroke={c} strokeOpacity={0.5} />
      <polygon
        className="floor"
        points={pts([A, B, C, D])}
        fill={c}
        fillOpacity={0.1}
        stroke={c}
        strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 5px ${c})` }}
      />
      {gridLines}
      <g transform={`translate(${top[0]},${top[1]})`}>
        <rect x={-lw / 2} y={-11} width={lw} height={22} rx={2} fill="#0b0a1a" stroke={c} />
        <text className="rname" textAnchor="middle" y={4} fill={c}>
          {room.name}
        </text>
      </g>
      {room.meeting && (
        <g style={{ pointerEvents: "none" }}>
          <IsoBox x={x0 + 1.2} y={y0 + 2.0} w={2.6} d={1.2} h={10} color={c} />
          <polygon
            points={pts([up(q1, 10), up(q2, 10), up(q2, 30), up(q1, 30)])}
            fill="#0b0a1a"
            stroke={c}
          />
          <g
            transform={`translate(${q1[0] + 8},${q1[1] - 20}) matrix(1 .5 0 1 0 0)`}
            fill={c}
            fontFamily="Chakra Petch, sans-serif"
            fontWeight={700}
          >
            <text fontSize={9} letterSpacing={1}>
              REPORT H+1
            </text>
            <text y={9} fontSize={7} fillOpacity={0.7}>
              Tiap hari 09.00
            </text>
          </g>
        </g>
      )}
      {room.agents.map((name, i) => {
        const slot = { 0: [1.3, 2.0], 1: [3.4, 1.5], 2: [2.6, 3.9] }[i] as [number, number];
        const sx = x0 + slot[0];
        const sy = y0 + slot[1];
        return (
          <g key={name} style={{ pointerEvents: "none" }}>
            <IsoBox x={sx - 0.8} y={sy - 1.2} w={1.8} d={0.7} h={12} color={c} />
          </g>
        );
      })}
    </g>
  );
}
