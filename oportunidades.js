// =====================================================
// OPORTUNIDADES DE MEJORA · en el Seguimiento de cada cliente
// =====================================================
// Arriba del Seguimiento, lo que se puede mejorar en la semana, en 4
// categorías y en este orden:
//   1. Entrenamiento                     (faltó, estancado, bajó, muy duro)
//   2. Actividad física complementaria   (cardio a medias, nada fuera de la rutina)
//   3. Alimentación                      (pocos días, lo que le falta o le
//                                         sobra en promedio de kcal, proteína,
//                                         carbos y grasa, el fin de semana)
//   4. Composición                       (falta pesarse, baja muy rápido,
//                                         sube mucho, peso estancado)
// Dentro de cada una, primero lo de «Actuar» y después lo de «Revisar». Cada
// cosa trae el dato, una recomendación práctica (con equivalencias en comida
// real) y «Usar en mi mensaje», que la pasa a la caja para escribirle.
// Solo lee: no cambia nada del cliente.
//
// Carga DESPUÉS de seguimiento-areas.js (usa saUsar, saEstancados, saNum,
// saSemanaISO) y de composicion.js / nutricion-plus.js.
// =====================================================

const OP_CATS = [
  ['entreno', 'Entrenamiento', '#3C7BD6'],
  ['actividad', 'Actividad física complementaria', '#EE8434'],
  ['comida', 'Alimentación', '#46965A'],
  ['cuerpo', 'Composición', '#9B6BD6'],
];
const _op = { items: [] };

// Equivalencias en comida real (aproximadas) para cerrar lo que falta.
const OP_PROT = [[15, '1 yogur griego o 2 huevos', 15], [30, '1 lata de atún o 100 g de pechuga de pollo', 28], [45, '100 g de pechuga de pollo y 1 yogur griego', 45], [Infinity, 'una porción más de proteína en cada comida (pollo, carne, huevo o atún)', null]];
const OP_CARB = [[30, '1 banano o 1 tajada de pan', 27], [60, '1 taza de arroz cocido o 1 arepa mediana', 45], [Infinity, '1 taza de arroz cocido y 1 banano', 70]];
const OP_GRASA = [[12, '1 cucharada de aceite de oliva o 1/4 de aguacate', 12], [Infinity, '1/2 aguacate o 1 puñado de maní', 18]];
const opEquiv = (tabla, falta) => tabla.find(x => falta <= x[0]);

function opHTML() {
  return `<section class="sa-area op-area" id="sa-mejora" data-op-mejora>
    <div class="sa-ah">Oportunidades de mejora<span class="op-pill" data-op-resumen>…</span></div>
    <div data-op-cuerpo><div class="es-card es-sk"></div></div>
  </section>`;
}

// El objetivo del cliente: bajar, subir o mantener (lo calórico de su ficha
// y, si no, lo que escribiste en «objetivo»).
function opObjetivo(c) {
  const k = String(c.objetivo_calorico || '');
  if (/^deficit/.test(k)) return 'bajar';
  if (/^superavit/.test(k)) return 'subir';
  if (k === 'mantener') return 'mantener';
  const t = String(c.objetivo || '').toLowerCase();
  if (/(bajar|perder|definir|grasa|adelgaz)/.test(t)) return 'bajar';
  if (/(ganar|subir|masa|volumen|m[uú]sculo)/.test(t)) return 'subir';
  return null;
}

const opDiaNombre = (f) => ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(f + 'T12:00:00Z').getUTCDay()];
const opLista = (xs) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
const opG = (n) => `${Math.round(Math.abs(n))} g`;

