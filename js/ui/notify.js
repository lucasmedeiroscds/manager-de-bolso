// =============================================================
// notify.js — NOTIFICAÇÕES DO CELULAR
// =============================================================
// • Durante o seu jogo, se você sair do app (outra tela/aplicativo):
//   avisa gol, lance decisivo e fim de jogo.
// • Conquista desbloqueada com o app em segundo plano.
// • Lembrete diário (só com o app INSTALADO no Android/Chrome):
//   "Hoje tem jogo: X x Y". Usa o "periodic sync" do navegador, que
//   decide sozinho o melhor horário (pode não vir todo dia).
// =============================================================
let enabled = false;

export const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const notifPermission = () => notifSupported() ? Notification.permission : 'unsupported';

export function setNotifEnabled(on) { enabled = !!on && notifPermission() === 'granted'; }

// Pede permissão (precisa ser num toque do usuário). Devolve true/false.
export async function askNotif() {
  if (!notifSupported()) return false;
  const r = await Notification.requestPermission();
  enabled = r === 'granted';
  if (enabled) registerReminder();
  return enabled;
}

// Só aparece se o jogo estiver em segundo plano (com ele aberto, já tem som e tela)
export async function notify(title, body, tag = 'ef') {
  if (!enabled || !document.hidden) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', renotify: true });
  } catch { /* sem notificação */ }
}

// Guarda o texto do lembrete para o service worker ler depois
export async function saveReminder(text) {
  try {
    const c = await caches.open('ef-meta');
    await c.put('./lembrete.json', new Response(JSON.stringify({ text: text || null, at: Date.now(), on: enabled })));
  } catch { /* sem lembrete */ }
}

async function registerReminder() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.periodicSync) await reg.periodicSync.register('ef-lembrete', { minInterval: 20 * 60 * 60 * 1000 });
  } catch { /* navegador não deixa: segue sem lembrete */ }
}
export function initNotif(on) { setNotifEnabled(on); if (enabled) registerReminder(); }
