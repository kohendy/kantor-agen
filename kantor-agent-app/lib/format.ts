export function formatClock(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => (n < 10 ? "0" + n : "" + n);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