// ── 1 y 2. Entrenamiento y actividad (con la semana ya calculada) ─────────
function opEntreno(S, D, n) {
  const out = [];
  const F = S.F || {};
  const kgde = (s) => (s && s.unidad === 'lb' ? Number(s.peso) * 0.4536 : Number(s && s.peso)) || 0;
  if (F.plan && (F.faltaron || []).length) {
    const dias = F.faltaron.map(x => opDiaNombre(x.f));
    const igual = S.prev && S.prev.plan && S.prev.hechas < S.prev.plan;
    const fuerte = F.faltaron.length >= 2 || !F.hechas;
    out.push({
      cat: 'entreno', nivel: fuerte ? 'actuar' : 'revisar',
      titulo: F.faltaron.length === 1 ? 'Faltó a 1 entreno' : `Faltó a ${F.faltaron.length} entrenos`,
      dato: `Hizo ${F.hechas} de ${F.plan} rutinas. Faltó el ${opLista(dias)}${igual ? `; la semana pasada también le faltaron (${S.prev.hechas} de ${S.prev.plan})` : ''}.`,
      rec: 'que deje fijos sus días en el calendario de la app y, si un día no puede, que haga la rutina al día siguiente en vez de saltarla.',
      msg: `${n}, esta semana hiciste ${F.hechas} de ${F.plan} entrenos. Deja fijos tus días en el calendario de la app y, si un día no puedes, haz la rutina al día siguiente en vez de saltarla.`,
      ped: { tipo: 'entreno', texto: 'Cumplir los entrenos de la semana', objetivo: {} },
    });
  }
  const est = typeof saEstancados === 'function' ? saEstancados(D) : [];
  est.slice(0, 3).forEach(x => {
    const u = x.serie.unidad || 'kg';
    const paso = u === 'lb' ? 5 : kgde(x.serie) >= 20 ? 2.5 : 1;
    const nuevo = Number(x.serie.peso) + paso;
    const reps = Number(x.serie.reps), tope = x.rango ? x.rango[1] : null;
    const base = { cat: 'entreno', nivel: est.length >= 3 ? 'actuar' : 'revisar', titulo: `Estancado en ${x.nombre}`, dato: `3 sesiones seguidas con ${saNum(x.serie.peso)} ${u} × ${reps}${tope ? ` (su rango es ${x.rango[0]}-${tope})` : ''}.` };
    // Reps primero: por debajo del tope del rango, se suman reps con el mismo peso.
    if (tope && reps < tope) {
      out.push({ ...base,
        rec: `mantener ${saNum(x.serie.peso)} ${u} y sumar 1 o 2 repeticiones por serie hasta llegar a ${tope}. Ahí se sube el peso.`,
        msg: `${n}, en ${x.nombre} llevas 3 sesiones con ${saNum(x.serie.peso)} ${u} × ${reps}. Mantén el peso y busca 1 o 2 repeticiones más por serie hasta llegar a ${tope}; cuando llegues, subimos el peso.`,
        ped: { tipo: 'entreno', texto: `${x.nombre}: llegar a ${tope} reps con ${saNum(x.serie.peso)} ${u}`, objetivo: { ejercicio: x.nombre } },
      });
      return;
    }
    // En el tope pero lo sintió muy duro: todavía no.
    if (x.rpe && x.rpe >= 9) {
      out.push({ ...base,
        rec: `mantener ${saNum(x.serie.peso)} ${u} una sesión más: llegó al tope pero con esfuerzo ${x.rpe} de 10. Cuando le salga más cómodo, se sube.`,
        msg: `${n}, en ${x.nombre} ya llegas a ${reps} con ${saNum(x.serie.peso)} ${u}, pero lo sentiste muy duro. Mantén ese peso una sesión más y, cuando te salga más cómodo, subimos.`,
        ped: null,
      });
      return;
    }
    out.push({
      cat: 'entreno', nivel: est.length >= 3 ? 'actuar' : 'revisar',
      titulo: `Estancado en ${x.nombre}`,
      dato: `3 sesiones seguidas con ${saNum(x.serie.peso)} ${u} × ${x.serie.reps}.`,
      rec: `la próxima vez ${saNum(nuevo)} ${u}, aunque haga 2 repeticiones menos. Cuando vuelva a llegar a ${x.serie.reps}, sube otra vez.`,
      msg: `${n}, en ${x.nombre} llevas 3 sesiones con ${saNum(x.serie.peso)} ${u} × ${x.serie.reps}. La próxima vez sube a ${saNum(nuevo)} ${u}, aunque hagas 2 repeticiones menos. Cuando vuelvas a llegar a ${x.serie.reps}, subimos otra vez.`,
      ped: { tipo: 'entreno', texto: `${x.nombre}: subir a ${saNum(nuevo)} ${u}`, objetivo: { ejercicio: x.nombre, peso_kg: u === 'lb' ? Math.round(nuevo * 0.4536 * 10) / 10 : nuevo } },
    });
  });
  const bajas = (S.sobre || []).filter(x => x.tipo === 'baja' && x.antes && x.ahora);
  bajas.slice(0, 2).forEach(x => {
    const ua = x.antes.unidad || 'kg', ub = x.ahora.unidad || 'kg';
    out.push({
      cat: 'entreno', nivel: 'revisar',
      titulo: `Bajó en ${x.nombre}`,
      dato: `De ${saNum(x.antes.peso)} ${ua} × ${x.antes.reps} a ${saNum(x.ahora.peso)} ${ub} × ${x.ahora.reps}.`,
      rec: 'preguntarle cómo durmió y cómo comió ese día. Una sesión baja es normal; si se repite, se ajusta la carga.',
      msg: `${n}, vi que en ${x.nombre} bajaste un poco esta semana. ¿Cómo dormiste y comiste ese día? Una sesión así es normal; si se repite, ajustamos la carga.`,
      ped: null,
    });
  });
  if (S.rpe && S.rpe.n >= 2 && S.rpe.prom >= 9) {
    out.push({
      cat: 'entreno', nivel: 'revisar', titulo: 'Entrenos muy duros',
      dato: `Marcó sus entrenos con un esfuerzo de ${saNum(S.rpe.prom)} de 10 en promedio (${S.rpe.n} sesiones).`,
      rec: 'mantener las cargas esta semana y revisar sueño y comida antes de subir. Si sigue así, se baja un poco el volumen.',
      msg: `${n}, tus entrenos de esta semana los sentiste muy duros. Esta semana mantenemos las cargas; cuéntame cómo vas durmiendo y comiendo.`,
      ped: null,
    });
  }

  // Actividad complementaria (cardio que le pusiste o que hace por su cuenta)
  const C = S.C || { plan: 0, hechos: 0, faltaron: [], extras: [] };
  if (C.plan && C.faltaron.length) {
    const t = C.faltaron[0];
    const min = t.min ? ` (${t.min} min)` : '';
    out.push({
      cat: 'actividad', nivel: !C.hechos && C.faltaron.length >= 2 ? 'actuar' : 'revisar',
      titulo: C.hechos ? 'Cardio a medias' : 'Cardio sin hacer',
      dato: `Hizo ${C.hechos} de ${C.plan} de lo que le pusiste: ${String(t.titulo).toLowerCase()}${min}.`,
      rec: `que lo haga justo al terminar la rutina, aunque sean 15 min${t.min ? ` en vez de ${t.min}` : ''}: así no depende de buscar otro momento del día. Y que lo marque «Ya lo hice» en la app.`,
      msg: `${n}, del cardio hiciste ${C.hechos} de ${C.plan}. Hazlo justo al terminar la rutina, aunque sean 15 minutos: así no tienes que buscar otro momento del día. Y márcalo «Ya lo hice» en la app.`,
      ped: { tipo: 'otro', texto: 'Hacer el cardio después de entrenar', objetivo: {} },
    });
  }
  const pasados = (S.dias || []).filter(d => !d.futuro).length;
  if (!C.plan && !(C.extras || []).length && pasados >= 4) {
    out.push({
      cat: 'actividad', nivel: 'revisar', titulo: 'Nada de actividad fuera de la rutina',
      dato: 'Esta semana no registró ninguna caminata, cardio ni deporte.',
      rec: 'una caminata de 20 a 30 min los días que no entrena, y que la registre en la app con «Añadir cardio o deporte».',
      msg: `${n}, los días que no entrenas suma una caminata de 20 a 30 minutos y regístrala en la app con «Añadir cardio o deporte». Ayuda mucho a la recuperación y al gasto del día.`,
      ped: { tipo: 'otro', texto: 'Caminata los días sin entreno', objetivo: {} },
    });
  }
  return out;
}

