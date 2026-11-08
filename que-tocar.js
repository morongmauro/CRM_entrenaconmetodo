// =====================================================
// QUÉ TOCAR · lo que le has dicho por tema y qué decirle sin repetir
// =====================================================
// Dos piezas, en Seguimiento y en Toques:
//
// 1. «Lo que le has dicho»: por tema (fuerza, adherencia, registro de
//    comida, calorías y macros, medición, técnica), si lo felicitaste, le
//    pediste o le corregiste, semana a semana. Sale solo de:
//      · tus mensajes guardados (seguimiento_mensajes): cada frase se lee y
//        se reconoce el tema y si felicita, pide o corrige;
//      · lo que le pediste en el seguimiento (seguimiento_pedidos) y los
//        videos pedidos (videos_tecnica);
//      · lo que marcas en la lista (toques_temas).
//
// 2. «Qué tocar esta semana · sin repetir»: 3 a 5 puntos con qué recordar
//    (el dato) y por qué ahora (lo que ya le dijiste). Tú eliges:
//      · «Ya lo dije yo»: lo dijiste con tus palabras (WhatsApp, Diálogos);
//      · «Usar texto»: el texto sugerido va a tu mensaje (o se copia);
//      · «Ver texto sugerido»: solo para mirarlo.
//    Lo marcado se guarda en `toques_temas` (migraciones/toques-temas.sql) y
//    cuenta como toque ese día. «Deshacer» no borra: marca deshecho_en.
//
// Va DESPUÉS de seguimiento-semana.js (esSemanaDe), seguimiento-areas.js y
// toques.js.
// =====================================================

const QT_TEMAS = [
  ['fuerza', 'Fuerza (pesos y reps)', 'Fuerza'],
  ['adherencia', 'Adherencia al entreno', 'Adherencia'],
  ['registro', 'Comida · registro', 'Registro comida'],
  ['macros', 'Comida · calorías y macros', 'Calorías y macros'],
  ['medicion', 'Composición y medición', 'Medición'],
  ['tecnica', 'Técnica (videos)', 'Técnica'],
];
const QT_NOM = Object.fromEntries(QT_TEMAS.map(([k, l, c]) => [k, { largo: l, corto: c }]));
const QT_ACC = {
  felicita: ['Felicitaste', '#E4F1E7', '#2F7F45'],
  pide: ['Pediste', '#EAF1FB', '#1E4E8C'],
  corrige: ['Corregiste', '#FDEFD9', '#9A5B12'],
};
const QT_SQL = 'migraciones/toques-temas.sql';
const _qt = { datos: null, en: 0, de: null, sinTabla: false, ctx: null, cargando: null };

const qtNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const qtDia = (v) => String(v || '').slice(0, 10);
const qtEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(qtDia(a) + 'T12:00:00Z')) / 86400000);
const qtLunes = (f) => { const t = new Date(f + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
const qtMas = (f, n) => { const t = new Date(f + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const qtHace = (f, hoy) => { const d = qtEntre(f, hoy); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
const QT_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const qtCorta = (f) => { const t = new Date(qtDia(f) + 'T12:00:00Z'); return `${t.getUTCDate()} ${QT_MES[t.getUTCMonth()]}`; };
const qtNum = (x) => String(Math.round(Number(x) * 10) / 10).replace('.', ',');
const qtEsc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));

// ── Leer cada frase: tema y si felicita, pide o corrige ─────────────────
// El orden importa: «tu peso bajó a 84 kg» es medición, no fuerza.
const QT_RE_TEMA = [
  ['tecnica', /\bvideos?\b|tecnica|\bgrab(a|ar|ate|arte|aste|alo)\b/],
  ['medicion', /medicion|medidas|\bpesa(r|rte|te)\b|\bpesate\b|tu peso|peso corporal|fotos? de progreso|\bfotos?\b|cintura|bascula|grasa corporal|% de grasa|composicion/],
  ['registro', /registr|anotar lo que comes|anota(r)? (la|tu|lo que) comida/],
  ['macros', /proteina|calori|kcal|carbo|macros?\b|gramos|\bgrasas?\b|desayuno|almuerzo|\bcena\b|merienda|snack|yogur|huevo|comida|comer\b|comes\b/],
  ['fuerza', /\bkg\b|kilos|\blbs?\b|\bpress\b|sentadilla|\bremo\b|peso muerto|dominada|hip thrust|zancada|curl|repeticion|\breps?\b|\bseries\b|\bcarga\b|fuerza|record|\bsub(e|ir|iste|io|imos)\b/],
  ['adherencia', /entren(o|os|aste|ar|amos|amiento)|rutina|constancia|\b\d de \d\b|completaste|faltaste|cumpli(ste|endo)|semana completa|todos los dias/],
];
const QT_RE_EJERCICIO = /\bpress\b|sentadilla|\bremo\b|peso muerto|dominada|hip thrust|zancada|curl|repeticion|\breps?\b|\bseries\b|\bcarga\b/;
const QT_RE_MACRO = /proteina|calori|kcal|carbo|macros?\b|gramos|\bgrasas?\b/;
const QT_RE_CORRIGE = /\bojo\b|cuidado|no hiciste|no registr|faltaron|\bfalto\b|faltaste|te falt|no cumpl|no llegaste|\berror\b|corrig|bajaste el ritmo|se te paso|no lo hiciste/;
const QT_RE_PIDE = /te pido|puedes|podrias|intenta|procura|necesito|mandame|enviame|\benvia\b|\bmanda\b|\bgrabate\b|\bregistra\b|\bregistrar\b|recuerda|\bsube\b|\bsubir\b|agrega|\bsuma\b|\banota\b|\bpesate\b|\btomate\b|\bhaz\b|trata de|\bqueda(mos)? en\b|esta semana (sube|haz|intenta|registra|manda)|\?\s*$/;
const QT_RE_FELICITA = /felicit|bien hecho|muy bien|excelente|genial|buen trabajo|vale mucho|se nota|bravo|crack|orgullo|lograste|subiste|\bsubio\b|record|lo hiciste|cumpliste|completaste|bien ahi|increible|\bsuper\b|felicidades|enhorabuena|me encanta|gran semana|vas muy bien/;

window.qtClasificar = (texto) => {
  const out = [];
  String(texto || '').split(/(?<=[.!?¡¿\n])\s+|\n+/).forEach(frase => {
    const n = qtNorm(frase).trim();
    if (n.length < 6) return;
    // Una frase puede tocar dos temas («sube el remo a 55 kg y mándame tu medición»).
    let temas = QT_RE_TEMA.filter(([, re]) => re.test(n)).map(([k]) => k);
    if (!temas.length) return;
    // «Tu peso bajó a 84 kg» es medición, no fuerza; «registra lo que comes» es registro, no macros.
    if (temas.includes('medicion') && !QT_RE_EJERCICIO.test(n)) temas = temas.filter(k => k !== 'fuerza');
    if (temas.includes('registro') && !QT_RE_MACRO.test(n)) temas = temas.filter(k => k !== 'macros');
    if (temas.includes('tecnica')) temas = temas.filter(k => k !== 'fuerza');
    if ((temas.includes('registro') || temas.includes('macros')) && !/entren|rutina/.test(n)) temas = temas.filter(k => k !== 'adherencia');
    const acc = [];
    if (QT_RE_FELICITA.test(n)) acc.push('felicita');
    if (QT_RE_CORRIGE.test(n)) acc.push('corrige');
    else if (QT_RE_PIDE.test(n)) acc.push('pide');
    temas.slice(0, 2).forEach(t => acc.forEach(a => out.push({ tema: t, accion: a, frag: frase.trim() })));
  });
  return out;
};

// ── Datos (de todos o de un cliente), 2 minutos ─────────────────────────
window.qtCargar = async (clienteId = null, forzar = false) => {
  if (!forzar && _qt.datos && Date.now() - _qt.en < 120000 && (_qt.de === null || _qt.de === clienteId)) return _qt.datos;
  const hoy = fmt.hoy(), desde = qtMas(hoy, -120);
  const leer = async (q) => { try { const { data, error } = await q; return error ? { error } : { data: data || [] }; } catch (e) { return { error: e }; } };
  const f = (q) => (clienteId ? q.eq('cliente_id', clienteId) : q);
  const [m, t, p, v] = await Promise.all([
    leer(f(sb.from('seguimiento_mensajes').select('cliente_id, fecha, origen, titulo, texto').gte('fecha', desde)).limit(5000)),
    leer(f(sb.from('toques_temas').select('*').gte('fecha', desde)).limit(5000)),
    leer(f(sb.from('seguimiento_pedidos').select('id, cliente_id, fecha, tipo, texto, estado, revisado_en').gte('fecha', desde)).limit(5000)),
    leer(f(sb.from('videos_tecnica').select('cliente_id, ejercicio_nombre, pedido_en, estado, revisado_en').gte('pedido_en', desde)).limit(5000)),
  ]);
  _qt.sinTabla = !!t.error && /toques_temas|relation|schema cache|42P01|PGRST20/i.test(String(t.error.message || t.error.code || ''));
  _qt.datos = {
    msj: m.data || [],
    marcas: (t.data || []).filter(x => !x.deshecho_en),
    pedidos: p.data || [],
    vids: v.data || [],
  };
  _qt.en = Date.now();
  _qt.de = clienteId;
  return _qt.datos;
};
window.qtDe = (id) => {
  const D = _qt.datos || { msj: [], marcas: [], pedidos: [], vids: [] };
  const de = (l) => l.filter(x => String(x.cliente_id) === String(id));
  return { msj: de(D.msj), marcas: de(D.marcas), pedidos: de(D.pedidos), vids: de(D.vids) };
};

// Todo lo que le dijiste, como eventos {fecha, tema, accion, frag, fuente}.
const QT_PED_TEMA = { entreno: 'fuerza', video: 'tecnica', comida: 'macros', medicion: 'medicion' };
window.qtEventos = (L) => {
  const ev = [];
  (L.msj || []).forEach(x => {
    const f = qtDia(x.fecha);
    if (x.origen === 'videos') { ev.push({ fecha: f, tema: 'tecnica', accion: 'pide', frag: x.titulo || 'Le pediste un video', fuente: 'msj' }); return; }
    qtClasificar(x.texto).forEach(c => ev.push({ fecha: f, ...c, fuente: 'msj' }));
  });
  (L.marcas || []).forEach(x => ev.push({ fecha: qtDia(x.fecha), tema: x.tema, accion: x.accion, frag: x.texto || '', fuente: 'marca', punto: x.punto, modo: x.modo, id: x.id }));
  (L.pedidos || []).forEach(x => { const t = QT_PED_TEMA[x.tipo]; if (t) ev.push({ fecha: qtDia(x.fecha), tema: t, accion: 'pide', frag: x.texto || '', fuente: 'pedido' }); });
  (L.vids || []).forEach(x => ev.push({ fecha: qtDia(x.pedido_en), tema: 'tecnica', accion: 'pide', frag: `Video de ${x.ejercicio_nombre || 'un ejercicio'}`, fuente: 'video' }));
  const visto = new Set();
  return ev.filter(e => e.fecha && QT_NOM[e.tema]).sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.fuente === 'marca' ? -1 : 1))
    .filter(e => { const k = `${e.fecha}|${e.tema}|${e.accion}`; if (visto.has(k)) return false; visto.add(k); return true; });
};

// Por tema: las 6 semanas, la última vez y la última de cada acción.
window.qtResumen = (ev, hoy) => {
  const lunes = qtLunes(hoy);
  const semanas = [5, 4, 3, 2, 1, 0].map(k => qtMas(lunes, -7 * k));
  const R = {};
  QT_TEMAS.forEach(([k]) => {
    const l = ev.filter(e => e.tema === k);
    R[k] = {
      cel: semanas.map(s => [...new Set(l.filter(e => e.fecha >= s && e.fecha <= qtMas(s, 6)).map(e => e.accion))]),
      ult: l[0] || null,
      por: { felicita: l.find(e => e.accion === 'felicita') || null, pide: l.find(e => e.accion === 'pide') || null, corrige: l.find(e => e.accion === 'corrige') || null },
      pide42: l.filter(e => e.accion === 'pide' && qtEntre(e.fecha, hoy) <= 42).length,
    };
  });
  R._semanas = semanas;
  R._hoy = hoy;
  R._ev = ev;
  return R;
};

// Lo que más conviene saber de un vistazo (una línea, o nada).
function qtAlerta(R) {
  const hoy = R._hoy;
  const t = QT_TEMAS.map(([k]) => k).find(k => R[k].pide42 >= 2 && !R[k].por.felicita);
  if (t) return `${QT_NOM[t].corto}: se lo pediste ${R[t].pide42} veces y nunca lo felicitaste`;
  const ped21 = R._ev.filter(e => e.accion === 'pide' && qtEntre(e.fecha, hoy) <= 21).length;
  const fel21 = R._ev.some(e => e.accion === 'felicita' && qtEntre(e.fecha, hoy) <= 21);
  if (ped21 >= 3 && !fel21) return `Le pediste ${ped21} cosas en 3 semanas y ninguna felicitación`;
  return '';
}

// ── Los puntos de la semana ─────────────────────────────────────────────
// Cada punto: { key, titulo, tema, accion, dato, por, tono, texto }.
function qtPuntos(c, S, R, L) {
  const hoy = R._hoy;
  const n = String(c.como_le_digo || c.nombre || '').trim().split(/\s+/)[0] || '';
  const pts = [];
  const desde = (e) => (e ? `${qtHace(e.fecha, hoy)}${e.frag ? `: «${e.frag.length > 70 ? e.frag.slice(0, 69) + '…' : e.frag}»` : ''}` : '');
  const ultFel = (t) => R[t].por.felicita;
  const felReciente = (t, d = 7) => ultFel(t) && qtEntre(ultFel(t).fecha, hoy) < d;

  // 1. Un logro nuevo (fuerza).
  if (S && S.prog && S.prog.length) {
    const u = ultFel('fuerza');
    const fragU = u ? qtNorm(u.frag) : '';
    const p = S.prog.find(x => !fragU.includes(qtNorm(x.nombre).split(' ')[0])) || S.prog[0];
    if (!felReciente('fuerza', 3)) {
      pts.push({ key: `logro:${qtNorm(p.nombre).slice(0, 40)}`, titulo: 'Felicitar un logro nuevo', tema: 'fuerza', accion: 'felicita',
        dato: `${p.nombre}: de ${qtNum(p.de)} a ${qtNum(p.a)} ${p.unidad}`,
        por: u ? `La última felicitación de fuerza fue ${desde(u)}` : 'Nunca le has felicitado la fuerza', tono: 'v',
        texto: `${n}, vi que ${p.nombre} subió de ${qtNum(p.de)} a ${qtNum(p.a)} ${p.unidad}. Eso vale mucho.` });
    }
  }
  // 2. Su constancia: entreno y registro de comida.
  if (S && S.F && S.F.plan > 0 && S.F.hechas >= S.F.plan && !felReciente('adherencia')) {
    const u = ultFel('adherencia');
    pts.push({ key: 'constancia:entreno', titulo: 'Reconocer su constancia', tema: 'adherencia', accion: 'felicita',
      dato: `Hizo ${S.F.hechas} de ${S.F.plan} entrenos${S.racha >= 2 ? ` · ${S.racha} semanas seguidas` : ''}`,
      por: u ? `La última vez que se la reconociste fue ${qtHace(u.fecha, hoy)}` : 'Nunca le has felicitado la constancia', tono: 'v',
      texto: `${S.racha >= 2 ? `Ya van ${S.racha} semanas seguidas completas` : `Completaste los ${S.F.plan} entrenos de la semana`}. Esa constancia es lo que da resultados.` });
  }
  const K = S && S.K;
  if (K && K.base >= 3 && K.dias >= Math.max(4, K.base - 1) && !felReciente('registro')) {
    const u = ultFel('registro');
    pts.push({ key: 'constancia:registro', titulo: 'Reconocer su registro de comida', tema: 'registro', accion: 'felicita',
      dato: `Registró comida ${K.dias} de ${K.base} días`,
      por: u ? `La última vez que se lo felicitaste fue ${qtHace(u.fecha, hoy)}` : 'Nunca le has felicitado el registro', tono: 'v',
      texto: `Y se nota que estás registrando: ${K.dias} de ${K.base} días. Con eso te puedo ajustar mucho mejor.` });
  }
  // 3. Lo que le pediste: si ya lo cumplió, cerrarlo; si sigue pendiente, preguntar sin repetir.
  const marcasKey = new Set((L.marcas || []).map(x => x.punto));
  const cumplido = (L.pedidos || []).filter(x => x.estado === 'cumplio' && qtEntre(x.fecha, hoy) <= 35 && !marcasKey.has(`cerrar:${x.id}`))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  if (cumplido) {
    const tema = QT_PED_TEMA[cumplido.tipo] || 'adherencia';
    const felDespues = R[tema].por.felicita && R[tema].por.felicita.fecha >= qtDia(cumplido.revisado_en || cumplido.fecha);
    if (!felDespues) pts.push({ key: `cerrar:${cumplido.id}`, titulo: 'Cerrar lo que le pediste', tema, accion: 'felicita',
      dato: `El ${qtCorta(cumplido.fecha)} le pediste «${cumplido.texto}»: ya lo cumplió`,
      por: 'No se lo pidas de nuevo: felicítalo por cumplirlo', tono: 'n',
      texto: `Y lo que quedamos (${String(cumplido.texto || '').replace(/\.$/, '').toLowerCase()}): lo cumpliste. Bien ahí.` });
  }
  const pendiente = (L.pedidos || []).filter(x => x.estado === 'pendiente' && qtEntre(x.fecha, hoy) >= 6 && qtEntre(x.fecha, hoy) <= 30)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))[0];
  if (pendiente) {
    const tema = QT_PED_TEMA[pendiente.tipo] || 'adherencia';
    pts.push({ key: `preguntar:${pendiente.id}`, titulo: 'Preguntar por lo que le pediste', tema, accion: 'pide',
      dato: `El ${qtCorta(pendiente.fecha)} le pediste «${pendiente.texto}»: aún no se ve`,
      por: `Ya se lo pediste ${qtHace(pendiente.fecha, hoy)}: pregúntale cómo le fue en vez de repetirlo`, tono: 'n',
      texto: `¿Cómo te fue con lo que quedamos (${String(pendiente.texto || '').replace(/\.$/, '').toLowerCase()})?` });
  }
  // 4. Una sola cosa a mejorar: la primera que no le hayas pedido esta semana.
  const cand = [];
  if (S && S.F && S.F.plan > 0 && S.F.faltaron && S.F.faltaron.length) cand.push({ tema: 'adherencia', dato: `Hizo ${S.F.hechas} de ${S.F.plan} entrenos (faltó ${S.F.faltaron.length})`,
    texto: `Esta semana faltó ${S.F.faltaron.length === 1 ? 'un entreno' : `${S.F.faltaron.length} entrenos`}. Si un día no puedes, hazlo al día siguiente en vez de saltarlo.` });
  if (K && K.base >= 3 && K.dias < K.base - 1) cand.push({ tema: 'registro', dato: `Registró comida ${K.dias} de ${K.base} días`,
    texto: `Te pido una cosa esta semana: registra lo que comes todos los días, aunque sea rápido. Sin eso no puedo ajustarte bien.` });
  if (K && K.prot && K.prot.pct != null && K.prot.pct < 0.85) cand.push({ tema: 'macros', dato: `Proteína ${Math.round(K.prot.pct * 100)} % de su meta (${K.prot.prom} de ${K.prot.meta} g)`,
    texto: `Lo que más te ayudaría ahora es la proteína: vas en ${K.prot.prom} g y la meta son ${K.prot.meta}. Un yogur griego o un huevo más al día ya suma.` });
  const mej = cand.find(x => !(R[x.tema].por.pide && qtEntre(R[x.tema].por.pide.fecha, hoy) < 7) && !(R[x.tema].por.corrige && qtEntre(R[x.tema].por.corrige.fecha, hoy) < 7));
  if (mej) {
    const u = [R[mej.tema].por.pide, R[mej.tema].por.corrige].filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    pts.push({ key: `mejorar:${mej.tema}`, titulo: 'Una sola cosa a mejorar', tema: mej.tema, accion: 'pide', dato: mej.dato,
      por: u && qtEntre(u.fecha, hoy) <= 21 ? `Ya se lo pediste el ${qtCorta(u.fecha)}: si mejoró, reconócelo; si no, dilo distinto` : u ? `Se lo pediste por última vez ${qtHace(u.fecha, hoy)}` : 'Nunca se lo has pedido', tono: 'n', texto: mej.texto });
  }
  // 5. Un video que revisaste esta semana: contarle cómo salió.
  const rev = S && S.revisados && S.revisados[0];
  if (rev && !(R.tecnica.ult && R.tecnica.ult.fecha >= qtDia(rev.revisado_en) && R.tecnica.ult.accion !== 'pide')) {
    const bien = rev.estado === 'bien';
    pts.push({ key: `video:${qtNorm(rev.ejercicio_nombre || '').slice(0, 40)}`, titulo: 'Contarle cómo salió su video', tema: 'tecnica', accion: bien ? 'felicita' : 'corrige',
      dato: `Revisaste su video de ${rev.ejercicio_nombre || 'un ejercicio'}: ${bien ? 'bien' : rev.estado === 'mejorar' ? 'a mejorar' : 'hay que corregir'}`,
      por: 'Si no le cuentas, no sabe que lo viste', tono: 'v',
      texto: bien ? `Vi tu video de ${rev.ejercicio_nombre || 'ese ejercicio'}: la técnica está muy bien.` : `Vi tu video de ${rev.ejercicio_nombre || 'ese ejercicio'}: te dejé una corrección en la app, míralo antes del próximo entreno.` });
  }
  return pts.slice(0, 5);
}

