// =====================================================
// TU TELÉFONO COMO COACH · avisos de tus clientes en el CRM
// =====================================================
// Instalas el CRM en la pantalla de inicio (su propio ícono, distinto al de
// tu app de cliente) y activas aquí los avisos. Desde ese momento, cuando un
// cliente te escribe en la app, registra una medida o sube una foto, el aviso
// te llega al CRM (no a tu app de cliente) y al tocarlo se abre donde hay que
// actuar: su Seguimiento o la Bandeja.
//
// Además: «Mi app (vista cliente)» en «Más» abre tu app como Mauro, y allá
// queda «Vista coach (CRM)» en Configuración para volver.
//
// La suscripción se guarda en la app (coach-data?action=push_sub, con tu
// token de coach). Carga DESPUÉS de crm-prueba.js y movil.js.
// =====================================================

const CA_CLAVE = 'crm:avisos', CA_NO = 'crm:avisosNo';
const caLeer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const caPoner = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* nada */ } };
const caSoporta = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const caActivos = () => caSoporta() && Notification.permission === 'granted' && caLeer(CA_CLAVE) === '1';
const caInstalado = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
const caIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

// Tu app de cliente, con la marca para que allá aparezca «Vista coach (CRM)».
window.crmMiAppURL = () => {
  const base = String((typeof _settings !== 'undefined' && _settings && _settings.mealtracker_app_url) || '').trim().replace(/\/+$/, '');
  return base ? `${base}/?crm=${encodeURIComponent(location.origin)}` : null;
};

function caB64(s) {
  const p = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map(c => c.charCodeAt(0)));
}

window.crmAvisosActivar = async () => {
  if (!caSoporta()) {
    toast(caIOS() && !caInstalado() ? 'En iPhone primero instala el CRM: Compartir → «Agregar a inicio», y actívalos desde ese ícono' : 'Este navegador no permite avisos');
    return false;
  }
  const cfg = typeof mtApiBase === 'function' ? mtApiBase() : null;
  const token = typeof mtApiToken === 'function' ? await mtApiToken() : null;
  if (!cfg || !token) { toast('Conecta la app en Ajustes (URL y contraseña de coach)'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Sin permiso no te puedo avisar. Actívalos en los ajustes del teléfono.'); return false; }
  try {
    const h = { Authorization: `Bearer ${token}` };
    const k = await fetch(`${cfg.url}/api/coach-data?action=push_key`, { headers: h }).then(r => r.json());
    if (!k || !k.publicKey) { toast('La app no tiene los avisos configurados'); return false; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: caB64(k.publicKey) });
    const r = await fetch(`${cfg.url}/api/coach-data?action=push_sub`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }) });
    if (!r.ok) throw new Error('save');
    caPoner(CA_CLAVE, '1'); caPoner(CA_NO, null);
    toast('Listo: los avisos de tus clientes te llegan aquí');
    document.querySelectorAll('[data-ca-banner]').forEach(x => x.remove());
    return true;
  } catch (e) {
    toast('No pude activarlos. Inténtalo de nuevo.');
    return false;
  }
};

// La fila de «Más» (teléfono).
window.crmAvisosFila = () => caActivos()
  ? '<div class="mv-hoja-modo" data-ca-fila style="opacity:.75;cursor:default">Avisos de tus clientes: activados aquí</div>'
  : '<button type="button" class="mv-hoja-modo" data-ca-fila onclick="mvCerrarMas(); crmAvisosActivar()">Recibir aquí los avisos de tus clientes</button>';

// En «Hoy», en el teléfono, mientras no estén activados: una tarjeta.
function caBanner() {
  if (caActivos() || caLeer(CA_NO) || typeof enMovil !== 'function' || !enMovil() || _currentView !== 'hoy' || !view) return;
  if (view.querySelector('[data-ca-banner]')) return;
  const d = document.createElement('div');
  d.dataset.caBanner = '';
  d.className = 'ca-banner';
  d.innerHTML = `<div><b>Recibe aquí los avisos de tus clientes</b><span>Cuando te escriban, registren una medida o suban una foto, te llega a este teléfono y abre justo ese cliente.${caIOS() && !caInstalado() ? ' En iPhone, primero instala el CRM: Compartir → «Agregar a inicio».' : ''}</span></div>
    <div class="ca-bt"><button type="button" class="cp-btn" data-ca-activar onclick="crmAvisosActivar()">Activar</button><button type="button" class="cp-btn s" onclick="this.closest('[data-ca-banner]').remove(); try{localStorage.setItem('${CA_NO}','1')}catch(e){}">Ahora no</button></div>`;
  view.prepend(d);
}

(function () {
  // Al tocar un aviso con el CRM abierto: ir directo a donde dice.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const u = e.data && e.data.irA;
      if (!u) return;
      try {
        const q = new URL(u, location.origin).searchParams;
        if (q.get('seg') && typeof window.segIr === 'function') window.segIr(q.get('seg'));
        else if (q.get('ver') && routes[q.get('ver')]) navigate(q.get('ver'));
      } catch (er) { /* dirección rara: nada */ }
    });
  }
  if (routes.hoy) {
    const base = routes.hoy;
    routes.hoy = async (...a) => { const r = await base(...a); caBanner(); return r; };
  }
  const s = document.createElement('style');
  s.textContent = `
  .ca-banner{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#1F1F1F;color:#fff;border-radius:18px;padding:14px 16px;margin-bottom:12px}
  .ca-banner>div:first-child{flex:1 1 220px;min-width:0}
  .ca-banner b{display:block;font-size:15px}
  .ca-banner span{display:block;font-size:12.5px;color:#D8D8DC;margin-top:3px;line-height:1.4}
  .ca-bt{display:flex;gap:6px}
  .ca-banner .cp-btn{background:#F2C94C;color:#1F1F1F}
  .ca-banner .cp-btn.s{background:#3A3A3C;color:#fff}
  a.mv-hoja-modo{display:block;text-align:center;text-decoration:none}`;
  document.head.appendChild(s);
})();
