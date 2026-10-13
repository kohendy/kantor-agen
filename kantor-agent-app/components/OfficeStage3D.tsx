"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
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
  SEATS,
  STATUS_LABEL,
  colorOfAgent,
  roomOfAgent,
} from "@/lib/officeConfig";
import type { AgentRow, EventRow, AgentStatus } from "@/lib/types";
import { OfficeStage as OfficeStageSVG } from "./OfficeStage";
import {
  OFFSET_X,
  OFFSET_Z,
  createWalkwayVisuals,
} from "@/lib/stage3d/walkways";
import { ChoreographyEngine } from "@/lib/stage3d/choreography";
import {
  DaylightController,
  getHourFromUrl,
} from "@/lib/stage3d/daylight";

export type Selection = { type: "room" | "agent"; id: string } | null;

interface Agent3DRecord {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headGroup: THREE.Group;
  headMesh: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  statusLightMesh: THREE.Mesh;
  statusLightMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
  labelObj: CSS2DObject;
  labelDiv: HTMLDivElement;
  dotSpan: HTMLSpanElement;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  baseY: number;
  phase: number;
  status: AgentStatus;
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

// Framing kamera 3 baris ruangan (Row 0, 1, 2)
// Row 0 z=-3, Row 1 z=3, Row 2 z=9 -> Pusat z = 3.0, Pusat x = 0.0
const INIT_CAM_POS = new THREE.Vector3(15.5, 21.0, 22.0);
const INIT_CAM_TARGET = new THREE.Vector3(0, 0, 3.0);

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

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const infoContainerRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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
  const hoveredRef = useRef<{ type: "room" | "agent"; id: string } | null>(null);