// Si ya está hecho esta semana: marcado en la lista (con tu modo) o dicho en
// un mensaje guardado (mismo tema y acción).
function qtEstado(p, R, lunes) {
  const ev = R._ev.filter(e => e.fecha >= lunes);
  const m = ev.find(e => e.fuente === 'marca' && e.punto === p.key) || (p.key.startsWith('cerrar:') ? R._ev.find(e => e.fuente === 'marca' && e.punto === p.key) : null);
  if (m) return { modo: m.modo === 'texto' ? 'texto' : 'mio', id: m.id };
  const a = ev.find(e => e.fuente === 'msj' && e.tema === p.tema && e.accion === p.accion);
  if (a) return { modo: 'auto', fecha: a.fecha };
  return null;
}

// ── Lo que se ve ─────────────────────────────────────────────────────────
(function () {
  if (document.getElementById('qt-css')) return;
  const s = document.createElement('style');
  s.id = 'qt-css';
  s.textContent = `
  .qt-card{background:#fff;border-radius:18px;padding:14px 16px;box-shadow:0 1px 2px rgba(40,40,30,.04),0 6px 16px rgba(60,60,40,.05);margin:0 0 12px}
  .qt-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
  .qt-h small{font-size:12px;color:#8A877F}
  .qt-p{display:flex;gap:12px;padding:12px 2px;border-top:1px solid #F3F1EB}
  .qt-p.hecho{opacity:.72}
  .qt-c{flex:none;width:24px;height:24px;border-radius:99px;border:2px solid #CFCBC1;display:grid;place-items:center;font-size:12px;font-weight:800;color:#8A877F}
  .qt-p.hecho .qt-c{background:#46965A;border-color:#46965A;color:#fff}
  .qt-b{flex:1;min-width:0}
  .qt-t{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .qt-t b{font-size:14px;color:#1F1F1F;margin-right:2px}
  .qt-ch{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap}
  .qt-gr{background:#F3F1EB;color:#55565B}.qt-ve{background:#E4F1E7;color:#2F7F45}.qt-az{background:#EAF1FB;color:#1E4E8C}.qt-na{background:#FDEFD9;color:#9A5B12}
  .qt-d{font-size:13px;color:#1F1F1F;margin-top:4px}
  .qt-por{font-size:12.5px;font-weight:650;margin-top:2px}
  .qt-por.v{color:#2F7F45}.qt-por.n{color:#9A5B12}
  .qt-txt{font-size:13px;line-height:1.45;background:#F7F5F0;border-radius:10px;padding:8px 10px;margin-top:6px}
  .qt-acc{flex:none;display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end;max-width:380px}
  .qt-pie{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid #F3F1EB;padding-top:12px;font-size:13px;color:#55565B}
  .qt-aviso{font-size:12.5px;color:#9A5B12;background:#FDF6EA;border-radius:10px;padding:7px 10px;margin-top:8px}
  .qt-tab{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
  .qt-tab th{text-transform:none;letter-spacing:0;padding:6px 4px;color:#8A877F;font-weight:600;font-size:12px;text-align:center}
  .qt-tab th:first-child,.qt-tab th:last-child{text-align:left}
  .qt-tab td{padding:7px 4px;text-align:center;border-top:1px solid #F3F1EB}
  .qt-tab td:first-child{text-align:left;font-weight:650;color:#1F1F1F;white-space:nowrap}
  .qt-tab td:last-child{text-align:left;color:#55565B;font-size:12.5px;padding-left:8px}
  .qt-raya{color:#C9C5BC}
  .qt-celda{min-width:230px}
  .qt-fila{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:1px 0}
  .qt-fila span:first-child{font-size:12px;color:#55565B}
  .qt-nunca{font-size:11px;color:#B8B4AA}
  .qt-al{font-size:11.5px;font-weight:700;color:#9A5B12;margin-top:4px;white-space:normal}
  @media (max-width:760px){.qt-p{flex-wrap:wrap}.qt-b{flex-basis:calc(100% - 36px)}.qt-acc{flex-basis:100%;box-sizing:border-box;max-width:100%;justify-content:flex-start;padding-left:36px}.qt-tab{font-size:12px}}
  `;
  document.head.appendChild(s);
})();

