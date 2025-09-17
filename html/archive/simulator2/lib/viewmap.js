// ./lib/viewmap.js
// 余計な回転はせず、上下・左右の反転だけでビューに合わせる。

const e_r = (phi) => [Math.cos(phi), Math.sin(phi)];      // 半径（外向き+）
const e_t = (phi) => [-Math.sin(phi), Math.cos(phi)];     // 接線（CCW基準の前方+）
const dot = (a,b) => a[0]*b[0] + a[1]*b[1];

/**
 * 絶対座標の点列をビューへ射影
 * - 上（+Y）= 前方 = sign(ω)·t̂(φ0)
 * - 右（+X）= 内側 = -sign(ω)·r̂(φ0)
 * ※ 符号反転のみ。任意回転・スケールの調整はしません。
 */
export function makeAbsProjector({ phi0, omega }) {
  const s = Math.sign(omega) || 1;         // ω=0 のときは + とみなす
  const t0 = e_t(phi0);
  const r0 = e_r(phi0);

  const vy = [ s*t0[0],  s*t0[1] ];        // 上 = 前方
  const vx = [ -s*r0[0], -s*r0[1] ];       // 右 = 内側

  return (points) => points.map((p) => [ dot(p, vx), dot(p, vy) ]);
}

/**
 * 回転座標（中心基準）→ ビュー
 * 入力 series: { time, sts, sns }  ※ sns は中心基準、スケーター相対は (sns - R)
 * - 上（+Y）= 前方 = sign(ω)·s_t
 * - 右（+X）= 内側 = -sign(ω)·(s_n - R)
 * ※ 時間ごとの回転戻しはしない（成分そのまま、符号のみ切替）
 */
export function mapRotRelToView(series, { omega, R }) {
  const s = Math.sign(omega) || 1;
  const out = [];
  for (let i = 0; i < series.time.length; i++) {
    const st = series.sts[i];        // 接線成分（CCW基準）
    const rn = series.sns[i] - R;    // 半径成分（外向き+）を CoM 基準に
    const y = s * st;                // 上 = 前方
    const x = -s * rn;               // 右 = 内側
    out.push([x, y]);
  }
  return out;
}
