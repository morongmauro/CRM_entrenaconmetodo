// ── «‹ Atrás»: volver a donde estabas ──────────────────────────────────────
// Cada vez que cambias de sección, o entras a algo dentro de ella (un cliente
// en Entrenamiento, su rutina, una pestaña de Composición, Seguimiento de un
// cliente), se guarda dónde estabas. El botón «‹ Atrás» (abajo, junto a
// «+ Anotar») te devuelve ahí, con el scroll donde lo dejaste, y dice a
// dónde vuelves. También funciona el «atrás» del navegador o del teléfono.
// Va al final de todos los scripts: envuelve rerenderView (app.js) y lee el
// estado de cada sección.
(function () {
  const pila = [];
  let ult = null, volviendo = false;
  const leer = (f) => { try { return f(); } catch (e) { return undefined; } };
  // Lo que define «dónde estás»: la sección y, dentro, lo que elegiste.
  const foto = () => ({
    vista: leer(() => _currentView),
    ent: leer(() => ({ tab: _ent.tab, clienteId: _ent.clienteId, rutinaId: _ent.rutinaId, subtab: _ent.subtab, faseId: _ent.faseId })),
    comp: leer(() => ({ tab: _comp.tab, clienteId: _comp.clienteId })),
    sel: leer(() => _selectedClienteId),
    segIrA: leer(() => _segIrA),
    segMovil: leer(() => _segMovil),
    y: window.scrollY,
  });
  const clave = (s) => JSON.stringify({ ...s, y: 0 });
  const poner = (s) => {
    leer(() => { if (s.ent) Object.assign(_ent, s.ent); });
    leer(() => { if (s.comp) Object.assign(_comp, s.comp); });
    leer(() => { _selectedClienteId = s.sel ?? null; });
    leer(() => { _segIrA = s.segIrA ?? null; });
    leer(() => { if (s.segMovil) _segMovil = s.segMovil; });
  };
  const nombreDe = (v) => {
    const b = document.querySelector(`.nav-item[data-view="${v}"]`);
    return b ? b.textContent.replace(/\(\d+\)/, '').trim() : '';
  };

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'crm-atras'; btn.dataset.crmAtras = ''; btn.hidden = true;
  btn.setAttribute('aria-label', 'Volver atrás');
  btn.onclick = () => { if (pila.length) history.back(); };
  const pintar = () => {
    const s = pila[pila.length - 1];
    btn.hidden = !s;
    if (!s) return;
    const n = nombreDe(s.vista);
    const dentro = s.vista === ult?.vista;
    btn.innerHTML = `<span aria-hidden="true">‹</span> ${dentro ? 'Atrás' : n ? `Volver a ${n}` : 'Atrás'}`;
  };
  const montar = () => { if (!document.querySelector('[data-crm-atras]')) document.body.appendChild(btn); pintar(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();

  const orig = window.rerenderView;
  if (typeof orig !== 'function') return;
  window.rerenderView = function (op = {}) {
    const ahora = foto();
    if (!volviendo && ult && ult.vista && clave(ahora) !== clave(ult)) {
      pila.push(ult);
      if (pila.length > 40) pila.shift();
      try { history.pushState({ crmAtras: pila.length }, ''); } catch (e) {}
    }
    ult = ahora;
    pintar();
    return orig.call(this, op);
  };
  // El scroll de donde estás, para volver al mismo punto.
  let t = null;
  window.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { if (ult) ult.y = window.scrollY; }, 120); }, { passive: true });

  const volver = async () => {
    const s = pila.pop();
    if (!s) return;
    volviendo = true;
    try {
      if (typeof closeModal === 'function' && !document.getElementById('modal')?.classList.contains('hidden')) closeModal();
      poner(s);
      if (s.vista !== _currentView) await navigate(s.vista); else await window.rerenderView({ nueva: true });
    } finally { volviendo = false; }
    ult = foto();
    pintar();
    setTimeout(() => window.scrollTo({ top: s.y || 0, behavior: 'instant' }), 60);
  };
  window.crmAtras = volver;
  window.addEventListener('popstate', () => { if (pila.length) volver(); });

  const css = document.createElement('style');
  css.textContent = `
  .crm-atras{position:fixed;right:140px;bottom:22px;z-index:35;border:0;border-radius:999px;padding:12px 18px;font:inherit;font-size:14px;font-weight:800;background:#1F1F1F;color:#fff;box-shadow:0 10px 24px rgba(0,0,0,.18);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
  .crm-atras[hidden]{display:none}
  .crm-atras span{font-size:20px;line-height:1;margin-top:-2px}
  .crm-atras:hover{background:#000}
  #app-screen.hidden ~ .crm-atras{display:none}
  @media (max-width:760px){.crm-atras{right:auto;left:14px;bottom:calc(84px + env(safe-area-inset-bottom, 0px))}}`;
  document.head.appendChild(css);
})();