const qtChip = (accion, extra = '') => { const [t, bg, col] = QT_ACC[accion]; return `<span class="qt-ch" style="background:${bg};color:${col}">${t}${extra}</span>`; };

// La tabla «Lo que le has dicho» (6 semanas por tema).
window.qtTablaHTML = (R, { titulo = true } = {}) => {
  const hoy = R._hoy, lunes = qtLunes(hoy);
  const sem = R._semanas.map(s => (s === lunes ? 'Esta' : qtCorta(s)));
  const filas = QT_TEMAS.map(([k]) => {
    const r = R[k];
    const ult = r.ult ? `${qtHace(r.ult.fecha, hoy)} · ${QT_ACC[r.ult.accion][0].toLowerCase()}${r.ult.frag ? `: «${qtEsc(r.ult.frag.length > 60 ? r.ult.frag.slice(0, 59) + '…' : r.ult.frag)}»` : ''}` : 'Nunca';
    return `<tr data-qt-tema="${k}"><td>${QT_NOM[k].largo}</td>${r.cel.map(a => `<td>${a.length ? a.map(x => qtChip(x)).join(' ') : '<span class="qt-raya">—</span>'}</td>`).join('')}<td>${ult}</td></tr>`;
  }).join('');
  const al = qtAlerta(R);
  return `${titulo ? `<div class="qt-h"><div class="es-k">Lo que le has dicho · últimas 6 semanas</div><small>Sale de tus mensajes guardados y de lo que marcas</small></div>` : ''}
    <div style="overflow-x:auto"><table class="qt-tab" data-qt-tabla><thead><tr><th>Tema</th>${sem.map(s => `<th>${s}</th>`).join('')}<th>Última vez</th></tr></thead><tbody>${filas}</tbody></table></div>
    ${al ? `<div class="qt-aviso" data-qt-alerta><b>Ojo:</b> ${qtEsc(al)}</div>` : ''}`;
};

