// Service worker · EntrenaConMétodo CRM
//
// Estrategia: red primero PERO CON RELOJ. La versión anterior esperaba a la
// red indefinidamente y solo caía a la caché si el fetch fallaba. Con señal
// mala eso no falla: se queda colgado. Y como el CRM es una app instalada,
// el resultado era el clásico "aprieto un botón y no hace nada… y al rato sí".
// Ahora la red tiene 3,5 s; pasados esos, se sirve lo que haya en caché y la
// respuesta de red, cuando llegue, solo se guarda para la próxima.
const CACHE = 'ecm-crm-v5';
const TIMEOUT_RED = 3500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo GET del propio dominio; las llamadas a Supabase van siempre a la red
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith((async () => {
    const red = fetch(e.request).then(res => {
      if (res && res.ok) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
      }
      return res;
    });

    // Carrera: gana la red si contesta a tiempo; si no, la caché.
    const guardada = await caches.match(e.request);
    if (!guardada) return red.catch(() => new Response('Sin conexión', { status: 503 }));

    const reloj = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_RED));
    const ganador = await Promise.race([red.catch(() => null), reloj]);
    return ganador || guardada;
  })());
});

// ── Avisos de tus clientes (coach-avisos.js) ─────────────────────────────
// Llegan desde la app (cuando un cliente te escribe, registra una medida,
// sube una foto…). Al tocarlo se abre el CRM justo donde hay que actuar:
// su Seguimiento (?seg=) o la Bandeja (?ver=bandeja).
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* sin datos */ }
  event.waitUntil(self.registration.showNotification(d.title || 'Entrena con Método · CRM', {
    body: d.body || '',
    icon: '/icons/app-192.png?v=4',
    badge: '/icons/app-192.png?v=4',
    tag: d.tag || 'ecm-crm',
    data: { url: d.url || '/?ver=bandeja' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) {
      if ('focus' in c) { try { c.postMessage({ irA: url }); } catch (e) { /* nada */ } return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
