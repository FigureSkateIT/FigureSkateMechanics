// ./lib/viewmap.js

// 基底
const e_r = (phi) => [Math.cos(phi), Math.sin(phi)];      // 半径（外向き+）
const e_t = (phi) => [-Math.sin(phi), Math.cos(phi)];     // 接線（CCW 前方+）
const dot = (a,b) => a[0]*b[0] + a[1]*b[1];

/**
 * 絶対座標の点列を「上=初期接線, 右=円の内側」に射影する関数を返す。
 * - ω>0（CCW）のとき、右=内側（-r̂0）
 * - ω<0（CW） のとき、右=外側（+r̂0）
 */
export function makeAbsProjector(params){
  const { phi0, omega } = params;
  const vy = e_t(phi0);               // 上=前方
  const r0 = e_r(phi0);
  const inward = (omega > 0) ? -1 : +1;    // CCWなら右=内側
  const vx = [ inward*r0[0], inward*r0[1] ];  // 右=内/外を自動切替
  return (points) => points.map(p => [ dot(p, vx), dot(p, vy) ]);
}

/**
 * 回転座標（s_t, s_n）→ 初期基底(t̂0, r̂0)へ逆回転し、
 * 上=前方(t̂0), 右=円の内側（ωで自動切替）に並べ替えた点列を返す。
 * series: { time, sts, sns }  （sns は中心基準。スケーター相対は sns - R）
 */
export function mapRotRelToView(series, params){
  const { time, sts, sns } = series;
  const { phi0, omega, R } = params;

  const inwardSign = (omega > 0) ? +1 : -1; // r0>0 が外向き。内側を +X にしたいので CCWなら +X=内側 => r0 に符号反転をかける
  const out = [];
  for (let i=0; i<time.length; i++){
    const phi = phi0 + omega*time[i];
    const d = phi - phi0;         // 現在基底 -> 初期基底への角度差
    const c = Math.cos(d), s = Math.sin(d);

    // スケーター相対（CoM基準）成分を、初期基底へ回し直す
    const st = sts[i];
    const rn = sns[i] - R;        // CoM基準の半径成分（外向き+）
    const t0 =  c*st + s*rn;      // 初期接線方向成分（前方+）
    const r0 = -s*st + c*rn;      // 初期半径方向成分（外向き+）

    // 表示系：上=前方(t0)、右=内側
    const x = inwardSign * (-r0); // r0>0=外向き ⇒ 内側は -r0。CCW時は +X=内側になるよう inwardSign を掛ける
    const y = t0;                 // 前方を上へ
    out.push([x,y]);
  }
  return out;
}
