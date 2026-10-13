// Mesin Koreografi (Choreography Engine) tanpa dependensi React
// Mengatur antrean tugas aktor (jalan, tunggu, hadap, pose, panggilan fungsi)
// dengan delta waktu ter-clamp, percepatan adaptif, dan penanganan reduced-motion.

import * as THREE from "three";
import {
  OFFSET_X,
  OFFSET_Z,
  findPath,
  getMeetingPathForAgent,
  getReturnPathForAgent,
} from "./walkways";
import { MANAGER_AGENT_NAME } from "@/lib/officeConfig";

export type Task =
  | { type: "walkTo"; waypoints: THREE.Vector3[]; targetName?: string }
  | { type: "wait"; ms: number }
  | { type: "face"; angle: number }
  | { type: "pose"; name: string; ms: number }
  | { type: "call"; fn: () => void }
  | { type: "say"; text: string; ms: number };

export interface ActorRecord {
  id: string;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh?: THREE.Mesh;
  bubbleDiv?: HTMLDivElement;
  homePos: THREE.Vector3;
  targetPos: THREE.Vector3; // Referensi targetPos dari Agent3DRecord
  queue: Task[];
  currentTask: Task | null;
  currentTaskTimer: number; // Dalam detik
  waypointIndex: number;
  walkStep: number;
  isBusy: boolean;
  isDrainingBacklog?: boolean;
  onCompleteCallbacks: Array<() => void>;
  speechText: string | null;
  speechTimer: number;
}

export class ChoreographyEngine {
  private actors: Map<string, ActorRecord> = new Map();
  public onInboxGlow?: (active: boolean) => void;
  public onHeadNod?: (agentName: string) => void;
  public isMeetingActive: boolean = false;
  private pendingDelegations: Array<{ roomId: string; onDone?: () => void }> = [];

  public registerActor(record: {
    id: string;
    group: THREE.Group;
    bodyMesh: THREE.Mesh;
    headMesh?: THREE.Mesh;
    bubbleDiv?: HTMLDivElement;
    homePos: THREE.Vector3;
    targetPos: THREE.Vector3;
  }): void {
    this.actors.set(record.id, {
      ...record,
      queue: [],
      currentTask: null,
      currentTaskTimer: 0,
      waypointIndex: 0,
      walkStep: 0,
      isBusy: false,
      isDrainingBacklog: false,
      onCompleteCallbacks: [],
      speechText: null,
      speechTimer: 0,
    });
  }

  public unregisterActor(id: string): void {
    this.actors.delete(id);
  }

  public getActor(id: string): ActorRecord | undefined {
    return this.actors.get(id);
  }

  public isBusy(actorId: string): boolean {
    const actor = this.actors.get(actorId);
    if (!actor) return false;
    return actor.isBusy || actor.queue.length > 0 || actor.currentTask !== null;
  }

  public getQueueLength(actorId: string): number {
    const actor = this.actors.get(actorId);
    if (!actor) return 0;
    return actor.queue.length + (actor.currentTask ? 1 : 0);
  }

  // Tambahkan tugas ke antrean aktor
  public enqueue(actorId: string, tasks: Task[], onComplete?: () => void): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;

