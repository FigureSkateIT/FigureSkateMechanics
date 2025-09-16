"use strict";

/** --------------------------
 *  Math helpers / basis
 * -------------------------- */
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const toRad = d => d * DEG2RAD;
const toDeg = r => r * RAD2DEG;

const add = (a,b)=>[a[0]+b[0], a[1]+b[1]];
const sub = (a,b)=>[a[0]-b[0], a[1]-b[1]];
const mul = (s,v)=>[s*v[0], s*v[1]];
const dot = (a,b)=>a[0]*b[0]+a[1]*b[1];
const norm = v=>Math.hypot(v[0], v[1]);

// Polar basis at phase phi: e_r (radial), e_t (tangent, CCW)
function e_r(phi){ return [Math.cos(phi), Math.sin(phi)]; }
function e_t(phi){ return [-Math.sin(phi), Math.cos(phi)]; }

/** --------------------------
 *  Parameters + presets
 * -------------------------- */
const $ = sel => document.querySelector(sel);

$("#btnDutch").addEventListener("click", ()=>{
  $("#bpm").value = 138;
  $("#diameter").value = 9;
  $("#centralDeg").value = 180;
  $("#totalBeats").value = 6;
  $("#direction").value = "ccw";
  $("#startBeat").value = 0;
  $("#swingBeats").value = 1;
  $("#swingAmp").value = 1.0;
  $("#l").value = 0.5;
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
  $("#l").value = 0.3;
  $("#theta0").value = 0;
  $("#thetaV").value = 0;
});

/** --------------------------
 *  Core computation
 * -------------------------- */
function computeDerived({
  bpm, diameter, centralDeg, totalBeats, direction,
  startBeat, swingBeats, swingAmp, l, theta0, thetaV, h
}){
  const Tb = 60 / bpm;                     // s per beat
  const T = totalBeats * Tb;               // s on arc
  const wMag = toRad(centralDeg) / T;      // |ω|
  const omega = (direction === "cw" ? -1 : 1) * wMag;
  const R = diameter / 2;

  const dt = swingBeats * Tb;              // swing duration
  const vr = swingAmp / dt;                // relative speed magnitude

  // Start phase on the arc (0 ... central angle), mapped by startBeat
  const phiSpan = toRad(centralDeg);
  const phi0 = (direction === "cw" ? 1 : 1) * (startBeat / totalBeats) * phiSpan;

  // Initial relative position components in [t_hat, e_r] basis (at phi0)
  const r_t0 = l * Math.cos(toRad(theta0));
  const r_n0 = l * Math.sin(toRad(theta0));

  // Initial relative velocity components in [t_hat, e_r] basis (at phi0)
  const v_t0 = vr * Math.cos(toRad(thetaV));
  const v_n0 = vr * Math.sin(toRad(thetaV));

  return {Tb, T, dt, omega, R, vr, phi0, r_t0, r_n0, v_t0, v_n0, h};
}

/** Paths:
 * CoM: R * e_r(phi(t))
 * Point (Coriolis-view/inertial straight): p_cor(t) = p0 + v_rel0_abs * t
 *   where v_rel0_abs = v_t0 * e_t(phi0) + v_n0 * e_r(phi0)
 * Point (no-Coriolis/rotating carry): r_rel_rot(t) = r0 + v_rel_rot0 * t
 *   p_nocor(t) = CoM(t) + r_t(t) * e_t(phi(t)) + r_n(t) * e_r(phi(t))
 *
 * Note: “Coriolis” here means「回転系で見える横ずれ（慣性系では直線運動）」の可視化。
 */