function qtListaHTML(ctx) {
  const { puntos, estados } = ctx;
  if (!puntos.length) return `<div class="qt-h"><div class="es-k">Qué tocar esta semana · sin repetir</div></div><p class="text-sm text-slate-500" style="margin:8px 0 0">Nada pendiente que recordarle esta semana. Si le escribes, pregúntale cómo va.</p>`;
  const h = estados.filter(Boolean).length;
  const fila = (p, i) => {
    const e = estados[i];
    const est = !e ? '' : e.modo === 'mio' ? '<span class="qt-ch qt-ve">Lo dijiste con tus palabras</span>' : e.modo === 'texto' ? '<span class="qt-ch qt-ve">Usaste el texto sugerido</span>' : `<span class="qt-ch qt-ve">Ya se lo dijiste en tu mensaje (${qtHace(e.fecha, fmt.hoy())})</span>`;
    const acc = e ? (e.id ? `<button type="button" class="btn btn-ghost btn-sm" data-qt-deshacer onclick="qtDeshacer(${i})">Deshacer</button>` : '')
      : `<button type="button" class="btn btn-ghost btn-sm" data-qt-ver onclick="qtVer(${i}, this)">Ver texto sugerido</button>
         <button type="button" class="btn btn-ghost btn-sm" data-qt-usar onclick="qtMarcar(${i}, 'texto')">Usar texto</button>
         <button type="button" class="btn btn-primary btn-sm" data-qt-dije onclick="qtMarcar(${i}, 'mio')">Ya lo dije yo</button>`;
    return `<div class="qt-p${e ? ' hecho' : ''}" data-qt-punto="${qtEsc(p.key)}" data-qt-hecho="${e ? e.modo : ''}">
      <span class="qt-c">${e ? '✓' : i + 1}</span>
      <div class="qt-b">
        <div class="qt-t"><b>${qtEsc(p.titulo)}</b><span class="qt-ch qt-gr">${QT_NOM[p.tema].corto}</span>${est}</div>
        <div class="qt-d"><b>Qué recordar:</b> ${qtEsc(p.dato)}</div>
        <div class="qt-por ${p.tono}">${qtEsc(p.por)}</div>
        <div class="qt-txt" data-qt-txt hidden>«${qtEsc(p.texto)}»</div>
      </div>
      <div class="qt-acc">${acc}</div>
    </div>`;
  };
  return `<div class="qt-h"><div class="es-k">Qué tocar esta semana · sin repetir</div><small>Tú decides: usar el texto o decirlo a tu manera</small></div>
    <div style="margin-top:6px">${puntos.map(fila).join('')}</div>
    <div class="qt-pie"><div data-qt-cuenta><b style="color:#1F1F1F">${h} de ${puntos.length} tocados.</b> Se guarda al marcar: la próxima semana no te lo vuelve a sugerir igual.</div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="${ctx.modal ? 'closeModal();' : ''}navigate('dialogos')">Abrir Diálogos</button></div>
    ${_qt.sinTabla ? `<div class="qt-aviso">Para guardar lo que marcas falta correr <b>${QT_SQL}</b> en Supabase.</div>` : ''}`;
}

