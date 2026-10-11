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
  ROOMS,
  SEATS,
  STATUS_LABEL,
  colorOfAgent,
  roomOfAgent,
} from "@/lib/officeConfig";
import type { AgentRow, EventRow, AgentStatus } from "@/lib/types";
import { OfficeStage as OfficeStageSVG } from "./OfficeStage";

export type Selection = { type: "room" | "agent"; id: string } | null;

interface Agent3DRecord {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
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

const OFFSET_X = -8.5;
const OFFSET_Z = -5.5;

const INIT_CAM_POS = new THREE.Vector3(14.5, 17.5, 17.0);
const INIT_CAM_TARGET = new THREE.Vector3(0, 0, 0);

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
  useEffect(() => {
    const meetingRoom = ROOMS.find((r) => r.meeting)!;
    AGENT_RENDER_ORDER.forEach((name, i) => {
      const rec = agentRecordsRef.current[name];
      if (!rec) return;
      if (gathered) {
        const sx = meetingRoom.x + SEATS[i][0] + OFFSET_X;
        const sz = meetingRoom.y + SEATS[i][1] + OFFSET_Z;
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

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200);
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
    controls.maxDistance = 55;
    controls.maxPolarAngle = Math.PI / 2 - 0.08; // strictly < 90 deg so cannot dip under floor
    controls.minPolarAngle = 0.12;
    controls.listenToKeyEvents(window);

    // Pan clamping so map is never lost
    controls.addEventListener("change", () => {
      controls.target.x = Math.max(-12, Math.min(12, controls.target.x));
      controls.target.y = Math.max(-2, Math.min(5, controls.target.y));
      controls.target.z = Math.max(-10, Math.min(10, controls.target.z));
    });

    // Lighting
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

    // Track raycast hit targets
    const raycastHitMeshes: THREE.Mesh[] = [];

    // Build Rooms
    const roomRecords: Record<string, Room3DRecord> = {};
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
        // lines along X
        gridPoints.push(new THREE.Vector3(cx - 2.5, 0.005, cz + offset));
        gridPoints.push(new THREE.Vector3(cx + 2.5, 0.005, cz + offset));
        // lines along Z
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

        // Glowing trim on table top
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
          sctx.letterSpacing = "2px";
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
        selectRoom(room.id);
      });
      labelDiv.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectRoom(room.id);
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

    // Build Agents (Robots)
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
    const robotHitGeo = new THREE.BoxGeometry(0.85, 1.25, 0.85);

    AGENT_RENDER_ORDER.forEach((name, i) => {
      const group = new THREE.Group();
      const cfg = AGENTS[name];
      const agentColor = colorOfAgent(name);
      const agentHex = new THREE.Color(agentColor).getHex();
      const currentStatus = statusOf(name);
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

      // Head
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xeef0ff,
        roughness: 0.35,
        metalness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.set(0, 0.77, 0);
      group.add(headMesh);

      // Visor
      const visorMesh = new THREE.Mesh(visorGeo, visorMat);
      visorMesh.position.set(0, 0.77, 0.22);
      group.add(visorMesh);

      // Eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: agentHex });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.11, 0.77, 0.24);
      group.add(leftEye);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.11, 0.77, 0.24);
      group.add(rightEye);

      // Antenna
      const antMat = new THREE.MeshBasicMaterial({ color: 0xeef0ff });
      const antennaMesh = new THREE.Mesh(antennaGeo, antMat);
      antennaMesh.position.set(0, 1.07, 0);
      group.add(antennaMesh);

      // Status Light indicator tip
      const statusLightMat = new THREE.MeshStandardMaterial({
        color: statusHex,
        emissive: statusHex,
        emissiveIntensity: 1.2,
        roughness: 0.2,
      });
      const statusLightMesh = new THREE.Mesh(tipGeo, statusLightMat);
      statusLightMesh.position.set(0, 1.2, 0);
      group.add(statusLightMesh);

      // Lead agent star
      if (cfg.lead) {
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.position.set(0, 1.34, 0);
        group.add(starMesh);
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
        selectAgent(name);
      });
      labelDiv.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectAgent(name);
        }
      });

      const labelObj = new CSS2DObject(labelDiv);
      labelObj.position.set(0, 1.48, 0);
      group.add(labelObj);

      // Home position
      const hp = HOME_POSITIONS[name];
      const startX = hp[0] + OFFSET_X;
      const startZ = hp[1] + OFFSET_Z;
      group.position.set(startX, 0, startZ);

      scene.add(group);

      agentRecords[name] = {
        group,
        bodyMesh,
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
    });
    agentRecordsRef.current = agentRecords;

    // Pointer events for Click vs Drag distinction (~5px threshold)
    let pointerDownPos = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onPointerDown(e: MouseEvent) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    }

    function onPointerMove(e: MouseEvent) {
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

    function onPointerUp(e: MouseEvent) {
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 5) return; // was a drag / pan / orbit, not a click

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(raycastHitMeshes, false);
      if (hits.length > 0) {
        // Prioritize agents over room floor if both hit
        const agentHit = hits.find((h) => h.object.userData.type === "agent");
        const hit = agentHit || hits[0];
        const data = hit.object.userData as {
          type: "room" | "agent";
          id: string;
        };
        if (data.type === "agent") {
          selectAgent(data.id);
        } else if (data.type === "room") {
          selectRoom(data.id);
        }
      }
    }

    renderer.domElement.addEventListener("mousedown", onPointerDown);
    renderer.domElement.addEventListener("mousemove", onPointerMove);
    renderer.domElement.addEventListener("mouseup", onPointerUp);

    // ResizeObserver: updates canvas size without changing camera position or target
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

    // Visibility & Intersection Observers (pauses rendering when tab hidden or element not visible)
    function onVisibilityChange() {
      isTabVisibleRef.current = !document.hidden;
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
      // Re-trigger animation loop after WebGL context is restored
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      animate();
    }
    gl.canvas.addEventListener("webglcontextlost", onContextLost);
    gl.canvas.addEventListener("webglcontextrestored", onContextRestored);

    // Expose test helper on window for automated verification
    (window as unknown as { __STAGE_3D__?: unknown }).__STAGE_3D__ = {
      getCameraPosition: () => camera.position.clone(),
      getCameraTarget: () => controls.target.clone(),
      getMemoryInfo: () => ({ ...renderer.info.memory }),
      renderer,
      scene,
      camera,
      controls,
    };

    // Animation Loop
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clock = new THREE.Clock();

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isTabVisibleRef.current || !isIntersectingRef.current) {
        return;
      }

      clock.getDelta();
      const time = clock.getElapsedTime();
      const reducedMotion = motionQuery.matches;

      // Handle Smooth Reset Animation if active
      if (resetAnimRef.current && resetAnimRef.current.active) {
        const anim = resetAnimRef.current;
        const now = performance.now();
        const progress = Math.min(1, (now - anim.startTime) / anim.duration);
        // easeInOutCubic
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

      // Animate Agents
      const isGathered = gatheredRef.current;
      const currentSel = selectedRef.current;
      const camPos = camera.position;

      Object.entries(agentRecords).forEach(([name, rec]) => {
        // Movement: Lerp or instant snap
        if (reducedMotion) {
          rec.group.position.x = rec.targetPos.x;
          rec.group.position.z = rec.targetPos.z;
        } else {
          rec.group.position.x += (rec.targetPos.x - rec.group.position.x) * 0.08;
          rec.group.position.z += (rec.targetPos.z - rec.group.position.z) * 0.08;
        }

        // Bobbing based on status
        let bobY = 0;
        if (!reducedMotion) {
          if (rec.status === "working") {
            bobY = Math.sin(time * 5.2 + rec.phase) * 0.055;
            rec.statusLightMat.emissiveIntensity =
              1.1 + Math.sin(time * 6.5 + rec.phase) * 0.7;
          } else if (rec.status === "review") {
            bobY = Math.sin(time * 2.8 + rec.phase) * 0.025;
            rec.statusLightMat.emissiveIntensity =
              1.0 + Math.sin(time * 3.5 + rec.phase) * 0.4;
          } else {
            rec.statusLightMat.emissiveIntensity = 0.3;
          }
        }
        rec.group.position.y = rec.baseY + bobY;

        // Label distance fading & gather occlusion
        const dist = camPos.distanceTo(rec.group.position);
        const isHovered =
          hoveredRef.current?.type === "agent" && hoveredRef.current.id === name;
        const isSelected =
          currentSel?.type === "agent" && currentSel.id === name;

        if (isGathered && !isHovered && !isSelected) {
          // In meeting room gathered mode, hide non-selected labels to prevent clutter
          rec.labelDiv.style.display = "none";
        } else {
          rec.labelDiv.style.display = "inline-flex";
          // Dim labels far from camera
          const maxDist = 48;
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
        const alpha = Math.min(1.0, Math.max(0.4, 1.0 - (dist - 14) / 38));
        rRec.labelDiv.style.opacity = alpha.toFixed(2);
      });

      renderer.render(scene, camera);
      cssRenderer.render(scene, camera);
    }

    animate();

    // Cleanup & Leak Prevention on unmount
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      intersectObserver.disconnect();

      renderer.domElement.removeEventListener("mousedown", onPointerDown);
      renderer.domElement.removeEventListener("mousemove", onPointerMove);
      renderer.domElement.removeEventListener("mouseup", onPointerUp);
      gl.canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.canvas.removeEventListener("webglcontextrestored", onContextRestored);

      controls.dispose();

      // Traverse & Dispose all geometries, materials, textures
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });

      renderer.dispose();

      if (cssRenderer.domElement.parentNode) {
        cssRenderer.domElement.parentNode.removeChild(cssRenderer.domElement);
      }

      delete (window as unknown as { __STAGE_3D__?: unknown }).__STAGE_3D__;
    };
  }, [webglSupported, selectAgent, selectRoom, statusOf]);

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
                ? "Semua agent sedang berkumpul. Arahkan kursor ke karakter untuk melihat namanya."
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
