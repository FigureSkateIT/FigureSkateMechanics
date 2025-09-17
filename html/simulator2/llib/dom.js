// ./lib/dom.js
export const $ = (sel) => document.querySelector(sel);

export function num(id, def = 0) {
  const el = document.getElementById(id);
  return el ? (Number(el.value) || def) : def;
}