function simulate(params){
  const {Tb, dt, omega, R, vr, phi0, r_t0, r_n0, v_t0, v_n0, h} = params;

  const steps = Math.max(1, Math.ceil(dt / h));
  const time = [];
  const pathCoM = [];
  const pathCor = [];
  const pathNoCor = [];

  // Initial bases and positions
  const er0 = e_r(phi0);
  const et0 = e_t(phi0);

  const cm0 = mul(R, er0);                                         // CoM at t=0
  const rrel0_abs = add(mul(r_t0, et0), mul(r_n0, er0));           // initial offset (abs)
  const p0 = add(cm0, rrel0_abs);                                  // point initial abs pos

  const v_rel0_abs = add(mul(v_t0, et0), mul(v_n0, er0));          // used for “Coriolis” path (inertial straight)
  const v_cm0_abs  = mul(omega * R, et0);                 // 重心速度（ωR t̂）
  const v_abs0     = add(v_cm0_abs, v_rel0_abs);  

  for(let i=0;i<=steps;i++){
    const t = Math.min(i*h, dt);
    time.push(t);

    // CoM
    const phi = phi0 + omega * t;
    const er = e_r(phi), et = e_t(phi);
    const cm = mul(R, er);
    pathCoM.push(cm);

    // Coriolis-view: inertial straight line with initial relative velocity
    const p_cor = add(p0, mul(t, v_abs0));
    pathCor.push(p_cor);

    // no-Coriolis: carry relative position in rotating frame, then map to inertial
    const r_t = r_t0 + v_t0 * t;
    const r_n = r_n0 + v_n0 * t;
    const r_abs = add(mul(r_t, et), mul(r_n, er));
    const p_nocor = add(cm, r_abs);
    pathNoCor.push(p_nocor);
  }

  return {time, pathCoM, pathCor, pathNoCor, dt, Tb, omega, vr, phi0, R, r_t0, r_n0, v_t0, v_n0, p0};
}

/** --------------------------
 *  Validation vs theory
 *  Δy_theory = ω * v_r * Δt^2
 *  φ_theory = atan2(Δy, v_r Δt)
 *  Simulation: measure relative displacement in the initial swing basis
 * -------------------------- */
function compareTheorySim(params, sim){
  const {dt, omega, vr, r_t0, r_n0, v_t0, v_n0, phi0} = params;
  const {pathCoM, pathCor, p0} = sim;

  // Theory
  const dY_theory = omega * vr * dt * dt;           // sign depends on ω and convention; we report magnitude
  const s_theory  = vr * dt;
  const phi_theory = toDeg(Math.atan2(Math.abs(dY_theory), s_theory));

  // Initial swing basis vectors (absolute)
  const et0 = e_t(phi0), er0 = e_r(phi0);
  const u_s = [ // along swing direction at t=0
    Math.cos(Math.atan2(v_n0, v_t0)) * et0[0] + Math.sin(Math.atan2(v_n0, v_t0)) * er0[0],
    Math.cos(Math.atan2(v_n0, v_t0)) * et0[1] + Math.sin(Math.atan2(v_n0, v_t0)) * er0[1]
  ];
  const u_p = [ // perpendicular to swing (turn left from u_s): (-sinθ)et0 + cosθ er0
    -Math.sin(Math.atan2(v_n0, v_t0)) * et0[0] + Math.cos(Math.atan2(v_n0, v_t0)) * er0[0],
    -Math.sin(Math.atan2(v_n0, v_t0)) * et0[1] + Math.cos(Math.atan2(v_n0, v_t0)) * er0[1]
  ];

  // Relative displacement of “Coriolis-view” path (inertial straight) w.r.t. CoM
  const cm0 = pathCoM[0];
  const cmF = pathCoM[pathCoM.length-1];
  const pF  = pathCor[pathCor.length-1];

  const rel0 = sub(p0, cm0);
  const relF = sub(pF, cmF);
  const dRel = sub(relF, rel0); // displacement of the point relative to CoM over [0, dt]

  const s_sim = dot(dRel, u_s);
  const y_sim = dot(dRel, u_p);

  const phi_sim = toDeg(Math.atan2(Math.abs(y_sim), s_sim));
  const err_phi = Math.abs(phi_sim - phi_theory);

  return {
    Tb: sim.Tb,
    dt,
    omega,
    vr,
    dY_theory: Math.abs(dY_theory),
    dY_sim: Math.abs(y_sim),
    phi_theory,
    phi_sim,
    err_phi
  };
}

/** --------------------------
 *  Drawing
 * -------------------------- */
