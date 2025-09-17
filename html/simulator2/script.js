// script.js  (type="module" で読み込む)
import { $, num } from "./lib/dom.js";
import { derive, integrateRot, toAbsolute } from "./lib/physics.js";
import { drawPathsOnCanvas } from "./lib/draw.js";

function runOnce() {
  // 入力取得（最低限ここだけメインに残す）
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

  // 導出量 → 3モード計算
  const model       = derive(paramsIn);                  // 円中心原点の回転座標系
  const rot_ideal   = integrateRot(model, "ideal");      // s¨ = 0
  const rot_coronly = integrateRot(model, "corOnly");    // s¨ = -2Ω×s˙
  const rot_both    = integrateRot(model, "both");       // s¨ = -2Ω×s˙ - Ω×(Ω×s)

  const n = rot_ideal.time.length;

  // 絶対座標へ
  const abs_ideal   = toAbsolute(model, rot_ideal);
  const abs_coronly = toAbsolute(model, rot_coronly);
  const abs_both    = toAbsolute(model, rot_both);

  // 左：絶対座標（0〜Δtのみ）
  drawPathsOnCanvas(
    document.getElementById("canvasAbs"),
    [
      { points: abs_ideal.cm.slice(0, n),        color: "#374151", lw: 2 }, // CoM
      { points: abs_ideal.path.slice(0, n),      color: "#10b981", lw: 2 }, // ideal
      { points: abs_coronly.path.slice(0, n),    color: "#a855f7", lw: 2 }, // cor-only
      { points: abs_both.path.slice(0, n),       color: "#ef4444", lw: 2 }, // both
    ],
    { grid: true, pad: 0.5 }
  );

  // 右：回転座標（スケーター相対 r′=[s_t, s_n - R]）
  drawPathsOnCanvas(
    document.getElementById("canvasRot"),
    [
      { points: abs_ideal.rotRel.slice(0, n),    color: "#10b981", lw: 2 },
      { points: abs_coronly.rotRel.slice(0, n),  color: "#a855f7", lw: 2 },
      { points: abs_both.rotRel.slice(0, n),     color: "#ef4444", lw: 2 },
    ],
    { grid: true, axes: true, pad: 0.2 }
  );
}

function wirePresets() {
  $("#btnDutch")?.addEventListener("click", () => {
    $("#bpm").value = 138; $("#diameter").value = 9; $("#centralDeg").value = 180;
    $("#totalBeats").value = 6; $("#direction").value = "ccw"; $("#startBeat").value = 0;
    $("#swingBeats").value = 1; $("#swingAmp").value = 1.0;
    $("#l").value = 0.0; $("#theta0").value = 0; $("#thetaV").value = 0;
  });
  $("#btnWillow")?.addEventListener("click", () => {
    $("#bpm").value = 138; $("#diameter").value = 10; $("#centralDeg").value = 270;
    $("#totalBeats").value = 12; $("#direction").value = "ccw"; $("#startBeat").value = 0;
    $("#swingBeats").value = 0.5; $("#swingAmp").value = 0.5;
    $("#l").value = 0.0; $("#theta0").value = 0; $("#thetaV").value = 0;
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
