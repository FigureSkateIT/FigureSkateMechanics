// ./lib/physics.js
const DEG2RAD = Math.PI / 180;
const toRad = (d) => d * DEG2RAD;

const e_r = (phi) => [Math.cos(phi), Math.sin(phi)];      // 半径（外向き+）
const e_t = (phi) => [-Math.sin(phi), Math.cos(phi)];     // 接線（CCW 前向き+）

// 回転基底 (t, r) での Ω× の写像： [vt, vn] -> [ ω*vn, -ω*vt ]
const crossTR = (omega, vTR) => [omega * vTR[1], -omega * vTR[0]];

/** 入力(生) → 導出量（回転座標＝円中心原点） */
export function derive(inp) {
  const Tb = 60 / Math.max(1e-9, inp.bpm);
  const T  = inp.totalBeats * Tb;

  const wMag  = toRad(inp.centralDeg) / Math.max(1e-9, T);
  const omega = (inp.direction === "cw" ? -1 : 1) * wMag;
  const R     = inp.diameter / 2;

  const dt    = inp.swingBeats * Tb;
  const vmag  = inp.swingAmp / dt;

  const phiSpan = toRad(inp.centralDeg);
  const phi0    = (inp.startBeat / Math.max(1e-9, inp.totalBeats)) * phiSpan;

  // 初期位置 s′(0) を中心原点で与える（CoM=[0,R]）
  const r_t0_rel = inp.l * Math.cos(toRad(inp.theta0));
  const r_n0_rel = inp.l * Math.sin(toRad(inp.theta0));
  const s_t0 = r_t0_rel;
  const s_n0 = R + r_n0_rel;

  // 初期相対速度（回転座標成分）
  const v_t0 = vmag * Math.cos(toRad(inp.thetaV));
  const v_n0 = vmag * Math.sin(toRad(inp.thetaV));

  return { Tb, T, dt, omega, R, phi0, s_t0, s_n0, v_t0, v_n0, vmag, h: inp.h };
}

/** 回転座標の運動方程式を積分（symplectic Euler） */
export function integrateRot(prm, mode) {
  const { dt, h, omega, s_t0, s_n0, v_t0, v_n0 } = prm;
  const steps = Math.max(1, Math.ceil(dt / h));

  const time = [], sts = [], sns = [];
  let st = s_t0, sn = s_n0;
  let vt = v_t0, vn = v_n0;

  for (let i = 0; i <= steps; i++) {
    const t = Math.min(i * h, dt);
    time.push(t); sts.push(st); sns.push(sn);
    if (i === steps) break;

    let at = 0, an = 0;
    if (mode === "corOnly" || mode === "both") {
      const wv = crossTR(omega, [vt, vn]); // Ω×s˙
      at += -2 * wv[0];
      an += -2 * wv[1];
    }
    if (mode === "both") {
      // -Ω×(Ω×s) = +ω² s
      at += (omega * omega) * st;
      an += (omega * omega) * sn;
    }
    // ideal: at=an=0

    vt += at * h; vn += an * h;
    st += vt * h; sn += vn * h;
  }
  return { time, sts, sns };
}

/** 回転→絶対への変換（およびスケーター相対 r′） */
export function toAbsolute(prm, series) {
  const { time, sts, sns } = series;
  const { omega, R, phi0 } = prm;

  const cm = [], path = [], rotRel = [];
  for (let i = 0; i < time.length; i++) {
    const phi = phi0 + omega * time[i];
    const et = e_t(phi), er = e_r(phi);
    const cm_i = [R * er[0], R * er[1]];
    const p_i  = [sts[i] * et[0] + sns[i] * er[0],
                  sts[i] * et[1] + sns[i] * er[1]];
    const rr_i = [sts[i], sns[i] - R];
    cm.push(cm_i); path.push(p_i); rotRel.push(rr_i);
  }
  return { cm, path, rotRel };
}
