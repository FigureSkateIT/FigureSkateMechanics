"use strict";

/* ========= Utilities / Basis ========= */
const DEG2RAD = Math.PI / 180;
const toRad = d => d * DEG2RAD;

const add = (a,b)=>[a[0]+b[0], a[1]+b[1]];
const mul = (s,v)=>[s*v[0], s*v[1]];
const e_r = phi => [Math.cos(phi), Math.sin(phi)];      // 半径（外向き+）
const e_t = phi => [-Math.sin(phi), Math.cos(phi)];     // 接線（CCW 前向き+）

// ★ 回転基底(t, r)での Ω× の写像： [vt, vn] -> [ ω*vn, -ω*vt ]
const crossTR = (omega, vTR)=>[ omega*vTR[1], -omega*vTR[0] ];

const $ = sel => document.querySelector(sel);
const num = (id, def=0) => {
  const el = document.getElementById(id);
  return el ? (Number(el.value) || def) : def;
};

/* ========= Parameters (origin = circle center) ========= */
function derive(){
  const Tb = 60 / Math.max(1e-9, num("bpm", 138));

  const diameter   = num("diameter", 9);
  const centralDeg = num("centralDeg", 180);
  const totalBeats = num("totalBeats", 6);
  const direction  = ($("#direction")?.value || "ccw");
  const startBeat  = num("startBeat", 0);

  const swingBeats = Math.max(0.1, num("swingBeats", 1));
  const swingAmp   = num("swingAmp", 1.0);

  const l      = num("l", 0.0);
  const theta0 = num("theta0", 0);
  const thetaV = num("thetaV", 0);
  const h      = Math.max(0.001, num("h", 0.01));

  const T = totalBeats * Tb;
  const wMag = toRad(centralDeg) / Math.max(1e-9, T);
  const omega = (direction === "cw" ? -1 : 1) * wMag;
  const R = diameter / 2;

  const dt = swingBeats * Tb;
  const vmag = swingAmp / dt;

  const phiSpan = toRad(centralDeg);
  const phi0 = (startBeat / Math.max(1e-9,totalBeats)) * phiSpan;

  // 原点＝円の中心。CoM は常に R r̂(φ)。
  // CoM からの初期オフセット(l,θ0)を中心基準へ：s(0) = [s_t0, s_n0]
  const r_t0_rel = l * Math.cos(toRad(theta0));   // 接線方向
  const r_n0_rel = l * Math.sin(toRad(theta0));   // 半径方向
  const s_t0 = r_t0_rel;
  const s_n0 = R + r_n0_rel;

  // 初期相対速度（回転座標の成分）
  const v_t0 = vmag * Math.cos(toRad(thetaV));
  const v_n0 = vmag * Math.sin(toRad(thetaV));

  return { Tb, T, dt, omega, R, phi0, s_t0, s_n0, v_t0, v_n0, vmag, h };
}

/* ========= Rotating-frame ODE on s′ =========
   mode:
    - "ideal"    : s¨ = 0
    - "corOnly"  : s¨ = -2Ω×s˙
    - "both"     : s¨ = -2Ω×s˙ - Ω×(Ω×s) = -2Ω×s˙ + ω² s
   数値は半陰解法（symplectic Euler）
============================================= */
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

    if (i === steps) break;

    // 加速度（回転座標）
    let at = 0, an = 0;

    if (mode === "corOnly" || mode === "both"){
      const wv = crossTR(omega, [vt, vn]); // Ω×s˙
      at += -2 * wv[0];
      an += -2 * wv[1];
    }
    if (mode === "both"){
      // -Ω×(Ω×s) = +ω² s
      at += (omega*omega) * st;
      an += (omega*omega) * sn;
    }
    // ideal: at=an=0

    // 半陰：速度→位置
    vt += at * h;
    vn += an * h;
    st += vt * h;
    sn += vn * h;
  }

  return { time, sts, sns };
}

