"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  AGENTS,
  AGENT_RENDER_ORDER,
  HOME_POSITIONS,
  MANAGER_AGENT_NAME,
  MANAGER_ROOM_ID,
  ROOMS,
  SEAT_BY_AGENT,
  STATUS_LABEL,
  HR_PORTAL_POS,
  colorOfAgent,
  roomOfAgent,
  RoomConfig,
} from "@/lib/officeConfig";
import {
  FLOORPLAN,
  FloorplanData,
  WallSide,
  validateFloorplan,
} from "@/lib/stage3d/floorplan";
import type { AgentRow, EventRow, AgentStatus } from "@/lib/types";
import { OfficeStage as OfficeStageSVG } from "./OfficeStage";
import {
  createWalkwayVisuals,
  getMeetingPathForAgent,
  findPath,
  generateWalkwayGraph,
  findPathWithGraph,
  findPathNodes,
  WaypointNode,
} from "@/lib/stage3d/walkways";
import { ChoreographyEngine } from "@/lib/stage3d/choreography";
import {
  DaylightController,
  getHourFromUrl,
} from "@/lib/stage3d/daylight";
import {
  createDeskMesh,
  createAgentCharacter,
  calculateRoomSlotPosition,
  DynamicDeskResult,
  DynamicAgentResult,
} from "@/lib/stage3d/instances";
import {
  createVoxelHuman,
  getAgentAppearance,
  VoxelHumanResult,
} from "@/lib/stage3d/characters/voxelHuman";
import { THEME, softenColor } from "@/lib/stage3d/theme";
import {
  T2A_PLACED_PROPS,
  T2B_PLACED_PROPS,
  ALL_PLACED_PROPS,
  PROPS_REGISTRY,
  validatePropsPlacement,
  PROPS_OBSTACLES,
  WalkObstacle,
} from "@/lib/stage3d/props/index";

export type Selection = {
  type: "room" | "agent" | "agent_instance";
  id: string;
} | null;

interface Agent3DRecord {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headGroup: THREE.Group;
  headMesh: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  statusLightMesh?: THREE.Mesh;
  statusLightMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
  labelObj: CSS2DObject;
  labelDiv: HTMLDivElement;
  dotSpan: HTMLSpanElement;
  bubbleDiv?: HTMLDivElement;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  baseY: number;
  phase: number;
  status: AgentStatus;
  appearance: {
    skin: string;
    hair: string;
    department: string;
    lead: boolean;
  };
  characterType: "voxelHuman";
  dispose: () => void;
}

interface Room3DRecord {
  group: THREE.Group;
  floorMesh: THREE.Mesh;
  floorMat: THREE.MeshStandardMaterial;
  edgeLines: THREE.LineSegments;
  edgeMat: THREE.LineBasicMaterial;
  hitMesh: THREE.Mesh;
  labelObj: CSS2DObject;
  labelDiv: HTMLDivElement;
}

// Framing kamera ortografis isometrik dari Tenggara (Southeast)
// Sudut Barat Laut (Meeting di 0,0) di pojok atas layar, Pintu Utama di tenggara menghadap kamera
// Pusat denah 44x36 (termasuk bay x: -3..44, z: -2..36): (20.5, 0, 17.0)
const INIT_CAM_TARGET = new THREE.Vector3(20.5, 0, 17.0);
const INIT_CAM_POS = new THREE.Vector3(20.5 + 45.0, 38.0, 17.0 + 45.0);

function updateCameraFrustum(cam: THREE.OrthographicCamera, w: number, h: number) {
  const aspect = w / h;
  const margin = 1.08;
  const boundHalfW = 30.052 * margin; // ~32.45
  const boundHalfH = 18.0 * margin;   // ~19.44
  const halfH = Math.max(boundHalfH, boundHalfW / aspect);
  const halfW = halfH * aspect;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = -200;
  cam.far = 500;
  cam.updateProjectionMatrix();
}

function createHatchedTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = THEME.bay.background;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = THEME.bay.hatchColor;
  ctx.lineWidth = 8;
  for (let d = -128; d <= 256; d += 24) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + 128, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function pill(status: string) {
  const cls = status === "working" ? "w" : status === "review" ? "r" : "";
  return (
    <span className={`pill ${cls}`}>{STATUS_LABEL[status] ?? status}</span>
  );
}

function getStatusColor(status: AgentStatus): number {
  switch (status) {
    case "working":
      return 0x2ee6a8;
    case "review":
      return 0xf5a623;
    case "idle":
    default:
      return 0x4a4875;
  }
}