// ── 3. Alimentación (del Mealtracker) ─────────────────────────────────────
function opComida(c, S, d, peso, n) {
  const out = [];
  const K = S.K;
  if (K && K.base >= 3 && K.dias < K.base * 0.6) {
    out.push({
      cat: 'comida', nivel: 'actuar', titulo: 'Registra pocos días',
      dato: `Registró ${K.dias} de ${K.base} días${K.finde ? ', y nada el fin de semana' : ''}.`,
      rec: 'que registre todos los días aunque sea aproximado; dictarlo en el chat de la app toma 30 segundos. Sin registro no se puede saber qué ajustar.',
      msg: `${n}, esta semana registraste ${K.dias} de ${K.base} días. Regístralo todos los días aunque sea aproximado: dictarlo en el chat de la app toma 30 segundos y así sé qué ajustar.`,
      ped: { tipo: 'comida', texto: 'Registrar la comida todos los días', objetivo: { foco: 'registro' } },
    });
  }
  if (!d) return out;
  let meta = null;
  try { const a = analizarNutricionSemana(d, saSemanaISO(S.lunes), c, peso); meta = a && a.meta; } catch (e) { meta = null; }
  if (!meta || !meta.kcal) return out;
  const hist = d.history || {};
  const reg = (fs) => fs.filter(f => hist[f] && Number(hist[f].kcal) > 0);
  let fechas = reg(S.fechas.filter(f => f < S.hoy)), cuando = 'esta semana';
  if (fechas.length < 3) { fechas = reg(Array.from({ length: 7 }, (_, i) => evtSumarDias(S.hoy, -7 + i))); cuando = 'los últimos 7 días'; }
  if (fechas.length < 3) return out;
  const prom = (k) => fechas.reduce((a, f) => a + (Number(hist[f][k]) || 0), 0) / fechas.length;
  const P = { kcal: prom('kcal'), p: prom('p'), c: prom('c'), g: prom('g') };
  const dif = { kcal: P.kcal - meta.kcal, p: meta.p ? P.p - meta.p : null, c: meta.c ? P.c - meta.c : null, g: meta.g ? P.g - meta.g : null };
  const macros = `<div class="op-mac">${[['kcal', 'kcal', dif.kcal], ['p', 'proteína', dif.p], ['c', 'carbos', dif.c], ['g', 'grasa', dif.g]].map(([k, l, v]) => `<div><b class="${v == null ? '' : v < 0 ? 'op-neg' : 'op-pos'}">${v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${k === 'kcal' ? Math.round(Math.abs(v)) : opG(v)}`}</b>${l}</div>`).join('')}</div>`;
  const falta = [];
  if (dif.p != null && dif.p <= -10) { const e = opEquiv(OP_PROT, -dif.p); falta.push([`<b>${e[1]}</b>${e[2] ? ` (≈ ${e[2]} g de proteína)` : ''}`, `${e[1]}${e[2] ? ` (unos ${e[2]} g de proteína)` : ''}`]); }
  if (dif.c != null && dif.c <= -20) { const e = opEquiv(OP_CARB, -dif.c); falta.push([`<b>${e[1]}</b> (≈ ${e[2]} g de carbos)`, `${e[1]} (unos ${e[2]} g de carbos)`]); }
  if (dif.g != null && dif.g <= -10) { const e = opEquiv(OP_GRASA, -dif.g); falta.push([`<b>${e[1]}</b> (≈ ${e[2]} g de grasa)`, `${e[1]} (unos ${e[2]} g de grasa)`]); }
  const corto = dif.kcal <= -meta.kcal * 0.1 || (dif.p != null && dif.p <= -meta.p * 0.1);
  const pasa = dif.kcal >= meta.kcal * 0.1;
  if (corto && falta.length) {
    const fuerte = dif.kcal <= -meta.kcal * 0.2 || (dif.p != null && dif.p <= -meta.p * 0.2);
    out.push({
      cat: 'comida', nivel: fuerte ? 'actuar' : 'revisar', titulo: 'No llega a su meta',
      dato: `Promedio de ${fechas.length} días registrados (${cuando}) contra su meta. Lo que le falta cada día:`, extra: macros,
      rec: `sumar al día ${falta.map(x => x[0]).join(' y ')}. Con eso cierra casi toda la diferencia.`,
      msg: `${n}, revisé tu comida de ${cuando}: en promedio te faltan ${[dif.p != null && dif.p < 0 ? `${opG(dif.p)} de proteína` : null, dif.c != null && dif.c < -20 ? `${opG(dif.c)} de carbos` : null].filter(Boolean).join(' y ') || `${Math.round(-dif.kcal)} kcal`} al día. Súmale ${falta.map(x => x[1]).join(' y ')}. Con eso cierras casi toda la diferencia.`,
      ped: { tipo: 'comida', texto: 'Llegar a la meta de proteína', objetivo: { foco: dif.p != null && dif.p <= -10 ? 'proteina' : 'otro' } },
    });
  } else if (pasa) {
    const exC = dif.c != null ? dif.c * 4 : 0, exG = dif.g != null ? dif.g * 9 : 0;
    const porGrasa = exG > exC;
    out.push({
      cat: 'comida', nivel: dif.kcal >= meta.kcal * 0.2 ? 'actuar' : 'revisar', titulo: 'Se pasa de su meta',
      dato: `Promedio de ${fechas.length} días registrados (${cuando}) contra su meta. Lo que le sobra cada día:`, extra: macros,
      rec: porGrasa ? 'menos aceite y fritos, y el queso, el aguacate y las salsas en porciones pequeñas.' : 'la mitad del arroz, el pan o la arepa en la cena, y cambiar bebidas con azúcar por agua o versión cero.',
      msg: `${n}, revisé tu comida de ${cuando}: en promedio vas unas ${Math.round(dif.kcal)} kcal por encima de tu meta. ${porGrasa ? 'Baja el aceite y los fritos, y el queso, el aguacate y las salsas en porciones pequeñas.' : 'En la cena come la mitad del arroz, el pan o la arepa, y cambia las bebidas con azúcar por agua o versión cero.'}`,
      ped: { tipo: 'comida', texto: 'Ajustar porciones a la meta', objetivo: { foco: 'otro' } },
    });
  }
  // El fin de semana: sábado y domingo muy por encima y entre semana en meta.
  const finde = fechas.filter(f => [0, 6].includes(new Date(f + 'T12:00:00Z').getUTCDay()));
  const entre = fechas.filter(f => !finde.includes(f));
  if (finde.length && entre.length >= 2) {
    const pf = finde.reduce((a, f) => a + Number(hist[f].kcal), 0) / finde.length;
    const pe = entre.reduce((a, f) => a + Number(hist[f].kcal), 0) / entre.length;
    if (pf >= meta.kcal * 1.2 && pe <= meta.kcal * 1.1) {
      out.push({
        cat: 'comida', nivel: 'revisar', titulo: 'El fin de semana se sale',
        dato: `Sábado y domingo, ${Math.round(pf - meta.kcal)} kcal por encima de su meta; entre semana, ${Math.abs(pe - meta.kcal) <= meta.kcal * 0.1 ? 'en meta' : 'por debajo'}.`,
        rec: 'dejar planeada una comida libre (no todo el fin de semana) y registrar igual, aunque sea aproximado.',
        msg: `${n}, entre semana vas muy bien con la comida; el fin de semana se sube bastante. Deja planeada una comida libre, no todo el fin de semana, y regístrala igual aunque sea aproximado.`,
        ped: { tipo: 'comida', texto: 'Una sola comida libre el fin de semana', objetivo: { foco: 'otro' } },
      });
    }
  }
  return out;
}

// ── 4. Composición (peso) ─────────────────────────────────────────────────
function opCuerpo(c, meds, n) {
  const out = [];
  const hoy = fmt.hoy();
  const conPeso = (meds || []).filter(m => m.peso != null && Number(m.peso) > 0).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const ult = conPeso[conPeso.length - 1] || null;
  const obj = opObjetivo(c);
  const dias = ult ? saDias(ult.fecha, hoy) : null;
  if (!ult || dias > 10) {
    out.push({
      cat: 'cuerpo', nivel: !ult || dias > 14 ? 'actuar' : 'revisar', titulo: 'Falta registrar el peso',
      dato: ult ? `Último peso hace ${dias} días (${saNum(ult.peso)} kg).` : 'No tiene ningún peso registrado.',
      rec: 'que se pese el lunes en ayunas, después de ir al baño, y lo anote en la app. Sin peso no se sabe si la meta va bien.',
      msg: `${n}, el lunes pésate en ayunas, después de ir al baño, y anótalo en la app. Así veo si la meta va bien.`,
      ped: { tipo: 'medicion', texto: 'Pesarse el lunes en ayunas', objetivo: {} },
    });
  }
  if (!ult) return out;
  // Ritmo: contra el peso de hace 10 a 60 días.
  const ref = conPeso.slice().reverse().find(m => { const x = saDias(m.fecha, ult.fecha); return x >= 10 && x <= 60; });
  if (ref) {
    const sem = saDias(ref.fecha, ult.fecha) / 7;
    const pct = ((Number(ult.peso) - Number(ref.peso)) / Number(ref.peso)) * 100 / sem;
    const kgSem = (Number(ult.peso) - Number(ref.peso)) / sem;
    if (pct <= -1) {
      out.push({
        cat: 'cuerpo', nivel: pct <= -1.5 ? 'actuar' : 'revisar', titulo: 'Baja muy rápido',
        dato: `${saNum(Math.abs(kgSem))} kg por semana (${saNum(Math.abs(pct))} % de su peso): de ${saNum(ref.peso)} a ${saNum(ult.peso)} kg.`,
        rec: obj === 'bajar' ? 'subir 100 a 150 kcal al día, sobre todo de proteína y carbos alrededor del entreno, para no perder músculo.' : 'revisar si está comiendo lo suficiente; si no busca bajar, subir la comida hasta su meta.',
        msg: obj === 'bajar' ? `${n}, vas bajando más rápido de lo ideal. Súmale 100 a 150 kcal al día, sobre todo proteína y carbos alrededor del entreno, para que lo que bajes sea grasa y no músculo.` : `${n}, vi que bajaste de peso estas semanas. ¿Estás comiendo lo que te toca? Quiero que llegues a tu meta de comida todos los días.`,
        ped: null,
      });
    } else if (pct >= 0.5 && obj !== 'subir') {
      out.push({
        cat: 'cuerpo', nivel: pct >= 1 ? 'actuar' : 'revisar', titulo: 'Sube mucho',
        dato: `+${saNum(kgSem)} kg por semana: de ${saNum(ref.peso)} a ${saNum(ult.peso)} kg.`,
        rec: 'revisar los fines de semana y las porciones (Alimentación). Si es retención por un día salado o el ciclo, esperar al siguiente peso.',
        msg: `${n}, el peso subió estas semanas. Revisemos juntos las porciones y el fin de semana; con un par de ajustes lo enderezamos.`,
        ped: null,
      });
    }
  }
  // Estancado: 3 o más pesos en 21 días o más, todos en medio kilo, buscando bajar.
  const hace = evtSumarDias(ult.fecha, -35);
  const rec = conPeso.filter(m => String(m.fecha) >= hace);
  if (obj === 'bajar' && rec.length >= 3 && saDias(rec[0].fecha, ult.fecha) >= 21) {
    const vs = rec.map(m => Number(m.peso));
    if (Math.max(...vs) - Math.min(...vs) <= 0.5) {
      out.push({
        cat: 'cuerpo', nivel: 'revisar', titulo: 'Peso estancado',
        dato: `${Math.round(saDias(rec[0].fecha, ult.fecha) / 7)} semanas entre ${saNum(Math.min(...vs))} y ${saNum(Math.max(...vs))} kg. Su meta es bajar.`,
        rec: 'primero cerrar lo que le falta en Alimentación. Si ya cumple y sigue igual 2 semanas más, bajar 150 kcal o sumar 2.000 pasos al día.',
        msg: `${n}, tu peso lleva unas semanas quieto. Primero vamos a cumplir la meta de comida todos los días; si en 2 semanas sigue igual, ajustamos un poco las calorías o sumamos caminata.`,
        ped: null,
      });
    }
  }
  return out;
}

// ── Pintar ────────────────────────────────────────────────────────────────
window.opPintar = async (c, S, D) => {
  const caja = document.querySelector('[data-op-cuerpo]');
  if (!caja) return;
  const n = escapeHtml(String(c.como_le_digo || c.nombre || '').split(/\s+/)[0]) || 'Hola';
  let d = null, meds = [];
  try { [d, meds] = await Promise.all([typeof getMealtrackerDataMerged === 'function' ? getMealtrackerDataMerged(c).catch(() => null) : null, db.mediciones.listCliente(c.id).catch(() => [])]); } catch (e) { /* sin datos */ }
  if (!caja.isConnected || _sa.cliente !== c) return;
  const conPeso = (meds || []).filter(m => m.peso != null);
  const peso = conPeso.length ? Number(conPeso[conPeso.length - 1].peso) : null;
  let items = [];
  try { items = [...opEntreno(S, D, n), ...opComida(c, S, d, peso, n), ...opCuerpo(c, meds, n)]; } catch (e) { console.warn('oportunidades', e); }
  _op.items = items;
  const orden = { actuar: 0, revisar: 1 };
  const actuar = items.filter(x => x.nivel === 'actuar').length;
  const res = document.querySelector('[data-op-resumen]');
  if (res) {
    res.textContent = items.length ? `${items.length} esta semana${actuar ? ` · ${actuar} para actuar` : ''}` : 'Todo al día';
    res.className = `op-pill ${items.length ? (actuar ? 'op-r' : 'op-a') : 'op-v'}`;
  }
  const tarjeta = (x) => {
    const i = _op.items.indexOf(x);
    return `<div class="op-it" data-op-item="${x.cat}" data-op-nivel="${x.nivel}">
      <div class="op-t">${escapeHtml(x.titulo)} <span class="op-tag ${x.nivel === 'actuar' ? 'op-r' : 'op-a'}">${x.nivel === 'actuar' ? 'Actuar' : 'Revisar'}</span></div>
      <div class="op-d">${escapeHtml(x.dato)}</div>${x.extra || ''}
      <div class="op-rec"><b>Recomendación:</b> ${x.rec}</div>
      <button type="button" class="sa-btn" data-op-usar onclick="opUsar(${i})">Usar en mi mensaje</button>
    </div>`;
  };
  caja.innerHTML = `<div class="op-cols">${OP_CATS.map(([k, t, col], i) => {
    const xs = items.filter(x => (k === 'entreno' ? x.cat === 'entreno' : k === 'actividad' ? x.cat === 'actividad' : x.cat === k)).sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    return `<div class="op-col" data-op-cat="${k}"><div class="op-h"><i style="background:${col}"></i>${i + 1}. ${t}</div>
      ${xs.length ? xs.map(tarjeta).join('') : '<div class="op-ok">Al día: nada que mejorar esta semana.</div>'}</div>`;
  }).join('')}</div>`;
};
window.opUsar = (i) => {
  const x = _op.items[i];
  if (!x || typeof saUsar !== 'function') return;
  saUsar(x.msg, x.ped ? [x.ped] : []);
};

(function () {
  if (document.getElementById('op-css')) return;
  const s = document.createElement('style');
  s.id = 'op-css';
  s.textContent = `
  .op-area .sa-ah{text-transform:none;letter-spacing:0;font-size:17px;font-weight:800;color:#1F1F1F}
  .op-pill{margin-left:10px;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;background:#F1EEE8;color:#737373}
  .op-r{background:#FBE3DE;color:#B2402B}.op-a{background:#FDEFD9;color:#9A5B12}.op-v{background:#E4F1E7;color:#2F7F45}
  .op-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}
  .op-col{min-width:0}
  .op-h{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14.5px;margin:2px 2px 8px;color:#1F1F1F}
  .op-h i{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}
  .op-it{background:#fff;border:1px solid #EEECE5;border-radius:14px;padding:12px 14px;margin-bottom:10px}
  .op-t{font-weight:800;font-size:14.5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#1F1F1F}
  .op-tag{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px}
  .op-d{font-size:13px;color:#555;margin:4px 0 6px;line-height:1.4}
  .op-rec{font-size:13px;background:#F7F5F0;border-radius:10px;padding:8px 10px;line-height:1.45;color:#444;margin-bottom:8px}
  .op-rec b{color:#1F1F1F}
  .op-mac{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:6px 0 8px}
  .op-mac div{background:#F7F5F0;border-radius:10px;padding:7px 8px;font-size:11.5px;color:#666}
  .op-mac b{display:block;font-size:15px;color:#1F1F1F}
  .op-mac b.op-neg{color:#B2402B}.op-mac b.op-pos{color:#9A5B12}
  .op-ok{font-size:13px;color:#2F7F45;background:#F2F8F3;border-radius:12px;padding:10px 12px}
  @media (max-width:760px){.op-cols{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
})();
