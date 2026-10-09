import { P, pts, up, type Point } from "./stageGeometry";

// Dua lapis poligon: backing gelap + warna transparan dengan stroke.
// Dipindahkan dari fungsi `face()` pada prototipe.
export function Face({
  points,
  color,
  opacity,
  extraStyle,
}: {
  points: Point[];
  color: string;
  opacity: number;
  extraStyle?: React.CSSProperties;
}) {
  const p = pts(points);
  return (
    <>
      <polygon points={p} fill="#14122e" />
      <polygon
        points={p}
        fill={color}
        fillOpacity={opacity}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
        style={extraStyle}
      />
    </>
  );
}

// Kotak isometrik sederhana (dipakai untuk meja agent & meja rapat).
// Dipindahkan dari fungsi `box()` pada prototipe.
export function IsoBox({
  x,
  y,
  w,
  d,
  h,
  color,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: string;
}) {
  const A = P(x, y);
  const B = P(x + w, y);
  const C = P(x + w, y + d);
  const D = P(x, y + d);
  return (
    <>
      <Face points={[D, C, up(C, h), up(D, h)]} color={color} opacity={0.22} />
      <Face points={[B, C, up(C, h), up(B, h)]} color={color} opacity={0.1} />
      <Face
        points={[up(A, h), up(B, h), up(C, h), up(D, h)]}
        color={color}
        opacity={0.4}
      />
    </>
  );
}