function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (
    (window as unknown as { __FORCE_WEBGL_FALLBACK__?: boolean })
      .__FORCE_WEBGL_FALLBACK__
  ) {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

export function OfficeStage3D({
  agents,
  events,
  realtimeConnected,
  fullFrame = false,
  onToggleFullFrame,
  detailCollapsed = false,
  onToggleDetailCollapse,
  isMobileDetailOpen = false,
  onCloseMobileDetail,
}: {
  agents: AgentRow[];
  events: EventRow[];
  realtimeConnected: boolean;
  fullFrame?: boolean;
  onToggleFullFrame?: () => void;
  detailCollapsed?: boolean;
  onToggleDetailCollapse?: () => void;
  isMobileDetailOpen?: boolean;
  onCloseMobileDetail?: () => void;
}) {
  const [webglSupported] = useState(() => isWebGLAvailable());
  const [webglInitError, setWebglInitError] = useState(false);

  const [selected, setSelected] = useState<Selection>(null);
  const [gathered, setGathered] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Mode Demo & Daylight Controls
  const [isDemo] = useState(() => {
    if (typeof window === "undefined") return false;
    const search = window.location.search;
    return (
      new URLSearchParams(search).get("demo") === "1" ||
      new URLSearchParams(search).get("e2e") === "1"
    );
  });
  const showDemoUI = process.env.NODE_ENV !== "production" || isDemo;
  const [hourOverrideState, setHourOverrideState] = useState<number | null>(() =>
    getHourFromUrl()
  );
  const [shotMode, setShotMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search;
      return new URLSearchParams(search).get("shot") === "1";
    }
    return false;
  });
  const shotModeRef = useRef<boolean>(shotMode);

  useEffect(() => {
    shotModeRef.current = shotMode;
    if (cssRendererRef.current) {
      cssRendererRef.current.domElement.style.display = shotMode ? "none" : "block";
    }
  }, [shotMode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const infoContainerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cssRendererRef = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isTabVisibleRef = useRef<boolean>(true);
  const isIntersectingRef = useRef<boolean>(true);

  const agentRecordsRef = useRef<Record<string, Agent3DRecord>>({});
  const roomRecordsRef = useRef<Record<string, Room3DRecord>>({});
  const floorMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const inboxTrayMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const statusOverridesRef = useRef<Record<string, AgentStatus | null>>({});

  const choreoEngineRef = useRef<ChoreographyEngine>(new ChoreographyEngine());
  const daylightControllerRef = useRef<DaylightController>(new DaylightController());

  const gatheredRef = useRef<boolean>(false);
  const selectedRef = useRef<Selection>(null);
  const hoveredRef = useRef<{
    type: "room" | "agent" | "agent_instance";
    id: string;
  } | null>(null);
  const raycastHitMeshesRef = useRef<THREE.Mesh[]>([]);

  // Demo Instance & Dynamic Items Ref
  const [demoInstanceStep, setDemoInstanceStep] = useState<number>(0);
  const [demoStatusMessage, setDemoStatusMessage] = useState<string>("");
  const [showCeoApprovalCard, setShowCeoApprovalCard] = useState<boolean>(false);
  const [ceoApprovalStatus, setCeoApprovalStatus] = useState<
    "pending" | "approved" | "rejected"
  >("pending");

  const dynamicDesksRef = useRef<DynamicDeskResult[]>([]);
  const dynamicAgentsRef = useRef<DynamicAgentResult[]>([]);
  const demoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInstanceDemoRunningRef = useRef<boolean>(false);
  const demoQueueRef = useRef<Array<() => void>>([]);
  const demoStateRef = useRef({
    step: 0,
    statusMessage: "",
    showApprovalCard: false,
    approvalStatus: "pending" as "pending" | "approved" | "rejected",
  });

  useEffect(() => {
    demoStateRef.current = {
      step: demoInstanceStep,
      statusMessage: demoStatusMessage,
      showApprovalCard: showCeoApprovalCard,
      approvalStatus: ceoApprovalStatus,
    };
  }, [demoInstanceStep, demoStatusMessage, showCeoApprovalCard, ceoApprovalStatus]);

  const resetAnimRef = useRef<{
    active: boolean;
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    startZoom: number;
  } | null>(null);

  useEffect(() => {
    gatheredRef.current = gathered;
  }, [gathered]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const agentsRef = useRef<AgentRow[]>(agents);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  const agentByName = useMemo(() => {
    const map: Record<string, AgentRow> = {};
    agents.forEach((a) => {
      map[a.nama] = a;
    });
    return map;
  }, [agents]);

  const lastEventByAgent = useMemo(() => {
    const map: Record<string, EventRow> = {};
    for (const ev of events) {
      if (!map[ev.agent]) map[ev.agent] = ev;
    }
    return map;
  }, [events]);

  const stats = useMemo(() => {
    const n = { working: 0, review: 0, idle: 0 };
    agents.forEach((a) => {
      if (a.status in n) n[a.status as keyof typeof n]++;
    });
    return n;
  }, [agents]);

  const statusOf = useCallback(
    (name: string): AgentStatus =>
      (agentByName[name]?.status as AgentStatus) ?? "idle",
    [agentByName]
  );

  const selectRoom = useCallback((id: string) => {
    if (id === "meeting") {
      setGathered((g) => !g);
    }
    setSelected({ type: "room", id });
  }, []);

  const selectAgent = useCallback((name: string) => {
    setSelected({ type: "agent", id: name });
  }, []);

  const selectAgentInstance = useCallback((id: string) => {
    setSelected({ type: "agent_instance", id });
  }, []);

  const handlersRef = useRef({ selectAgent, selectRoom, selectAgentInstance });
  useEffect(() => {
    handlersRef.current = { selectAgent, selectRoom, selectAgentInstance };
  }, [selectAgent, selectRoom, selectAgentInstance]);

  // Handler Demo Instance Request (7 Langkah Dinamis)
  const handleResetInstanceDemo = useCallback(() => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    // Bersihkan meja dinamis
    dynamicDesksRef.current.forEach((d) => {
      d.dispose();
      d.group.removeFromParent?.();
    });
    dynamicDesksRef.current = [];

    // Bersihkan agen dinamis
    dynamicAgentsRef.current.forEach((a) => {
      a.dispose();
      a.group.removeFromParent?.();
      const idx = raycastHitMeshesRef.current.indexOf(a.hitMesh);
      if (idx !== -1) raycastHitMeshesRef.current.splice(idx, 1);
    });
    dynamicAgentsRef.current = [];

    isInstanceDemoRunningRef.current = false;
    demoQueueRef.current = [];
    setDemoInstanceStep(0);
    setDemoStatusMessage("");
    setShowCeoApprovalCard(false);
    setCeoApprovalStatus("pending");
  }, []);

  const handleApproveCeo = useCallback(() => {
    setCeoApprovalStatus("approved");
    setDemoInstanceStep(4);
    setDemoStatusMessage(
      "Langkah 4/7: CEO menyetujui penambahan. Menginstruksikan Operasional."
    );
    choreoEngineRef.current.say(
      MANAGER_AGENT_NAME,
      "Penambahan disetujui. HEPHAESTUS, siapkan fasilitasnya!",
      2200
    );

    demoTimerRef.current = setTimeout(() => {
      setShowCeoApprovalCard(false);
      // LANGKAH 5: Operasional menyiapkan meja
      setDemoInstanceStep(5);
      setDemoStatusMessage(
        "Langkah 5/7: HEPHAESTUS (Operasional) menyiapkan meja kerja baru"
      );
      choreoEngineRef.current.say(
        "HEPHAESTUS",
        "Siap! Menyiapkan meja kerja baru di Ruang Iklan...",
        2200
      );

      const adsRoom = ROOMS.find((r) => r.id === "ads" || r.id === "advertiser")!;
      // Buat meja dinamis dengan status "disiapkan"
      const deskRes = createDeskMesh(adsRoom, 3, "disiapkan");
      dynamicDesksRef.current.push(deskRes);
      const adsRec = roomRecordsRef.current["advertiser"] || roomRecordsRef.current["ads"];
      if (adsRec) {
        adsRec.group.add(deskRes.group);
      }

      demoTimerRef.current = setTimeout(() => {
        // LANGKAH 6: Deploy Agen Baru
        setDemoInstanceStep(6);
        setDemoStatusMessage(
          "Langkah 6/7: Meja siap. Deploying Agent: ARTEMIS · Akun B"
        );

        // Hapus glow & tag persiapan
        if (deskRes.prepGlow) deskRes.prepGlow.visible = false;
        if (deskRes.prepTag && deskRes.prepTag.element.parentNode) {
          deskRes.prepTag.element.parentNode.removeChild(deskRes.prepTag.element);
        }

        const slotPos = calculateRoomSlotPosition(adsRoom, 3, true);
        const agentRes = createAgentCharacter({
          instanceId: "inst_ads_akun_b",
          label: "ARTEMIS · Akun B",
          role: "Pengelola Kampanye (Akun B)",
          color: "#38bdf8",
          initialPos: slotPos.world,
          status: "working",
          onClick: () => {
            setSelected({ type: "agent_instance", id: "inst_ads_akun_b" });
          },
        });
        dynamicAgentsRef.current.push(agentRes);
        sceneRef.current?.add(agentRes.group);
        raycastHitMeshesRef.current.push(agentRes.hitMesh);

        // Balon ucapan agen baru
        if (agentRes.bubbleDiv) {
          agentRes.bubbleDiv.textContent =
            "Instance ARTEMIS Akun B aktif! Siap kerja.";
          agentRes.bubbleDiv.style.display = "block";
          agentRes.bubbleDiv.style.opacity = "1";
          setTimeout(() => {
            if (agentRes.bubbleDiv) {
              agentRes.bubbleDiv.style.opacity = "0";
              agentRes.bubbleDiv.style.display = "none";
            }
          }, 2600);
        }

        demoTimerRef.current = setTimeout(() => {
          // LANGKAH 7: Selesai & Aktif Bekerja
          setDemoInstanceStep(7);
          setDemoStatusMessage(
            "Langkah 7/7: Instance Agen aktif bekerja di Ruang Iklan (Selesai)"
          );
          isInstanceDemoRunningRef.current = false;

          // Jalankan antrean berikutnya jika ada
          if (demoQueueRef.current.length > 0) {
            const nextDemo = demoQueueRef.current.shift()!;
            nextDemo();
          }
        }, 1800);
      }, 2000);
    }, 1600);
  }, []);

  const handleRejectCeo = useCallback(() => {
    setCeoApprovalStatus("rejected");
    setDemoStatusMessage("Permohonan penambahan agen ditolak oleh CEO.");
    choreoEngineRef.current.say(
      MANAGER_AGENT_NAME,
      "Permintaan ditolak. Tetap gunakan tim yang ada saat ini.",
      2500
    );
    demoTimerRef.current = setTimeout(() => {
      setShowCeoApprovalCard(false);
      isInstanceDemoRunningRef.current = false;
      setDemoInstanceStep(0);
      setDemoStatusMessage("");
    }, 2000);
  }, []);

  const startInstanceDemoRef = useRef<(opts?: { autoApprove?: boolean }) => void>(() => {});

  const startInstanceDemo = useCallback(
    (opts?: { autoApprove?: boolean }) => {
      if (isInstanceDemoRunningRef.current) {
        demoQueueRef.current.push(() => startInstanceDemoRef.current(opts));
        setDemoStatusMessage(
          "Permintaan diantrekan (Antrean #" + demoQueueRef.current.length + ")"
        );
        return;
      }

      handleResetInstanceDemo();
      isInstanceDemoRunningRef.current = true;

      // LANGKAH 1: Permintaan diajukan ke HR
      setDemoInstanceStep(1);
      setDemoStatusMessage("Langkah 1/7: Kebutuhan Kapasitas Tim Iklan diajukan ke HR");
      choreoEngineRef.current.say(
        "HERA",
        "Menerima permohonan agen baru untuk Tim Iklan (Akun B)...",
        2000
      );

      demoTimerRef.current = setTimeout(() => {
        // LANGKAH 2: HERA Verifikasi
        setDemoInstanceStep(2);
        setDemoStatusMessage(
          "Langkah 2/7: HERA memverifikasi kapasitas ruangan & beban kerja"
        );
        choreoEngineRef.current.say(
          "HERA",
          "Kapasitas saat ini penuh. Mengajukan proposal penambahan ke CEO.",
          2000
        );

        demoTimerRef.current = setTimeout(() => {
          // LANGKAH 3: Muncul Kartu Approval CEO
          setDemoInstanceStep(3);
          setDemoStatusMessage(
            "Langkah 3/7: Menunggu Persetujuan CEO untuk Penambahan Agent"
          );
          setShowCeoApprovalCard(true);
          setCeoApprovalStatus("pending");
          choreoEngineRef.current.say(
            MANAGER_AGENT_NAME,
            "Permintaan agen diterima. Menunggu tanda tangan CEO...",
            2600
          );

          if (opts?.autoApprove) {
            demoTimerRef.current = setTimeout(() => {
              handleApproveCeo();
            }, 800);
          }
        }, 2000);
      }, 2000);
    },
    [handleApproveCeo, handleResetInstanceDemo]
  );
  useEffect(() => {
    startInstanceDemoRef.current = startInstanceDemo;
  }, [startInstanceDemo]);

  // Update agent status & material when agents prop changes (WITHOUT rebuilding scene)
  useEffect(() => {
    agents.forEach((a) => {
      const rec = agentRecordsRef.current[a.nama];
      if (rec) {
        const nextStatus = (a.status as AgentStatus) ?? "idle";
        if (rec.status !== nextStatus) {
          rec.status = nextStatus;
          const hex = getStatusColor(nextStatus);
          rec.statusLightMat.color.setHex(hex);
          rec.statusLightMat.emissive.setHex(hex);
          rec.dotSpan.className = `agent-dot3d st-${nextStatus}`;
          const isMini = rec.labelDiv.classList.contains("is-mini");
          rec.labelDiv.className = `agent-tag3d st-${nextStatus}${
            selectedRef.current?.type === "agent" && selectedRef.current.id === a.nama
              ? " sel"
              : ""
          }${isMini ? " is-mini" : ""}`;
          rec.labelDiv.setAttribute("data-status", nextStatus);
        }
      }
    });
  }, [agents]);

  const isFirstMountRef = useRef(true);
  const meetingReducedMotionOverrideRef = useRef<boolean | null>(null);

  // Update pergerakan agen saat gathered (rapat) berubah lewat ChoreographyEngine
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    const choreo = choreoEngineRef.current;
    if (!choreo) return;
    const meetingRoom = ROOMS.find((r) => r.meeting)!;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const motionOverride = meetingReducedMotionOverrideRef.current;
    meetingReducedMotionOverrideRef.current = null;
    const isReduced =
      motionOverride !== null ? motionOverride : prefersReducedMotion;

    if (gathered) {
      if (!choreo.isMeetingActive) {
        choreo.startMeeting(
          SEAT_BY_AGENT,
          { x: meetingRoom.x, y: meetingRoom.y },
          isReduced
        );
      }
    } else {
      if (choreo.isMeetingActive) {
        choreo.endMeeting(isReduced);
      }
    }
  }, [gathered]);

  // Update visual selection highlights
  useEffect(() => {
    // Rooms
    Object.entries(roomRecordsRef.current).forEach(([roomId, rRec]) => {
      const isSel =
        (selected?.type === "room" && selected.id === roomId) ||
        (selected?.type === "agent" && roomOfAgent(selected.id)?.id === roomId);
      rRec.floorMat.opacity = isSel ? 0.35 : 0.18;
      rRec.edgeMat.opacity = isSel ? 1.0 : 0.7;
      rRec.labelDiv.classList.toggle("sel", isSel);
    });

    // Agents
    Object.entries(agentRecordsRef.current).forEach(([agentName, aRec]) => {
      const isSel = selected?.type === "agent" && selected.id === agentName;
      aRec.labelDiv.classList.toggle("sel", isSel);
    });

    // Dynamic Agent Instances
    dynamicAgentsRef.current.forEach((aRec) => {
      const isSel =
        selected?.type === "agent_instance" &&
        selected.id === (aRec.hitMesh.userData.id as string);
      aRec.labelDiv.classList.toggle("sel", isSel);
    });
  }, [selected]);

  // Close info on click outside or Escape
  useEffect(() => {
    if (!infoOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        infoContainerRef.current &&
        !infoContainerRef.current.contains(event.target as Node)
      ) {
        setInfoOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [infoOpen]);

  // Main Three.js Scene Setup & Animation Loop
  // STRICT ATURAN KERAS: Deps hanya [webglSupported]! Jangan pemicu rebuild scene.
  useEffect(() => {
    if (!webglSupported) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setWebglInitError(true));
      return;
    }

    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    renderer.setSize(width, height, false);

    validateFloorplan(FLOORPLAN);
    const propsValidation = validatePropsPlacement(
      FLOORPLAN.doors,
      FLOORPLAN.rooms,
      SEAT_BY_AGENT,
      HOME_POSITIONS,
      ALL_PLACED_PROPS,
      FLOORPLAN.bays
    );
    if (!propsValidation.valid) {
      throw new Error(
        `[Stage3D] Props validation failed: ${propsValidation.errors.join("; ")}`
      );
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, -200, 500);
    updateCameraFrustum(camera, width, height);
    camera.position.copy(INIT_CAM_POS);
    camera.lookAt(INIT_CAM_TARGET);
    cameraRef.current = camera;

    // CSS2D Renderer for labels
    const cssRenderer = new CSS2DRenderer();
    cssRenderer.setSize(width, height);
    cssRenderer.domElement.style.position = "absolute";
    cssRenderer.domElement.style.top = "0";
    cssRenderer.domElement.style.left = "0";
    cssRenderer.domElement.style.pointerEvents = "none";
    cssRenderer.domElement.style.zIndex = "10";
    cssRenderer.domElement.className = "stage-3d-css-layer";
    container.appendChild(cssRenderer.domElement);
    if (shotModeRef.current) {
      cssRenderer.domElement.style.display = "none";
    }
    cssRendererRef.current = cssRenderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(INIT_CAM_TARGET);
    controls.minDistance = 8;
    controls.maxDistance = 75;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minPolarAngle = 0.12;
    controls.listenToKeyEvents(window);

    // Pan clamping agar denah tidak hilang
    controls.addEventListener("change", () => {
      controls.target.x = Math.max(-5, Math.min(45, controls.target.x));
      controls.target.y = Math.max(-2, Math.min(6, controls.target.y));
      controls.target.z = Math.max(-5, Math.min(40, controls.target.z));
    });

    // Lighting (diinisialisasi dengan DaylightController)
    const daylight = daylightControllerRef.current;
    const choreo = choreoEngineRef.current;

    const ambientLight = new THREE.AmbientLight(0xfffbf2, 1.55);
    scene.add(ambientLight);

    // Directional light utama kiri-atas dari sudut pandang isometrik tenggara
    const dirLight1 = new THREE.DirectionalLight(0xfffaed, 1.65);
    dirLight1.position.set(-15, 42, 45);
    dirLight1.target.position.set(20.5, 0, 17.0);
    scene.add(dirLight1);
    scene.add(dirLight1.target);

    // Directional light sekunder (fill light)
    const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.75);
    dirLight2.position.set(50, 28, 20);
    dirLight2.target.position.set(20.5, 0, 17.0);
    scene.add(dirLight2);
    scene.add(dirLight2.target);

    scene.background = new THREE.Color(THEME.background.day);

    const meetingPoint = new THREE.PointLight(0xb7f34a, 0.6, 14);
    meetingPoint.position.set(7.5, 2.5, 4.5);
    scene.add(meetingPoint);

    // Visual koridor halus di sela pelat
    const walkwayVisuals = createWalkwayVisuals();
    walkwayVisuals.group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh || (c as THREE.LineSegments).isLineSegments) {
        c.userData.isStatic = true;
      }
    });
    scene.add(walkwayVisuals.group);

    // Track raycast hit targets
    const raycastHitMeshes: THREE.Mesh[] = [];
    raycastHitMeshesRef.current = raycastHitMeshes;
    const floorMaterials: THREE.MeshStandardMaterial[] = [];

    // Merged Static Geometry: High Walls, Low Cutaway Walls, Door Sills, Corridors, Bays
    const WALL_THICKNESS = 0.16;
    const WALL_HIGH = 2.4;
    const WALL_LOW = 0.65;
    const SILL_HEIGHT = 0.04;

    const highWallGeos: THREE.BufferGeometry[] = [];
    const lowWallGeos: THREE.BufferGeometry[] = [];
    const sillGeos: THREE.BufferGeometry[] = [];
    const corridorGeos: THREE.BufferGeometry[] = [];
    const bayGeos: THREE.BufferGeometry[] = [];

    // Corridors
    FLOORPLAN.corridors.forEach((c) => {
      const geo = new THREE.BoxGeometry(c.w, 0.06, c.d);
      geo.translate(c.x + c.w / 2, -0.035, c.z + c.d / 2);
      corridorGeos.push(geo);
    });

    // Open common areas (atrium, atrium_selatan, taman_kecil)
    FLOORPLAN.rooms
      .filter((r) => r.kind === "common" && r.doors.length === 0)
      .forEach((cr) => {
        if (cr.id === "taman_kecil") {
          const tGeo = new THREE.BoxGeometry(cr.w, 0.08, cr.d);
          const tMat = new THREE.MeshStandardMaterial({
            color: THEME.commonFloors.taman_kecil,
            roughness: 0.45,
            metalness: 0.05,
          });
          floorMaterials.push(tMat);
          const tMesh = new THREE.Mesh(tGeo, tMat);
          tMesh.position.set(cr.x + cr.w / 2, -0.04, cr.z + cr.d / 2);
          tMesh.name = `floor_${cr.id}`;
          tMesh.userData.isStatic = true;
          scene.add(tMesh);
        } else {
          const geo = new THREE.BoxGeometry(cr.w, 0.06, cr.d);
          geo.translate(cr.x + cr.w / 2, -0.035, cr.z + cr.d / 2);
          corridorGeos.push(geo);
        }
      });

    // Bays (hatched floor)
    FLOORPLAN.bays.forEach((b) => {
      const geo = new THREE.BoxGeometry(b.w, 0.06, b.d);
      geo.translate(b.x + b.w / 2, -0.035, b.z + b.d / 2);
      bayGeos.push(geo);
    });

    // Walls & door sills for enclosed rooms
    const enclosedRooms = FLOORPLAN.rooms.filter(
      (r) => r.kind === "dept" || r.doors.length > 0
    );

    enclosedRooms.forEach((r) => {
      const sides: WallSide[] = ["N", "W", "S", "E"];
      sides.forEach((side) => {
        const isHigh = side === "N" || side === "W";
        const wallH = isHigh ? WALL_HIGH : WALL_LOW;
        const targetGeos = isHigh ? highWallGeos : lowWallGeos;
        const sideDoors = r.doors
          .filter((d) => d.side === side)
          .sort((a, b) => a.offset - b.offset);

        if (side === "N" || side === "S") {
          const zCoord = side === "N" ? r.z : r.z + r.d;
          let curX = 0;
          for (const door of sideDoors) {
            if (door.offset > curX) {
              const segW = door.offset - curX;
              const geo = new THREE.BoxGeometry(segW, wallH, WALL_THICKNESS);
              geo.translate(r.x + curX + segW / 2, wallH / 2, zCoord);
              targetGeos.push(geo);
            }
            const sillGeo = new THREE.BoxGeometry(door.width, SILL_HEIGHT, WALL_THICKNESS);
            sillGeo.translate(r.x + door.offset + door.width / 2, SILL_HEIGHT / 2, zCoord);
            sillGeos.push(sillGeo);
            curX = door.offset + door.width;
          }
          if (curX < r.w) {
            const segW = r.w - curX;
            const geo = new THREE.BoxGeometry(segW, wallH, WALL_THICKNESS);
            geo.translate(r.x + curX + segW / 2, wallH / 2, zCoord);
            targetGeos.push(geo);
          }
        } else {
          const xCoord = side === "W" ? r.x : r.x + r.w;
          let curZ = 0;
          for (const door of sideDoors) {
            if (door.offset > curZ) {
              const segD = door.offset - curZ;
              const geo = new THREE.BoxGeometry(WALL_THICKNESS, wallH, segD);
              geo.translate(xCoord, wallH / 2, r.z + curZ + segD / 2);
              targetGeos.push(geo);
            }
            const sillGeo = new THREE.BoxGeometry(WALL_THICKNESS, SILL_HEIGHT, door.width);
            sillGeo.translate(xCoord, SILL_HEIGHT / 2, r.z + door.offset + door.width / 2);
            sillGeos.push(sillGeo);
            curZ = door.offset + door.width;
          }
          if (curZ < r.d) {
            const segD = r.d - curZ;
            const geo = new THREE.BoxGeometry(WALL_THICKNESS, wallH, segD);
            geo.translate(xCoord, wallH / 2, r.z + curZ + segD / 2);
            targetGeos.push(geo);
          }
        }
      });
    });

    const highWallMat = new THREE.MeshStandardMaterial({
      color: THEME.walls.high,
      roughness: THEME.walls.highRoughness,
      metalness: THEME.walls.highMetalness,
    });
    const lowWallMat = new THREE.MeshStandardMaterial({
      color: THEME.walls.low,
      roughness: THEME.walls.lowRoughness,
      metalness: THEME.walls.lowMetalness,
    });
    const sillMat = new THREE.MeshStandardMaterial({
      color: THEME.walls.doorSill,
      roughness: THEME.walls.doorSillRoughness,
      metalness: THEME.walls.doorSillMetalness,
    });
    const corridorMat = new THREE.MeshStandardMaterial({
      color: THEME.corridor.floor,
      roughness: THEME.corridor.floorRoughness,
      metalness: THEME.corridor.floorMetalness,
    });
    const hatchedTex = createHatchedTexture();
    const bayMat = new THREE.MeshStandardMaterial({
      map: hatchedTex,
      roughness: 0.45,
      metalness: 0.1,
    });

    let highWallMesh: THREE.Mesh | null = null;
    let lowWallMesh: THREE.Mesh | null = null;
    let sillMesh: THREE.Mesh | null = null;
    let corridorMesh: THREE.Mesh | null = null;
    let bayMesh: THREE.Mesh | null = null;

    if (highWallGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(highWallGeos, false);
      if (merged) {
        highWallMesh = new THREE.Mesh(merged, highWallMat);
        highWallMesh.name = "highWalls";
        highWallMesh.userData.isStatic = true;
        scene.add(highWallMesh);
      }
    }
    if (lowWallGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(lowWallGeos, false);
      if (merged) {
        lowWallMesh = new THREE.Mesh(merged, lowWallMat);
        lowWallMesh.name = "lowWalls";
        lowWallMesh.userData.isStatic = true;
        scene.add(lowWallMesh);
      }
    }
    if (sillGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(sillGeos, false);
      if (merged) {
        sillMesh = new THREE.Mesh(merged, sillMat);
        sillMesh.name = "doorSills";
        sillMesh.userData.isStatic = true;
        scene.add(sillMesh);
      }
    }
    if (corridorGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(corridorGeos, false);
      if (merged) {
        corridorMesh = new THREE.Mesh(merged, corridorMat);
        corridorMesh.name = "corridors";
        corridorMesh.userData.isStatic = true;
        scene.add(corridorMesh);
      }
    }
    if (bayGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(bayGeos, false);
      if (merged) {
        bayMesh = new THREE.Mesh(merged, bayMat);
        bayMesh.name = "expansionBays";
        bayMesh.userData.isStatic = true;
        scene.add(bayMesh);
      }
    }

    // Build Rooms
    const roomRecords: Record<string, Room3DRecord> = {};

    ROOMS.forEach((room) => {
      const roomGroup = new THREE.Group();
      const cx = room.x + room.w / 2;
      const cz = room.z + room.d / 2;
      const roomColorHex = new THREE.Color(room.color).getHex();

      // Pelat lantai SOLID dilunakkan (softened 60% putih / THEME.deptFloors)
      const customDeptColor = THEME.deptFloors?.[room.id as keyof typeof THEME.deptFloors];
      const softenedColorHex = customDeptColor
        ? new THREE.Color(customDeptColor).getHex()
        : softenColor(room.color, THEME.roomFloor.whiteMixRatio);
      const floorBoxGeo = new THREE.BoxGeometry(room.w, 0.08, room.d);
      const floorMat = new THREE.MeshStandardMaterial({
        color: softenedColorHex,
        roughness: THEME.roomFloor.roughness,
        metalness: THEME.roomFloor.metalness,
      });
      floorMaterials.push(floorMat);

      const floorMesh = new THREE.Mesh(floorBoxGeo, floorMat);
      floorMesh.position.set(cx, -0.04, cz);
      floorMesh.name = `floor_${room.id}`;
      floorMesh.userData.isStatic = true;
      roomGroup.add(floorMesh);

      // Glowing edges
      const floorEdgesGeo = new THREE.EdgesGeometry(floorBoxGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: roomColorHex,
        transparent: true,
        opacity: THEME.roomFloor.edgeOpacity,
      });
      const edgeLines = new THREE.LineSegments(floorEdgesGeo, edgeMat);
      edgeLines.position.set(cx, -0.04, cz);
      edgeLines.name = `floorEdges_${room.id}`;
      edgeLines.userData.isStatic = true;
      roomGroup.add(edgeLines);

      // Desks / Furniture
      if (room.meeting) {
        // Ruang Meeting ditangani oleh voxel props Tahap 2a
      } else if (room.id === MANAGER_ROOM_ID) {
        // Meja dan kursi ATLAS ditangani oleh voxel props Tahap 2a.
        // Nampan persetujuan (approval tray) dipertahankan untuk reaktivitas status approval CEO.
        const trayGeo = new THREE.BoxGeometry(0.36, 0.06, 0.26);
        const trayMat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          emissive: 0xf07167,
          emissiveIntensity: 0.25,
          roughness: 0.35,
        });
        inboxTrayMatRef.current = trayMat;
        const trayMesh = new THREE.Mesh(trayGeo, trayMat);
        trayMesh.position.set(5.2, 0.47, 15.8);
        trayMesh.name = "mgrTray";
        trayMesh.userData.isStatic = true;
        roomGroup.add(trayMesh);

        const papersGeo = new THREE.BoxGeometry(0.28, 0.02, 0.20);
        const papersMat = new THREE.MeshStandardMaterial({ color: THEME.props.tech.paper, roughness: 0.6 });
        const papersMesh = new THREE.Mesh(papersGeo, papersMat);
        papersMesh.position.set(5.2, 0.51, 15.8);
        papersMesh.name = "mgrPapers";
        papersMesh.userData.isStatic = true;
        roomGroup.add(papersMesh);
      } else if (room.id === "hr") {
        // HR Desk at (4.5, 0.24, 23.8)
        const hrDeskGeo = new THREE.BoxGeometry(2.0, 0.48, 0.7);
        const hrDeskMat = new THREE.MeshStandardMaterial({
          color: THEME.furniture.hrDesk,
          roughness: 0.35,
          metalness: 0.25,
        });
        const hrDeskMesh = new THREE.Mesh(hrDeskGeo, hrDeskMat);
        hrDeskMesh.position.set(4.5, 0.24, 23.8);
        hrDeskMesh.name = "hrDesk";
        hrDeskMesh.userData.isStatic = true;
        roomGroup.add(hrDeskMesh);

        const hrDeskEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(hrDeskGeo),
          new THREE.LineBasicMaterial({ color: roomColorHex, transparent: true, opacity: 0.8 })
        );
        hrDeskEdges.position.copy(hrDeskMesh.position);
        hrDeskEdges.name = "hrDeskEdges";
        hrDeskEdges.userData.isStatic = true;
        roomGroup.add(hrDeskEdges);

        const hrChair = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.08, 0.45),
          new THREE.MeshStandardMaterial({ color: THEME.furniture.chair, roughness: 0.5 })
        );
        hrChair.position.set(4.5, 0.24, 22.4);
        hrChair.name = "hrChair";
        hrChair.userData.isStatic = true;
        roomGroup.add(hrChair);

        const hrMon = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 0.28, 0.04),
          new THREE.MeshStandardMaterial({
            color: roomColorHex,
            emissive: roomColorHex,
            emissiveIntensity: 0.5,
          })
        );
        hrMon.position.set(4.5, 0.62, 23.9);
        hrMon.name = "hrMon";
        hrMon.userData.isStatic = true;
        roomGroup.add(hrMon);

        // Portal Onboarding at (7.0, 0.85, 21.3)
        const pField = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.6, 0.05),
          new THREE.MeshStandardMaterial({
            color: roomColorHex,
            emissive: roomColorHex,
            emissiveIntensity: 0.65,
            transparent: true,
            opacity: 0.45,
          })
        );
        pField.position.set(7.0, 0.85, 21.3);
        pField.name = "hrPortal";
        pField.userData.isStatic = true;
        roomGroup.add(pField);

        // Lounge Sofa at (2.0, 0.14, 23.8)
        const sofa = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.28, 0.6),
          new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 })
        );
        sofa.position.set(2.0, 0.14, 23.8);
        sofa.name = "hrSofa";
        sofa.userData.isStatic = true;
        roomGroup.add(sofa);
      } else if (room.id === "operasional") {
        // Furnitur dan rak operasional ditangani oleh voxel props Tahap 2a
      } else if (room.id === "sosmed") {
        // Creative Desk at (5.0, 0.22, 31.3)
        const sosDeskGeo = new THREE.BoxGeometry(1.85, 0.44, 0.72);
        const sosDeskMat = new THREE.MeshStandardMaterial({
          color: THEME.furniture.sosmedDesk,
          roughness: 0.35,
          metalness: 0.25,
        });
        const sosDeskMesh = new THREE.Mesh(sosDeskGeo, sosDeskMat);
        sosDeskMesh.position.set(5.0, 0.22, 31.3);
        sosDeskMesh.name = "sosDesk";
        sosDeskMesh.userData.isStatic = true;
        roomGroup.add(sosDeskMesh);

        const sosDeskEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(sosDeskGeo),
          new THREE.LineBasicMaterial({ color: roomColorHex, transparent: true, opacity: 0.75 })
        );
        sosDeskEdges.position.copy(sosDeskMesh.position);
        sosDeskEdges.name = "sosDeskEdges";
        sosDeskEdges.userData.isStatic = true;
        roomGroup.add(sosDeskEdges);

        const sosChair = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.08, 0.45),
          new THREE.MeshStandardMaterial({ color: THEME.furniture.chair, roughness: 0.5 })
        );
        sosChair.position.set(5.0, 0.24, 29.9);
        sosChair.name = "sosChair";
        sosChair.userData.isStatic = true;
        roomGroup.add(sosChair);

        const ultrawideMon = new THREE.Mesh(
          new THREE.BoxGeometry(0.78, 0.34, 0.04),
          new THREE.MeshStandardMaterial({
            color: roomColorHex,
            emissive: roomColorHex,
            emissiveIntensity: 0.55,
          })
        );
        ultrawideMon.position.set(5.0, 0.62, 31.4);
        ultrawideMon.name = "sosMon";
        ultrawideMon.userData.isStatic = true;
        roomGroup.add(ultrawideMon);

        // Tripod & Ring light at (2.5, 0.55, 30.5)
        const tripod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 })
        );
        tripod.position.set(2.5, 0.55, 30.5);
        tripod.name = "sosTripod";
        tripod.userData.isStatic = true;
        roomGroup.add(tripod);

        const ringLight = new THREE.Mesh(
          new THREE.TorusGeometry(0.18, 0.025, 8, 24),
          new THREE.MeshStandardMaterial({ color: 0xfff5e6, emissive: 0xfff5e6, emissiveIntensity: 1.2 })
        );
        ringLight.position.set(2.5, 1.15, 30.5);
        ringLight.name = "sosRingLight";
        ringLight.userData.isStatic = true;
        roomGroup.add(ringLight);
      } else if (room.id !== "riset") {
        // Regular room desks for agents (Advertiser, Creative, Copy, Landing Page - UNTOUCHED)
        // Riset ditangani oleh voxel props Tahap 2a.
        const deskMat = new THREE.MeshStandardMaterial({
          color: THEME.furniture.desk,
          roughness: THEME.furniture.deskRoughness,
          metalness: THEME.furniture.deskMetalness,
        });
        const deskEdgeMat = new THREE.LineBasicMaterial({
          color: roomColorHex,
          transparent: true,
          opacity: 0.5,
        });
        const chairMat = new THREE.MeshStandardMaterial({
          color: THEME.furniture.chair,
          roughness: THEME.furniture.chairRoughness,
          metalness: THEME.furniture.chairMetalness,
        });
        const monMat = new THREE.MeshStandardMaterial({
          color: THEME.furniture.monitorScreen,
          emissive: THEME.furniture.monitorScreen,
          emissiveIntensity: 0.4,
        });

        const deskGeos: THREE.BufferGeometry[] = [];
        const deskEdgeGeos: THREE.BufferGeometry[] = [];
        const monGeos: THREE.BufferGeometry[] = [];
        const chairGeos: THREE.BufferGeometry[] = [];

        room.agents.forEach((agentName) => {
          const hp = HOME_POSITIONS[agentName];
          if (!hp) return;
          const dx = hp[0];
          const dz = hp[1] + 0.8;

          const dg = new THREE.BoxGeometry(1.6, 0.44, 0.7);
          dg.translate(dx, 0.22, dz);
          deskGeos.push(dg);

          const baseDesk = new THREE.BoxGeometry(1.6, 0.44, 0.7);
          const eg = new THREE.EdgesGeometry(baseDesk);
          eg.translate(dx, 0.22, dz);
          deskEdgeGeos.push(eg);
          baseDesk.dispose();

          const mg = new THREE.BoxGeometry(0.38, 0.24, 0.04);
          mg.translate(dx, 0.56, dz - 0.08);
          monGeos.push(mg);

          const cg = new THREE.BoxGeometry(0.44, 0.08, 0.44);
          cg.translate(dx, 0.24, hp[1] - 0.4);
          chairGeos.push(cg);
        });

        if (deskGeos.length > 0) {
          const mergedDesks = BufferGeometryUtils.mergeGeometries(deskGeos, false);
          if (mergedDesks) {
            const m = new THREE.Mesh(mergedDesks, deskMat);
            m.name = `desks_${room.id}`;
            m.userData.isStatic = true;
            roomGroup.add(m);
          }
        }

        if (deskEdgeGeos.length > 0) {
          const mergedDeskEdges = BufferGeometryUtils.mergeGeometries(deskEdgeGeos, false);
          if (mergedDeskEdges) {
            const m = new THREE.LineSegments(mergedDeskEdges, deskEdgeMat);
            m.name = `deskEdges_${room.id}`;
            m.userData.isStatic = true;
            roomGroup.add(m);
          }
        }

        if (monGeos.length > 0) {
          const mergedMons = BufferGeometryUtils.mergeGeometries(monGeos, false);
          if (mergedMons) {
            const m = new THREE.Mesh(mergedMons, monMat);
            m.name = `monitors_${room.id}`;
            m.userData.isStatic = true;
            roomGroup.add(m);
          }
        }

        if (chairGeos.length > 0) {
          const mergedChairs = BufferGeometryUtils.mergeGeometries(chairGeos, false);
          if (mergedChairs) {
            const m = new THREE.Mesh(mergedChairs, chairMat);
            m.name = `chairs_${room.id}`;
            m.userData.isStatic = true;
            roomGroup.add(m);
          }
        }
      }

      // Invisible Hitbox for clicking the room floor
      const hitGeo = new THREE.BoxGeometry(room.w, 0.3, room.d);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.set(cx, 0.15, cz);
      hitMesh.userData = { type: "room", id: room.id };
      roomGroup.add(hitMesh);
      raycastHitMeshes.push(hitMesh);

      // Room CSS2D Label
      const labelDiv = document.createElement("div");
      labelDiv.className = "room-tag3d";
      labelDiv.style.setProperty("--c", room.color);
      labelDiv.textContent = room.name;
      labelDiv.setAttribute("role", "button");
      labelDiv.setAttribute("tabindex", "0");
      labelDiv.setAttribute("aria-label", `Ruangan ${room.name}`);
      labelDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        handlersRef.current.selectRoom(room.id);
      });
      labelDiv.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlersRef.current.selectRoom(room.id);
        }
      });

      const labelObj = new CSS2DObject(labelDiv);
      labelObj.position.set(cx, 1.6, room.z + 1.2);
      roomGroup.add(labelObj);

      scene.add(roomGroup);

      const record: Room3DRecord = {
        group: roomGroup,
        floorMesh,
        floorMat,
        edgeLines,
        edgeMat,
        hitMesh,
        labelObj,
        labelDiv,
      };
      roomRecords[room.id] = record;
      if (room.id === "advertiser") roomRecords["ads"] = record;
      if (room.id === "landing_page") roomRecords["lp"] = record;
    });

    // Enclosed Common Rooms (pantry, lounge, toilet, taman, resepsi)
    FLOORPLAN.rooms
      .filter((r) => r.kind === "common" && r.doors.length > 0)
      .forEach((cRoom) => {
        const roomGroup = new THREE.Group();
        const cx = cRoom.x + cRoom.w / 2;
        const cz = cRoom.z + cRoom.d / 2;
        const roomColorHex = new THREE.Color(cRoom.color).getHex();
        const commonColorHex =
          THEME.commonFloors[cRoom.id as keyof typeof THEME.commonFloors] ||
          softenColor(cRoom.color, 0.60);

        const floorBoxGeo = new THREE.BoxGeometry(cRoom.w, 0.08, cRoom.d);
        const floorMat = new THREE.MeshStandardMaterial({
          color: commonColorHex,
          roughness: THEME.roomFloor.roughness,
          metalness: THEME.roomFloor.metalness,
        });
        floorMaterials.push(floorMat);

        const floorMesh = new THREE.Mesh(floorBoxGeo, floorMat);
        floorMesh.position.set(cx, -0.04, cz);
        floorMesh.name = `floor_${cRoom.id}`;
        floorMesh.userData.isStatic = true;
        roomGroup.add(floorMesh);

        const floorEdgesGeo = new THREE.EdgesGeometry(floorBoxGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: roomColorHex,
          transparent: true,
          opacity: THEME.roomFloor.edgeOpacity,
        });
        const edgeLines = new THREE.LineSegments(floorEdgesGeo, edgeMat);
        edgeLines.position.set(cx, -0.04, cz);
        edgeLines.name = `floorEdges_${cRoom.id}`;
        edgeLines.userData.isStatic = true;
        roomGroup.add(edgeLines);

        const hitGeo = new THREE.BoxGeometry(cRoom.w, 0.3, cRoom.d);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.set(cx, 0.15, cz);
        hitMesh.userData = { type: "room", id: cRoom.id };
        roomGroup.add(hitMesh);
        raycastHitMeshes.push(hitMesh);

        const labelDiv = document.createElement("div");
        labelDiv.className = "room-tag3d";
        labelDiv.style.setProperty("--c", cRoom.color);
        labelDiv.textContent = cRoom.label.toUpperCase();
        labelDiv.setAttribute("role", "button");
        labelDiv.setAttribute("tabindex", "0");
        labelDiv.setAttribute("aria-label", `Ruangan ${cRoom.label}`);
        labelDiv.addEventListener("click", (e) => {
          e.stopPropagation();
          handlersRef.current.selectRoom(cRoom.id);
        });
        labelDiv.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlersRef.current.selectRoom(cRoom.id);
          }
        });

        const labelObj = new CSS2DObject(labelDiv);
        labelObj.position.set(cx, 1.6, cRoom.z + 1.2);
        roomGroup.add(labelObj);

        scene.add(roomGroup);

        roomRecords[cRoom.id] = {
          group: roomGroup,
          floorMesh,
          floorMat,
          edgeLines,
          edgeMat,
          hitMesh,
          labelObj,
          labelDiv,
        };
      });

    roomRecordsRef.current = roomRecords;
    floorMaterialsRef.current = floorMaterials;

    // =========================================================================
    // TAHAP 2A: VOXEL PROPS & INSTANCED MESHES (4 DEPT & COMMON AREAS)
    // =========================================================================
    const dummy = new THREE.Object3D();

    // 1. Instanced Chairs (19 meeting chairs + 19 home desk chairs = 38 chairs)
    const chairGeo = PROPS_REGISTRY["chair_single"].createGeometry();
    const chairMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.1,
    });
    const chairPositions: { x: number; y: number; z: number; rotY?: number }[] = [];

    // 19 meeting chairs
    Object.values(SEAT_BY_AGENT).forEach(([sx, sz]) => {
      const rotY = sz < 4.5 ? 0 : Math.PI;
      chairPositions.push({ x: sx, y: 0, z: sz, rotY });
    });

    // 19 home desk chairs
    Object.entries(HOME_POSITIONS).forEach(([agentName, [hx, hz]]) => {
      let rotY = 0;
      if (
        ["THEIA", "LYRA", "IRIS", "CLIO", "ERATO", "DAPHNE", "HERMES", "THEMIS", "TALOS"].includes(
          agentName
        )
      ) {
        rotY = Math.PI;
      }
      chairPositions.push({ x: hx, y: 0, z: hz, rotY });
    });

    const instancedChairs = new THREE.InstancedMesh(chairGeo, chairMat, chairPositions.length);
    instancedChairs.name = "instanced_chairs";
    instancedChairs.userData.isStatic = true;
    chairPositions.forEach((pos, idx) => {
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.rotation.set(0, pos.rotY ?? 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instancedChairs.setMatrixAt(idx, dummy.matrix);
    });
    instancedChairs.instanceMatrix.needsUpdate = true;
    scene.add(instancedChairs);

    // Helper generator instanced mesh per propId
    function createInstancedPropsFromList(
      propId: string,
      meshName: string,
      matParams: THREE.MeshStandardMaterialParameters = {}
    ) {
      const items = ALL_PLACED_PROPS.filter((p) => p.propId === propId);
      if (items.length === 0) return null;
      const def = PROPS_REGISTRY[propId];
      if (!def) return null;
      const geo = def.createGeometry();
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.1,
        ...matParams,
      });
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      im.name = meshName;
      im.userData.isStatic = true;
      items.forEach((p, idx) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotY ?? 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(idx, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
      return im;
    }

    createInstancedPropsFromList("potted_plant", "instanced_plants", { roughness: 0.6, metalness: 0.05 });
    createInstancedPropsFromList("voxel_tree", "instanced_trees", { roughness: 0.7, metalness: 0.05 });
    createInstancedPropsFromList("dining_table", "instanced_dining_tables", { roughness: 0.4, metalness: 0.15 });
    createInstancedPropsFromList("toilet_cubicle", "instanced_toilet_cubicles", { roughness: 0.4, metalness: 0.1 });
    createInstancedPropsFromList("manager_coffee_table", "instanced_coffee_tables", { roughness: 0.4, metalness: 0.15 });
    createInstancedPropsFromList("atrium_bench", "instanced_benches", { roughness: 0.5, metalness: 0.2 });
    createInstancedPropsFromList("ops_shelving", "instanced_ops_shelving", { roughness: 0.5, metalness: 0.2 });
    createInstancedPropsFromList("beanbag", "instanced_beanbags", { roughness: 0.6, metalness: 0.05 });
    createInstancedPropsFromList("advertiser_desk", "instanced_advertiser_desks", { roughness: 0.4, metalness: 0.15 });
    createInstancedPropsFromList("creative_drafting_desk", "instanced_creative_desks", { roughness: 0.5, metalness: 0.1 });
    createInstancedPropsFromList("copy_desk", "instanced_copy_desks", { roughness: 0.5, metalness: 0.1 });
    createInstancedPropsFromList("landing_page_desk", "instanced_lp_desks", { roughness: 0.4, metalness: 0.15 });

    const instancedPropIds = new Set([
      "potted_plant",
      "voxel_tree",
      "dining_table",
      "toilet_cubicle",
      "manager_coffee_table",
      "atrium_bench",
      "ops_shelving",
      "beanbag",
      "chair_single",
      "manager_chair",
      "advertiser_desk",
      "creative_drafting_desk",
      "copy_desk",
      "landing_page_desk",
    ]);

    // Unique Voxel Props
    ALL_PLACED_PROPS.forEach((prop) => {
      if (instancedPropIds.has(prop.propId)) return;
      const def = PROPS_REGISTRY[prop.propId];
      if (!def) return;

      const geo = def.createGeometry(prop.options);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(prop.x, prop.y, prop.z);
      if (prop.rotY) mesh.rotation.y = prop.rotY;
      mesh.name = `prop_${prop.id}`;
      mesh.userData.isStatic = true;

      const targetGroup = roomRecords[prop.roomId]?.group ?? scene;
      targetGroup.add(mesh);

      if (def.createEmissiveGeometry) {
        const emGeo = def.createEmissiveGeometry(prop.options);
        const emMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          emissive: 0xffffff,
          emissiveIntensity: 0.8,
          roughness: 0.2,
        });
        const emMesh = new THREE.Mesh(emGeo, emMat);
        emMesh.position.set(prop.x, prop.y, prop.z);
        if (prop.rotY) emMesh.rotation.y = prop.rotY;
        emMesh.name = `prop_em_${prop.id}`;
        emMesh.userData.isStatic = true;
        targetGroup.add(emMesh);
      }
    });

    // =========================================================================
    // TAHAP 3: KARAKTER MANUSIA VOXEL HIDUP (19 AGEN)
    // =========================================================================
    const agentRecords: Record<string, Agent3DRecord> = {};

    AGENT_RENDER_ORDER.forEach((name, i) => {
      const cfg = AGENTS[name];
      const agentColor = colorOfAgent(name);
      const currentAgents = agentsRef.current;
      const agentRow = currentAgents.find((a) => a.nama === name);
      const currentStatus: AgentStatus = (agentRow?.status as AgentStatus) ?? "idle";

      // Initial position
      const isGatheredNow = gatheredRef.current;
      let startX: number;
      let startZ: number;

      if (isGatheredNow) {
        const seat = SEAT_BY_AGENT[name];
        if (!seat) {
          throw new Error(
            `[OfficeStage3D] Kursi rapat tidak ditemukan untuk agen "${name}" di SEAT_BY_AGENT`
          );
        }
        startX = seat[0];
        startZ = seat[1];
      } else {
        const hp = HOME_POSITIONS[name];
        startX = hp[0];
        startZ = hp[1];
      }

      const dept = roomOfAgent(name)?.id ?? "manager";
      const vHuman = createVoxelHuman({
        name,
        department: dept,
        lead: cfg.lead ?? false,
        status: currentStatus,
        color: agentColor,
        initialPos: { x: startX, y: 0, z: startZ },
        role: cfg.role,
        onClick: () => {
          handlersRef.current.selectAgent(name);
        },
      });

      scene.add(vHuman.group);
      raycastHitMeshes.push(vHuman.hitMesh);

      const record: Agent3DRecord = {
        group: vHuman.group,
        bodyMesh: vHuman.bodyMesh,
        headGroup: vHuman.headGroup,
        headMesh: vHuman.headMesh,
        leftArm: vHuman.leftArm,
        rightArm: vHuman.rightArm,
        leftLeg: vHuman.leftLeg,
        rightLeg: vHuman.rightLeg,
        shadowMesh: vHuman.shadowMesh,
        statusLightMesh: vHuman.statusLightMesh,
        statusLightMat: vHuman.statusLightMat,
        hitMesh: vHuman.hitMesh,
        labelObj: vHuman.labelObj,
        labelDiv: vHuman.labelDiv,
        dotSpan: vHuman.dotSpan,
        bubbleDiv: vHuman.bubbleDiv,
        targetPos: new THREE.Vector3(startX, 0, startZ),
        currentPos: new THREE.Vector3(startX, 0, startZ),
        baseY: 0,
        phase: i * 0.45,
        status: currentStatus,
        appearance: vHuman.appearance,
        characterType: vHuman.characterType,
        dispose: vHuman.dispose,
      };
      agentRecords[name] = record;

      // Daftarkan SEMUA agen ke Choreography Engine
      const homeX = HOME_POSITIONS[name][0];
      const homeZ = HOME_POSITIONS[name][1];
      choreo.registerActor({
        id: name,
        group: vHuman.group,
        bodyMesh: vHuman.bodyMesh,
        headMesh: vHuman.headMesh,
        bubbleDiv: vHuman.bubbleDiv,
        homePos: new THREE.Vector3(homeX, 0, homeZ),
        targetPos: record.targetPos,
      });
    });
    agentRecordsRef.current = agentRecords;

    // Callback event untuk Choreography: menyalakan nampan inbox dan anggukan kepala
    choreo.onInboxGlow = (active: boolean) => {
      if (inboxTrayMatRef.current) {
        inboxTrayMatRef.current.emissiveIntensity = active ? 1.4 : 0.25;
      }
    };
    choreo.onHeadNod = (roomId: string) => {
      // Kepala departemen ruangan tujuan mengangguk singkat
      const leadEntry = Object.entries(AGENTS).find(
        ([agentName, cfg]) => cfg.lead && roomOfAgent(agentName)?.id === roomId
      );
      const leadAgent = leadEntry?.[0];
      if (leadAgent && agentRecords[leadAgent]) {
        const rec = agentRecords[leadAgent];
        rec.headGroup.rotation.x = 0.22;
        setTimeout(() => {
          if (rec.headGroup) rec.headGroup.rotation.x = 0;
        }, 800);
      }
    };

    // Pointer events for Click vs Drag distinction (~5px threshold) & multi-touch pinch tracking
    let pointerDownPos = { x: 0, y: 0 };
    let isPointerDragging = false;
    let hadMultiTouchOrCancel = false;
    const activePointers = new Set<number>();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onPointerDown(e: PointerEvent) {
      if (activePointers.size === 0) {
        hadMultiTouchOrCancel = false;
        isPointerDragging = false;
      }
      activePointers.add(e.pointerId);
      if (activePointers.size > 1) {
        hadMultiTouchOrCancel = true;
      }
      pointerDownPos = { x: e.clientX, y: e.clientY };
    }

    function onPointerMove(e: PointerEvent) {
      if (activePointers.size > 1) {
        hadMultiTouchOrCancel = true;
      }
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 5) {
        isPointerDragging = true;
      }

      if (e.pointerType === "mouse") {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(raycastHitMeshes, false);
        if (hits.length > 0) {
          const topHit = hits[0].object.userData as {
            type: "room" | "agent" | "agent_instance";
            id: string;
          };
          renderer.domElement.style.cursor = "pointer";
          hoveredRef.current = topHit;
        } else {
          renderer.domElement.style.cursor = "default";
          hoveredRef.current = null;
        }
      }
    }

    function onPointerCancel(e: PointerEvent) {
      activePointers.delete(e.pointerId);
      hadMultiTouchOrCancel = true;
      isPointerDragging = true;
    }

    function onPointerUp(e: PointerEvent) {
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      const shouldIgnore =
        hadMultiTouchOrCancel ||
        activePointers.size > 1 ||
        isPointerDragging ||
        dist > 5;

      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        hadMultiTouchOrCancel = false;
        isPointerDragging = false;
      }

      if (shouldIgnore) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(raycastHitMeshes, false);
      if (hits.length > 0) {
        const agentHit = hits.find(
          (h) =>
            h.object.userData.type === "agent" ||
            h.object.userData.type === "agent_instance"
        );
        const hit = agentHit || hits[0];
        const data = hit.object.userData as {
          type: "room" | "agent" | "agent_instance";
          id: string;
        };
        if (data.type === "agent") {
          handlersRef.current.selectAgent(data.id);
        } else if (data.type === "agent_instance") {
          handlersRef.current.selectAgentInstance(data.id);
        } else if (data.type === "room") {
          handlersRef.current.selectRoom(data.id);
        }
      }
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          updateCameraFrustum(camera, cr.width, cr.height);
          renderer.setSize(cr.width, cr.height, false);
          cssRenderer.setSize(cr.width, cr.height);
        }
      }
    });
    resizeObserver.observe(container);

    // Visibility & Intersection Observers
    function onVisibilityChange() {
      isTabVisibleRef.current = !document.hidden;
      if (isTabVisibleRef.current) {
        daylight.checkPeriodicUpdate();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    const intersectObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          isIntersectingRef.current = entries[0].isIntersecting;
        }
      },
      { threshold: 0.05 }
    );
    intersectObserver.observe(container);

    // WebGL Context Lost / Restored handling
    const gl = renderer.getContext();
    function onContextLost(e: Event) {
      e.preventDefault();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    }
    function onContextRestored() {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      animate();
    }
    gl.canvas.addEventListener("webglcontextlost", onContextLost);
    gl.canvas.addEventListener("webglcontextrestored", onContextRestored);

    // Expose test helper on window for automated verification (non-production, ?e2e=1, atau ?demo=1)
    const urlParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const isE2E = urlParams?.get("e2e") === "1";
    const isDemoMode = urlParams?.get("demo") === "1";
    const exposeStage3D =
      process.env.NODE_ENV !== "production" || isE2E || isDemoMode;

    if (exposeStage3D) {
      (window as unknown as { __STAGE_3D__?: unknown }).__STAGE_3D__ = {
        scene,
        camera,
        renderer,
        floorplan: FLOORPLAN,
        obstacles: PROPS_OBSTACLES,
        allPlacedProps: ALL_PLACED_PROPS,
        t2aPlacedProps: T2A_PLACED_PROPS,
        t2bPlacedProps: T2B_PLACED_PROPS,
        validateFloorplan: () => validateFloorplan(FLOORPLAN),
        validatePropsPlacement: (props = ALL_PLACED_PROPS) =>
          validatePropsPlacement(
            FLOORPLAN.doors,
            FLOORPLAN.rooms,
            SEAT_BY_AGENT,
            HOME_POSITIONS,
            props,
            FLOORPLAN.bays
          ),
        focusRoom: (roomId: string) => {
          const room = FLOORPLAN.rooms.find((r) => r.id === roomId);
          if (!room) return false;
          const cx = room.x + room.w / 2;
          const cz = room.z + room.d / 2;
          const cy = 1.0;
          controls.target.set(cx, cy, cz);
          camera.position.set(cx + 45.0, cy + 38.0, cz + 45.0);
          camera.lookAt(controls.target);
          camera.updateMatrixWorld();

          const corners = [
            new THREE.Vector3(room.x, 0, room.z),
            new THREE.Vector3(room.x + room.w, 0, room.z),
            new THREE.Vector3(room.x, 0, room.z + room.d),
            new THREE.Vector3(room.x + room.w, 0, room.z + room.d),
            new THREE.Vector3(room.x, 2.5, room.z),
            new THREE.Vector3(room.x + room.w, 2.5, room.z),
            new THREE.Vector3(room.x, 2.5, room.z + room.d),
            new THREE.Vector3(room.x + room.w, 2.5, room.z + room.d),
          ];

          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          corners.forEach((c) => {
            c.applyMatrix4(camera.matrixWorldInverse);
            if (c.x < minX) minX = c.x;
            if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.y > maxY) maxY = c.y;
          });

          const viewW = maxX - minX;
          const viewH = maxY - minY;
          const frustumHalfH = (camera.top - camera.bottom) / 2;
          const frustumHalfW = (camera.right - camera.left) / 2;

          const targetZoomY = (0.70 * 2 * frustumHalfH) / viewH;
          const targetZoomX = (0.80 * 2 * frustumHalfW) / viewW;
          const targetZoom = Math.min(targetZoomY, targetZoomX);

          camera.zoom = targetZoom;
          camera.updateProjectionMatrix();
          controls.update();
          return true;
        },
        getSceneUuid: () => scene.uuid,
        getCameraPosition: () => camera.position.clone(),
        getCameraTarget: () => controls.target.clone(),
        getMemoryInfo: () => ({ ...renderer.info.memory }),
        getRenderInfo: () => ({
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          points: renderer.info.render.points,
          lines: renderer.info.render.lines,
        }),
        getStaticDrawCalls: () => {
          let count = 0;
          scene.traverse((obj) => {
            if (
              obj.userData?.isStatic === true &&
              ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments)
            ) {
              count++;
            }
          });
          return count;
        },
        projectPoint: (x: number, y: number, z: number) => {
          const v = new THREE.Vector3(x, y, z);
          v.project(camera);
          return { x: v.x, y: v.y, z: v.z };
        },
        getSelected: () => selectedRef.current,
        getActivePointerCount: () => activePointers.size,
        getAgentPosition: (nama: string) =>
          agentRecords[nama]?.group.position.clone(),
        getAgentTargetPosition: (nama: string) =>
          agentRecords[nama]?.targetPos.clone(),
        getAgentRotation: (nama: string) => {
          const r = agentRecords[nama]?.group.rotation;
          return r ? { x: r.x, y: r.y, z: r.z, _x: r.x, _y: r.y, _z: r.z } : null;
        },
        getDaylight: () => ({
          ...daylight.getDaylightState(),
          live: daylight.getLiveValues(),
        }),
        setHourOverride: (h: number | null) => {
          daylight.setHourOverride(h);
          setHourOverrideState(h);
        },
        getTheme: () => THEME,
        getEffectiveSpeed: (actorId: string = MANAGER_AGENT_NAME) =>
          choreo.getEffectiveSpeed(actorId),
        generateWalkwayGraph: (
          fp?: FloorplanData,
          hp?: Record<string, [number, number]>,
          sp?: Record<string, [number, number]>,
          obs?: WalkObstacle[]
        ) => generateWalkwayGraph(fp, hp, sp, obs),
        calculateRoomSlotPosition: (room: RoomConfig, slotIdx: number, isExp?: boolean) =>
          calculateRoomSlotPosition(room, slotIdx, isExp),
        demoDelegate: (roomId: string) => choreo.delegate(roomId),
        clearChoreo: (actorId: string = MANAGER_AGENT_NAME) => choreo.clear(actorId),
        isChoreoBusy: (actorId: string = MANAGER_AGENT_NAME) => choreo.isBusy(actorId),
        getChoreoQueueLength: (actorId: string = MANAGER_AGENT_NAME) =>
          choreo.getQueueLength(actorId),
        isMeetingActive: () => choreo.isMeetingActive,
        getPendingDelegationsCount: () => choreo.getPendingDelegationsCount(),
        triggerGather: () => setGathered((g) => !g),
        isGathered: () => gatheredRef.current,
        getSeatPositions: () => SEAT_BY_AGENT,
        getHomePositions: () => HOME_POSITIONS,
        findPath: (
          from: string,
          to: string,
          customAllowed?: string[],
          customGraph?: Record<string, WaypointNode>
        ) => findPath(from, to, customAllowed, customGraph),
        findPathNodes: (
          from: string,
          to: string,
          customAllowed?: string[],
          customGraph?: Record<string, WaypointNode>
        ) => findPathNodes(from, to, customAllowed, customGraph),
        resetCamera: () => handleResetCamera(),
        setShotMode: (val: boolean) => {
          setShotMode(val);
          shotModeRef.current = val;
          if (cssRendererRef.current) {
            cssRendererRef.current.domElement.style.display = val ? "none" : "block";
          }
        },
        isShotMode: () => shotModeRef.current,
        getAgentMeetingWaypoints: (nama: string) => {
          const seat = SEAT_BY_AGENT[nama];
          if (!seat) {
            throw new Error(
              `[OfficeStage3D] Kursi rapat tidak ditemukan untuk agen "${nama}" di SEAT_BY_AGENT`
            );
          }
          const target = { x: seat[0], z: seat[1] };
          const p = agentRecords[nama]?.group.position;
          return getMeetingPathForAgent(nama, { x: p.x, z: p.z }, target);
        },
        startMeetingNow: (reducedMotion: boolean = false) => {
          meetingReducedMotionOverrideRef.current = reducedMotion;
          const mr = ROOMS.find((r) => r.meeting)!;
          setGathered(true);
          choreo.startMeeting(
            SEAT_BY_AGENT,
            { x: mr.x, y: mr.y },
            reducedMotion
          );
        },
        endMeetingNow: (reducedMotion: boolean = false) => {
          meetingReducedMotionOverrideRef.current = reducedMotion;
          setGathered(false);
          choreo.endMeeting(reducedMotion);
        },
        setStatusOverride: (nama: string, st: AgentStatus | null) => {
          statusOverridesRef.current[nama] = st;
          const rec = agentRecords[nama];
          if (rec) {
            const eff = st ?? rec.status;
            const hex = getStatusColor(eff);
            rec.statusLightMat.color.setHex(hex);
            rec.statusLightMat.emissive.setHex(hex);
          }
        },
        getStatusOverride: (nama: string) =>
          statusOverridesRef.current[nama] ?? null,
        startInstanceDemo: (opts?: { autoApprove?: boolean }) =>
          startInstanceDemo(opts),
        approveInstanceRequest: () => handleApproveCeo(),
        rejectInstanceRequest: () => handleRejectCeo(),
        resetInstanceDemo: () => handleResetInstanceDemo(),
        getInstanceDemoState: () => ({
          step: demoStateRef.current.step,
          statusMessage: demoStateRef.current.statusMessage,
          showApprovalCard: demoStateRef.current.showApprovalCard,
          approvalStatus: demoStateRef.current.approvalStatus,
          dynamicDesksCount: dynamicDesksRef.current.length,
          dynamicAgentsCount: dynamicAgentsRef.current.length,
          isRunning: isInstanceDemoRunningRef.current,
        }),
        getAgents: () =>
          Object.entries(agentRecords).map(([name, rec]) => ({
            name,
            department: rec.appearance.department,
            status: rec.status,
            role: AGENTS[name]?.role,
            lead: rec.appearance.lead,
            appearance: rec.appearance,
            position: rec.group.position.clone(),
            characterType: rec.characterType,
          })),
        getAgentRecord: (nama: string) => agentRecords[nama] ?? null,
        getAgentPose: (nama: string) => {
          const rec = agentRecords[nama];
          if (!rec) return null;
          return {
            status: statusOverridesRef.current[nama] ?? rec.status,
            isSitting: rec.leftLeg.rotation.x < -1.0,
            leftArmRotX: rec.leftArm.rotation.x,
            rightArmRotX: rec.rightArm.rotation.x,
            leftLegRotX: rec.leftLeg.rotation.x,
            rightLegRotX: rec.rightLeg.rotation.x,
            headRot: { x: rec.headGroup.rotation.x, y: rec.headGroup.rotation.y, z: rec.headGroup.rotation.z },
            bodyRot: { x: rec.bodyMesh.rotation.x, y: rec.bodyMesh.rotation.y, z: rec.bodyMesh.rotation.z },
          };
        },
        getDrawCalls: () => renderer.info.render.calls,
        getHrPortalPos: () => HR_PORTAL_POS,
        getCharacterType: (nama: string) => agentRecords[nama]?.characterType ?? "voxelHuman",
        getAgentAppearance: (nama: string) => agentRecords[nama]?.appearance ?? null,
        controls,
      };
    }

    // Animation Loop
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = new THREE.Timer();

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isTabVisibleRef.current || !isIntersectingRef.current) {
        return;
      }

      timer.update();
      const rawDt = timer.getDelta();
      const dt = Math.min(rawDt, 0.1);
      const time = timer.getElapsed();
      const reducedMotion = motionQuery.matches;

      // Handle Smooth Reset Animation if active
      if (resetAnimRef.current && resetAnimRef.current.active) {
        const anim = resetAnimRef.current;
        const now = performance.now();
        const progress = Math.min(1, (now - anim.startTime) / anim.duration);
        const ease =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(anim.startPos, INIT_CAM_POS, ease);
        controls.target.lerpVectors(anim.startTarget, INIT_CAM_TARGET, ease);
        camera.zoom = THREE.MathUtils.lerp(anim.startZoom, 1.0, ease);
        camera.updateProjectionMatrix();

        if (progress >= 1) {
          camera.position.copy(INIT_CAM_POS);
          controls.target.copy(INIT_CAM_TARGET);
          camera.zoom = 1.0;
          camera.updateProjectionMatrix();
          resetAnimRef.current.active = false;
        }
      }

      controls.update();

      // Siklus pencahayaan jam nyata (daylight)
      daylight.checkPeriodicUpdate();
      daylight.update(dt, {
        ambientLight,
        dirLight1,
        dirLight2,
        scene,
        roomFloorMats: floorMaterialsRef.current,
      });

      // Mesin koreografi
      choreo.update(dt, reducedMotion);

      // Animate Agents
      const isGathered = gatheredRef.current;
      const currentSel = selectedRef.current;
      const camPos = camera.position;

      Object.entries(agentRecords).forEach(([name, rec]) => {
        const isActorUnderChoreo = choreo.isBusy(name);

        const override = statusOverridesRef.current[name];
        const activeStatus = override ?? rec.status;

        // Gerakan posisi: jika aktor sedang dikendalikan choreo, posisi dikendalikan choreo
        if (!isActorUnderChoreo) {
          if (reducedMotion) {
            rec.group.position.x = rec.targetPos.x;
            rec.group.position.z = rec.targetPos.z;
          }
        }

        // Animasi halus bekerja / idle / review / berjalan / meeting
        if (reducedMotion) {
          rec.group.position.y = rec.baseY;
          rec.bodyMesh.scale.set(1, 1, 1);
          rec.bodyMesh.rotation.set(0, 0, 0);
          rec.headGroup.rotation.set(0, 0, 0);
          rec.leftArm.rotation.set(0, 0, 0);
          rec.rightArm.rotation.set(0, 0, 0);
          rec.leftLeg.rotation.set(-1.45, 0, 0);
          rec.rightLeg.rotation.set(-1.45, 0, 0);
          rec.statusLightMat.emissiveIntensity =
            activeStatus === "idle" ? 0.3 : 1.2;
        } else if (isActorUnderChoreo) {
          // Sedang berjalan dalam koreografi: ayunan lengan & kaki berlawanan
          const speed = choreo.getEffectiveSpeed(name);
          const walkPhase = time * 10 * Math.max(0.8, speed / 4.0) + rec.phase;
          rec.leftLeg.rotation.x = Math.sin(walkPhase) * 0.6;
          rec.rightLeg.rotation.x = -Math.sin(walkPhase) * 0.6;
          rec.leftArm.rotation.x = -Math.sin(walkPhase) * 0.5;
          rec.rightArm.rotation.x = Math.sin(walkPhase) * 0.5;
          rec.bodyMesh.rotation.y = Math.sin(walkPhase) * 0.05;
          rec.bodyMesh.rotation.x = 0;
          rec.bodyMesh.scale.set(1, 1, 1);
          rec.headGroup.rotation.set(0, 0, 0);
          rec.statusLightMat.emissiveIntensity = 0.9;
        } else if (isGathered) {
          // POSE KHUSUS DI RUANG MEETING:
          // Duduk menghadap ke tengah meja rapat (7.5, 4.5), menyimak dengan napas halus
          rec.group.position.y = rec.baseY;
          rec.leftLeg.rotation.x = -1.45;
          rec.rightLeg.rotation.x = -1.45;
          rec.leftArm.rotation.set(-0.4, 0, 0);
          rec.rightArm.rotation.set(-0.4, 0, 0);
          rec.bodyMesh.rotation.set(0, 0, 0);

          // Orientasi menghadap ke tengah meja rapat (7.5, 4.5)
          const meetingCenter = { x: 7.5, z: 4.5 };
          const dx = meetingCenter.x - rec.group.position.x;
          const dz = meetingCenter.z - rec.group.position.z;
          rec.group.rotation.y = Math.atan2(dx, dz);

          // Napas halus dan sesekali mengangguk tanda menyimak
          rec.bodyMesh.scale.set(1, 1.0 + Math.sin(time * 2.2 + rec.phase) * 0.015, 1);
          const listenPhase = Math.sin(time * 0.7 + rec.phase);
          rec.headGroup.rotation.x =
            listenPhase > 0.4 ? Math.sin(time * 2.5 + rec.phase) * 0.08 : 0;
          rec.headGroup.rotation.y = Math.sin(time * 0.4 + rec.phase) * 0.12;
          rec.headGroup.rotation.z = 0;
          rec.statusLightMat.emissiveIntensity = 0.6;
        } else {
          // Di meja kerja: duduk menghadap meja
          const deskRot = [
            "THEIA", "LYRA", "IRIS", "CLIO", "ERATO", "DAPHNE", "HERMES", "THEMIS", "TALOS"
          ].includes(name)
            ? Math.PI
            : 0;
          rec.group.rotation.y = deskRot;
          rec.leftLeg.rotation.x = -1.45;
          rec.rightLeg.rotation.x = -1.45;

          if (activeStatus === "working") {
            // working: duduk membungkuk ke meja, mengetik (lengan bergerak), kepala miring
            const bobY = Math.sin(time * 5.2 + rec.phase) * 0.035;
            rec.group.position.y = rec.baseY + bobY;
            rec.statusLightMat.emissiveIntensity =
              1.1 + Math.sin(time * 6.5 + rec.phase) * 0.7;

            rec.leftArm.rotation.x = -0.45 + Math.sin(time * 12 + rec.phase) * 0.28;
            rec.rightArm.rotation.x = -0.45 + Math.cos(time * 12 + rec.phase) * 0.28;

            rec.headGroup.rotation.z = Math.sin(time * 3.2 + rec.phase) * 0.06;
            rec.headGroup.rotation.x = 0.12 + Math.abs(Math.sin(time * 6.5 + rec.phase)) * 0.08;
            rec.headGroup.rotation.y = 0;

            rec.bodyMesh.rotation.x = 0.08 + Math.sin(time * 4.0 + rec.phase) * 0.02;
            rec.bodyMesh.rotation.y = Math.sin(time * 3.8 + rec.phase) * 0.03;
            rec.bodyMesh.scale.set(1, 1, 1);
          } else if (activeStatus === "review") {
            // review: kepala mengangguk lambat, tangan di dagu
            rec.group.position.y = rec.baseY;
            rec.statusLightMat.emissiveIntensity =
              1.0 + Math.sin(time * 3.5 + rec.phase) * 0.4;

            rec.leftArm.rotation.set(-0.35, 0, 0);
            rec.rightArm.rotation.set(-1.15, 0, -0.22); // tangan di dagu
            rec.headGroup.rotation.x = 0.08 + Math.abs(Math.sin(time * 3.0 + rec.phase)) * 0.18;
            rec.headGroup.rotation.y = 0;
            rec.headGroup.rotation.z = 0;
            rec.bodyMesh.rotation.set(0, 0, 0);
            rec.bodyMesh.scale.set(1, 1, 1);
          } else {
            // idle: napas pelan (skala Y), tangan rileks di meja, toleh 4-9s
            rec.group.position.y = rec.baseY;
            rec.statusLightMat.emissiveIntensity = 0.3;
            rec.leftArm.rotation.set(-0.25, 0, 0);
            rec.rightArm.rotation.set(-0.25, 0, 0);
            rec.bodyMesh.rotation.set(0, 0, 0);

            rec.bodyMesh.scale.y = 1.0 + Math.sin(time * 2.6 + rec.phase) * 0.022;
            const turnPhase = Math.sin(time * 0.35 + rec.phase);
            rec.headGroup.rotation.y =
              turnPhase > 0.6 ? Math.sin(time * 1.5 + rec.phase) * 0.22 : 0;
            rec.headGroup.rotation.x = 0;
            rec.headGroup.rotation.z = 0;
          }
        }
      });

      // Animasi Agen Dinamis (Instance)
      dynamicAgentsRef.current.forEach((dynAgent) => {
        const isSel =
          currentSel?.type === "agent_instance" &&
          currentSel.id === (dynAgent.hitMesh.userData.id as string);
        const isHov =
          hoveredRef.current?.type === "agent_instance" &&
          hoveredRef.current.id === (dynAgent.hitMesh.userData.id as string);

        if (dynAgent.leftLeg && dynAgent.rightLeg) {
          dynAgent.leftLeg.rotation.x = -1.45;
          dynAgent.rightLeg.rotation.x = -1.45;
        }
        dynAgent.leftArm.rotation.x = -0.45 + Math.sin(time * 12) * 0.28;
        dynAgent.rightArm.rotation.x = -0.45 + Math.cos(time * 12) * 0.28;
        dynAgent.headGroup.rotation.z = Math.sin(time * 3.2) * 0.06;
        dynAgent.headGroup.rotation.x = 0.12 + Math.abs(Math.sin(time * 6.5)) * 0.08;

        if (isSel || isHov) {
          dynAgent.labelDiv.classList.remove("is-mini");
          dynAgent.labelDiv.style.display = "inline-flex";
          dynAgent.labelDiv.style.opacity = "1.0";
          dynAgent.labelDiv.style.zIndex = isSel ? "30" : "20";
        } else {
          dynAgent.labelDiv.classList.add("is-mini");
          dynAgent.labelDiv.style.display = "inline-flex";
          dynAgent.labelDiv.style.opacity = "0.85";
          dynAgent.labelDiv.style.zIndex = "10";
        }
      });

      // Room labels distance fading
      Object.entries(roomRecords).forEach(([, rRec]) => {
        const dist = camPos.distanceTo(rRec.group.position);
        const alpha = Math.min(1.0, Math.max(0.4, 1.0 - (dist - 14) / 42));
        const alphaStr = alpha.toFixed(2);
        if (rRec.labelDiv.style.opacity !== alphaStr) {
          rRec.labelDiv.style.opacity = alphaStr;
        }
      });

      renderer.render(scene, camera);
      cssRenderer.render(scene, camera);

      // Label CSS2D Teroptimasi pasca-CSS2DRenderer:
      // default tersembunyi (display: none), mini badge untuk aktif (working/review), penuh untuk hover/selected
      Object.entries(agentRecords).forEach(([name, rec]) => {
        const isHovered =
          hoveredRef.current?.type === "agent" && hoveredRef.current.id === name;
        const isSelected =
          currentSel?.type === "agent" && currentSel.id === name;
        const override = statusOverridesRef.current[name];
        const activeStatus = override ?? rec.status;
        const isActorUnderChoreo = choreo.isBusy(name);
        const isActive =
          isActorUnderChoreo || activeStatus === "working" || activeStatus === "review";

        if (isSelected || isHovered) {
          rec.labelDiv.classList.remove("is-mini");
          rec.labelDiv.style.display = "inline-flex";
          rec.labelDiv.style.opacity = "1.0";
          rec.labelDiv.style.zIndex = isSelected ? "30" : "20";
        } else if (isGathered) {
          if (isActive) {
            rec.labelDiv.classList.add("is-mini");
            rec.labelDiv.style.display = "inline-flex";
            rec.labelDiv.style.opacity = "0.85";
            rec.labelDiv.style.zIndex = "10";
          } else {
            rec.labelDiv.style.display = "none";
          }
        } else if (isActive) {
          rec.labelDiv.classList.add("is-mini");
          rec.labelDiv.style.display = "inline-flex";
          const dist = camPos.distanceTo(rec.group.position);
          const alpha = Math.min(1.0, Math.max(0.4, 1.0 - (dist - 16) / 36));
          rec.labelDiv.style.opacity = alpha.toFixed(2);
          rec.labelDiv.style.zIndex = "10";
        } else {
          rec.labelDiv.style.display = "none";
        }
      });

      dynamicAgentsRef.current.forEach((dynAgent) => {
        const isSel =
          currentSel?.type === "agent_instance" &&
          currentSel.id === (dynAgent.hitMesh.userData.id as string);
        const isHov =
          hoveredRef.current?.type === "agent_instance" &&
          hoveredRef.current.id === (dynAgent.hitMesh.userData.id as string);

        if (isSel || isHov) {
          dynAgent.labelDiv.classList.remove("is-mini");
          dynAgent.labelDiv.style.display = "inline-flex";
          dynAgent.labelDiv.style.opacity = "1.0";
          dynAgent.labelDiv.style.zIndex = isSel ? "30" : "20";
        } else {
          dynAgent.labelDiv.classList.add("is-mini");
          dynAgent.labelDiv.style.display = "inline-flex";
          dynAgent.labelDiv.style.opacity = "0.85";
          dynAgent.labelDiv.style.zIndex = "10";
        }
      });
    }

    animate();

    // Cleanup on unmount
    return () => {
      handleResetInstanceDemo();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      intersectObserver.disconnect();

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      gl.canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.canvas.removeEventListener("webglcontextrestored", onContextRestored);

      controls.dispose();

      // Dispose all agent records
      Object.values(agentRecordsRef.current).forEach((rec) => {
        rec.dispose?.();
      });

      // Dispose all geometries, materials, textures
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((m) => {
            const matWithTextures = m as THREE.Material & {
              map?: THREE.Texture | null;
              emissiveMap?: THREE.Texture | null;
            };
            if (matWithTextures.map && typeof matWithTextures.map.dispose === "function") {
              matWithTextures.map.dispose();
            }
            if (matWithTextures.emissiveMap && typeof matWithTextures.emissiveMap.dispose === "function") {
              matWithTextures.emissiveMap.dispose();
            }
            m.dispose();
          });
        }
      });

      renderer.dispose();

      if (cssRenderer.domElement.parentNode) {
        cssRenderer.domElement.parentNode.removeChild(cssRenderer.domElement);
      }

      if (typeof window !== "undefined") {
        delete (window as unknown as { __STAGE_3D__?: unknown }).__STAGE_3D__;
      }
    };
  }, [webglSupported]);

  // Reset Camera View Handler
  const handleResetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    resetAnimRef.current = {
      active: true,
      startTime: performance.now(),
      duration: 520,
      startPos: cameraRef.current.position.clone(),
      startTarget: controlsRef.current.target.clone(),
      startZoom: cameraRef.current.zoom,
    };
  }, []);

  const handleSetHour = useCallback((h: number | null) => {
    daylightControllerRef.current.setHourOverride(h);
    setHourOverrideState(h);
  }, []);

  // Automatic Fallback to SVG map if WebGL is unavailable or failed
  if (!webglSupported || webglInitError) {
    return (
      <OfficeStageSVG
        agents={agents}
        events={events}
        realtimeConnected={realtimeConnected}
      />
    );
  }

  function renderDetailContent() {
    if (!selected) {
      return (
        <p className="hint">
          Klik ruangan atau karakter untuk membuka jobdesc. Klik ruang Meeting H+1 untuk
          mengumpulkan semua agent, klik lagi untuk membubarkan. Titik di label karakter
          menandai status: menyala berarti bekerja, kuning berarti menunggu review.
        </p>
      );
    }
    if (selected.type === "room") {
      const room = ROOMS.find((r) => r.id === selected.id);
      if (!room) return null;
      if (room.meeting) {
        return (
          <>
            <h3 style={{ color: room.color }}>{room.name}</h3>
            <p>{room.desc}</p>
            <p>
              {gathered
                ? "Semua agent departemen sedang berkumpul. Arahkan kursor ke karakter untuk melihat namanya."
                : "Agent sedang bekerja di ruangan masing-masing."}
            </p>
            <button
              className="member"
              type="button"
              style={{ "--c": room.color } as React.CSSProperties}
              onClick={() => setGathered((g) => !g)}
            >
              {gathered ? "Bubarkan rapat" : "Kumpulkan semua agent"}
            </button>
          </>
        );
      }
      return (
        <>
          <h3 style={{ color: room.color }}>{room.name}</h3>
          <p>{room.desc}</p>
          <div className="lbl">Anggota ruangan</div>
          <div className="members">
            {room.agents.map((n) => {
              const cfg = AGENTS[n];
              return (
                <button
                  key={n}
                  className="member"
                  type="button"
                  style={{ "--c": room.color } as React.CSSProperties}
                  onClick={() => selectAgent(n)}
                >
                  {cfg.lead ? "\u2605 " : ""}
                  {n} {"\u00b7"} {cfg.role}
                </button>
              );
            })}
          </div>
        </>
      );
    }
    if (selected.type === "agent_instance") {
      return (
        <>
          <h3 style={{ color: "#38bdf8" }}>
            ARTEMIS · Akun B <span className="pill w">bekerja</span>
          </h3>
          <p>
            <b>Pengelola Kampanye (Akun B)</b>, ruang advertisers.
            Instance agen dinamis sisi klien yang disiapkan melalui persetujuan
            CEO untuk menangani lonjakan campaign iklan.
          </p>
          <div className="cols">
            <div>
              <div className="lbl">Status Instance</div>
              <div className="chips">
                <span className="chip">Sisi Klien (Demo)</span>
                <span className="chip">Slot #4</span>
                <span className="chip">Meta Ads (Akun B)</span>
              </div>
            </div>
            <div>
              <div className="lbl">Catatan Fasilitas</div>
              <p style={{ margin: "4px 0", fontSize: "11px", color: "var(--muted)" }}>
                Meja kerja runtime disiapkan oleh HEPHAESTUS (Operasional) tanpa
                menulis ke database.
              </p>
            </div>
          </div>
        </>
      );
    }
    const name = selected.id;
    const cfg = AGENTS[name];
    const room = roomOfAgent(name);
    const status = statusOf(name);
    const lastEvent = lastEventByAgent[name];
    const json = lastEvent ? JSON.stringify(lastEvent, null, 2) : "(belum ada event)";
    return (
      <>
        <h3 style={{ color: room?.color }}>
          {cfg.lead ? "\u2605 " : ""}
          {name} {pill(status)}
        </h3>
        <p>
          <b>{cfg.role}</b>, ruang {room?.name.toLowerCase()}. {cfg.desc}
        </p>
        <div className="cols">
          <div>
            <div className="lbl">Tool</div>
            <div className="chips">
              {cfg.tools.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="lbl">Event terakhir yang ditulis ke database</div>
            <pre className="json">{json}</pre>
          </div>
        </div>
      </>
    );
  }

  const selectedTitle = selected
    ? selected.type === "agent"
      ? selected.id
      : selected.type === "agent_instance"
      ? "ARTEMIS · Akun B"
      : ROOMS.find((r) => r.id === selected.id)?.name ?? "Detail"
    : "Jobdesc & Detail";

  return (
    <section
      className={`card stage-card ${fullFrame ? "is-full-frame" : ""}`}
      aria-label="Peta kantor 3D"
    >
      {/* Normal Mode Stats Header */}
      {!fullFrame && (
        <div className="stats">
          <span>
            <i className="pip w" /> <b>{stats.working}</b>bekerja
          </span>
          <span>
            <i className="pip r" /> <b>{stats.review}</b>menunggu review
          </span>
          <span>
            <i className="pip" /> <b>{stats.idle}</b>idle
          </span>
          <span className={`conn ${realtimeConnected ? "on" : "off"}`}>
            {realtimeConnected
              ? "\u25cf realtime tersambung"
              : "\u25cb memakai polling cadangan"}
          </span>
        </div>
      )}

      {/* Map Area */}
      <div className="stage-map-area" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="stage-3d-canvas"
          tabIndex={0}
          role="region"
          aria-label="Peta kantor 3D interaktif. Gunakan klik kiri untuk memutar, klik kanan untuk menggeser, roda mouse untuk memperbesar."
        />

        {/* Kartu Persetujuan CEO (Floating Demo Modal V1b) */}
        {!shotMode && showCeoApprovalCard && (
          <div
            className="ceo-approval-demo-card"
            role="dialog"
            aria-label="Permintaan Persetujuan CEO"
          >
            <div className="ceo-card-badge">PERSETUJUAN CEO · DEMO</div>
            <h4>Permohonan Penambahan Agen</h4>
            <p className="ceo-card-desc">
              <b>Ruang:</b> Advertisers (Iklan)
              <br />
              <b>Departemen:</b> Pemasaran & Meta Ads
              <br />
              <b>Template Agen:</b> ARTEMIS · Pengelola Kampanye
              <br />
              <b>Konteks:</b> Penanganan Campaign Akun B (beban tinggi)
              <br />
              <b>Peralatan:</b> 1 Meja & Workstation Baru (disiapkan Operasional)
            </p>
            {ceoApprovalStatus === "approved" ? (
              <div className="ceo-approved-badge">✓ DISETUJUI OLEH CEO</div>
            ) : (
              <div className="ceo-card-actions">
                <button
                  type="button"
                  className="ceo-approve-btn"
                  onClick={handleApproveCeo}
                >
                  Setujui Penambahan (CEO)
                </button>
                <button
                  type="button"
                  className="ceo-reject-btn"
                  onClick={handleRejectCeo}
                >
                  Tolak
                </button>
              </div>
            )}
          </div>
        )}

        {/* Panel Kontrol Mode Demo & Jam (Hanya non-production atau ?demo=1) */}
        {!shotMode && showDemoUI && (
          <aside
            className="stage-demo-panel"
            aria-label="Mode Demo dan Kontrol Cahaya"
          >
            <div className="stage-demo-head">
              <span>Mode Demo</span>
              <span className="stage-demo-badge">V1b</span>
            </div>
            <div className="stage-demo-btns">
              <button
                type="button"
                className="stage-demo-btn"
                aria-label="Demo Brief ke Riset"
                onClick={() => choreoEngineRef.current.delegate("riset")}
              >
                Brief → Riset
              </button>
              <button
                type="button"
                className="stage-demo-btn"
                aria-label="Demo Brief ke Copy lalu Landing Page"
                onClick={() => {
                  choreoEngineRef.current.delegate("copy");
                  choreoEngineRef.current.delegate("lp");
                }}
              >
                Brief → Copy lalu LP
              </button>
              <button
                type="button"
                className="stage-demo-btn"
                aria-label="Demo Banjir 7 brief delegasi"
                onClick={() => {
                  [
                    "riset",
                    "copy",
                    "lp",
                    "ads",
                    "creative",
                    "riset",
                    "copy",
                  ].forEach((r) => choreoEngineRef.current.delegate(r));
                }}
              >
                Banjir brief (7)
              </button>
              <button
                type="button"
                className="stage-demo-btn"
                style={{
                  color: "var(--amber)",
                  borderColor: "rgba(245, 166, 35, 0.4)",
                }}
                aria-label="Hentikan semua koreografi"
                onClick={() => choreoEngineRef.current.clear(MANAGER_AGENT_NAME)}
              >
                Hentikan
              </button>
            </div>

            {/* Bagian Simulasi Penambahan Instance Agen (V1b) */}
            <div className="stage-demo-section-title">Demo Instance Agen</div>
            <div className="stage-demo-btns">
              <button
                type="button"
                className="stage-demo-btn is-highlight"
                aria-label="Jalankan Simulasi Tambah Agen (7 Langkah)"
                onClick={() => startInstanceDemo()}
                disabled={demoInstanceStep > 0 && demoInstanceStep < 7}
              >
                {demoInstanceStep > 0
                  ? `Simulasi (${demoInstanceStep}/7)`
                  : "+ Tambah Agen (7 Langkah)"}
              </button>
              {demoInstanceStep > 0 && (
                <button
                  type="button"
                  className="stage-demo-btn"
                  style={{
                    color: "var(--amber)",
                    borderColor: "rgba(245, 166, 35, 0.4)",
                  }}
                  aria-label="Reset Simulasi Instance"
                  onClick={handleResetInstanceDemo}
                >
                  Reset Instance
                </button>
              )}
            </div>
            {demoStatusMessage && (
              <div className="stage-demo-status-pill">{demoStatusMessage}</div>
            )}

            <div className="stage-demo-daylight">
              <span className="stage-demo-daylight-lbl">Jam:</span>
              {[7, 13, 17, 21].map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`stage-demo-btn ${
                    hourOverrideState === h ? "is-active" : ""
                  }`}
                  aria-label={`Ubah simulasi jam ke ${h}:00`}
                  onClick={() => handleSetHour(h)}
                >
                  {h < 10 ? `0${h}` : h}
                </button>
              ))}
              <button
                type="button"
                className={`stage-demo-btn ${
                  hourOverrideState === null ? "is-active" : ""
                }`}
                aria-label="Reset simulasi jam ke jam perangkat"
                onClick={() => handleSetHour(null)}
              >
                Auto
              </button>
            </div>
          </aside>
        )}

        {/* Fullscreen Toggle Button (Top Right) */}
        {!shotMode && onToggleFullFrame && (
          <button
            type="button"
            className="stage-ctrl-btn stage-fullscreen-btn"
            aria-label={fullFrame ? "Keluar layar penuh" : "Layar penuh"}
            aria-pressed={fullFrame}
            onClick={onToggleFullFrame}
            title={fullFrame ? "Keluar layar penuh (Esc)" : "Layar penuh"}
          >
            {fullFrame ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            )}
          </button>
        )}

        {/* Reset Camera Button (Bottom Right, above Info icon) */}
        {!shotMode && (
          <button
            type="button"
            className="stage-ctrl-btn stage-reset-btn"
            aria-label="Reset tampilan"
            title="Reset tampilan kamera"
            onClick={handleResetCamera}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
        )}

        {/* Info Button & Popover (Bottom Right) */}
        {!shotMode && (
          <div className="stage-info-wrap" ref={infoContainerRef}>
            <button
              type="button"
              className="stage-info-btn"
              aria-label="Informasi"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((prev) => !prev)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
            {infoOpen && (
              <div
                className="stage-info-popover"
                role="region"
                aria-label="Informasi Sinkronisasi Realtime"
              >
                <p>
                  Peta 3D Three.js interaktif. Geser untuk memutar, klik kanan / dua jari
                  untuk menggeser, roda mouse untuk memperbesar. Tiap agent menulis event ke
                  database dan Supabase Realtime memperbarui lampu status dan posisi secara
                  langsung tanpa membangun ulang adegan.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Normal Mode Detail Panel */}
      {!shotMode && !fullFrame && <div className="detail">{renderDetailContent()}</div>}

      {/* Full Frame Desktop Floating Detail Panel (Bottom Center) */}
      {!shotMode && fullFrame && (
        <div
          className={`stage-detail-floating ${
            detailCollapsed ? "collapsed" : ""
          }`}
          role="region"
          aria-label="Jobdesc & Detail Agen"
        >
          <div className="detail-floating-head">
            <span className="detail-floating-title">{selectedTitle}</span>
            {onToggleDetailCollapse && (
              <button
                type="button"
                className="ff-chevron-btn"
                aria-label={
                  detailCollapsed
                    ? "Buka panel detail"
                    : "Lipat panel detail"
                }
                onClick={onToggleDetailCollapse}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: detailCollapsed ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
          </div>
          {!detailCollapsed && (
            <div className="detail-floating-body">{renderDetailContent()}</div>
          )}
        </div>
      )}

      {/* Full Frame Mobile Bottom Sheet for Detail */}
      {fullFrame && isMobileDetailOpen && (
        <div
          className="stage-mobile-bottom-sheet"
          role="dialog"
          aria-label="Detail Karakter"
        >
          <div className="mobile-sheet-head">
            <span className="detail-floating-title">{selectedTitle}</span>
            <button
              type="button"
              className="ff-close-btn"
              aria-label="Tutup panel"
              onClick={onCloseMobileDetail}
            >
              ✕
            </button>
          </div>
          <div className="mobile-sheet-body">{renderDetailContent()}</div>
        </div>
      )}
    </section>
  );
}