  const resetAnimRef = useRef<{
    active: boolean;
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
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

  const handlersRef = useRef({ selectAgent, selectRoom });
  useEffect(() => {
    handlersRef.current = { selectAgent, selectRoom };
  }, [selectAgent, selectRoom]);

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
          rec.labelDiv.className = `agent-tag3d st-${nextStatus}${
            selectedRef.current?.type === "agent" && selectedRef.current.id === a.nama
              ? " sel"
              : ""
          }`;
          rec.labelDiv.setAttribute("data-status", nextStatus);
        }
      }
    });
  }, [agents]);

  // Update target positions when gathered changes
  // ATLAS mengabaikan gather di V1a dan tetap berada di mejanya
  useEffect(() => {
    const meetingRoom = ROOMS.find((r) => r.meeting)!;
    AGENT_RENDER_ORDER.forEach((name, i) => {
      const rec = agentRecordsRef.current[name];
      if (!rec) return;

      if (name === MANAGER_AGENT_NAME) {
        const hp = HOME_POSITIONS[name];
        rec.targetPos.set(hp[0] + OFFSET_X, rec.baseY, hp[1] + OFFSET_Z);
        return;
      }

      if (gathered) {
        const seat = SEATS[i] ?? [2.5, 2.5];
        const sx = meetingRoom.x + seat[0] + OFFSET_X;
        const sz = meetingRoom.y + seat[1] + OFFSET_Z;
        rec.targetPos.set(sx, rec.baseY, sz);
      } else {
        const hp = HOME_POSITIONS[name];
        rec.targetPos.set(hp[0] + OFFSET_X, rec.baseY, hp[1] + OFFSET_Z);
      }
    });
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

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 220);
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
    cssRendererRef.current = cssRenderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(INIT_CAM_TARGET);
    controls.minDistance = 8;
    controls.maxDistance = 65;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minPolarAngle = 0.12;
    controls.listenToKeyEvents(window);

    // Pan clamping agar 3 baris ruangan tidak pernah hilang
    controls.addEventListener("change", () => {
      controls.target.x = Math.max(-12, Math.min(12, controls.target.x));
      controls.target.y = Math.max(-2, Math.min(6, controls.target.y));
      controls.target.z = Math.max(-8, Math.min(14, controls.target.z));
    });

    // Lighting (diinisialisasi dengan DaylightController)
    const daylight = daylightControllerRef.current;
    const choreo = choreoEngineRef.current;

    const ambientLight = new THREE.AmbientLight(0x2d2b56, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xe8f0ff, 1.6);
    dirLight1.position.set(16, 26, 20);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa78bfa, 0.8);
    dirLight2.position.set(-16, 18, -16);
    scene.add(dirLight2);

    const meetingPoint = new THREE.PointLight(0xb7f34a, 0.9, 14);
    meetingPoint.position.set(OFFSET_X + 8.5, 2.5, OFFSET_Z + 2.5);
    scene.add(meetingPoint);

    // Visual koridor halus di sela pelat
    const walkwayVisuals = createWalkwayVisuals();
    scene.add(walkwayVisuals.group);

    // Track raycast hit targets
    const raycastHitMeshes: THREE.Mesh[] = [];

    // Build Rooms
    const roomRecords: Record<string, Room3DRecord> = {};
    const floorMaterials: THREE.MeshStandardMaterial[] = [];
    const floorBoxGeo = new THREE.BoxGeometry(5.0, 0.08, 5.0);
    const floorEdgesGeo = new THREE.EdgesGeometry(floorBoxGeo);

    ROOMS.forEach((room) => {
      const roomGroup = new THREE.Group();
      const cx = room.x + 2.5 + OFFSET_X;
      const cz = room.y + 2.5 + OFFSET_Z;

      const roomColorHex = new THREE.Color(room.color).getHex();

      // Thin glass floor plate
      const floorMat = new THREE.MeshStandardMaterial({
        color: roomColorHex,
        transparent: true,
        opacity: 0.18,
        roughness: 0.25,
        metalness: 0.1,
      });
      floorMaterials.push(floorMat);

      const floorMesh = new THREE.Mesh(floorBoxGeo, floorMat);
      floorMesh.position.set(cx, -0.04, cz);
      roomGroup.add(floorMesh);

      // Glowing edges
      const edgeMat = new THREE.LineBasicMaterial({
        color: roomColorHex,
        transparent: true,
        opacity: 0.75,
      });
      const edgeLines = new THREE.LineSegments(floorEdgesGeo, edgeMat);
      edgeLines.position.set(cx, -0.04, cz);
      roomGroup.add(edgeLines);

      // Subtle inner grid lines
      const gridPoints: THREE.Vector3[] = [];
      for (let i = 1; i < 5; i++) {
        const offset = i - 2.5;
        gridPoints.push(new THREE.Vector3(cx - 2.5, 0.005, cz + offset));
        gridPoints.push(new THREE.Vector3(cx + 2.5, 0.005, cz + offset));
        gridPoints.push(new THREE.Vector3(cx + offset, 0.005, cz - 2.5));
        gridPoints.push(new THREE.Vector3(cx + offset, 0.005, cz + 2.5));
      }
      const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
      const gridMat = new THREE.LineBasicMaterial({
        color: roomColorHex,
        transparent: true,
        opacity: 0.18,
      });
      const gridSegments = new THREE.LineSegments(gridGeo, gridMat);
      roomGroup.add(gridSegments);

      // Desks / Furniture
      if (room.meeting) {
        // Meeting Conference Table
        const tableGeo = new THREE.BoxGeometry(2.6, 0.42, 1.2);
        const tableMat = new THREE.MeshStandardMaterial({
          color: 0x14122e,
          roughness: 0.3,
          metalness: 0.4,
        });
        const tableMesh = new THREE.Mesh(tableGeo, tableMat);
        tableMesh.position.set(room.x + 2.5 + OFFSET_X, 0.21, room.y + 2.6 + OFFSET_Z);
        roomGroup.add(tableMesh);

        const tableEdgeGeo = new THREE.EdgesGeometry(tableGeo);
        const tableEdgeMat = new THREE.LineBasicMaterial({
          color: roomColorHex,
          transparent: true,
          opacity: 0.7,
        });
        const tableEdges = new THREE.LineSegments(tableEdgeGeo, tableEdgeMat);
        tableEdges.position.copy(tableMesh.position);
        roomGroup.add(tableEdges);

        // Whiteboard / Screen at back
        const screenGeo = new THREE.BoxGeometry(3.4, 0.95, 0.06);
        const screenCanvas = document.createElement("canvas");
        screenCanvas.width = 512;
        screenCanvas.height = 144;
        const sctx = screenCanvas.getContext("2d");
        if (sctx) {
          sctx.fillStyle = "#0b0a1a";
          sctx.fillRect(0, 0, 512, 144);
          sctx.strokeStyle = room.color;
          sctx.lineWidth = 6;
          sctx.strokeRect(4, 4, 504, 136);
          sctx.fillStyle = room.color;
          sctx.font = "bold 34px 'Chakra Petch', sans-serif";
          sctx.fillText("REPORT H+1", 24, 56);
          sctx.fillStyle = "rgba(183, 243, 74, 0.75)";
          sctx.font = "24px 'Chakra Petch', sans-serif";
          sctx.fillText("Tiap hari 09.00", 24, 104);
        }
        const screenTex = new THREE.CanvasTexture(screenCanvas);
        const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.set(room.x + 2.5 + OFFSET_X, 0.88, room.y + 0.15 + OFFSET_Z);
        roomGroup.add(screenMesh);
      } else if (room.id === MANAGER_ROOM_ID) {
        // RUANG MANAGER: Meja eksekutif, monitor, kursi, nampan "inbox brief"
        const mgrDeskGeo = new THREE.BoxGeometry(2.3, 0.44, 0.95);
        const mgrDeskMat = new THREE.MeshStandardMaterial({
          color: 0x18142a,
          roughness: 0.35,
          metalness: 0.4,
        });
        const mgrDeskMesh = new THREE.Mesh(mgrDeskGeo, mgrDeskMat);
        mgrDeskMesh.position.set(cx, 0.22, cz - 0.45);
        roomGroup.add(mgrDeskMesh);

        const mgrDeskEdgeGeo = new THREE.EdgesGeometry(mgrDeskGeo);
        const mgrDeskEdgeMat = new THREE.LineBasicMaterial({
          color: roomColorHex,
          transparent: true,
          opacity: 0.75,
        });
        const mgrDeskEdges = new THREE.LineSegments(mgrDeskEdgeGeo, mgrDeskEdgeMat);
        mgrDeskEdges.position.copy(mgrDeskMesh.position);
        roomGroup.add(mgrDeskEdges);

        // Monitor Manager
        const monGeo = new THREE.BoxGeometry(0.85, 0.42, 0.05);
        const monMat = new THREE.MeshStandardMaterial({
          color: roomColorHex,
          emissive: roomColorHex,
          emissiveIntensity: 0.5,
        });
        const monMesh = new THREE.Mesh(monGeo, monMat);
        monMesh.position.set(cx, 0.65, cz - 0.65);
        roomGroup.add(monMesh);

        // Kursi Manager
        const chairSeatGeo = new THREE.BoxGeometry(0.55, 0.08, 0.50);
        const chairBackGeo = new THREE.BoxGeometry(0.55, 0.52, 0.08);
        const chairMat = new THREE.MeshStandardMaterial({
          color: 0x100e22,
          roughness: 0.5,
          metalness: 0.2,
        });
        const chairSeat = new THREE.Mesh(chairSeatGeo, chairMat);
        chairSeat.position.set(cx, 0.24, cz + 0.22);
        roomGroup.add(chairSeat);
        const chairBack = new THREE.Mesh(chairBackGeo, chairMat);
        chairBack.position.set(cx, 0.54, cz + 0.46);
        roomGroup.add(chairBack);

        // Nampan "Inbox Brief" di atas meja
        const trayGeo = new THREE.BoxGeometry(0.36, 0.06, 0.26);
        const trayMat = new THREE.MeshStandardMaterial({
          color: 0x221a28,
          emissive: 0xf07167,
          emissiveIntensity: 0.25,
          roughness: 0.35,
        });
        inboxTrayMatRef.current = trayMat;

        const trayMesh = new THREE.Mesh(trayGeo, trayMat);
        trayMesh.position.set(cx + 0.65, 0.47, cz - 0.45);
        roomGroup.add(trayMesh);

        // Lembaran dokumen di dalam nampan
        const papersGeo = new THREE.BoxGeometry(0.28, 0.02, 0.20);
        const papersMat = new THREE.MeshStandardMaterial({
          color: 0xf5f5ff,
          roughness: 0.6,
        });
        const papersMesh = new THREE.Mesh(papersGeo, papersMat);
        papersMesh.position.set(cx + 0.65, 0.51, cz - 0.45);
        roomGroup.add(papersMesh);
      } else {
        // Regular room desks for agents
        const deskGeo = new THREE.BoxGeometry(1.8, 0.44, 0.7);
        const deskTopEdgeGeo = new THREE.EdgesGeometry(deskGeo);
        const deskMat = new THREE.MeshStandardMaterial({
          color: 0x14122e,
          roughness: 0.4,
          metalness: 0.3,
        });
        const deskEdgeMat = new THREE.LineBasicMaterial({
          color: roomColorHex,
          transparent: true,
          opacity: 0.5,
        });

        const slots = [
          [1.3, 2.0],
          [3.4, 1.5],
          [2.6, 3.9],
        ];
        slots.forEach((slot) => {
          const sx = room.x + slot[0];
          const sy = room.y + slot[1];
          const dx = sx + 0.1 + OFFSET_X;
          const dz = sy - 0.85 + OFFSET_Z;

          const deskMesh = new THREE.Mesh(deskGeo, deskMat);
          deskMesh.position.set(dx, 0.22, dz);
          roomGroup.add(deskMesh);

          const deskEdges = new THREE.LineSegments(deskTopEdgeGeo, deskEdgeMat);
          deskEdges.position.copy(deskMesh.position);
          roomGroup.add(deskEdges);

          // Small monitor
          const monGeo = new THREE.BoxGeometry(0.38, 0.24, 0.04);
          const monMat = new THREE.MeshStandardMaterial({
            color: roomColorHex,
            emissive: roomColorHex,
            emissiveIntensity: 0.4,
          });
          const monMesh = new THREE.Mesh(monGeo, monMat);
          monMesh.position.set(dx, 0.56, dz - 0.08);
          roomGroup.add(monMesh);
        });
      }

      // Invisible Hitbox for clicking the room floor
      const hitGeo = new THREE.BoxGeometry(5.0, 0.3, 5.0);
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
      labelObj.position.set(cx, 1.6, cz - 2.2);
      roomGroup.add(labelObj);

      scene.add(roomGroup);

      roomRecords[room.id] = {
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

    // Build Agents (Robots) dengan geometri bersama (shared geometries)
    const agentRecords: Record<string, Agent3DRecord> = {};
    const shadowGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.01, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
    });
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.44, 0.38);
    const headGeo = new THREE.BoxGeometry(0.56, 0.42, 0.42);
    const visorGeo = new THREE.BoxGeometry(0.44, 0.2, 0.04);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x14122b });
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const antennaGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.18);
    const tipGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const starGeo = new THREE.OctahedronGeometry(0.12, 0);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffb800,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    });
    const armGeo = new THREE.BoxGeometry(0.08, 0.20, 0.08);
    const robotHitGeo = new THREE.BoxGeometry(0.85, 1.25, 0.85);

    AGENT_RENDER_ORDER.forEach((name, i) => {
      const group = new THREE.Group();
      const cfg = AGENTS[name];
      const agentColor = colorOfAgent(name);
      const agentHex = new THREE.Color(agentColor).getHex();
      const currentAgents = agentsRef.current;
      const agentRow = currentAgents.find((a) => a.nama === name);
      const currentStatus: AgentStatus = (agentRow?.status as AgentStatus) ?? "idle";
      const statusHex = getStatusColor(currentStatus);

      // Floor Shadow
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.position.set(0, 0.005, 0);
      group.add(shadowMesh);

      // Robot Body
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xdfe3ff,
        roughness: 0.35,
        metalness: 0.2,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.set(0, 0.34, 0);
      group.add(bodyMesh);

      // Chest plate badge with agent color
      const chestGeo = new THREE.BoxGeometry(0.24, 0.14, 0.02);
      const chestMat = new THREE.MeshBasicMaterial({ color: agentHex });
      const chestMesh = new THREE.Mesh(chestGeo, chestMat);
      chestMesh.position.set(0, 0.34, 0.2);
      group.add(chestMesh);

      // Two arms for working animation (lengan mengetuk meja)
      const armMat = new THREE.MeshStandardMaterial({
        color: 0xdfe3ff,
        roughness: 0.35,
        metalness: 0.2,
      });
      const leftArm = new THREE.Mesh(armGeo, armMat);
      leftArm.position.set(-0.29, 0.32, 0.08);
      group.add(leftArm);

      const rightArm = new THREE.Mesh(armGeo, armMat);
      rightArm.position.set(0.29, 0.32, 0.08);
      group.add(rightArm);

      // Head Group (agar visor, mata, antena, bintang ikut berputar/menoleh bersama kepala)
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.77, 0);

      const headMat = new THREE.MeshStandardMaterial({
        color: 0xeef0ff,
        roughness: 0.35,
        metalness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.set(0, 0, 0);
      headGroup.add(headMesh);

      // Visor
      const visorMesh = new THREE.Mesh(visorGeo, visorMat);
      visorMesh.position.set(0, 0, 0.22);
      headGroup.add(visorMesh);

      // Eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: agentHex });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.11, 0, 0.24);
      headGroup.add(leftEye);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.11, 0, 0.24);
      headGroup.add(rightEye);

      // Antenna
      const antMat = new THREE.MeshBasicMaterial({ color: 0xeef0ff });
      const antennaMesh = new THREE.Mesh(antennaGeo, antMat);
      antennaMesh.position.set(0, 0.30, 0);
      headGroup.add(antennaMesh);

      // Status Light indicator tip
      const statusLightMat = new THREE.MeshStandardMaterial({
        color: statusHex,
        emissive: statusHex,
        emissiveIntensity: 1.2,
        roughness: 0.2,
      });
      const statusLightMesh = new THREE.Mesh(tipGeo, statusLightMat);
      statusLightMesh.position.set(0, 0.43, 0);
      headGroup.add(statusLightMesh);

      // Lead agent star
      if (cfg.lead) {
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.position.set(0, 0.57, 0);
        headGroup.add(starMesh);
      }

      group.add(headGroup);

      // Balon teks CSS2D khusus untuk ATLAS
      let bubbleDiv: HTMLDivElement | undefined;
      if (name === MANAGER_AGENT_NAME) {
        bubbleDiv = document.createElement("div");
        bubbleDiv.className = "atlas-speech-bubble";
        bubbleDiv.setAttribute("aria-hidden", "true");
        const bubbleObj = new CSS2DObject(bubbleDiv);
        bubbleObj.position.set(0, 2.05, 0);
        group.add(bubbleObj);
      }

      // Invisible Hitbox
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(robotHitGeo, hitMat);
      hitMesh.position.set(0, 0.62, 0);
      hitMesh.userData = { type: "agent", id: name };
      group.add(hitMesh);
      raycastHitMeshes.push(hitMesh);

      // CSS2D Tag Label
      const labelDiv = document.createElement("div");
      labelDiv.className = `agent-tag3d st-${currentStatus}`;
      labelDiv.style.setProperty("--c", agentColor);
      labelDiv.setAttribute("role", "button");
      labelDiv.setAttribute("tabindex", "0");
      labelDiv.setAttribute("aria-label", `${name}, ${cfg.role}`);

      const dotSpan = document.createElement("span");
      dotSpan.className = `agent-dot3d st-${currentStatus}`;
      labelDiv.appendChild(dotSpan);

      const nameSpan = document.createElement("span");
      nameSpan.className = "agent-name3d";
      nameSpan.textContent = (cfg.lead ? "★ " : "") + name;
      labelDiv.appendChild(nameSpan);

      labelDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        handlersRef.current.selectAgent(name);
      });
      labelDiv.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlersRef.current.selectAgent(name);
        }
      });

      const labelObj = new CSS2DObject(labelDiv);
      labelObj.position.set(0, 1.48, 0);
      group.add(labelObj);

      // Initial position
      const isGatheredNow = gatheredRef.current;
      const meetingRoom = ROOMS.find((r) => r.meeting)!;
      let startX: number;
      let startZ: number;

      if (isGatheredNow && name !== MANAGER_AGENT_NAME) {
        const seat = SEATS[i] ?? [2.5, 2.5];
        startX = meetingRoom.x + seat[0] + OFFSET_X;
        startZ = meetingRoom.y + seat[1] + OFFSET_Z;
      } else {
        const hp = HOME_POSITIONS[name];
        startX = hp[0] + OFFSET_X;
        startZ = hp[1] + OFFSET_Z;
      }
      group.position.set(startX, 0, startZ);

      scene.add(group);

      const record: Agent3DRecord = {
        group,
        bodyMesh,
        headGroup,
        headMesh,
        leftArm,
        rightArm,
        statusLightMesh,
        statusLightMat,
        hitMesh,
        labelObj,
        labelDiv,
        dotSpan,
        targetPos: new THREE.Vector3(startX, 0, startZ),
        currentPos: new THREE.Vector3(startX, 0, startZ),
        baseY: 0,
        phase: i * 0.45,
        status: currentStatus,
      };
      agentRecords[name] = record;

      // Daftarkan ATLAS ke Choreography Engine
      if (name === MANAGER_AGENT_NAME) {
        choreo.registerActor({
          id: name,
          group,
          bodyMesh,
          headMesh,
          bubbleDiv,
          homePos: new THREE.Vector3(startX, 0, startZ),
          targetPos: record.targetPos,
        });
      }
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
            type: "room" | "agent";
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
        const agentHit = hits.find((h) => h.object.userData.type === "agent");
        const hit = agentHit || hits[0];
        const data = hit.object.userData as {
          type: "room" | "agent";
          id: string;
        };
        if (data.type === "agent") {
          handlersRef.current.selectAgent(data.id);
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
          camera.aspect = cr.width / cr.height;
          camera.updateProjectionMatrix();
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
        getSceneUuid: () => scene.uuid,
        getCameraPosition: () => camera.position.clone(),
        getCameraTarget: () => controls.target.clone(),
        getMemoryInfo: () => ({ ...renderer.info.memory }),
        getSelected: () => selectedRef.current,
        getActivePointerCount: () => activePointers.size,
        getAgentPosition: (nama: string) =>
          agentRecords[nama]?.group.position.clone(),
        getAgentTargetPosition: (nama: string) =>
          agentRecords[nama]?.targetPos.clone(),
        getDaylight: () => ({
          ...daylight.getDaylightState(),
          live: daylight.getLiveValues(),
        }),
        setHourOverride: (h: number | null) => {
          daylight.setHourOverride(h);
          setHourOverrideState(h);
        },
        demoDelegate: (roomId: string) => choreo.delegate(roomId),
        clearChoreo: () => choreo.clear(MANAGER_AGENT_NAME),
        isChoreoBusy: (actorId: string = MANAGER_AGENT_NAME) => choreo.isBusy(actorId),
        getChoreoQueueLength: (actorId: string = MANAGER_AGENT_NAME) =>
          choreo.getQueueLength(actorId),
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
        renderer,
        scene,
        camera,
        controls,
      };
    }

    // Animation Loop
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clock = new THREE.Clock();

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isTabVisibleRef.current || !isIntersectingRef.current) {
        return;
      }

      const rawDt = clock.getDelta();
      const time = clock.getElapsedTime();
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

        if (progress >= 1) {
          camera.position.copy(INIT_CAM_POS);
          controls.target.copy(INIT_CAM_TARGET);
          resetAnimRef.current.active = false;
        }
      }

      controls.update();

      // Siklus pencahayaan jam nyata (daylight)
      daylight.checkPeriodicUpdate();
      daylight.update(rawDt, {
        ambientLight,
        dirLight1,
        dirLight2,
        scene,
        roomFloorMats: floorMaterialsRef.current,
      });

      // Mesin koreografi
      choreo.update(rawDt, reducedMotion);

      // Animate Agents
      const isGathered = gatheredRef.current;
      const currentSel = selectedRef.current;
      const camPos = camera.position;

      Object.entries(agentRecords).forEach(([name, rec]) => {
        const isActorUnderChoreo =
          name === MANAGER_AGENT_NAME && choreo.isBusy(MANAGER_AGENT_NAME);

        const override = statusOverridesRef.current[name];
        const activeStatus = override ?? rec.status;

        // Gerakan posisi: jika aktor sedang dikendalikan choreo, lerp posisi regular dilewati
        if (!isActorUnderChoreo) {
          if (reducedMotion) {
            rec.group.position.x = rec.targetPos.x;
            rec.group.position.z = rec.targetPos.z;
          } else {
            rec.group.position.x += (rec.targetPos.x - rec.group.position.x) * 0.08;
            rec.group.position.z += (rec.targetPos.z - rec.group.position.z) * 0.08;
          }
        }

        // Animasi halus bekerja / idle / review / berjalan
        if (reducedMotion) {
          rec.group.position.y = rec.baseY;
          rec.bodyMesh.scale.set(1, 1, 1);
          rec.bodyMesh.rotation.set(0, 0, 0);
          rec.headGroup.rotation.set(0, 0, 0);
          rec.leftArm.rotation.set(0, 0, 0);
          rec.rightArm.rotation.set(0, 0, 0);
          rec.statusLightMat.emissiveIntensity =
            activeStatus === "idle" ? 0.3 : 1.2;
        } else if (isActorUnderChoreo) {
          // Sedang berjalan dalam koreografi (bobbing & rotasi sudah ditangani choreo)
          rec.leftArm.rotation.set(0, 0, 0);
          rec.rightArm.rotation.set(0, 0, 0);
          rec.statusLightMat.emissiveIntensity = 0.9;
        } else {
          // Di meja: status visual halus
          if (activeStatus === "working") {
            // working: kepala miring & mengetuk, badan goyang mikro, lengan mengetuk meja
            const bobY = Math.sin(time * 5.2 + rec.phase) * 0.055;
            rec.group.position.y = rec.baseY + bobY;
            rec.statusLightMat.emissiveIntensity =
              1.1 + Math.sin(time * 6.5 + rec.phase) * 0.7;

            rec.leftArm.rotation.x = Math.sin(time * 12 + rec.phase) * 0.28;
            rec.rightArm.rotation.x = Math.cos(time * 12 + rec.phase) * 0.28;

            rec.headGroup.rotation.z = Math.sin(time * 3.2 + rec.phase) * 0.06;
            rec.headGroup.rotation.x = Math.abs(Math.sin(time * 6.5 + rec.phase)) * 0.08;
            rec.headGroup.rotation.y = 0;

            rec.bodyMesh.rotation.y = Math.sin(time * 4.0 + rec.phase) * 0.03;
            rec.bodyMesh.scale.set(1, 1, 1);
          } else if (activeStatus === "review") {
            // review: kepala mengangguk lambat seolah menunggu
            const bobY = Math.sin(time * 2.8 + rec.phase) * 0.025;
            rec.group.position.y = rec.baseY + bobY;
            rec.statusLightMat.emissiveIntensity =
              1.0 + Math.sin(time * 3.5 + rec.phase) * 0.4;

            rec.leftArm.rotation.set(0, 0, 0);
            rec.rightArm.rotation.set(0, 0, 0);
            rec.headGroup.rotation.x = Math.abs(Math.sin(time * 3.0 + rec.phase)) * 0.18;
            rec.headGroup.rotation.y = 0;
            rec.headGroup.rotation.z = 0;
            rec.bodyMesh.rotation.set(0, 0, 0);
            rec.bodyMesh.scale.set(1, 1, 1);
          } else {
            // idle: napas pelan (skala Y ±1-1.5%) dan sesekali menoleh
            rec.group.position.y = rec.baseY;
            rec.statusLightMat.emissiveIntensity = 0.3;
            rec.leftArm.rotation.set(0, 0, 0);
            rec.rightArm.rotation.set(0, 0, 0);
            rec.bodyMesh.rotation.set(0, 0, 0);

            rec.bodyMesh.scale.y = 1.0 + Math.sin(time * 2.6 + rec.phase) * 0.022;
            const turnPhase = Math.sin(time * 0.4 + rec.phase);
            rec.headGroup.rotation.y =
              turnPhase > 0.6 ? Math.sin(time * 1.8 + rec.phase) * 0.22 : 0;
            rec.headGroup.rotation.x = 0;
            rec.headGroup.rotation.z = 0;
          }
        }

        // Label distance fading & gather occlusion
        const dist = camPos.distanceTo(rec.group.position);
        const isHovered =
          hoveredRef.current?.type === "agent" && hoveredRef.current.id === name;
        const isSelected =
          currentSel?.type === "agent" && currentSel.id === name;

        // Dalam mode kumpul ruang meeting, sembunyikan label agent lain yang tidak dipilih
        // (kecuali ATLAS yang berada di luar ruang meeting)
        if (isGathered && name !== MANAGER_AGENT_NAME && !isHovered && !isSelected) {
          rec.labelDiv.style.display = "none";
        } else {
          rec.labelDiv.style.display = "inline-flex";
          const maxDist = 52;
          const minDist = 16;
          const alpha = Math.min(
            1.0,
            Math.max(0.35, 1.0 - (dist - minDist) / (maxDist - minDist))
          );
          rec.labelDiv.style.opacity = alpha.toFixed(2);
        }
      });

      // Room labels distance fading
      Object.entries(roomRecords).forEach(([, rRec]) => {
        const dist = camPos.distanceTo(rRec.group.position);
        const alpha = Math.min(1.0, Math.max(0.4, 1.0 - (dist - 14) / 42));
        rRec.labelDiv.style.opacity = alpha.toFixed(2);
      });

      renderer.render(scene, camera);
      cssRenderer.render(scene, camera);
    }

    animate();

    // Cleanup on unmount
    return () => {
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

        {/* Panel Kontrol Mode Demo & Jam (Hanya non-production atau ?demo=1) */}
        {showDemoUI && (
          <aside
            className="stage-demo-panel"
            aria-label="Mode Demo dan Kontrol Cahaya"
          >
            <div className="stage-demo-head">
              <span>Mode Demo</span>
              <span className="stage-demo-badge">V1a</span>
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
        {onToggleFullFrame && (
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

        {/* Info Button & Popover (Bottom Right) */}
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
      </div>

      {/* Normal Mode Detail Panel */}
      {!fullFrame && <div className="detail">{renderDetailContent()}</div>}

      {/* Full Frame Desktop Floating Detail Panel (Bottom Center) */}
      {fullFrame && (
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
