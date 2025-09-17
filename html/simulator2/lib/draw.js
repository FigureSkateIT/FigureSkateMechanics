// ./lib/draw.js
export function drawPathsOnCanvas(canvas, paths, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 収集 & バリデーション
  const valid = (p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  const all = [];
  for (const s of paths) {
    if (!s || !Array.isArray(s.points)) continue;
    for (const p of s.points) if (valid(p)) all.push(p);
  }
  if (all.length < 2) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("No data", 12, 20);
    return;
  }

  // バウンディング + パディング
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of all) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const pad   = (options.pad ?? 0.5) * Math.max(spanX, spanY, 1);

  minX -= pad; maxX += pad; minY -= pad; maxY += pad;

  // スケーリング・センタリング
  const W = canvas.width, H = canvas.height;
  const sx = W / Math.max(1e-9, (maxX - minX));
  const sy = H / Math.max(1e-9, (maxY - minY));
  const s  = 0.9 * Math.min(sx, sy); // 余白 10%

  const cx = W / 2 - s * ((minX + maxX) / 2);
  const cy = H / 2 + s * ((minY + maxY) / 2);

  // ★ 先に定義（以降で使う）
  const toPx = ([x, y]) => [cx + s * x, cy - s * y];

  // 10cm グリッド（オプションで変更可）
  if (options.grid !== false) {
    const step = options.gridStep ?? 0.1; // 10cm = 0.1m
    const startX = Math.ceil(minX / step);
    const endX   = Math.floor(maxX / step);
    const startY = Math.ceil(minY / step);
    const endY   = Math.floor(maxY / step);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;

    for (let k = startX; k <= endX; k++) {
      const gx = k * step;
      ctx.beginPath();
      ctx.moveTo(...toPx([gx, minY]));
      ctx.lineTo(...toPx([gx, maxY]));
      ctx.stroke();
    }
    for (let k = startY; k <= endY; k++) {
      const gy = k * step;
      ctx.beginPath();
      ctx.moveTo(...toPx([minX, gy]));
      ctx.lineTo(...toPx([maxX, gy]));
      ctx.stroke();
    }
  }

  // 軸
  if (options.axes) {
    ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(...toPx([0, minY])); ctx.lineTo(...toPx([0, maxY])); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...toPx([minX, 0])); ctx.lineTo(...toPx([maxX, 0])); ctx.stroke();
  }

  // パス描画
  for (const { points, color, lw = 2 } of paths) {
    if (!points || points.length < 2) continue;

    ctx.beginPath();
    let [x0, y0] = toPx(points[0]); ctx.moveTo(x0, y0);
    for (let i = 1; i < points.length; i++) {
      const [x, y] = toPx(points[i]);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    const [tx, ty] = toPx(points[0]);
    const [hx, hy] = toPx(points[points.length - 1]);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
  }
}
