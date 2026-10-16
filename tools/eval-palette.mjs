// Evaluator palette Polish 2

function hexToRgb(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}
function rgbToLab(r, g, b) {
  let [R, G, B] = [r, g, b].map(v => {
    v /= 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  });
  let X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.00000;
  let Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [(116 * fy) - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE76(lab1, lab2) {
  return Math.sqrt(Math.pow(lab1[0] - lab2[0], 2) + Math.pow(lab1[1] - lab2[1], 2) + Math.pow(lab1[2] - lab2[2], 2));
}
function getRelativeLuminance(r, g, b) {
  const [R, G, B] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function getContrastRatio(hex1, hex2) {
  const lum1 = getRelativeLuminance(...hexToRgb(hex1));
  const lum2 = getRelativeLuminance(...hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const commonFloors = {
  pantry: '#faebd7',
  lounge: '#ede9fe',
  toilet: '#e0f2fe',
  taman: '#dcfce7',
  taman_kecil: '#dcfce7',
  resepsi: '#fef3c7',
  atrium: '#edf2f7',
  corridor: '#dbe5f0'
};

const desks = {
  meeting: '#4a3c31',
  manager: '#5c3d2e',
  riset: '#0284c7',
  operasional: '#2b394e',
  advertiser: '#1e3a5f',
  hr: '#4a354f',
  sosmed: '#523f3a',
  creative: '#4c1d95',
  copy: '#831843',
  landing_page: '#064e3b'
};

const candidatePalette = {
  meeting: '#d5b27a',      // warm oak wood pastel (distinct from pantry/resepsi)
  operasional: '#7fa2be',  // industrial steel-slate blue
  advertiser: '#6cd3ff',   // vibrant cyan-sky blue
  manager: '#f38981',      // executive coral pink/red
  riset: '#f6be55',        // amber gold research
  hr: '#e592f7',           // orchid / magenta HR
  sosmed: '#fca25e',       // lively social media orange
  creative: '#b89df8',     // vivid purple lilac
  copy: '#ff7eb8',         // flamingo / vivid rose pink
  landing_page: '#4fe6b2', // energetic emerald mint
};

console.log("=== EVALUASI CANDIDATE PALETTE ===");
let allPass = true;

console.log("\n--- 1. Saturation (harus >= 0.25) ---");
for (const [k, hex] of Object.entries(candidatePalette)) {
  const [, s, l] = rgbToHsl(...hexToRgb(hex));
  const pass = s >= 0.25;
  if (!pass) allPass = false;
  console.log(k.padEnd(14), hex, "Sat:", s.toFixed(3), pass ? "OK" : "FAIL");
}

console.log("\n--- 2. Delta E to common floors (harus >= 15) ---");
for (const [dept, dHex] of Object.entries(candidatePalette)) {
  const dLab = rgbToLab(...hexToRgb(dHex));
  let minCom = Infinity;
  let minComName = "";
  for (const [com, cHex] of Object.entries(commonFloors)) {
    const cLab = rgbToLab(...hexToRgb(cHex));
    const dist = deltaE76(dLab, cLab);
    if (dist < minCom) {
      minCom = dist;
      minComName = com;
    }
  }
  const pass = minCom >= 15;
  if (!pass) allPass = false;
  console.log(dept.padEnd(14), "min dE:", minCom.toFixed(2), "to", minComName, pass ? "OK" : "FAIL < 15");
}

console.log("\n--- 3. Inter-department Delta E (harus >= 12) ---");
const keys = Object.keys(candidatePalette);
let minInter = Infinity;
let minPair = "";
for (let i = 0; i < keys.length; i++) {
  for (let j = i + 1; j < keys.length; j++) {
    const k1 = keys[i], k2 = keys[j];
    const d1 = rgbToLab(...hexToRgb(candidatePalette[k1]));
    const d2 = rgbToLab(...hexToRgb(candidatePalette[k2]));
    const dist = deltaE76(d1, d2);
    if (dist < minInter) {
      minInter = dist;
      minPair = k1 + " & " + k2;
    }
    if (dist < 12) {
      console.log("FAIL:", k1, "&", k2, dist.toFixed(2));
      allPass = false;
    }
  }
}
console.log("Min inter-dept distance:", minInter.toFixed(2), "between", minPair, minInter >= 12 ? "OK" : "FAIL < 12");

console.log("\n--- 4. Contrast to Desk (harus >= 1.5:1) ---");
for (const [dept, fHex] of Object.entries(candidatePalette)) {
  const deskHex = desks[dept] || "#334155";
  const cr = getContrastRatio(fHex, deskHex);
  const pass = cr >= 1.5;
  if (!pass) allPass = false;
  console.log(dept.padEnd(14), "Floor:", fHex, "Desk:", deskHex, "CR:", cr.toFixed(2) + ":1", pass ? "OK" : "FAIL < 1.5");
}

console.log("\nALL PASS?:", allPass);
