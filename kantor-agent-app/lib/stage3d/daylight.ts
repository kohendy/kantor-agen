// Siklus Pencahayaan Alami Mengikuti Jam Nyata (daylight.ts)
// Mendukung interpolasi 4 fase: pagi (06-10), siang (10-15), sore (15-18), malam (18-06).
// Transisi dilerp halus ±2 detik. Menjaga kecerahan lantai minimum agar label & lampu tetap terbaca.

import * as THREE from "three";
import { THEME } from "./theme";

export type DaylightPhase = "pagi" | "siang" | "sore" | "malam";

export interface LightValues {
  ambientColor: number;
  ambientIntensity: number;
  dir1Color: number;
  dir1Intensity: number;
  dir2Color: number;
  dir2Intensity: number;
  bgColor: number;
  floorEmissive: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
}

export interface DaylightState {
  hour: number;
  phase: DaylightPhase;
  values: LightValues;
}

// Keyframes jam untuk interpolasi
interface Keyframe {
  hour: number;
  phase: DaylightPhase;
  values: LightValues;
}

const KEYFRAMES: Keyframe[] = [
  // 07:00 - Pagi (hangat dan terang)
  {
    hour: 7,
    phase: "pagi",
    values: {
      ambientColor: 0xfff3e3,
      ambientIntensity: 1.35,
      dir1Color: 0xffebcc,
      dir1Intensity: 1.50,
      dir2Color: 0xe0e7ff,
      dir2Intensity: 0.65,
      bgColor: new THREE.Color(THEME.background.morning).getHex(),
      floorEmissive: 0.0,
      hemiSkyColor: 0xfff8ee,
      hemiGroundColor: 0xccd5e8,
      hemiIntensity: 0.55,
    },
  },
  // 13:00 - Siang (terang netral)
  {
    hour: 13,
    phase: "siang",
    values: {
      ambientColor: 0xfffbf2,
      ambientIntensity: 1.55,
      dir1Color: 0xfffaed,
      dir1Intensity: 1.65,
      dir2Color: 0xdbeafe,
      dir2Intensity: 0.75,
      bgColor: new THREE.Color(THEME.background.day).getHex(),
      floorEmissive: 0.0,
      hemiSkyColor: 0xffffff,
      hemiGroundColor: 0xdbeafe,
      hemiIntensity: 0.65,
    },
  },
  // 17:00 - Sore (hangat oranye lembut tapi tetap terang)
  {
    hour: 17,
    phase: "sore",
    values: {
      ambientColor: 0xffeedb,
      ambientIntensity: 1.25,
      dir1Color: 0xffb87a,
      dir1Intensity: 1.35,
      dir2Color: 0xd4d4f8,
      dir2Intensity: 0.60,
      bgColor: new THREE.Color(THEME.background.evening).getHex(),
      floorEmissive: 0.02,
      hemiSkyColor: 0xffeedb,
      hemiGroundColor: 0x94a3b8,
      hemiIntensity: 0.50,
    },
  },
  // 22:00 - Malam (biru gelap berkarakter, agen & furnitur tetap terang dengan HemisphereLight & kontras >= 1.3:1)
  {
    hour: 22,
    phase: "malam",
    values: {
      ambientColor: 0x526388,
      ambientIntensity: 1.10,
      dir1Color: 0xa2b7e0,
      dir1Intensity: 0.95,
      dir2Color: 0x65779c,
      dir2Intensity: 0.55,
      bgColor: new THREE.Color(THEME.background.night).getHex(),
      floorEmissive: 0.03,
      hemiSkyColor: 0x94a6c4,
      hemiGroundColor: 0x3d4960,
      hemiIntensity: 0.75,
    },
  },
];

// Baca override jam dari parameter URL (?jam=HH atau ?jam=HH:MM)
export function getHourFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("jam");
  if (!param) return null;

  if (param.includes(":")) {
    const [h, m] = param.split(":");
    const parsedH = parseFloat(h);
    const parsedM = parseFloat(m) || 0;
    if (!isNaN(parsedH)) return (parsedH + parsedM / 60) % 24;
  }
  const parsed = parseFloat(param);
  return !isNaN(parsed) ? parsed % 24 : null;
}

// Tentukan fase nama dari jam
export function getPhaseFromHour(hour: number): DaylightPhase {
  if (hour >= 6 && hour < 10) return "pagi";
  if (hour >= 10 && hour < 15) return "siang";
  if (hour >= 15 && hour < 18) return "sore";
  return "malam";
}

