// =====================================================
// DIÁLOGO TIPO · el guion del check-in, en Seguimiento
// =====================================================
// La base es siempre la misma (6 pasos, como hacen los coaches 1 a 1 de
// ticket alto): apertura, lo que vi de tu semana (con sus datos), escuchar
// (con lo que le respondes según conteste), los avisos que tienes que darle,
// el foco de la semana (una sola cosa) y el cierre. Lo que cambia es el
// contenido: sus números de ESA semana, el tipo de semana (primera, ciclo
// nuevo, última del ciclo, sin registros, récord, viene bien, le costó) y la
// versión de cada frase, que rota cada semana y es distinta por cliente.
//
// Convive con «Mensajes» (la pestaña Semana): esto es el guion completo para
// tenerlo de referencia o copiar y pegar. Copiar uno queda en su registro de
// seguimiento, igual que los mensajes; los avisos quedan como «ya se lo dijiste».
// Usa lo de seguimiento-semana.js (esSemanaDe, esMensajes, esSaludo…).
// =====================================================

const _dlgT = { cliente: null, pasos: [] };

const DT_TIPOS = {
  primera: 'su primera semana',
  cicloNuevo: 'semana 1 de un ciclo nuevo',
  cierreCiclo: 'última semana del ciclo',
  sinRegistros: 'semana sin registros',
  record: 'semana récord',
  bien: 'semana normal, viene bien',
  cuesta: 'semana normal, le costó',
};

function dtTipo(c, S) {
  const ini = String(c.fecha_inicio || '').slice(0, 10);
  if (ini && ini >= evtSumarDias(S.lunes, -6) && ini <= S.fechas[6]) return 'primera';
  if (S.fase && S.semCiclo === 1) return 'cicloNuevo';
  if (S.fase && S.fase.semanas && S.semCiclo === S.fase.semanas) return 'cierreCiclo';
  const comio = S.K ? S.K.dias : 0;
  if (!S.F.hechas && !comio) return 'sinRegistros';
  if ((S.rec && S.rec.length) || (S.prog && S.prog.length)) return 'record';
  const pct = S.F.plan ? S.F.hechas / S.F.plan : 1;
  return pct >= 0.75 ? 'bien' : 'cuesta';
}

// Una de las 3 versiones: cambia cada semana y no es la misma para todos.
const dtVer = (c, S, paso, vs) => vs[(esHash(c.id + ':dlg:' + paso) + esSemanaAbs(S.lunes)) % vs.length];

