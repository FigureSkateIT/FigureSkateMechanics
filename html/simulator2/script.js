// script.js  (必ず <script type="module" src="./script.js"> で読み込む)
import { $, num } from "./lib/dom.js";
import { derive, integrateRot, toAbsolute } from "./lib/physics.js";
import { drawPathsOnCanvas } from "./lib/draw.js";
import { makeAbsProjector, mapRotRelToView } from "./lib/viewmap.js";
import { computeTheoryRows } from "./lib/theory.js";

function runOnce() {
  // 1) 入力 -> 導出パラメータ
  const paramsIn = {
    bpm:         num("bpm", 138),
    diameter:    num("diameter", 9),
    centralDeg:  num("centralDeg", 180),
    totalBeats:  num("totalBeats", 6),
    direction:   $("#direction")?.value || "ccw",
    startBeat:   num("startBeat", 0),
    swingBeats:  Math.max(0.1, num("swingBeats", 1)),
    swingAmp:    num("swingAmp", 1.0),
    l:           num("l", 0.0),
    theta0:      num("theta0", 0),
    thetaV:      num("thetaV", 0),
    h:           Math.max(0.001, num("h", 0.01)),
  };
  const model = derive(paramsIn);

  

  // 2) 回転座標で 3 モード積分
  const rot_ideal   = integrateRot(model, "ideal");    // s¨ = 0
  const rot_coronly = integrateRot(model, "corOnly");  // s¨ = -2Ω×s˙
  const rot_both    = integrateRot(model, "both");     // s¨ = -2Ω×s˙ - Ω×(Ω×s)
  const n = rot_ideal.time.length;

  // 3) 絶対座標へ（ワールド座標）→ ビュー射影（t0を上方向、内側を右方向）
  const abs_ideal   = toAbsolute(model, rot_ideal);
  const abs_coronly = toAbsolute(model, rot_coronly);
  const abs_both    = toAbsolute(model, rot_both);

  const projectAbs = makeAbsProjector(model); // 上=初期接線, 右=内側（ωで自動切替）
  const absCoM   = projectAbs(abs_ideal.cm.slice(0, n));
  const absId    = projectAbs(abs_ideal.path.slice(0, n));
  const absCor   = projectAbs(abs_coronly.path.slice(0, n));
  const absBoth  = projectAbs(abs_both.path.slice(0, n));

  drawPathsOnCanvas(
    document.getElementById("canvasAbs"),
    [
      { points: absCoM,  color: "#374151", lw: 2 },  // CoM
      { points: absId,   color: "#10b981", lw: 2 },  // ideal
      { points: absCor,  color: "#a855f7", lw: 2 },  // cor-only
      { points: absBoth, color: "#ef4444", lw: 2 },  // both
    ],
    { grid: true, pad: 0.5 }
  );

  // 4) 相対座標ビュー（重心は静止・上=前方、右=内側。各時刻を初期基底へ逆回転してから描画）
  const relId   = mapRotRelToView(rot_ideal,   model).slice(0, n);
  const relCor  = mapRotRelToView(rot_coronly, model).slice(0, n);
  const relBoth = mapRotRelToView(rot_both,    model).slice(0, n);

  drawPathsOnCanvas(
    document.getElementById("canvasRot"),
    [
      { points: relId,   color: "#10b981", lw: 2 },
      { points: relCor,  color: "#a855f7", lw: 2 },
      { points: relBoth, color: "#ef4444", lw: 2 },
    ],
    { grid: true, axes: true, pad: 0.2 }
  );

  // 5) 理論値計算
  const theoryRows = computeTheoryRows(
    {
      bpm: paramsIn.bpm,
      diameter: paramsIn.diameter,
      centralDeg: paramsIn.centralDeg,
      totalBeats: paramsIn.totalBeats,
      direction: paramsIn.direction,
    },
    [
      { label: "Swing", swingBeats: paramsIn.swingBeats, swingAmp: paramsIn.swingAmp },
    ],
    2 // 有効数字
  );
  // 例：開発時は確認だけ
  console.table(theoryRows);
  renderTheoryTable(theoryRows);
}

function wirePresets() {
  $("#btnDutchSwing")?.addEventListener("click", () => {
    $("#bpm").value = 138; $("#diameter").value = 9; $("#centralDeg").value = 180;
    $("#totalBeats").value = 6; $("#direction").value = "ccw"; $("#startBeat").value = 0;
    $("#swingBeats").value = 1; $("#swingAmp").value = 1.0;
    $("#l").value = 0.5; $("#theta0").value = 180; $("#thetaV").value = 0;
  });
  $("#btnDutchLFIStroke")?.addEventListener("click", () => {
    $("#bpm").value = 138; $("#diameter").value = 9; $("#centralDeg").value = 270;
    $("#totalBeats").value = 6; $("#direction").value = "ccw"; $("#startBeat").value = 0;
    $("#swingBeats").value = 0.5; $("#swingAmp").value = 0.5;
    $("#l").value = 0; $("#theta0").value = 0; $("#thetaV").value = 180;
  });
}

function init() {
  wirePresets();
  const form = document.getElementById("params");
  if (form) {
    form.addEventListener("submit", (e) => { e.preventDefault(); runOnce(); });
    form.dispatchEvent(new Event("submit")); // 初回自動描画
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}


function renderTheoryTable(rows){
  const tbody = document.querySelector("#theoryTable tbody");
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.label || "-"}</td>
      <td>${r.f.Tb}</td>
      <td>${r.f.T}</td>
      <td>${r.f.R}</td>
      <td>${r.f.omega}</td>
      <td>${r.f.v_cm}</td>
      <td>${r.f.dt}</td>
      <td>${r.f.vrel}</td>
      <td>${r.f.a_cf}</td>
      <td>${r.f.a_c}</td>
      <td>${r.f.drift}</td>
      <td>${r.f.devDeg}</td>
    </tr>
  `).join("");
}
