import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// Fuentes self-hosted (antes: @import a Google Fonts, que bloqueaba el primer
// pintado y dependía de red externa). Vite las sirve con hash + cache eterno.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/bebas-neue/latin-400.css';
import MealTracker from './MealTracker.jsx';

// El dashboard del coach se carga en un chunk aparte: los clientes no
// descargan su código, y el coach solo lo baja al entrar a /coach.
const CoachDashboard = lazy(() => import('./CoachDashboard.jsx'));
// Ranking público del mes ("camino a la cima") — página liviana sin login
// que los clientes abren directo por link. También en chunk aparte.
const Ranking = lazy(() => import('./Ranking.jsx'));

// Ruteo simple: /coach → dashboard, /ranking → tablero público,
// cualquier otra ruta renderiza la app del cliente.
const path = (typeof window !== 'undefined' && window.location.pathname) || '/';
const isCoach = path === '/coach' || path.startsWith('/coach/');
const isRanking = path === '/ranking' || path.startsWith('/ranking/');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isCoach
      ? <Suspense fallback={null}><CoachDashboard /></Suspense>
      : isRanking
        ? <Suspense fallback={null}><Ranking /></Suspense>
        : <MealTracker />}
  </React.StrictMode>
);

// Oculta el splash una vez React renderizó.
if (typeof window !== 'undefined') {
  requestAnimationFrame(() => {
    setTimeout(() => document.body.classList.add('app-ready'), 80);
  });
}

// ─── Auto-actualización sin refresh manual ────────────────────────────────
// Cada build genera /version.json con un sello único, y ese MISMO sello queda
// incrustado en el bundle como __BUILD_VERSION__ (ver vite.config.js). La app
// compara el sello del código que ESTÁ corriendo contra el del servidor; si
// difieren, este código es viejo y se recarga en un momento seguro.
//
// Por qué el sello incrustado es clave: antes la base de comparación era el
// PRIMER fetch de version.json. Si el teléfono arrancaba con un bundle viejo
// servido de caché (típico en PWA de pantalla de inicio) pero el servidor ya
// tenía un build nuevo, esa primera lectura "adoptaba" la versión nueva como
// si fuera la propia — el mismatch no se detectaba nunca y el cliente quedaba
// clavado en la versión vieja para siempre, por más que usara la app todo el
// día. Con el sello dentro del bundle eso es imposible: un bundle viejo
// siempre sabe que es viejo.
if (typeof window !== 'undefined') {
  const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : null;
  let updateReady = false;

  const checkVersion = async () => {
    if (!BUILD_VERSION) return; // dev server: no hay version.json ni sello
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== BUILD_VERSION) updateReady = true;
    } catch (e) { /* sin red: se reintenta luego */ }
  };

  const applyIfReady = () => {
    if (!updateReady) return;
    // Guard anti-bucle: si tras recargar la caché sigue sirviendo este mismo
    // bundle viejo, no volvemos a recargar (evita un loop infinito de reloads;
    // el próximo intento llega solo con el siguiente ciclo de visibilidad).
    try {
      if (sessionStorage.getItem('mt:reloadedForBuild') === BUILD_VERSION) return;
      sessionStorage.setItem('mt:reloadedForBuild', BUILD_VERSION);
    } catch (e) {}
    window.location.reload();
  };

  // Al abrir la app: si este bundle ya es viejo, recarga de inmediato — el
  // usuario recién llega y no ha empezado a interactuar, es el momento más
  // seguro de todos. Así la versión nueva entra apenas abren, sin esperar.
  checkVersion().then(applyIfReady);
  setInterval(checkVersion, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Al VOLVER a la app: aplica lo pendiente y, clave, re-verifica y
      // aplica EN ESE MISMO instante si hay build nuevo. En el teléfono la
      // pestaña no se recarga sola al reabrirla (solo "despierta"), y el
      // orden anterior (aplicar → verificar) obligaba a DOS ciclos de
      // salir/volver para recibir una actualización. Ahora basta UNO: el
      // regreso es el momento seguro por excelencia — el cliente aún no
      // ha empezado a interactuar.
      applyIfReady();
      checkVersion().then(applyIfReady);
    } else {
      // Al salir de la app es el otro momento seguro para recargar.
      applyIfReady();
    }
  });
}

// ─── Service worker de notificaciones push ───────────────────────────────
// SOLO push (sin caché): no interfiere con el auto-update de version.json.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
