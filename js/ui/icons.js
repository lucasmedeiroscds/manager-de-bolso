// =============================================================
// icons.js — ícones desenhados em SVG (nítidos em qualquer tela)
// Uso: icon('home') → '<svg ...>'
// =============================================================
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5v-6h3v6h5V10"/>',
  squad: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 19.5c.6-3.6 3.2-5.5 6.2-5.5s5.6 1.9 6.2 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.2 13.6c2.6 0 4.5 1.6 5 4.6"/>',
  tactics: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 12h17"/><circle cx="12" cy="12" r="2.6"/><circle cx="8" cy="7.5" r="1" fill="currentColor"/><circle cx="16" cy="16.5" r="1" fill="currentColor"/>',
  trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.5H4.5a3 3 0 0 0 3 4M16.5 5.5h3a3 3 0 0 1-3 4"/><path d="M12 13.5V17M8.5 20h7M9.5 17h5"/>',
  market: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none"/>',
  fast: '<path d="M4 6v12l7.5-6zM12.5 6v12L20 12z" fill="currentColor" stroke="none"/>',
  skip: '<path d="M5 6v12l8-6zM17 6v12" /><path d="M5 6v12l8-6z" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.6 0-2.6.8-2.6 1.9 0 2.6 5.3 1.3 5.3 4 0 1.2-1.1 2.1-2.7 2.1-1.2 0-2.2-.5-2.7-1.3M12 6.5V8M12 16v1.5"/>',
  chart: '<path d="M4 19.5h16"/><rect x="5.5" y="11" width="3" height="6" rx=".6"/><rect x="10.5" y="7" width="3" height="10" rx=".6"/><rect x="15.5" y="4" width="3" height="13" rx=".6"/>',
  list: '<path d="M8 7h12M8 12h12M8 17h12"/><circle cx="4.5" cy="7" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="17" r="1" fill="currentColor"/>',
  pitch: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 12h16"/><circle cx="12" cy="12" r="2.5"/><path d="M8.5 3v3h7V3M8.5 21v-3h7v3"/>',
  medal: '<path d="M8 3h3l1 4-2.5 2zM16 3h-3l-1 4 2.5 2z"/><circle cx="12" cy="15" r="5"/><path d="m12 12.6.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.6.9.4-1.7-1.3-1.2 1.7-.2z" fill="currentColor" stroke="none"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" fill="currentColor" stroke="none"/>',
  stadium: '<ellipse cx="12" cy="9" rx="8.5" ry="3.5"/><path d="M3.5 9v6c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V9"/>',
  users: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3.6-6 7-6s6.3 2 7 6"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5z"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  swap: '<path d="M7 4v14M3.5 14.5 7 18l3.5-3.5M17 20V6M13.5 9.5 17 6l3.5 3.5"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  fire: '<path d="M12 3c.5 3-1.8 4.6-3 6.4C7.6 11.5 7 13 7 14.5A5 5 0 0 0 17 15c0-2.6-1.5-4.6-2.6-5.8-.2 1.5-.9 2.4-1.9 2.8.6-2.8-.2-6-.5-9z"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.3-3 7.5-7 9-4-1.5-7-4.7-7-9V6z"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.8 2-1.8 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2.2c2.1 0 3.7-1.7 3.7-3.8C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.3" r="1.2" fill="currentColor"/><circle cx="15" cy="7.6" r="1.2" fill="currentColor"/>',
  whistle: '<circle cx="9.5" cy="14" r="5"/><path d="M13 10.5 20 8v3l-5 1.5"/><circle cx="9.5" cy="14" r="1.2" fill="currentColor"/>'
};

export function icon(name, size = 22, cls = '') {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
