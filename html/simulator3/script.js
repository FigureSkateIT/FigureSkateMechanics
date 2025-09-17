"use strict";

/* =========================
 *  Utilities / Basis
 * ========================= */
const DEG2RAD = Math.PI / 180;
const toRad = d => d * DEG2RAD;

const add = (a,b)=>[a[0]+b[0], a[1]+b[1]];
const sub = (a,b)=>[a[0]-b[0], a[1]-b[1]];
const mul = (s,v)=>[s*v[0], s*v[1]];
const dot = (a,b)=>a[0]*b[0]+a[1]*b[1];

const e_r = phi => [Math.cos(phi), Math.sin(phi)];      // 半径方向（外向き）
const e_t = phi => [-Math.sin(phi), Math.cos(phi)];     // 接線方向（CCW）
const crossOmega = (omega, v)=>[-omega*v[1], omega*v[0]]; // 2D: Ω×v = ω J v

const $ = sel => document.querySelector(sel);
const num = (id, def=0) => {
  const el = document.getElementById(id);
  return el ? (Number(el.value) || def) : def;
};

/* =========================
 *  Parameters (from UI)
 *  回転座標の原点＝円の中心 （←重要！）
 * ========================= */
function derive(){
  const Tb = 60 / Math.max(1e-9, num("bpm", 138));

  const diameter   = num("diameter", 9);
  const centralDeg = num("centralDeg", 180);
  const totalBeats = num("totalBeats", 6);
  const direction  = ($("#direction")?.value || "ccw");
  const startBeat  = num("startBeat", 0);

  const swingBeats = Math.max(0.1, num("swingBeats", 1));
  const swingAmp   = num("swingAmp", 1.0);

  const l      = num("l", 0.0);           // CoM からの初期オフセット長
  const theta0 = num("theta0", 0);        // その角度（t̂=0°, r̂へ＋）
  const thetaV = num("thetaV", 0);        // 初期相対速度の角度（同上）
  const h      = Math.max(0.001, num("h", 0.01));

  const T = totalBeats * Tb;
  const wMag = toRad(centralDeg) / Math.max(1e-9, T);
  const omega = (direction === "cw" ? -1 : 1) * wMag;
  const R = diameter / 2;

  const dt = swingBeats * Tb;
  const vmag = swingAmp / dt; // Δt で相対移動 A の目安

  const phiSpan = toRad(centralDeg);
  const phi0 = (startBeat / Math.max(1e-9,totalBeats)) * phiSpan;

  // ★ 原点＝円の中心の回転座標（s′）で初期位置を与える
  // CoM は常に [0, R]。CoM からの相対オフセット(l, θ0) を足す。
  const r_t0_rel = l * Math.cos(toRad(theta0));  // CoM基準の接線成分
  const r_n0_rel = l * Math.sin(toRad(theta0));  // CoM基準の半径成分
  const s_t0 = r_t0_rel;                          // 中心基準：接線
  const s_n0 = R + r_n0_rel;                      // 中心基準：半径（R を足す）

  // 初期相対速度 v′(0)（回転座標の成分）
  const v_t0 = vmag * Math.cos(toRad(thetaV));
  const v_n0 = vmag * Math.sin(toRad(thetaV));

  return { Tb, T, dt, omega, R, phi0, s_t0, s_n0, v_t0, v_n0, vmag, h };
}

/* =========================
 *  Rotating-frame ODE (s′)
 *  mode:
 *   - "ideal"    : r¨′ = 0                       （遠心・コリオリとも外力で打消し）
 *   - "corOnly"  : r¨′ = -2Ω×r˙′                 （遠心のみ外力で打消し）
 *   - "both"     : r¨′ = -2Ω×r˙′ - Ω×(Ω×r′)     （どちらも打消さない）
 *  数値は半陰解法（symplectic Euler）
 * ========================= */
