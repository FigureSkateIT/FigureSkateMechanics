"use strict";

/* ===== 基本ベクトル演算 ===== */
const DEG2RAD = Math.PI / 180, RAD2DEG = 180 / Math.PI;
const toRad = d => d * DEG2RAD, toDeg = r => r * RAD2DEG;
const add = (a,b)=>[a[0]+b[0], a[1]+b[1]];
const sub = (a,b)=>[a[0]-b[0], a[1]-b[1]];
const mul = (s,v)=>[s*v[0], s*v[1]];
const dot = (a,b)=>a[0]*b[0]+a[1]*b[1];
const norm = v=>Math.hypot(v[0], v[1]);
// 2D で Ω×v = ω J v,  J[x,y]=[-y,x]
const crossOmega = (omega, v)=>[-omega*v[1], omega*v[0]];
// 単位基底（絶対座標）：r̂(φ), t̂(φ)
const e_r = phi => [Math.cos(phi), Math.sin(phi)];
const e_t = phi => [-Math.sin(phi), Math.cos(phi)];
const $ = sel => document.querySelector(sel);

/* ===== プリセット ===== */
$("#btnDutch").addEventListener("click", ()=>{
  $("#bpm").value = 138;
  $("#diameter").value = 9;
  $("#centralDeg").value = 180;
  $("#totalBeats").value = 6;
  $("#direction").value = "ccw";
  $("#startBeat").value = 0;
  $("#swingBeats").value = 1;
  $("#swingAmp").value = 1.0;
  $("#l").value = 0.0;
  $("#theta0").value = 0;
  $("#thetaV").value = 0;
});

$("#btnWillow").addEventListener("click", ()=>{
  $("#bpm").value = 138;
  $("#diameter").value = 10;
  $("#centralDeg").value = 270;
  $("#totalBeats").value = 12;
  $("#direction").value = "ccw";
  $("#startBeat").value = 0;
  $("#swingBeats").value = 0.5;
  $("#swingAmp").value = 0.5;
  $("#l").value = 0.0;
  $("#theta0").value = 0;
  $("#thetaV").value = 0;
});

/* ===== 導出量 ===== */
function derive(params){
  const { bpm, diameter, centralDeg, totalBeats, direction, startBeat,
          swingBeats, swingAmp, l, theta0, thetaV, h } = params;

  const Tb = 60/Math.max(1e-9,bpm);
  const T = totalBeats * Tb;
  const wMag = toRad(centralDeg) / Math.max(1e-9,T);
  const omega = (direction==="cw"?-1:1)*wMag;
  const R = diameter/2;

  const dt = Math.max(1e-6, swingBeats * Tb); // スイング時間
  // “出して戻す”ようにするため、往路で A/2 まで、復路で 0 まで戻す設計
  // 初速度は |v'0| = (A/2) / (dt/2) = A / dt を目安に
  const vmag = swingAmp / dt;

  const phiSpan = toRad(centralDeg);
  const phi0 = (startBeat/totalBeats) * phiSpan;

  // 初期相対位置 r'(0) = [r_t0, r_n0]（回転座標）
  const r_t0 = l * Math.cos(toRad(theta0));
  const r_n0 = l * Math.sin(toRad(theta0));
  // 初期相対速度 v'(0) = [v_t0, v_n0]
  const v_t0 = vmag * Math.cos(toRad(thetaV));
  const v_n0 = vmag * Math.sin(toRad(thetaV));

  return { Tb, T, dt, omega, R, phi0, r_t0, r_n0, v_t0, v_n0, h, vmag };
}

/* ===== 回転座標系 ODE（半陰解法オイラーで安定） ===== */
function integrateRotating(params, withCoriolis=true){
  const { dt, h, omega, r_t0, r_n0, v_t0, v_n0 } = params;
  const steps = Math.max(1, Math.ceil(dt / h));
  const time=[], rts=[], rns=[], vts=[], vns=[], acor=[], acf=[];
  let rt=r_t0, rn=r_n0, vt=v_t0, vn=v_n0;

  for(let i=0;i<=steps;i++){
    const t = Math.min(i*h, dt);
    time.push(t); rts.push(rt); rns.push(rn); vts.push(vt); vns.push(vn);

    // 途中で“戻す”：中点で v' を反転
    if (i===Math.floor(steps/2)) { vt = -vt; vn = -vn; }

    // fictitious accelerations in rotating frame
    // a_cor = -2Ω×v′ = -2 * crossOmega(ω, v′)
    const a_cor = withCoriolis ? mul(-2, crossOmega(omega, [vt,vn])) : [0,0];
    // a_cf  = -Ω×(Ω×r′) = + ω^2 r′
    const a_cf  = [ (omega*omega)*rt, (omega*omega)*rn ];

    // 半陰解法：v_{k+1} = v_k + a*dt, r_{k+1} = r_k + v_{k+1}*dt
    vt += (a_cor[0] + a_cf[0]) * h;
    vn += (a_cor[1] + a_cf[1]) * h;
    rt += vt * h;
    rn += vn * h;

    acor.push(a_cor); acf.push(a_cf);
  }
  return { time, rts, rns, vts, vns, acor, acf };
}

