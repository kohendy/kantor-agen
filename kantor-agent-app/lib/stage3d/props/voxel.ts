// lib/stage3d/props/voxel.ts
// Helper kecil untuk membuat balok berwarna (box(w,h,d,color), posisi relatif)
// yang menggabungkan banyak balok menjadi satu BufferGeometry per prop dengan vertex color.
// Tidak ada tekstur gambar.

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface VoxelBoxDef {
  /** Posisi X relatif terhadap origin/tengah prop */
  x: number;
  /** Posisi Y (tinggi dari lantai, y = 0 adalah alas prop) */
  y: number;
  /** Posisi Z relatif terhadap origin/tengah prop */
  z: number;
  /** Lebar balok sepanjang sumbu X */
  w: number;
  /** Tinggi balok sepanjang sumbu Y */
  h: number;
  /** Kedalaman balok sepanjang sumbu Z */
  d: number;
  /** Warna balok dari THEME */
  color: string | number | THREE.Color;
}

/**
 * Buat satu BoxGeometry dengan posisi tertentu dan pasang attribute vertex color RGB.
 */
export function createVoxelBox(
  w: number,
  h: number,
  d: number,
  color: string | number | THREE.Color,
  x = 0,
  y = 0,
  z = 0,
  centeredXZ = true
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const cx = centeredXZ ? x : x + w / 2;
  const cy = y + h / 2;
  const cz = centeredXZ ? z : z + d / 2;
  geo.translate(cx, cy, cz);

  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const vertexCount = geo.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Menggabungkan banyak balok VoxelBoxDef menjadi satu BufferGeometry dengan vertex colors.
 */
export function buildVoxelGeometry(
  boxes: VoxelBoxDef[],
  centeredXZ = true
): THREE.BufferGeometry {
  if (boxes.length === 0) return new THREE.BufferGeometry();
  const geos = boxes.map((b) =>
    createVoxelBox(b.w, b.h, b.d, b.color, b.x, b.y, b.z, centeredXZ)
  );
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/**
 * Membuat Mesh dari BufferGeometry voxel dengan material MeshStandardMaterial (vertexColors: true).
 */
export function createVoxelMesh(
  geometry: THREE.BufferGeometry,
  materialOptions?: THREE.MeshStandardMaterialParameters
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.1,
    ...materialOptions,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.userData.isStatic = true;
  return mesh;
}