// Interpolasi antara dua keyframe
export function computeDaylightValues(hour: number): DaylightState {
  const normHour = (hour % 24 + 24) % 24;
  const phase = getPhaseFromHour(normHour);

  // Cari keyframe sebelum dan sesudah dalam siklus melingkar 24 jam
  const frames = [...KEYFRAMES].sort((a, b) => a.hour - b.hour);

  let kfPrev: Keyframe = frames[frames.length - 1];
  let kfNext: Keyframe = frames[0];

  for (let i = 0; i < frames.length; i++) {
    const cur = frames[i];
    const next = frames[(i + 1) % frames.length];

    let span = next.hour - cur.hour;
    if (span <= 0) span += 24;

    let dist = normHour - cur.hour;
    if (dist < 0) dist += 24;

    if (dist <= span) {
      kfPrev = cur;
      kfNext = next;
      break;
    }
  }

  let span = kfNext.hour - kfPrev.hour;
  if (span <= 0) span += 24;
  let dist = normHour - kfPrev.hour;
  if (dist < 0) dist += 24;

  const t = Math.max(0, Math.min(1, dist / span));

  // Lerp warna dan intensitas
  const ambColor = new THREE.Color(kfPrev.values.ambientColor).lerp(
    new THREE.Color(kfNext.values.ambientColor),
    t
  );
  const dir1Color = new THREE.Color(kfPrev.values.dir1Color).lerp(
    new THREE.Color(kfNext.values.dir1Color),
    t
  );
  const dir2Color = new THREE.Color(kfPrev.values.dir2Color).lerp(
    new THREE.Color(kfNext.values.dir2Color),
    t
  );
  const bgColor = new THREE.Color(kfPrev.values.bgColor).lerp(
    new THREE.Color(kfNext.values.bgColor),
    t
  );
  const hemiSky = new THREE.Color(kfPrev.values.hemiSkyColor).lerp(
    new THREE.Color(kfNext.values.hemiSkyColor),
    t
  );
  const hemiGround = new THREE.Color(kfPrev.values.hemiGroundColor).lerp(
    new THREE.Color(kfNext.values.hemiGroundColor),
    t
  );

  return {
    hour: normHour,
    phase,
    values: {
      ambientColor: ambColor.getHex(),
      ambientIntensity:
        kfPrev.values.ambientIntensity +
        (kfNext.values.ambientIntensity - kfPrev.values.ambientIntensity) * t,
      dir1Color: dir1Color.getHex(),
      dir1Intensity:
        kfPrev.values.dir1Intensity +
        (kfNext.values.dir1Intensity - kfPrev.values.dir1Intensity) * t,
      dir2Color: dir2Color.getHex(),
      dir2Intensity:
        kfPrev.values.dir2Intensity +
        (kfNext.values.dir2Intensity - kfPrev.values.dir2Intensity) * t,
      bgColor: bgColor.getHex(),
      floorEmissive:
        kfPrev.values.floorEmissive +
        (kfNext.values.floorEmissive - kfPrev.values.floorEmissive) * t,
      hemiSkyColor: hemiSky.getHex(),
      hemiGroundColor: hemiGround.getHex(),
      hemiIntensity:
        kfPrev.values.hemiIntensity +
        (kfNext.values.hemiIntensity - kfPrev.values.hemiIntensity) * t,
    },
  };
}

export class DaylightController {
  private hourOverride: number | null = null;
  private targetState: DaylightState;
  private currentAmbColor = new THREE.Color();
  private currentDir1Color = new THREE.Color();
  private currentDir2Color = new THREE.Color();
  private currentBgColor = new THREE.Color();
  private currentHemiSky = new THREE.Color();
  private currentHemiGround = new THREE.Color();
  private currentAmbIntensity = 1.4;
  private currentDir1Intensity = 1.6;
  private currentDir2Intensity = 0.8;
  private currentHemiIntensity = 0.65;
  private currentFloorEmissive = 0.0;
  private lastComputeTime = 0;

  constructor() {
    this.hourOverride = getHourFromUrl();
    this.targetState = computeDaylightValues(this.getCurrentHour());
    this.syncImmediate();
  }

  public getCurrentHour(): number {
    if (this.hourOverride !== null) return this.hourOverride;
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }

  public setHourOverride(h: number | null): void {
    this.hourOverride = h;
    this.targetState = computeDaylightValues(this.getCurrentHour());
  }

  public getHourOverride(): number | null {
    return this.hourOverride;
  }

  public getDaylightState(): DaylightState {
    return this.targetState;
  }