/* ===== 絶対座標へ変換（CoM 円運動＋相対 → 絶対） ===== */
function toAbsolute(params, series){
  const { time } = series;
  const { omega, R, phi0 } = params;
  const cm=[], path=[];
  for(let i=0;i<time.length;i++){
    const t=time[i], phi=phi0 + omega*t;
    const et=e_t(phi), er=e_r(phi);
    const cm_i = mul(R, er);
    cm.push(cm_i);
    const rt = series.rts[i], rn = series.rns[i];
    const rel = add(mul(rt, et), mul(rn, er));
    path.push( add(cm_i, rel) );
  }
  return { cm, path };
}

/* ===== 座標変換を可視化（回転座標での軌跡） ===== */
function rotatingPairs(series){
  const pts=[];
  for(let i=0;i<series.time.length;i++) pts.push([series.rts[i], series.rns[i]]);
  return pts;
}

/* ===== 描画ユーティリティ ===== */
function drawPathsOnCanvas(canvas, paths, options){
  if (!canvas) return;
  const ctx = canvas.getContext("2d"); if(!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const valid = p => Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1]);
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
    // endpoints
    const [hx,hy]=toPx(points[points.length-1]); const [tx,ty]=toPx(points[0]);
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(tx,ty,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx,hy,4,0,Math.PI*2); ctx.fill();
  }
}

/* ===== UI ===== */
document.getElementById("params").addEventListener("submit", (e)=>{
  e.preventDefault();

  const bpm        = +$("#bpm").value || 138;
  const diameter   = +$("#diameter").value || 9;
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

  const params = derive({ bpm, diameter, centralDeg, totalBeats, direction, startBeat,
                          swingBeats, swingAmp, l, theta0, thetaV, h });

  // 回転座標で ODE 積分
  const rot_with  = integrateRotating(params, true);
  const rot_no    = integrateRotating(params, false);

  // Δt 範囲のみに限定（安全のため）
  const nSwing = rot_with.time.length;

  // 絶対へ変換
  const abs_with  = toAbsolute(params, rot_with);
  const abs_no    = toAbsolute(params, rot_no);

  // ===== 左：絶対座標（0〜Δt のみ） =====
  const pathCoM   = abs_with.cm.slice(0, nSwing);
  const pathWith  = abs_with.path.slice(0, nSwing);
  const pathNo    = abs_no.path.slice(0, nSwing);
  drawPathsOnCanvas(
    document.getElementById("canvasAbs"),
    [
      {points: pathCoM,  color:"#374151", lw:2},
      {points: pathWith, color:"#e11d48", lw:2},
      {points: pathNo,   color:"#059669", lw:2},
    ],
    {grid:true, pad:0.5}
  );

  // ===== 右：回転座標（r′ のみ、0〜Δt） =====
  const rotPtsWith = rotatingPairs(rot_with).slice(0, nSwing);
  const rotPtsNo   = rotatingPairs(rot_no).slice(0, nSwing);
  drawPathsOnCanvas(
    document.getElementById("canvasRot"),
    [
      {points: rotPtsWith, color:"#e11d48", lw:2},
      {points: rotPtsNo,   color:"#059669", lw:2},
    ],
    {grid:true, axes:true, pad:0.2}
  );

  // ===== 検算（終点の横ずれ・偏角） =====
  // 初期スイング方向（回転座標の v′0 角度）で直交基底を作り、終点の相対変位を分解
  const thV = Math.atan2(params.v_n0, params.v_t0);
  const u_s = [ Math.cos(thV), Math.sin(thV) ];
  const u_p = [ -Math.sin(thV), Math.cos(thV) ];

  const rel0 = [ rot_with.rts[0], rot_with.rns[0] ];
  const relF_with = [ rot_with.rts[nSwing-1], rot_with.rns[nSwing-1] ];
  const dRel_with = sub(relF_with, rel0);
  const s_with = dot(dRel_with, u_s);
  const y_with = dot(dRel_with, u_p);

  const relF_no = [ rot_no.rts[nSwing-1], rot_no.rns[nSwing-1] ];
  const dRel_no = sub(relF_no, rel0);
  const s_no = dot(dRel_no, u_s);
  const y_no = dot(dRel_no, u_p);

  const phi_with = toDeg(Math.atan2(Math.abs(y_with), s_with));
  const phi_no   = toDeg(Math.atan2(Math.abs(y_no),   s_no));

  const tbody = document.querySelector("#results tbody");
  const r = x => Number.isFinite(x) ? x.toPrecision(3) : "—";
  tbody.innerHTML = `
    <tr>
      <td>${r(params.Tb)}</td>
      <td>${r(params.dt)}</td>
      <td>${r(params.omega)}</td>
      <td>${r(params.vmag)}</td>
      <td>${r(y_with)}</td>
      <td>${r(y_no)}</td>
      <td>${r(phi_with)}</td>
      <td>${r(phi_no)}</td>
    </tr>
  `;
});

// 初期実行
document.getElementById("params").dispatchEvent(new Event("submit"));