/* ========= Transform to absolute =========
   p(t)  = s_t t̂(φ) + s_n r̂(φ)
   c(t)  = R r̂(φ)
   r′(t) = [s_t, s_n - R]（スケーター相対の回転座標）
========================================= */
function toAbsolute(params, series){
  const { time, sts, sns } = series;
  const { omega, R, phi0 } = params;

  const cm = [];
  const path = [];
  const rotRel = [];  // r′=[s_t, s_n - R]

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

/* ========= Drawing ========= */
function drawPathsOnCanvas(canvas, paths, options){
  if (!canvas) return; const ctx = canvas.getContext("2d"); if(!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const valid = p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  const all=[]; for(const s of paths){ if(!s||!Array.isArray(s.points)) continue;
    for(const p of s.points){ if(valid(p)) allPtsPush(all, p); } }
  if(all.length<2){ ctx.fillStyle="#9ca3af"; ctx.fillText("No data",12,20); return; }

  // bounds
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of all){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  const spanX=Math.max(1e-9,maxX-minX), spanY=Math.max(1e-9,maxY-minY);
  const pad=(options.pad??0.5)*Math.max(spanX,spanY,1);
  minX-=pad; maxX+=pad; minY-=pad; maxY+=pad;

  const W=canvas.width,H=canvas.height;
  const sx=W/Math.max(1e-9,maxX-minX), sy=H/Math.max(1e-9,maxY-minY);
  const s=0.9*Math.min(sx,sy);
  const cx=W/2 - s*((minX+maxX)/2), cy=H/2 + s*((minY+maxY)/2);
  const toPx=([x,y])=>[cx+s*x, cy-s*y];

  if(options.grid!==false){
    ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=1;
    for(let gx=Math.ceil(minX); gx<=Math.floor(maxX); gx++){
      ctx.beginPath(); ctx.moveTo(...toPx([gx,minY])); ctx.lineTo(...toPx([gx,maxY])); ctx.stroke();
    }
    for(let gy=Math.ceil(minY); gy<=Math.floor(maxY); gy++){
      ctx.beginPath(); ctx.moveTo(...toPx([minX,gy])); ctx.lineTo(...toPx([maxX,gy])); ctx.stroke();
    }
  }
  if(options.axes){
    ctx.strokeStyle="#9ca3af"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(...toPx([0,minY])); ctx.lineTo(...toPx([0,maxY])); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...toPx([minX,0])); ctx.lineTo(...toPx([maxX,0])); ctx.stroke();
  }

  for(const {points,color,lw=2} of paths){
    if(!points || points.length<2) continue;
    ctx.beginPath(); const [x0,y0]=toPx(points[0]); ctx.moveTo(x0,y0);
    for(let i=1;i<points.length;i++){ const [x,y]=toPx(points[i]); ctx.lineTo(x,y); }
    ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.stroke();

    const [tx,ty]=toPx(points[0]); const [hx,hy]=toPx(points[points.length-1]);
    ctx.fillStyle=color;
    ctx.beginPath(); ctx.arc(tx,ty,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx,hy,4,0,Math.PI*2); ctx.fill();
  }
}
// 小ユーティリティ（速度）
function allPtsPush(arr, p){ arr.push(p); }

/* ========= Main ========= */
function runOnce(){
  const params = derive();

  // 回転座標で3モード積分（戻し無し）
  const rot_ideal   = integrateRot(params, "ideal");    // s¨=0
  const rot_coronly = integrateRot(params, "corOnly");  // s¨=-2Ω×s˙
  const rot_both    = integrateRot(params, "both");     // s¨=-2Ω×s˙ - Ω×(Ω×s)

  const n = rot_ideal.time.length;

  // 絶対へ（0〜Δt）
  const abs_ideal   = toAbsolute(params, rot_ideal);
  const abs_coronly = toAbsolute(params, rot_coronly);
  const abs_both    = toAbsolute(params, rot_both);

  // 左：絶対座標
  drawPathsOnCanvas(
    document.getElementById("canvasAbs"),
    [
      {points: abs_ideal.cm.slice(0,n),        color:"#374151", lw:2}, // CoM
      {points: abs_ideal.path.slice(0,n),      color:"#10b981", lw:2}, // ideal
      {points: abs_coronly.path.slice(0,n),    color:"#a855f7", lw:2}, // cor-only
      {points: abs_both.path.slice(0,n),       color:"#ef4444", lw:2}, // both
    ],
    { grid:true, pad:0.5 }
  );

  // 右：回転座標（スケーター相対 r′=[s_t, s_n - R]）
  drawPathsOnCanvas(
    document.getElementById("canvasRot"),
    [
      {points: abs_ideal.rotRel.slice(0,n),    color:"#10b981", lw:2},
      {points: abs_coronly.rotRel.slice(0,n),  color:"#a855f7", lw:2},
      {points: abs_both.rotRel.slice(0,n),     color:"#ef4444", lw:2},
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
    document.addEventListener("DOMContentLoaded", ()=>{
      const f = document.getElementById("params");
      if (f){
        f.addEventListener("submit", (e)=>{ e.preventDefault(); runOnce(); });
        f.dispatchEvent(new Event("submit"));
      }
    });
  }
}
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
