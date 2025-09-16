function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function fmt(x, sig = 2) {
  return Number(x.toPrecision(sig));
}

document.getElementById("calc-form").addEventListener("submit", function(e) {
  e.preventDefault();

  // 入力値
  const bpm = Number(document.getElementById("bpm").value);
  const diameter = Number(document.getElementById("diameter").value);
  const centralDeg = Number(document.getElementById("centralDeg").value);
  const totalBeats = Number(document.getElementById("totalBeats").value);
  const swingAmp = Number(document.getElementById("swingAmp").value);
  const swingBeats = Number(document.getElementById("swingBeats").value);
  const mass = Number(document.getElementById("mass").value);

  // 計算
  const T_b = 60 / bpm;
  const T = totalBeats * T_b;
  const omega = toRad(centralDeg) / T;
  const R = diameter / 2;
  const a_cf = omega * omega * R;

  const dt = swingBeats * T_b;
  const v_r = swingAmp / dt;
  const a_c = 2 * omega * v_r;
  const drift = 0.5 * a_c * dt * dt;
  const phi_deg = (Math.atan2(drift, swingAmp) * 180) / Math.PI;
  const F_c = mass * a_c;

  // 結果テーブルに表示
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = `
    <tr>
      <td>${fmt(omega)}</td>
      <td>${fmt(a_c)}</td>
      <td>${fmt(a_cf)}</td>
      <td>${fmt(dt)}</td>
      <td>${fmt(v_r)}</td>
      <td>${fmt(drift)}</td>
      <td>${fmt(phi_deg)}</td>
      <td>${fmt(F_c)}</td>
    </tr>
  `;

  // グラフ描画
  drawTrajectory(R, centralDeg, swingAmp, drift);
});

function drawTrajectory(R, centralDeg, swingAmp, drift) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // 円弧の描画
  ctx.beginPath();
  ctx.arc(cx, cy, R * 20, Math.PI, 2 * Math.PI); // スケール調整
  ctx.strokeStyle = "gray";
  ctx.stroke();

  // 理想の足の軌跡（直線）
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + swingAmp * 100, cy); // x方向にスイング
  ctx.strokeStyle = "blue";
  ctx.stroke();
  ctx.fillText("No Coriolis", cx + swingAmp * 100 + 5, cy - 5);

  // コリオリ力ありの軌跡
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + swingAmp * 100, cy + drift * 100); // driftをy方向に加算
  ctx.strokeStyle = "red";
  ctx.stroke();
  ctx.fillText("With Coriolis", cx + swingAmp * 100 + 5, cy + drift * 100 - 5);
}
