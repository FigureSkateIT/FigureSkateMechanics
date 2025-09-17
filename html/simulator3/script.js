"use strict";

/* ===== ベクトルと基底 ===== */
const DEG2RAD = Math.PI / 180;
const toRad = d => d * DEG2RAD;
const add = (a,b)=>[a[0]+b[0], a[1]+b[1]];
const mul = (s,v)=>[s*v[0], s*v[1]];
const e_r = phi => [Math.cos(phi), Math.sin(phi)];
const e_t = phi => [-Math.sin(phi), Math.cos(phi)];
// 2D: Ω×v = ω J v,  J[x,y]=[-y,x]
const crossOmega = (omega, v)=>[-omega*v[1], omega*v[0]];
const $ = sel => document.querySelector(sel);

/* ===== 入力→導出量 ===== */
function derive(){
  const Tb = 60 / Math.max(1e-9, +$("#bpm").value || 138);
  const diameter   = +$("#diameter").value   || 9;
  const centralDeg = +$("#centralDeg").value || 180;
  const totalBeats = +$("#totalBeats").value || 6;
  const direction  = $("#direction").value || "ccw";
  const startBeat  = +$("#startBeat").value || 0;

  const swingBeats = Math.max(0.1, +$("#swingBeats").value || 1);
  const swingAmp   = +$("#swingAmp").value || 1.0;

  const l      = +$("#l").value || 0.0;
  const theta0 = +$("#theta0").value || 0;
  const thetaV = +$("#thetaV").value || 0;

  const h      = Math.max(0.001, +$("#h").value || 0.01);

  const T = totalBeats * Tb;
  const wMag = toRad(centralDeg) / Math.max(1e-9, T);
  const omega = (direction==="cw"?-1:1) * wMag;
  const R = diameter / 2;

  const dt = swingBeats * Tb;
  const vmag = swingAmp / dt; // Δt で相対移動 A を目安に

  const phiSpan = toRad(centralDeg);
  const phi0 = (startBeat/totalBeats) * phiSpan;

  // 初期 r′, v′（回転座標）
  const r_t0 = l * Math.cos(toRad(theta0));
  const r_n0 = l * Math.sin(toRad(theta0));
  const v_t0 = vmag * Math.cos(toRad(thetaV));
  const v_n0 = vmag * Math.sin(toRad(thetaV));

  return { Tb, T, dt, omega, R, phi0, r_t0, r_n0, v_t0, v_n0, vmag, h };
}

/* ===== 回転座標の ODE を1ステップ積分（symplectic Euler） ===== */
function stepRot(mode, omega, rt, rn, vt, vn, h){
  // 加速度
  let at=0, an=0;
  if (mode==="corOnly" || mode==="both"){
    const a_cor = [-2*crossOmega(omega, [vt,vn])[0], -2*crossOmega(omega, [vt,vn])[1]]; // -2Ω×v′
    at += a_cor[0]; an += a_cor[1];
  }
  if (mode==="both"){
    // -Ω×(Ω×r′) = +ω^2 r′
    at += (omega*omega)*rt;
    an += (omega*omega)*rn;
  }
  // ideal は at=an=0
  // 更新
  vt += at*h; vn += an*h;
  rt += vt*h; rn += vn*h;
  return {rt, rn, vt, vn};
}

/* ===== モードごとに回転座標で積分 ===== */
function integrateRot(params, mode){
  const { dt, h, omega, r_t0, r_n0, v_t0, v_n0 } = params;
  const steps = Math.max(1, Math.ceil(dt / h));
  const time=[], rts=[], rns=[];
  let rt=r_t0, rn=r_n0, vt=v_t0, vn=v_n0;

  for(let i=0;i<=steps;i++){
    const t = Math.min(i*h, dt);
    time.push(t); rts.push(rt); rns.push(rn);
    // 次ステップ
    if (i<steps){
      ({rt, rn, vt, vn} = stepRot(mode, omega, rt, rn, vt, vn, h));
    }
  }
  return { time, rts, rns };
}