function dtPasos(c, S) {
  const n = typeof dlgTrato === 'function' ? dlgTrato(c) : String(c.nombre || '').split(/\s+/)[0];
  const tipo = dtTipo(c, S);
  const prog = (S.prog || [])[0] || null, rec = (S.rec || [])[0] || null;
  const K = S.K;
  const pasos = [];

  // 1. Apertura: siempre la misma.
  pasos.push({ k: 'apertura', titulo: 'Apertura', nota: 'siempre igual', texto: esSaludo(n) });

  // 2. Lo que vi de tu semana, con sus datos.
  const partes = [];
  if (S.F.plan || S.F.hechas) partes.push(`${S.F.hechas} de ${S.F.plan} entrenos${S.C.plan ? ` y ${S.C.hechos} de ${S.C.plan} de cardio` : ''}`);
  if (K) partes.push(`registraste comida ${K.dias} de ${K.base} días`);
  const vi = partes.length ? `Vi tu semana: ${partes.join(', y ')}.` : '';
  let logro = '';
  if (rec) logro = `sacaste récord en ${rec.nombre}${rec.peso ? ` (${esNum(rec.peso)} ${rec.unidad || 'kg'} × ${rec.reps})` : ''}`;
  if (prog) logro = logro ? `${logro} y en ${prog.nombre} pasaste de ${esNum(prog.de)} a ${esNum(prog.a)} ${prog.unidad}` : `en ${prog.nombre} pasaste de ${esNum(prog.de)} a ${esNum(prog.a)} ${prog.unidad}`;
  if (!logro && S.racha >= 3) logro = `llevas ${S.racha} semanas seguidas completas`;
  if (!logro && K && K.enMeta >= 4) logro = `${K.enMeta} días dentro de tu meta de comida`;
  let texto2;
  if (tipo === 'sinRegistros') {
    texto2 = dtVer(c, S, 'vi-sin', [
      'Esta semana no vi registros en la app. ¿Todo bien por tu lado?',
      'No me llegaron registros tuyos esta semana. Cuéntame cómo vas, sin presión.',
      'Esta semana la app quedó en blanco. ¿Pasó algo? Lo acomodamos juntos.',
    ]);
  } else if (tipo === 'primera') {
    texto2 = `${vi} ${dtVer(c, S, 'vi-primera', [
      'Para ser tu primera semana, es un muy buen arranque.',
      'Primera semana y ya le estás tomando el ritmo. Así se empieza.',
      'Arrancaste bien: lo importante ahora es la constancia.',
    ])}`;
  } else if (logro) {
    texto2 = `${vi} Lo que más me gustó: ${logro}. ${dtVer(c, S, 'vi-logro', ['Eso es progreso de verdad.', 'Así se construye.', 'Vas por muy buen camino.'])}`;
  } else if (tipo === 'cuesta') {
    texto2 = `${vi} ${dtVer(c, S, 'vi-cuesta', [
      'Esta semana costó un poco más, y está bien: lo importante es retomar.',
      'No fue la semana más fácil, pero no se soltó. Eso cuenta.',
      'Semana movida. Vamos a acomodarla para que la próxima salga mejor.',
    ])}`;
  } else {
    texto2 = `${vi} ${dtVer(c, S, 'vi-bien', ['Buena semana, constante.', 'Vas al día: así se avanza.', 'Semana sólida.'])}`;
  }
  pasos.push({ k: 'vi', titulo: 'Lo que vi de tu semana', nota: 'con sus datos', texto: texto2.trim() });

  // 3. Escuchar: una pregunta corta y qué responderle según conteste.
  const pregunta = dtVer(c, S, 'escuchar', [
    'Para ajustar bien lo que viene, cuéntame rápido del 1 al 10: ¿cómo estuvo tu energía, tu sueño y tu estrés esta semana?',
    'Del 1 al 10, ¿cómo te sentiste esta semana de energía, sueño y estrés? Con eso afino lo que sigue.',
    'Antes de seguir: del 1 al 10, ¿qué tal tu energía, tu descanso y tu estrés esta semana?',
  ]);
  const quedan = S.F.plan && S.F.hechas < S.F.plan;
  pasos.push({
    k: 'escuchar', titulo: 'Escuchar', nota: 'pregunta corta', texto: pregunta,
    ramas: [
      { si: 'Si responde que bien (7 o más)', texto: dtVer(c, S, 'r-bien', [
        `Se nota en tus números. Seguimos con el mismo plan${quedan ? ' y vamos por los entrenos que faltan' : ''}.`,
        'Excelente, eso se refleja en lo que haces. Mantenemos el plan.',
        'Me alegra. Con esa energía, seguimos igual.',
      ]) },
      { si: 'Si responde que regular o mal (5 o menos)', texto: dtVer(c, S, 'r-mal', [
        'Gracias por contarme. Esta semana prioriza lo esencial: las sesiones de fuerza y la proteína. Si un día no da, me escribes y lo movemos.',
        'Gracias por decírmelo. Bajamos un poco la exigencia esta semana: lo importante es no soltar del todo.',
        'Entiendo. Esta semana vamos a lo básico, y si algún día no puedes, lo movemos sin problema.',
      ]) },
      { si: 'Si dice que se le complicó la semana', texto: dtVer(c, S, 'r-complico', [
        `Tranquil${/a$/i.test(n) ? 'a' : 'o'}, pasa. ¿Qué día se te complica más? Lo movemos para que la semana sea realista para ti.`,
        'Pasa, no te preocupes. Dime qué días tienes más libres y acomodo tu semana.',
        'Normal que pase. Ajustemos los días para que te quede fácil cumplir.',
      ]) },
    ],
  });

  // 4. Avisos de la semana: los mismos de «Mensajes» que no le has dicho.
  let avisos = [];
  try { avisos = (esMensajes(c, S) || []).filter(m => m.informar && !m.hecho); } catch (e) { avisos = []; }
  avisos.forEach((m, i) => pasos.push({ k: 'aviso', titulo: i ? '' : 'Avisos de la semana', nota: i ? '' : 'solo si hay', texto: m.texto, informar: true, tituloReg: m.titulo, sub: m.titulo }));

  // 5. El foco de la semana: una sola cosa.
  let foco;
  if (tipo === 'cierreCiclo') foco = 'cerrar fuerte el ciclo: completa tus entrenos y actualiza tu composición corporal y tus fotos';
  else if (tipo === 'cicloNuevo') foco = 'conocer tu rutina nueva: en cada ejercicio, primero la técnica y después el peso';
  else if (tipo === 'sinRegistros') foco = 'volver a registrar: aunque sea un entreno y tu comida de cada día';
  else if (S.F.plan && S.F.hechas < S.F.plan) foco = `completar los ${S.F.plan} entrenos`;
  else if (K && K.prot && K.prot.pct < 0.9) foco = `llegar a tus ${K.prot.meta} g de proteína al día`;
  else if (K && K.base >= 3 && K.dias / K.base < 0.7) foco = 'registrar tu comida todos los días';
  else if (S.subir && S.subir.length) foco = `subir un poco el peso en ${S.subir[0].nombre}`;
  else foco = `mantener el ritmo: ${S.F.plan || 'tus'} entrenos y tu comida registrada`;
  pasos.push({ k: 'foco', titulo: 'El foco de la semana', nota: 'una sola cosa', foco, texto: dtVer(c, S, 'foco', [
    `Para esta semana el foco es uno solo: ${foco}. Si lo logras, la semana es un éxito.`,
    `Esta semana nos enfocamos en una cosa: ${foco}. Lo demás, como vienes.`,
    `Una sola meta para esta semana: ${foco}. Con eso, vamos bien.`,
  ]) });

  // 6. Cierre.
  pasos.push({ k: 'cierre', titulo: 'Cierre', nota: '', texto: dtVer(c, S, 'cierre', [
    'Cualquier cosa me escribes por acá. ¡Vamos con toda!',
    'Aquí estoy para lo que necesites. ¡A darle esta semana!',
    'Me cuentas cómo te va. ¡Vamos por esa semana!',
  ]) });
  return { tipo, pasos, version: (esHash(c.id + ':dlg:vi') + esSemanaAbs(S.lunes)) % 3 + 1, avisos: avisos.length, foco };
}