// Arma los puntos y pinta donde corresponda (Seguimiento o la ventana de Toques).
async function qtArmar(c, S, { modal = false } = {}) {
  await qtCargar(modal ? null : c.id, !modal);
  const L = qtDe(c.id);
  const hoy = fmt.hoy();
  const R = qtResumen(qtEventos(L), hoy);
  const lunes = S && S.lunes ? S.lunes : qtLunes(hoy);
  // Los puntos se arman sin lo que marcaste esta semana: así lo ya marcado
  // sigue en la lista, con su chulo, en vez de desaparecer.
  const L0 = { ...L, marcas: L.marcas.filter(x => qtDia(x.fecha) < lunes) };
  const puntos = qtPuntos(c, S, qtResumen(qtEventos(L0), hoy), L0);
  _qt.ctx = { c, S, R, L, puntos, estados: puntos.map(p => qtEstado(p, R, lunes)), modal };
  return _qt.ctx;
}
function qtRepintar() {
  const ctx = _qt.ctx;
  if (!ctx) return;
  const lista = document.querySelector(ctx.modal ? '[data-qt-modal-lista]' : '[data-qt-lista]');
  const tabla = document.querySelector(ctx.modal ? '[data-qt-modal-tabla]' : '[data-qt-historial]');
  if (lista) lista.innerHTML = qtListaHTML(ctx);
  if (tabla) tabla.innerHTML = qtTablaHTML(ctx.R);
}