function drawAll(sim){
  const {pathCoM, pathCor, pathNoCor} = sim;
  const cvs = document.getElementById('canvas') || document.getElementById('canvasAbs');
  if (!cvs) {
    console.error('Canvas element not found. Expected #canvas or #canvasAbs.');
    return; // ここで抜ける（または throw でもOK）
  }
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0,0,cvs.width,cvs.height);

  // Determine dynamic scaling (m -> px)
  const allPts = [...pathCoM, ...pathCor, ...pathNoCor];
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(const [x,y] of allPts){
    if(x<minX) minX=x; if(x>maxX) maxX=x;
    if(y<minY) minY=y; if(y>maxY) maxY=y;
  }
  const pad = 0.5 * Math.max(maxX-minX, maxY-minY, 1); // meters
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;

  const W = cvs.width, H = cvs.height;
  const sx = W / (maxX - minX);
  const sy = H / (maxY - minY);
  const s  = 0.9 * Math.min(sx, sy); // keep margins
  const cx = W/2 - s*( (minX+maxX)/2 );
  const cy = H/2 + s*( (minY+maxY)/2 ); // y-axis flipped for canvas

  const toPx = ([x,y]) => [cx + s*x, cy - s*y];

  // grid
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for(let gx=Math.ceil(minX); gx<=Math.floor(maxX); gx++){
    const a = toPx([gx, minY]), b = toPx([gx, maxY]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  for(let gy=Math.ceil(minY); gy<=Math.floor(maxY); gy++){
    const a = toPx([minX, gy]), b = toPx([maxX, gy]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }

  // polyline helpers
  function poly(points, color, lw){
    ctx.beginPath();
    const [x0,y0] = toPx(points[0]);
    ctx.moveTo(x0,y0);
    for(let i=1;i<points.length;i++){
      const [x,y] = toPx(points[i]);
      ctx.lineTo(x,y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // draw paths
  poly(pathCoM,  "#374151", 2); // CoM
  poly(pathCor,  "#e11d48", 2); // Coriolis (inertial straight)
  poly(pathNoCor,"#059669", 2); // no-Coriolis

  // markers
  function dotPt(p, color){
    const [x,y] = toPx(p);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
  }
  dotPt(pathCoM[0],  "#374151");
  dotPt(pathCor[0],  "#e11d48");
  dotPt(pathNoCor[0],"#059669");

  dotPt(pathCoM[pathCoM.length-1],  "#374151");
  dotPt(pathCor[pathCor.length-1],  "#e11d48");
  dotPt(pathNoCor[pathNoCor.length-1],"#059669");
}

/** --------------------------
 *  UI wiring
 * -------------------------- */
$("#params").addEventListener("submit", (e)=>{
  e.preventDefault();

  const bpm        = +$("#bpm").value;
  const diameter   = +$("#diameter").value;
  const centralDeg = +$("#centralDeg").value;
  const totalBeats = +$("#totalBeats").value;
  const direction  = $("#direction").value;
  const startBeat  = +$("#startBeat").value;

  const swingBeats = +$("#swingBeats").value;
  const swingAmp   = +$("#swingAmp").value;

  const l      = +$("#l").value;
  const theta0 = +$("#theta0").value;
  const thetaV = +$("#thetaV").value;

  const h      = +$("#h").value;

  const derived = computeDerived({
    bpm, diameter, centralDeg, totalBeats, direction,
    startBeat, swingBeats, swingAmp, l, theta0, thetaV, h
  });

  const sim = simulate(derived);
  drawAll(sim);

  // Compare theory vs sim and print table
  const cmp = compareTheorySim(derived, sim);
  const tbody = $("#results tbody");
  const r = num=> Number.isFinite(r) ? r.toPrecision(3) : "—";
  tbody.innerHTML = `
    <tr>
      <td>${r(cmp.Tb)}</td>
      <td>${r(cmp.dt)}</td>
      <td>${r(cmp.omega)}</td>
      <td>${r(cmp.vr)}</td>
      <td>${r(cmp.dY_theory)}</td>
      <td>${r(cmp.dY_sim)}</td>
      <td>${r(cmp.phi_theory)}</td>
      <td>${r(cmp.phi_sim)}</td>
      <td>${r(cmp.err_phi)}</td>
    </tr>
  `;
});

// initial draw with defaults
document.getElementById("params").dispatchEvent(new Event("submit"));
