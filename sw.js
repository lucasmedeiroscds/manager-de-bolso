// =============================================================
// sw.js — "service worker": guarda o jogo no celular para
// funcionar SEM INTERNET depois da primeira abertura.
// Ao mudar qualquer arquivo do jogo, aumente o número da VERSAO
// para o celular baixar a versão nova.
// =============================================================
const VERSAO = 'manager-v18';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './css/style.css', './data/mundo.json',
  './js/main.js', './js/util.js', './js/storage.js',
  './js/data/generator.js', './js/data/importer.js', './js/data/world.js',
  './js/engine/ratings.js', './js/engine/tactics.js', './js/engine/match.js',
  './js/engine/season.js', './js/engine/finance.js', './js/engine/market.js', './js/engine/evolution.js', './js/engine/cups.js', './js/engine/career.js', './js/engine/divisions.js', './js/engine/nations.js', './js/engine/scouting.js',
  './js/ui/nations-screen.js', './js/ui/market-ui.js', './js/ui/career-screen.js', './js/engine/awards.js', './js/ui/awards-screen.js', './js/ui/pitch-anim.js', './js/ui/icons.js', './js/ui/theme.js', './js/ui/sound.js', './js/ui/settings-screen.js', './js/engine/national-coach.js',
  './js/engine/morale.js',
  './js/engine/stadium.js',
  './js/engine/records.js',
  './js/engine/press.js', './js/engine/interviews.js',
  './js/engine/derbies.js', './js/engine/achievements.js', './js/ui/achievements-screen.js',
  './js/engine/academy.js', './js/engine/staff.js', './js/engine/legends.js', './js/ui/clubdev-screen.js', './js/ui/notify.js', './js/engine/modes.js', './js/engine/fans.js', './js/engine/ranking.js', './js/ui/modes-screen.js', './js/ui/share.js', './js/engine/life.js', './js/engine/events.js', './js/ui/life-screen.js',
  './js/ui/news-screen.js',
  './js/engine/player-career.js',
  './js/ui/player-career-screen.js',
  './js/ui/records-screen.js',
  './js/ui/ui.js', './js/ui/screens.js', './js/ui/match-screen.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primeiro tenta a internet (pega atualizações); sem internet, usa a cópia guardada
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(VERSAO).then(c => c.put(e.request, copy));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// ---------- Notificações ----------
// Lembrete diário (periodic sync: só com o app instalado, no Chrome/Android)
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'ef-lembrete') return;
  e.waitUntil((async () => {
    const c = await caches.open('ef-meta');
    const r = await c.match('./lembrete.json');
    if (!r) return;
    const d = await r.json();
    if (!d.on || Date.now() - d.at < 18 * 60 * 60 * 1000) return;   // jogou há pouco: não incomoda
    await self.registration.showNotification('Estratégia FC', {
      body: d.text || 'Seu time está esperando por você. Bora para a próxima rodada?',
      tag: 'ef-lembrete', icon: 'icon-192.png', badge: 'icon-192.png'
    });
  })());
});
// Tocar na notificação abre (ou traz para frente) o jogo
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(x => 'focus' in x);
    return w ? w.focus() : self.clients.openWindow('./');
  }));
});