// Seguimiento: el armazón (arriba, después del calendario y la comida) y el pintado.
window.qtHTML = () => `<section class="sa-area" data-qt-seg>
  <div class="qt-card" data-qt-lista><div class="es-card es-sk"></div></div>
  <div class="qt-card" data-qt-historial></div>
</section>`;
window.qtPintar = async (c, S) => {
  if (!document.querySelector('[data-qt-lista]')) return;
  try { await qtArmar(c, S); } catch (e) { console.warn('qué tocar', e); const l = document.querySelector('[data-qt-lista]'); if (l) l.innerHTML = '<p class="text-sm text-slate-500">No pude leer lo que le has dicho.</p>'; return; }
  if (_qt.ctx.c !== c) return;
  qtRepintar();
};

// Toques: la ventana «Qué tocar» de un cliente.
window.qtAbrir = async (id) => {
  const c = ((typeof _tq !== 'undefined' && _tq.crudo && _tq.crudo.clientes) || []).find(x => String(x.id) === String(id)) || await db.clientes.get(id);
  if (!c) return;
  openModal(modalShell(`Qué tocar · ${qtEsc(c.nombre)}`, `<div data-qt-modal><div class="qt-card" data-qt-modal-lista style="box-shadow:none;padding:0"><p class="text-sm text-slate-500">Leyendo su semana…</p></div>
    <div class="qt-card" data-qt-modal-tabla style="box-shadow:none;padding:12px 0 0;border-top:1px solid #F3F1EB;border-radius:0"></div></div>`,
    `<a class="btn btn-secondary" href="?seg=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Abrir su seguimiento</a><button class="btn btn-primary" onclick="closeModal()">Listo</button>`), { wide: true });
  let S = null;
  try { if (typeof esSemanaDe === 'function') S = await esSemanaDe(c, qtLunes(fmt.hoy())); } catch (e) { S = null; }
  if (!document.querySelector('[data-qt-modal]')) return;
  try { await qtArmar(c, S, { modal: true }); } catch (e) { console.warn('qué tocar', e); return; }
  qtRepintar();
};