  public getLiveValues() {
    return {
      ambientColor: this.currentAmbColor.getHex(),
      ambientIntensity: this.currentAmbIntensity,
      dir1Color: this.currentDir1Color.getHex(),
      dir1Intensity: this.currentDir1Intensity,
      dir2Color: this.currentDir2Color.getHex(),
      dir2Intensity: this.currentDir2Intensity,
      bgColor: this.currentBgColor.getHex(),
      floorEmissive: this.currentFloorEmissive,
      hemiSkyColor: this.currentHemiSky.getHex(),
      hemiGroundColor: this.currentHemiGround.getHex(),
      hemiIntensity: this.currentHemiIntensity,
    };
  }

  // Langsung samakan tanpa transisi saat inisialisasi scene
  public syncImmediate(): void {
    const v = this.targetState.values;
    this.currentAmbColor.setHex(v.ambientColor);
    this.currentAmbIntensity = v.ambientIntensity;
    this.currentDir1Color.setHex(v.dir1Color);
    this.currentDir1Intensity = v.dir1Intensity;
    this.currentDir2Color.setHex(v.dir2Color);
    this.currentDir2Intensity = v.dir2Intensity;
    this.currentBgColor.setHex(v.bgColor);
    this.currentHemiSky.setHex(v.hemiSkyColor);
    this.currentHemiGround.setHex(v.hemiGroundColor);
    this.currentHemiIntensity = v.hemiIntensity;
    this.currentFloorEmissive = v.floorEmissive;
  }

  // Hitung ulang berkala tiap 60 detik atau saat tab terlihat
  public checkPeriodicUpdate(): void {
    const now = Date.now();
    if (now - this.lastComputeTime > 60000) {
      this.lastComputeTime = now;
      this.targetState = computeDaylightValues(this.getCurrentHour());
    }
  }

  // Lerp halus ±2 detik per frame
  public update(
    dt: number,
    lights: {
      ambientLight: THREE.AmbientLight;
      dirLight1: THREE.DirectionalLight;
      dirLight2: THREE.DirectionalLight;
      hemiLight?: THREE.HemisphereLight;
      scene: THREE.Scene;
      roomFloorMats: THREE.MeshStandardMaterial[];
    }
  ): void {
    const lerpFactor = Math.min(1.0, dt * 1.5);
    const target = this.targetState.values;

    // Ambient
    this.currentAmbColor.lerp(new THREE.Color(target.ambientColor), lerpFactor);
    this.currentAmbIntensity += (target.ambientIntensity - this.currentAmbIntensity) * lerpFactor;
    lights.ambientLight.color.copy(this.currentAmbColor);
    lights.ambientLight.intensity = this.currentAmbIntensity;

    // DirLight 1
    this.currentDir1Color.lerp(new THREE.Color(target.dir1Color), lerpFactor);
    this.currentDir1Intensity += (target.dir1Intensity - this.currentDir1Intensity) * lerpFactor;
    lights.dirLight1.color.copy(this.currentDir1Color);
    lights.dirLight1.intensity = this.currentDir1Intensity;

    // DirLight 2
    this.currentDir2Color.lerp(new THREE.Color(target.dir2Color), lerpFactor);
    this.currentDir2Intensity += (target.dir2Intensity - this.currentDir2Intensity) * lerpFactor;
    lights.dirLight2.color.copy(this.currentDir2Color);
    lights.dirLight2.intensity = this.currentDir2Intensity;

    // Hemisphere Light
    if (lights.hemiLight) {
      this.currentHemiSky.lerp(new THREE.Color(target.hemiSkyColor), lerpFactor);
      this.currentHemiGround.lerp(new THREE.Color(target.hemiGroundColor), lerpFactor);
      this.currentHemiIntensity += (target.hemiIntensity - this.currentHemiIntensity) * lerpFactor;
      lights.hemiLight.color.copy(this.currentHemiSky);
      lights.hemiLight.groundColor.copy(this.currentHemiGround);
      lights.hemiLight.intensity = this.currentHemiIntensity;
    }

    // Scene Background
    this.currentBgColor.lerp(new THREE.Color(target.bgColor), lerpFactor);
    if (!lights.scene.background || !(lights.scene.background instanceof THREE.Color)) {
      lights.scene.background = this.currentBgColor.clone();
    } else {
      (lights.scene.background as THREE.Color).copy(this.currentBgColor);
    }

    // Floor Emissive (sedikit berpendar di malam hari)
    this.currentFloorEmissive += (target.floorEmissive - this.currentFloorEmissive) * lerpFactor;
    lights.roomFloorMats.forEach((mat) => {
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = this.currentFloorEmissive;
    });
  }
}