function dtHTML(c, S, D) {
  const nom = escapeHtml(String(c.nombre || '').split(/\s+/)[0]);
  const chips = [];
  if (S.F.plan || S.F.hechas) chips.push(`Fuerza ${S.F.hechas}/${S.F.plan}`);
  if (S.C.plan) chips.push(`Cardio ${S.C.hechos}/${S.C.plan}`);
  if (S.K) chips.push(`Comida ${S.K.dias}/${S.K.base} días`);
  (S.prog || []).slice(0, 2).forEach(p => chips.push(`Subió ${p.nombre}`));
  (S.rec || []).slice(0, 1).forEach(r => chips.push(`Récord ${r.nombre}`));
  const sinResp = (S.notasSem || []).filter(x => !x.leida_en).length;
  if (sinResp) chips.push(`${sinResp} nota${sinResp === 1 ? '' : 's'} sin responder`);
  let i = 0;
  const paso = (p, idx) => {
    const id = idx;
    const num = p.titulo ? ++i : null;
    return `
      <div class="dlg-paso" data-dlg-paso="${p.k}">
        <div class="dlg-num">${num || ''}</div>
        <div class="dlg-cuerpo">
          ${p.titulo ? `<div class="dlg-ptit"><span>${escapeHtml(p.titulo)}</span><i>${escapeHtml(p.nota || '')}</i></div>` : ''}
          ${p.sub ? `<div class="dlg-sub">${escapeHtml(p.sub)} · <b>Avísale</b></div>` : ''}
          <div class="dlg-bur"><p>${escapeHtml(p.texto)}</p><button type="button" class="dlg-cp" data-dlg-copiar="${id}" onclick="dtCopiar(${id})">Copiar</button></div>
          ${(p.ramas || []).length ? `<div class="dlg-si">${p.ramas.map((r, j) => `
            <div class="dlg-q">${escapeHtml(r.si)}</div>
            <div class="dlg-bur dlg-bur-r"><p>${escapeHtml(r.texto)}</p><button type="button" class="dlg-cp" data-dlg-copiar="${id}.${j}" onclick="dtCopiar(${id}, ${j})">Copiar</button></div>`).join('')}</div>` : ''}
        </div>
      </div>`;
  };
  return `
    <div class="dlg" data-dlg data-dlg-tipo="${D.tipo}">
      <div class="dlg-cab">
        <div class="min-w-0">
          <h3 class="dlg-h">Diálogo con ${nom} · semana del ${esFechaCorta(S.lunes)} al ${esFechaCorta(S.fechas[6])}</h3>
          <div class="dlg-s">Tipo de semana: <b>${escapeHtml(DT_TIPOS[D.tipo])}</b> · versión ${D.version} de 3 (cambia cada semana)${D.avisos ? ` · ${D.avisos} aviso${D.avisos === 1 ? '' : 's'} pendiente${D.avisos === 1 ? '' : 's'}` : ''}</div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-dlg-todo onclick="dtCopiarTodo()">Copiar todo el diálogo</button>
      </div>
      ${chips.length ? `<div class="dlg-chips">${chips.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div>` : ''}
      ${D.pasos.map(paso).join('')}
      <div class="dlg-pie">Es el guion de referencia: cópialo entero o paso a paso, y cámbialo a tu manera. Lo que copias queda en su registro de seguimiento; los avisos quedan como «ya se lo dijiste».</div>
    </div>`;
}

window.dtPintar = async (c, lunes = null) => {
  const caja = document.getElementById('seg-dialogo');
  if (!caja) return;
  _dlgT.cliente = c;
  lunes = lunes || esLunesDe(c, fmt.hoy());
  let S;
  try { S = await esSemanaDe(c, lunes); }
  catch (e) { if (caja.isConnected) caja.innerHTML = `<div class="es-vacio">No pude leer su semana (${escapeHtml(e.message || 'error')}).</div>`; return; }
  if (!caja.isConnected || _dlgT.cliente !== c) return;
  _es.cliente = c; _es.semana = S;   // para que los avisos copiados queden como dichos
  const D = dtPasos(c, S);
  _dlgT.pasos = D.pasos;
  caja.innerHTML = dtHTML(c, S, D);
};

async function dtCopiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove(); return ok;
  }
}

