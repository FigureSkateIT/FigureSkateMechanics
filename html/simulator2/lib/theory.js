// ./lib/theory.js
// 理論値の計算（回転は等角速度、入力の角度は「前方=0°」規約）

const DEG2RAD = Math.PI / 180;
const toRad = (d) => d * DEG2RAD;

function safeDiv(a, b, fallback = 0) {
  return Math.abs(b) < 1e-12 ? fallback : a / b;
}

// 任意桁の有効数字丸め（表示用）
export function roundSig(x, sig = 3) {
  if (!isFinite(x) || x === 0) return 0;
  const neg = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const e = Math.floor(Math.log10(x));
  const f = Math.pow(10, sig - 1 - e);
  return neg * Math.round(x * f) / f;
}

export function fmt(x, sig = 3) {
  const r = roundSig(x, sig);
  return (Math.abs(r) < 1e-12 ? 0 : r).toString();
}

/**
 * 入力（パターン）から基礎量を計算
 * - 前方=0° 規約。角速度は符号つき ω（ccw:+, cw:-）
 */
export function computeTheoryBase(inp) {
  const bpm        = inp.bpm ?? 138;
  const diameter   = inp.diameter ?? 9;      // m
  const centralDeg = inp.centralDeg ?? 180;  // deg
  const totalBeats = inp.totalBeats ?? 6;
  const direction  = inp.direction ?? "ccw"; // "ccw" | "cw"

  const Tb = safeDiv(60, Math.max(1e-12, bpm));          // s/beat
  const T  = totalBeats * Tb;                             // s
  const phiSpanRad = toRad(centralDeg);
  const wMag = safeDiv(phiSpanRad, Math.max(1e-12, T));   // |ω|
  const omega = (direction === "cw" ? -1 : 1) * wMag;     // 符号つき
  const R = (inp.diameter ?? 9) / 2;                      // m

  return { Tb, T, omega, omegaAbs: Math.abs(omega), R, phiSpanRad };
}

/**
 * 単一ケース（Δt, A, mass）から理論値を計算
 * - swingBeats: Δt（ビート）
 * - swingAmp:   A（m） … Δt の間に相対座標が動く目安距離
 * - mass:       N=kg*m/s^2 用
 */
export function computeTheoryRow(base, caseSpec, sig = 2) {
  const swingBeats = Math.max(1e-9, caseSpec.swingBeats ?? 1);
  const swingAmp   = caseSpec.swingAmp ?? 1.0;

  const dt   = swingBeats * base.Tb;                         // s
  const vrel = safeDiv(swingAmp, dt);                        // m/s
  const a_cf = base.omegaAbs * base.omegaAbs * base.R;       // ω^2 R
  const a_c  = 2 * base.omegaAbs * vrel;                     // |2 ω v_r|
  const drift = 0.5 * a_c * dt * dt;                         // Δy = 1/2 a_c dt^2
  const devDeg = (Math.atan2(drift, swingAmp) / Math.PI) * 180; // φ = atan(Δy/A)
  return {
    label: caseSpec.label ?? "",
    // raw
    Tb: base.Tb, T: base.T, omega: base.omega, omegaAbs: base.omegaAbs, R: base.R,
    dt, vrel, a_cf, a_c, drift, devDeg, F_c,
    // display
    f: {
      Tb: fmt(base.Tb, sig),
      T: fmt(base.T, sig),
      omega: fmt(base.omega, sig),
      R: fmt(base.R, sig),
      dt: fmt(dt, sig),
      vrel: fmt(vrel, sig),
      a_cf: fmt(a_cf, sig),
      a_c: fmt(a_c, sig),
      drift: fmt(drift, sig),
      devDeg: fmt(devDeg, sig),
    }
  };
}

/**
 * 複数ケースをまとめて計算
 * cases: [{label, swingBeats, swingAmp, mass?}, ...]
 */
export function computeTheoryRows(inp, cases = [], sig = 2) {
  const base = computeTheoryBase(inp);
  return cases.map(c => computeTheoryRow(base, c, sig));
}
