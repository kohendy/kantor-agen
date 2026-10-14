// lib/stage3d/instanceRequests.ts
// State Machine Murni untuk Permintaan Penambahan Agent Baru (HR + Operasional + Ekspansi)
// Tanpa Three.js, tanpa DOM, tanpa setTimeout.
// Mendukung injeksi clock agar unit test dapat memajukan waktu tanpa delay.

export type InstanceScenario = "riset" | "iklan" | "sosmed";

export type InstanceRequestState =
  | "antre"
  | "diminta"
  | "menunggu_persetujuan"
  | "menyiapkan"
  | "siap"
  | "datang"
  | "duduk"
  | "selesai"
  | "ditolak";

export interface ScenarioDefinition {
  scenario: InstanceScenario;
  roomId: string;
  deptHead: string;
  requiresApproval: boolean;
  role: string;
  context: string;
  label: string;
  baseAgent: string;
  color: string;
}

export const SCENARIO_DEFINITIONS: Record<InstanceScenario, ScenarioDefinition> = {
  riset: {
    scenario: "riset",
    roomId: "riset",
    deptHead: "ATHENA",
    requiresApproval: false,
    role: "Riset Pasar",
    context: "Produk Baru",
    label: "ATHENA · Produk Baru (demo)",
    baseAgent: "ATHENA",
    color: "#f5a623",
  },
  iklan: {
    scenario: "iklan",
    roomId: "advertiser",
    deptHead: "ZEUS",
    requiresApproval: true,
    role: "Pengelola Kampanye",
    context: "Akun B",
    label: "ARTEMIS · Akun B (demo)",
    baseAgent: "ARTEMIS",
    color: "#38bdf8",
  },
  sosmed: {
    scenario: "sosmed",
    roomId: "sosmed",
    deptHead: "HERMES",
    requiresApproval: false,
    role: "Spesialis Konten",
    context: "Threads",
    label: "HERMES · Threads (demo)",
    baseAgent: "HERMES",
    color: "#fb923c",
  },
};

export interface InstanceRequest {
  id: string;
  scenario: InstanceScenario;
  roomId: string;
  deptHead: string;
  requiresApproval: boolean;
  role: string;
  context: string;
  label: string;
  baseAgent: string;
  color: string;
  state: InstanceRequestState;
  createdAt: number;
  updatedAt: number;
  slotIndex?: number;
}

export type InstanceAction =
  | { type: "request_queued"; request: InstanceRequest; queueLength: number; queueIndex: number }
  | { type: "dept_head_to_hr"; request: InstanceRequest; queueIndex: number }
  | { type: "hera_nod"; request: InstanceRequest }
  | { type: "show_approval_card"; request: InstanceRequest }
  | { type: "dept_head_rejected"; request: InstanceRequest }
  | { type: "ops_prepare"; request: InstanceRequest; needsExpansion: boolean }
  | { type: "ops_ready"; request: InstanceRequest }
  | { type: "agent_spawn_and_walk"; request: InstanceRequest }
  | { type: "agent_seated"; request: InstanceRequest }
  | { type: "dept_head_return"; request: InstanceRequest }
  | { type: "request_completed"; request: InstanceRequest }
  | { type: "reset" };

export class InstanceRequestManager {
  private requests: InstanceRequest[] = [];
  private activeRequestId: string | null = null;
  private expandedRooms: Set<string> = new Set();
  private listeners: Array<(action: InstanceAction) => void> = [];
  private getTime: () => number;

  constructor(clock?: () => number) {
    this.getTime = clock ?? (() => Date.now());
  }

  public setClock(clock: () => number): void {
    this.getTime = clock;
  }