window.dtCopiar = async (i, rama = null) => {
  const p = _dlgT.pasos[i];
  if (!p) return;
  const texto = rama == null ? p.texto : (p.ramas || [])[rama]?.texto;
  if (!texto) return;
  toast(await dtCopiarTexto(texto) ? 'Copiado. Pégalo en WhatsApp' : 'No pude copiar');
  const b = document.querySelector(`[data-dlg-copiar="${rama == null ? i : `${i}.${rama}`}"]`);
  if (b) { b.textContent = 'Copiado'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copiar'; }, 1800); }
  const c = _dlgT.cliente;
  if (c && typeof segRegistrar === 'function') {
    const ok = await segRegistrar(c.id, { origen: 'dialogo', titulo: p.tituloReg || `Diálogo · ${p.titulo || 'paso'}`, texto });
    if (ok && p.informar && _es.semana) (_es.semana.dichos ||= []).push({ titulo: p.tituloReg, fecha: fmt.hoy() });
  }
};

window.dtCopiarTodo = async () => {
  const pasos = _dlgT.pasos || [];
  if (!pasos.length) return;
  const texto = pasos.map(p => p.texto).join('\n\n');
  toast(await dtCopiarTexto(texto) ? 'Diálogo copiado. Pégalo en WhatsApp' : 'No pude copiar');
  const b = document.querySelector('[data-dlg-todo]');
  if (b) { b.textContent = 'Copiado'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copiar todo el diálogo'; }, 1800); }
  const c = _dlgT.cliente;
  if (c && typeof segRegistrar === 'function') {
    await segRegistrar(c.id, { origen: 'dialogo', titulo: 'Diálogo completo', texto });
    // Cada aviso, con su título: así queda como «ya se lo dijiste».
    for (const p of pasos.filter(x => x.informar)) {
      if (await segRegistrar(c.id, { origen: 'dialogo', titulo: p.tituloReg, texto: p.texto }) && _es.semana) (_es.semana.dichos ||= []).push({ titulo: p.tituloReg, fecha: fmt.hoy() });
    }
  }
};
