// Util geometri isometrik, dipindahkan apa adanya dari prototipe (fungsi P/pts/up).
export const TW = 32;
export const TH = 16;
export const OX = 380;
export const OY = 70;

export type Point = [number, number];

export function P(x: number, y: number): Point {
  return [(x - y) * TW + OX, (x + y) * TH + OY];
}

export function pts(arr: Point[]): string {
  return arr.map((p) => p[0] + "," + p[1]).join(" ");
}

export function up(p: Point, h: number): Point {
  return [p[0], p[1] - h];
}