// ── Acciones ─────────────────────────────────────────────────────────────
window.qtVer = (i, btn) => {
  const p = btn && btn.closest('[data-qt-punto]');
  const t = p && p.querySelector('[data-qt-txt]');
  if (!t) return;
  t.hidden = !t.hidden;
  btn.textContent = t.hidden ? 'Ver texto sugerido' : 'Ocultar texto';
};
window.qtMarcar = async (i, modo) => {
  const ctx = _qt.ctx;
  const p = ctx && ctx.puntos[i];
  if (!p) return;
  if (modo === 'texto') {
    if (!ctx.modal && typeof saUsar === 'function' && document.getElementById('sa-texto')) saUsar(p.texto);
    else { try { await navigator.clipboard.writeText(p.texto); toast('Texto copiado. Pégalo en tu mensaje'); } catch (e) { toast('No pude copiar el texto'); } }
  }
  const hoy = fmt.hoy();
  try {
    const { data, error } = await sb.from('toques_temas').insert({ cliente_id: ctx.c.id, fecha: hoy, tema: p.tema, accion: p.accion, modo, punto: p.key, texto: modo === 'texto' ? p.texto : `${p.titulo}: ${p.dato}` }).select('id').single();
    if (error) throw error;
    ctx.estados[i] = { modo, id: data && data.id };
    ctx.L.marcas.push({ cliente_id: ctx.c.id, fecha: hoy, tema: p.tema, accion: p.accion, modo, punto: p.key, texto: p.dato, id: data && data.id });
    ctx.R = qtResumen(qtEventos(ctx.L), hoy);
    if (modo === 'mio') toast('Listo: queda como dicho');
  } catch (e) {
    if (/toques_temas|relation|schema cache|42P01|PGRST20/i.test(String((e && (e.message || e.code)) || ''))) { _qt.sinTabla = true; toast(`Para guardarlo falta correr ${QT_SQL} en Supabase`, 4000); }
    else toast('No pude guardarlo (sin conexión)');
    return;
  }
  _qt.datos = null;
  if (typeof _tq !== 'undefined') { _tq.datos = null; _tq.leido = 0; }
  qtRepintar();
};
window.qtDeshacer = async (i) => {
  const ctx = _qt.ctx;
  const e = ctx && ctx.estados[i];
  if (!e || !e.id) return;
  try {
    const { error } = await sb.from('toques_temas').update({ deshecho_en: new Date().toISOString() }).eq('id', e.id);
    if (error) throw error;
  } catch (er) { toast('No pude deshacerlo'); return; }
  ctx.L.marcas = ctx.L.marcas.filter(x => x.id !== e.id);
  ctx.estados[i] = null;
  ctx.R = qtResumen(qtEventos(ctx.L), fmt.hoy());
  _qt.datos = null;
  if (typeof _tq !== 'undefined') { _tq.datos = null; _tq.leido = 0; }
  qtRepintar();
};

// ── Toques: la celda «Lo que le has dicho» ───────────────────────────────
window.qtCeldaToques = (f) => {
  if (!_qt.datos) return '<span class="tq-cero">—</span>';
  const hoy = fmt.hoy(), lunes = qtLunes(hoy);
  const L = qtDe(f.c.id);
  const R = qtResumen(qtEventos(L), hoy);
  const filas = QT_TEMAS.map(([k]) => {
    const r = R[k];
    const x = r.ult ? qtChip(r.ult.accion, ` · ${qtEntre(r.ult.fecha, hoy) <= 0 ? 'hoy' : `${qtEntre(r.ult.fecha, hoy)} d`}`) : '<span class="qt-nunca">Nunca</span>';
    return `<div class="qt-fila"><span>${QT_NOM[k].corto}</span>${x}</div>`;
  }).join('');
  const al = qtAlerta(R);
  const marcadas = L.marcas.filter(x => qtDia(x.fecha) >= lunes).length;
  return `<div class="qt-celda" data-qt-celda>${filas}${al ? `<div class="qt-al">${qtEsc(al)}</div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px"><button type="button" class="cp-btn s" data-qt-abrir onclick="event.stopPropagation();qtAbrir('${f.c.id}')">Qué tocar</button>${marcadas ? `<span class="tq-sub">${marcadas} tocado${marcadas === 1 ? '' : 's'} esta semana</span>` : ''}</div></div>`;
};