function integrateRot(params, mode){
  const { dt, h, omega, s_t0, s_n0, v_t0, v_n0 } = params;
  const steps = Math.max(1, Math.ceil(dt / h));

  const time = [];
  const sts = [];  // s_t(t)
  const sns = [];  // s_n(t)

  let st = s_t0, sn = s_n0;  // 位置（中心基準）
  let vt = v_t0, vn = v_n0;  // 速度（回転座標の成分）

  for(let i=0; i<=steps; i++){
    const t = Math.min(i*h, dt);
    time.push(t);
    sts.push(st);
    sns.push(sn);

    if (i === steps) break; // 最終点は更新しない

    // 加速度（回転座標）
    let at = 0, an = 0;

    if (mode === "corOnly" || mode === "both"){
      const wv = crossOmega(omega, [vt, vn]); // Ω×v′
      // a_cor = -2Ω×v′
      at += -2 * wv[0];
      an += -2 * wv[1];
    }

    if (mode === "both"){
      // a_cf = -Ω×(Ω×s′) = + ω^2 s′
      at += (omega*omega) * st;
      an += (omega*omega) * sn;
    }

    // ideal は at=an=0 のまま

    // 半陰解法（速度→位置の順）
    vt += at * h;
    vn += an * h;
    st += vt * h;
    sn += vn * h;
  }

  return { time, sts, sns };
}

/* =========================
 *  Transform to absolute
 *  s′=[s_t, s_n] を絶対座標へ：
 *   p(t) = s_t t̂(φ) + s_n r̂(φ)
 *  CoM(t) = R r̂(φ)
 *  スケーター相対（停止フレーム）で描くなら r′=[s_t, s_n - R]
 * ========================= */
function toAbsolute(params, series){
  const { time, sts, sns } = series;
  const { omega, R, phi0 } = params;

  const cm = [];
  const path = [];
  const rotRel = [];  // r′=[s_t, s_n - R]（CoM基準の回転座標）

  for(let i=0; i<time.length; i++){
    const t = time[i];
    const phi = phi0 + omega * t;
    const et = e_t(phi), er = e_r(phi);

    const cm_i = mul(R, er);
    const p_i  = add(mul(sts[i], et), mul(sns[i], er));
    const rr_i = [ sts[i], sns[i] - R ];

    cm.push(cm_i);
    path.push(p_i);
    rotRel.push(rr_i);
  }
  return { cm, path, rotRel };
}

/* =========================
 *  Drawing
 * ========================= */