  public subscribe(fn: (action: InstanceAction) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(action: InstanceAction): void {
    for (const listener of this.listeners) {
      listener(action);
    }
  }

  public getRequests(): InstanceRequest[] {
    return [...this.requests];
  }

  public getActiveRequest(): InstanceRequest | null {
    if (!this.activeRequestId) return null;
    return this.requests.find((r) => r.id === this.activeRequestId) ?? null;
  }

  public getQueue(): InstanceRequest[] {
    return this.requests.filter(
      (r) => r.id !== this.activeRequestId && r.state === "antre"
    );
  }

  public getQueueLength(): number {
    return this.getQueue().length;
  }

  public isExpanded(roomId: string): boolean {
    const norm = roomId === "ads" ? "advertiser" : roomId === "lp" ? "landing_page" : roomId;
    return this.expandedRooms.has(norm);
  }

  public getExpandedRooms(): string[] {
    return Array.from(this.expandedRooms);
  }

  public setExpanded(roomId: string, expanded: boolean = true): void {
    const norm = roomId === "ads" ? "advertiser" : roomId === "lp" ? "landing_page" : roomId;
    if (expanded) {
      this.expandedRooms.add(norm);
    } else {
      this.expandedRooms.delete(norm);
    }
  }

  public request(scenario: InstanceScenario): InstanceRequest {
    const def = SCENARIO_DEFINITIONS[scenario];
    if (!def) {
      throw new Error(`Skenario "${scenario}" tidak dikenali.`);
    }

    const now = this.getTime();
    const id = `req_${scenario}_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const hasActive = this.activeRequestId !== null;

    const req: InstanceRequest = {
      id,
      scenario,
      roomId: def.roomId,
      deptHead: def.deptHead,
      requiresApproval: def.requiresApproval,
      role: def.role,
      context: def.context,
      label: def.label,
      baseAgent: def.baseAgent,
      color: def.color,
      state: "antre",
      createdAt: now,
      updatedAt: now,
    };

    this.requests.push(req);

    if (hasActive) {
      const queueIndex = this.getQueue().length;
      this.emit({
        type: "request_queued",
        request: req,
        queueLength: queueIndex,
        queueIndex,
      });
      // Kepala departemen berjalan ke posisi antrean di ruang HR
      this.emit({
        type: "dept_head_to_hr",
        request: req,
        queueIndex,
      });
    } else {
      this.activeRequestId = id;
      // Langsung berjalan ke depan meja HERA
      this.emit({
        type: "dept_head_to_hr",
        request: req,
        queueIndex: 0,
      });
    }

    return req;
  }

  public advance(requestId: string, nextState: InstanceRequestState): boolean {
    const req = this.requests.find((r) => r.id === requestId);
    if (!req) return false;

    const prevState = req.state;
    if (prevState === nextState) return true;

    req.state = nextState;
    req.updatedAt = this.getTime();

    switch (nextState) {
      case "diminta":
        this.emit({ type: "hera_nod", request: req });
        break;
      case "menunggu_persetujuan":
        this.emit({ type: "show_approval_card", request: req });
        break;
      case "menyiapkan": {
        // Sosmed selalu butuh ekspansi jika bay belum terbuka
        const needsExpansion = req.roomId === "sosmed" && !this.isExpanded("sosmed");
        this.emit({ type: "ops_prepare", request: req, needsExpansion });
        break;
      }
      case "siap":
        this.emit({ type: "ops_ready", request: req });
        break;
      case "datang":
        this.emit({ type: "agent_spawn_and_walk", request: req });
        break;
      case "duduk":
        this.emit({ type: "agent_seated", request: req });
        break;
      case "selesai":
        this.emit({ type: "dept_head_return", request: req });
        this.emit({ type: "request_completed", request: req });
        this.activeRequestId = null;
        this.processNextInQueue();
        break;
      case "ditolak":
        this.emit({ type: "dept_head_rejected", request: req });
        this.emit({ type: "dept_head_return", request: req });
        this.activeRequestId = null;
        this.processNextInQueue();
        break;
    }

    return true;
  }

  public approveCeo(requestId?: string): boolean {
    const target = requestId
      ? this.requests.find((r) => r.id === requestId)
      : this.requests.find((r) => r.state === "menunggu_persetujuan");

    if (!target || target.state !== "menunggu_persetujuan") return false;
    return this.advance(target.id, "menyiapkan");
  }

  public rejectCeo(requestId?: string): boolean {
    const target = requestId
      ? this.requests.find((r) => r.id === requestId)
      : this.requests.find((r) => r.state === "menunggu_persetujuan");

    if (!target || target.state !== "menunggu_persetujuan") return false;
    return this.advance(target.id, "ditolak");
  }

  private processNextInQueue(): void {
    const next = this.getQueue()[0];
    if (next) {
      this.activeRequestId = next.id;
      this.emit({
        type: "dept_head_to_hr",
        request: next,
        queueIndex: 0,
      });
      this.advance(next.id, "diminta");
    }
  }

  public reset(): void {
    this.requests = [];
    this.activeRequestId = null;
    this.expandedRooms.clear();
    this.emit({ type: "reset" });
  }
}