    actor.queue.push(...tasks);
    if (onComplete) {
      actor.onCompleteCallbacks.push(onComplete);
    }
    actor.isBusy = true;
  }

  // Bersihkan antrean dan kembalikan aktor ke meja
  public clear(actorId: string): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;

    actor.queue = [];
    actor.currentTask = null;
    actor.currentTaskTimer = 0;
    actor.isBusy = false;
    actor.isDrainingBacklog = false;
    actor.group.position.copy(actor.homePos);
    actor.targetPos.copy(actor.homePos);
    actor.group.rotation.set(0, 0, 0);
    if (actor.bodyMesh) {
      actor.bodyMesh.rotation.set(0, 0, 0);
    }
    if (actor.headMesh) {
      actor.headMesh.rotation.set(0, 0, 0);
    }
    this.hideSpeechBubble(actor);
    if (this.onInboxGlow && actorId === MANAGER_AGENT_NAME) this.onInboxGlow(false);

    // Jalankan semua callback yang tertunda
    while (actor.onCompleteCallbacks.length > 0) {
      const cb = actor.onCompleteCallbacks.shift();
      cb?.();
    }
  }

  // Mengosongkan antrean tugas tanpa mereset posisi aktor seketika
  public clearQueue(actorId: string): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;

    actor.queue = [];
    actor.currentTask = null;
    actor.currentTaskTimer = 0;
    actor.isBusy = false;
    actor.isDrainingBacklog = false;
    this.hideSpeechBubble(actor);
    if (this.onInboxGlow && actorId === MANAGER_AGENT_NAME) this.onInboxGlow(false);

    while (actor.onCompleteCallbacks.length > 0) {
      const cb = actor.onCompleteCallbacks.shift();
      cb?.();
    }
  }

  public getPendingDelegationsCount(): number {
    return this.pendingDelegations.length;
  }

  // Hitung jumlah trip / perjalanan delegasi yang ada di antrean
  public countTripsInQueue(actorId: string): number {
    const actor = this.actors.get(actorId);
    if (!actor) return 0;
    let count = 0;
    for (const t of actor.queue) {
      if (t.type === "walkTo") count++;
    }
    if (actor.currentTask?.type === "walkTo") count++;
    // Satu delegasi biasanya terdiri dari 2 walkTo (berangkat + kembali)
    return Math.ceil(count / 2);
  }

  // Antrean delegasi Manager ATLAS
  public delegate(roomId: string, onDone?: () => void): void {
    const actor = this.actors.get(MANAGER_AGENT_NAME);
    if (!actor) return;

    // Jika rapat sedang berlangsung, tahan delegasi di antrean pending sampai rapat bubar
    if (this.isMeetingActive) {
      this.pendingDelegations.push({ roomId, onDone });
      this.showSpeechBubble(actor, "Rapat berlangsung, tugas diantrekan…", false);
      return;
    }

    const tasks: Task[] = [];
    const distToHome = actor.group.position.distanceTo(actor.homePos);

    // 1. Jika sedang di luar meja, harus kembali ke meja terlebih dahulu
    if (distToHome > 0.25) {
      const returnWaypoints = findPath(
        { x: actor.group.position.x, z: actor.group.position.z },
        "manager"
      );
      tasks.push({
        type: "walkTo",
        waypoints: returnWaypoints,
        targetName: "Kembali ke meja",
      });
      tasks.push({ type: "face", angle: 0 });
    }

    // 2. Baca brief di meja (±1.5–2 detik; inbox menyala lembut, kepala menunduk)
    tasks.push({ type: "say", text: "Membaca brief…", ms: 1600 });
    tasks.push({
      type: "call",
      fn: () => {
        if (this.onInboxGlow) this.onInboxGlow(true);
      },
    });
    tasks.push({ type: "pose", name: "readBrief", ms: 1600 });
    tasks.push({
      type: "call",
      fn: () => {
        if (this.onInboxGlow) this.onInboxGlow(false);
      },
    });

    // 3. Jalan ke pintu ruangan tujuan -> ke meja kepala departemen
    const outwardPath = findPath("manager", roomId);
    const roomUpper = roomId.toUpperCase();
    tasks.push({ type: "say", text: `Ke ${roomUpper}`, ms: 2200 });
    tasks.push({
      type: "walkTo",
      waypoints: outwardPath,
      targetName: `Ruang ${roomUpper}`,
    });

    // 4. Serah-terima singkat di meja kepala departemen (±1.5 detik)
    tasks.push({ type: "say", text: "Serah tugas…", ms: 1500 });
    tasks.push({
      type: "call",
      fn: () => {
        if (this.onHeadNod) this.onHeadNod(roomId);
      },
    });
    tasks.push({ type: "pose", name: "handover", ms: 1500 });

    // 5. Kembali ke meja Manager
    const returnPath = findPath(roomId, "manager");
    tasks.push({ type: "say", text: "Kembali…", ms: 2000 });
    tasks.push({
      type: "walkTo",
      waypoints: returnPath,
      targetName: "Kembali ke meja",
    });
    tasks.push({ type: "face", angle: 0 });
    tasks.push({
      type: "call",
      fn: () => {
        this.hideSpeechBubble(actor);
        actor.targetPos.copy(actor.homePos);
      },
    });

    this.enqueue(MANAGER_AGENT_NAME, tasks, onDone);
  }

  // Mengalirkan delegasi yang tertunda selama rapat setelah bubar
  public drainPendingDelegations(): void {
    if (this.isMeetingActive || this.pendingDelegations.length === 0) return;
    const next = this.pendingDelegations.shift();
    if (next) {
      this.delegate(next.roomId, () => {
        next.onDone?.();
        this.drainPendingDelegations();
      });
    }
  }

  // Gather: seluruh 16 agen berjalan serentak (ber-stagger) menuju kursi ruang Meeting
  public startMeeting(
    seatByAgent: Record<string, [number, number]>,
    meetingRoomPos: { x: number; y: number },
    reducedMotion: boolean = false
  ): void {
    this.isMeetingActive = true;
    const meetingCenter = { x: 0.0, z: -2.9 };

    let idx = 0;
    for (const [name, actor] of this.actors.entries()) {
      const seatRel = seatByAgent[name] ?? [2.5, 2.5];
      const targetSeatWorld = {
        x: meetingRoomPos.x + seatRel[0] + OFFSET_X,
        z: meetingRoomPos.y + seatRel[1] + OFFSET_Z,
      };

      const dx = meetingCenter.x - targetSeatWorld.x;
      const dz = meetingCenter.z - targetSeatWorld.z;
      const faceAngle = Math.atan2(dx, dz);

      if (reducedMotion) {
        this.clearQueue(name);
        actor.group.position.set(targetSeatWorld.x, 0, targetSeatWorld.z);
        actor.targetPos.set(targetSeatWorld.x, 0, targetSeatWorld.z);
        actor.group.rotation.y = faceAngle;
        actor.isBusy = false;
      } else {
        this.clearQueue(name);

        const waypoints = getMeetingPathForAgent(
          name,
          { x: actor.group.position.x, z: actor.group.position.z },
          targetSeatWorld,
          idx
        );

        // Stagger jeda berurutan antar agent 0.15 s - 0.4 s
        const staggerMs = 150 + ((idx * 160) % 550);

        const tasks: Task[] = [
          { type: "wait", ms: staggerMs },
          { type: "walkTo", waypoints, targetName: "Ruang Meeting" },
          { type: "face", angle: faceAngle },
        ];

        this.enqueue(name, tasks);
      }
      idx++;
    }
  }

  // Bubar: seluruh agen berjalan kembali ke mejanya masing-masing lewat koridor
  public endMeeting(reducedMotion: boolean = false): void {
    this.isMeetingActive = false;

    let idx = 0;
    for (const [name, actor] of this.actors.entries()) {
      const homeTarget = {
        x: actor.homePos.x,
        z: actor.homePos.z,
      };
      const homeFaceAngle = 0;

      if (reducedMotion) {
        this.clearQueue(name);
        actor.group.position.copy(actor.homePos);
        actor.targetPos.copy(actor.homePos);
        actor.group.rotation.y = homeFaceAngle;
        actor.isBusy = false;
      } else {
        this.clearQueue(name);

        const waypoints = getReturnPathForAgent(
          name,
          { x: actor.group.position.x, z: actor.group.position.z },
          homeTarget,
          idx
        );

        const staggerMs = 150 + ((idx * 150) % 500);

        const tasks: Task[] = [
          { type: "wait", ms: staggerMs },
          { type: "walkTo", waypoints, targetName: "Kembali ke meja" },
          { type: "face", angle: homeFaceAngle },
        ];

        if (name === MANAGER_AGENT_NAME) {
          tasks.push({
            type: "call",
            fn: () => {
              this.drainPendingDelegations();
            },
          });
        }

        this.enqueue(name, tasks);
      }
      idx++;
    }

    if (reducedMotion) {
      this.drainPendingDelegations();
    }
  }

  private showSpeechBubble(actor: ActorRecord, text: string, reducedMotion: boolean): void {
    actor.speechText = text;
    if (actor.bubbleDiv && !reducedMotion) {
      actor.bubbleDiv.textContent = text;
      actor.bubbleDiv.style.display = "block";
      actor.bubbleDiv.style.opacity = "1";
    }
  }

  private hideSpeechBubble(actor: ActorRecord): void {
    actor.speechText = null;
    if (actor.bubbleDiv) {
      actor.bubbleDiv.style.opacity = "0";
      actor.bubbleDiv.style.display = "none";
    }
  }

  // Update loop utama (dipanggil per frame Three.js)
  public update(rawDt: number, reducedMotion: boolean = false): void {
    // Clamp delta time maks 0.1 detik agar tidak teleportasi saat tab kembali aktif
    const dt = Math.min(Math.max(rawDt, 0), 0.1);

    for (const actor of this.actors.values()) {
      // Hitung percepatan adaptif:
      // Jika antrean mencapai penumpukan tinggi (tripsCount >= 4), aktor masuk mode pembersihan backlog
      // sehingga seluruh rangkaian delegasi backlog terselesaikan secara cepat dan efisien.
      const tripsCount = this.countTripsInQueue(actor.id);
      if (tripsCount >= 4) {
        actor.isDrainingBacklog = true;
      }

      let speedMultiplier = 1.0;
      let waitMultiplier = 1.0;

      if (actor.isDrainingBacklog) {
        if (tripsCount >= 5) {
          speedMultiplier = 5.2;
          waitMultiplier = 0.0; // Lewati jeda saat backlog sangat tinggi
        } else if (tripsCount >= 3) {
          speedMultiplier = 4.0;
          waitMultiplier = 0.02; // Jeda hampir instan
        } else {
          // Sisa 1-2 perjalanan terakhir dari backlog tetap dipercepat agar antrean segera tuntas
          speedMultiplier = 3.2;
          waitMultiplier = 0.05;
        }
      } else {
        // Mode normal
        if (tripsCount >= 2) {
          speedMultiplier = 1.4;
          waitMultiplier = 0.4; // Jeda diperpendek sedikit jika ada 2 antrean
        }
      }

      const baseSpeed = 2.6; // Unit per detik
      const currentSpeed = baseSpeed * speedMultiplier;

      // Update speech bubble timeout
      if (actor.speechTimer > 0) {
        actor.speechTimer -= dt;
        if (actor.speechTimer <= 0) {
          this.hideSpeechBubble(actor);
        }
      }

      // Ambil tugas berikutnya jika belum ada yang berjalan
      if (!actor.currentTask) {
        if (actor.queue.length > 0) {
          actor.currentTask = actor.queue.shift()!;
          actor.currentTaskTimer = 0;
          actor.waypointIndex = 0;
          actor.isBusy = true;
        } else {
          // Semua tugas selesai
          if (actor.isBusy) {
            actor.isBusy = false;
            actor.isDrainingBacklog = false;
            this.hideSpeechBubble(actor);
            actor.targetPos.copy(actor.homePos);
            while (actor.onCompleteCallbacks.length > 0) {
              const cb = actor.onCompleteCallbacks.shift();
              cb?.();
            }
          }
          continue;
        }
      }

      const task = actor.currentTask;

      // MODE REDUCED MOTION:
      // Tidak ada animasi jalan; tugas langsung selesai, posisi melompat ke titik akhir
      if (reducedMotion) {
        if (task.type === "walkTo") {
          const lastPoint = task.waypoints[task.waypoints.length - 1];
          if (lastPoint) {
            actor.group.position.x = lastPoint.x;
            actor.group.position.z = lastPoint.z;
            actor.targetPos.copy(lastPoint);
          }
        } else if (task.type === "face") {
          actor.group.rotation.y = task.angle;
        } else if (task.type === "call") {
          task.fn();
        }
        // Tunggu/pose/say langsung selesai
        this.hideSpeechBubble(actor);
        actor.currentTask = null;
        continue;
      }

      // EKSEKUSI TUGAS NORMAL
      switch (task.type) {
        case "say": {
          this.showSpeechBubble(actor, task.text, reducedMotion);
          actor.speechTimer = (task.ms / 1000) * waitMultiplier;
          actor.currentTask = null;
          break;
        }

        case "wait": {
          const targetWait = (task.ms / 1000) * waitMultiplier;
          actor.currentTaskTimer += dt;
          if (actor.currentTaskTimer >= targetWait) {
            actor.currentTask = null;
          }
          break;
        }

        case "pose": {
          const targetDuration = (task.ms / 1000) * waitMultiplier;
          actor.currentTaskTimer += dt;

          if (task.name === "readBrief" && actor.headMesh) {
            // Kepala menunduk pelan
            const headAngle = Math.sin((actor.currentTaskTimer / targetDuration) * Math.PI) * 0.28;
            actor.headMesh.rotation.x = headAngle;
          } else if (task.name === "handover" && actor.headMesh) {
            // Angguk hormat / serah-terima
            const nodAngle = Math.sin(actor.currentTaskTimer * 8.0) * 0.18;
            actor.headMesh.rotation.x = Math.max(0, nodAngle);
          }

          if (actor.currentTaskTimer >= targetDuration) {
            if (actor.headMesh) actor.headMesh.rotation.x = 0;
            actor.currentTask = null;
          }
          break;
        }

        case "face": {
          actor.group.rotation.y = task.angle;
          actor.currentTask = null;
          break;
        }

        case "call": {
          task.fn();
          actor.currentTask = null;
          break;
        }

        case "walkTo": {
          const waypoints = task.waypoints;
          if (!waypoints || waypoints.length === 0) {
            actor.currentTask = null;
            break;
          }

          const targetWp = waypoints[actor.waypointIndex];
          if (!targetWp) {
            // Selesai seluruh waypoint
            actor.currentTask = null;
            actor.group.position.y = 0;
            if (actor.bodyMesh) actor.bodyMesh.rotation.z = 0;
            break;
          }

          const dx = targetWp.x - actor.group.position.x;
          const dz = targetWp.z - actor.group.position.z;
          const dist = Math.hypot(dx, dz);
          const stepDist = currentSpeed * dt;

          if (dist <= stepDist || dist < 0.04) {
            // Tiba di waypoint ini, lanjut ke waypoint berikutnya
            actor.group.position.x = targetWp.x;
            actor.group.position.z = targetWp.z;
            actor.waypointIndex++;
            if (actor.waypointIndex >= waypoints.length) {
              actor.currentTask = null;
              actor.group.position.y = 0;
              if (actor.bodyMesh) actor.bodyMesh.rotation.z = 0;
            }
          } else {
            // Gerak maju
            const dirX = dx / dist;
            const dirZ = dz / dist;
            actor.group.position.x += dirX * stepDist;
            actor.group.position.z += dirZ * stepDist;

            // Update rotasi menghadap arah gerak
            const targetYaw = Math.atan2(dirX, dirZ);
            actor.group.rotation.y = targetYaw;

            // Bobbing langkah kecil & sedikit miring
            actor.walkStep += dt * currentSpeed * 6.0;
            const bob = Math.abs(Math.sin(actor.walkStep)) * 0.045;
            actor.group.position.y = bob;

            if (actor.bodyMesh) {
              actor.bodyMesh.rotation.z = Math.sin(actor.walkStep * 0.5) * 0.04;
            }
          }

          // Sinkronkan targetPos internal agar raycast / highlight tetap akurat
          actor.targetPos.copy(actor.group.position);
          break;
        }
      }
    }
  }
}