function drawPathsOnCanvas(canvas, paths, options){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // 有効点を収集
  const valid = p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  const allPts = [];
  for (const s of paths){
    if (!s || !Array.isArray(s.points)) continue;
    for (const p of s.points){
      if (valid(p)) allPts.push(p);
    }
  }
  if (allPts.length < 2){
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("No data", 12, 20);
    return;
  }

  // バウンディングとスケール
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const [x,y] of allPts){
    if (x<minX) minX=x; if (x>maxX) maxX=x;
    if (y<minY) minY=y; if (y>maxY) maxY=y;
  }
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const pad   = (options.pad ?? 0.5) * Math.max(spanX, spanY, 1);

  minX -= pad; maxX += pad;
  minY -= pad; maxY += pad;

  const W = canvas.width, H = canvas.height;
  const sx = W / Math.max(1e-9, (maxX - minX));
  const sy = H / Math.max(1e-9, (maxY - minY));
  const s  = 0.9 * Math.min(sx, sy);

  const cx = W/2 - s * ((minX + maxX) / 2);
  const cy = H/2 + s * ((minY + maxY) / 2);

  const toPx = ([x,y]) => [cx + s*x, cy - s*y];

  // グリッド
  if (options.grid !== false){
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for(let gx=Math.ceil(minX); gx<=Math.floor(maxX); gx++){
      ctx.beginPath(); ctx.moveTo(...toPx([gx,minY])); ctx.lineTo(...toPx([gx,maxY])); ctx.stroke();
    }
    for(let gy=Math.ceil(minY); gy<=Math.floor(maxY); gy++){
      ctx.beginPath(); ctx.moveTo(...toPx([minX,gy])); ctx.lineTo(...toPx([maxX,gy])); ctx.stroke();
    }
  }

  // 軸（回転座標図で便利）
  if (options.axes){
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(...toPx([0,minY])); ctx.lineTo(...toPx([0,maxY])); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...toPx([minX,0])); ctx.lineTo(...toPx([maxX,0])); ctx.stroke();
  }

  // パス群
  for (const {points, color, lw=2} of paths){
    if (!points || points.length < 2) continue;
    ctx.beginPath();
    const [x0,y0] = toPx(points[0]);
    ctx.moveTo(x0,y0);
    for (let i=1;i<points.length;i++){
      const [x,y] = toPx(points[i]);
      ctx.lineTo(x,y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // 始端/終端マーカー
    const [tx,ty] = toPx(points[0]);
    const [hx,hy] = toPx(points[points.length-1]);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(tx,ty,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx,hy,4,0,Math.PI*2); ctx.fill();
  }
}

/* =========================
 *  Main
 * ========================= */
function runOnce(){
  const params = derive();

  // 回転座標で3モード積分（単発・戻し無し）
  const rot_ideal   = integrateRot(params, "ideal");    // r¨′=0
  const rot_coronly = integrateRot(params, "corOnly");  // r¨′=-2Ω×r˙′
  const rot_both    = integrateRot(params, "both");     // r¨′=-2Ω×r˙′ - Ω×(Ω×r′)

  const nSwing = rot_ideal.time.length;

  // 絶対座標へ変換（0〜Δt のみ描画）
  const abs_ideal   = toAbsolute(params, rot_ideal);
  const abs_coronly = toAbsolute(params, rot_coronly);
  const abs_both    = toAbsolute(params, rot_both);

  const coM  = abs_ideal.cm.slice(0, nSwing);
  const pId  = abs_ideal.path.slice(0, nSwing);
  const pCor = abs_coronly.path.slice(0, nSwing);
  const pBoth= abs_both.path.slice(0, nSwing);

  drawPathsOnCanvas(
    document.getElementById("canvasAbs"),
    [
      {points: coM,  color:"#374151", lw:2}, // CoM
      {points: pId,  color:"#10b981", lw:2}, // ideal
      {points: pCor, color:"#a855f7", lw:2}, // cor-only
      {points: pBoth,color:"#ef4444", lw:2}, // both
    ],
    { grid:true, pad:0.5 }
  );

  // 右：回転座標（スケーター相対 r′=[s_t, s_n - R]）
  const rId   = abs_ideal.rotRel.slice(0, nSwing);
  const rCor  = abs_coronly.rotRel.slice(0, nSwing);
  const rBoth = abs_both.rotRel.slice(0, nSwing);

  drawPathsOnCanvas(
    document.getElementById("canvasRot"),
    [
      {points: rId,   color:"#10b981", lw:2},
      {points: rCor,  color:"#a855f7", lw:2},
      {points: rBoth, color:"#ef4444", lw:2},
    ],
    { grid:true, axes:true, pad:0.2 }
  );
}

function init(){
  const form = document.getElementById("params");
  if (form){
    form.addEventListener("submit", (e)=>{ e.preventDefault(); runOnce(); });
    form.dispatchEvent(new Event("submit"));
  } else {
    // フォームが無い（読み込み順の問題）場合は遅延
    document.addEventListener("DOMContentLoaded", ()=>{
      const f = document.getElementById("params");
      if (f){
        f.addEventListener("submit", (e)=>{ e.preventDefault(); runOnce(); });
        f.dispatchEvent(new Event("submit"));
      }
    });
  }
}

// 即時初期化（defer推奨だが保険として）
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
