import { P } from "@/lib/stageGeometry";
import type { AgentStatus } from "@/lib/types";

// Dipindahkan dari fungsi `robot()` pada prototipe.
export function AgentShape({
  name,
  role,
  color,
  status,
  isLead,
  pos,
  selected,
  onSelect,
}: {
  name: string;
  role: string;
  color: string;
  status: AgentStatus;
  isLead: boolean;
  pos: [number, number];
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  const p = P(pos[0], pos[1]);
  const w = name.length * 7.2 + (isLead ? 30 : 22);

  return (
    <g
      className={`agent hit st-${status}${selected ? " sel" : ""}`}
      id={`ag-${name}`}
      data-agent={name}
      style={{ "--c": color, transform: `translate(${p[0]}px,${p[1]}px)` } as React.CSSProperties}
      tabIndex={0}
      role="button"
      aria-label={`${name}, ${role}`}
      onClick={() => onSelect(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(name);
        }
      }}
    >
      <ellipse cx={0} cy={0} rx={11} ry={4.5} fill="#000" fillOpacity={0.45} />
      <g className="bot">
        <rect x={-7} y={-17} width={14} height={13} fill="#dfe3ff" stroke="#0b0a1a" />
        <rect x={-3} y={-13} width={6} height={4} fill={color} />
        <rect x={-9} y={-31} width={18} height={14} fill="#eef0ff" stroke="#0b0a1a" />
        <rect x={-7} y={-28} width={14} height={7} fill="#14122b" />
        <rect x={-5} y={-26} width={3} height={3} fill={color} />
        <rect x={2} y={-26} width={3} height={3} fill={color} />
        <rect x={-1} y={-37} width={2} height={6} fill="#eef0ff" />
        <circle cx={0} cy={-38} r={2.5} fill={color} />
      </g>
      <g className="tg" transform="translate(0,-52)">
        <rect className="tagbox" x={-w / 2} y={-9} width={w} height={18} rx={2} />
        <circle className="dot" cx={-w / 2 + 8} cy={0} r={3} />
        <text x={-w / 2 + 16} y={4}>
          {isLead ? "\u2605 " : ""}
          {name}
        </text>
      </g>
    </g>
  );
}