/* ===== 絶対座標へ変換 ===== */
function toAbsolute(params, series){
  const { time, rts, rns } = series;
  const { omega, R, phi0 } = params;
  const cm=[], path=[];
  for(let i=0;i<time.length;i++){
    const t=time[i], phi=phi0 + omega*t;
    const et=e_t(phi), er=e_r(phi);
    const cm_i = mul(R, er);
    const rel = add(mul(rts[i], et), mul(rns[i], er));
    cm.push(cm_i);
    path.push( add(cm_i, rel) );
  }
  return { cm, path };
}

/* ===== 描画ユーティリティ ===== */
function drawPathsOnCanvas(canvas, paths, options){
  if (!canvas) return; const ctx = canvas.getContext("2d"); if(!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const valid = p=>Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1]);
  const all=[]; for(const s of paths){ if(!s||!Array.isArray(s.points)) continue;
    for(const p of s.points){ if(valid(p)) all.push(p); } }
  if(all.length<2){ ctx.fillStyle="#9ca3af"; ctx.fillText("No data",12,20); return; }

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
    if(points.length<2) continue;
    ctx.beginPath(); const [x0,y0]=toPx(points[0]); ctx.moveTo(x0,y0);
    for(let i=1;i<points.length;i++){ const [x,y]=toPx(points[i]); ctx.lineTo(x,y); }
    ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.stroke();
    const [hx,hy]=toPx(points[points.length-1]); const [tx,ty]=toPx(points[0]);
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(tx,ty,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx,hy,4,0,Math.PI*2); ctx.fill();
  }
}

/* ===== メイン ===== */
document.getElementById("params").addEventListener("submit", (e)=>{
  e.preventDefault();
  const params = derive();

  // 3モード（単発、戻し無し）
  const rot_ideal   = integrateRot(params, "ideal");    // r¨′=0
  const rot_coronly = integrateRot(params, "corOnly");  // r¨′=-2Ω×r˙′
  const rot_both    = integrateRot(params, "both");     // r¨′=-2Ω×r˙′ - Ω×(Ω×r′)
  const nSwing = rot_ideal.time.length;

  // 絶対へ変換（0〜Δt）
  const abs_ideal   = toAbsolute(params, rot_ideal);
  const abs_coronly = toAbsolute(params, rot_coronly);
  const abs_both    = toAbsolute(params, rot_both);

  const pathCoM     = abs_ideal.cm.slice(0, nSwing);
  const pathIdeal   = abs_ideal.path.slice(0, nSwing);
  const pathCorOnly = abs_coronly.path.slice(0, nSwing);
  const pathBoth    = abs_both.path.slice(0, nSwing);

  // 左：絶対座標
  drawPathsOnCanvas(
    document.getElementById("canvasAbs"),
    [
      {points: pathCoM,     color:"#374151", lw:2},
      {points: pathIdeal,   color:"#10b981", lw:2},
      {points: pathCorOnly, color:"#a855f7", lw:2},
      {points: pathBoth,    color:"#ef4444", lw:2},
    ],
    {grid:true, pad:0.5}
  );

  // 右：回転座標（r′軌跡）
  const rotPtsIdeal   = rot_ideal.rts.map((x,i)=>[x, rot_ideal.rns[i]]).slice(0, nSwing);
  const rotPtsCorOnly = rot_coronly.rts.map((x,i)=>[x, rot_coronly.rns[i]]).slice(0, nSwing);
  const rotPtsBoth    = rot_both.rts.map((x,i)=>[x, rot_both.rns[i]]).slice(0, nSwing);
  drawPathsOnCanvas(
    document.getElementById("canvasRot"),
    [
      {points: rotPtsIdeal,   color:"#10b981", lw:2},
      {points: rotPtsCorOnly, color:"#a855f7", lw:2},
      {points: rotPtsBoth,    color:"#ef4444", lw:2},
    ],
    {grid:true, axes:true, pad:0.2}
  );
});

// 初期実行
document.getElementById("params").dispatchEvent(new Event("submit"));
