// =====================================================
// CRM EntrenaConMétodo · NUTRICIÓN DEL CLIENTE (centralizada)
// =====================================================
// Esta sección reemplaza al dashboard de coach del Mealtracker: todo lo que
// allá se miraba en pestañas sueltas (día, calendario, semana, historial,
// favoritos, micros) vive acá, junto al resto de la ficha del cliente y con
// UNA sola aritmética.
//
// ─── POR QUÉ LOS NÚMEROS NO CUADRABAN ANTES ─────────────────────────────
// El CRM y el dashboard del Mealtracker medían cosas distintas y las
// llamaban igual. Las cuatro diferencias reales eran:
//
//   1. LA VENTANA. El dashboard del coach promediaba los ÚLTIMOS 7 DÍAS
//      móviles (hoy hacia atrás); el CRM promedia la SEMANA ISO
//      (lunes-domingo), que es la misma con la que se registra el
//      seguimiento semanal. Un martes, "esta semana" eran dos conjuntos de
//      días distintos: nunca podían dar lo mismo.
//      → Canónico: SEMANA ISO. Es la unidad con la que trabajas el
//        seguimiento, los pendientes y el pago. La ventana móvil también
//        está disponible, pero rotulada como lo que es.
//
//   2. QUÉ CUENTA COMO "DÍA REGISTRADO". El CRM pedía kcal > 0; el
//      Mealtracker solo pedía que la fecha existiera. Un día en que el
//      cliente registró y luego borró una comida contaba allá y no acá.
//      → Canónico: diaRegistradoMT() en app.js, un único criterio para
//        toda la app (adherencia rápida incluida).
//
//   3. LA META CONTRA LA QUE SE COMPARA. Se leían por separado la meta
//      vigente y el historial de metas, y con clientes que tienen varias
//      cuentas podían salir de cuentas distintas. Además el formato viejo
//      ({calories, protein…}) se leía a medias y el cliente aparecía "sin
//      meta".
//      → Canónico: goalsMTEnFecha() en app.js. Cada día se juzga contra la
//        meta que regía ESE día, normalizando los dos formatos.
//
//   4. EL DÍA EN CURSO. En modo directo el CRM solo plegaba el día de hoy
//      si traía kcal > 0; la API de coach lo pliega siempre.
//      → Canónico: se pliega siempre, en getMealtrackerDataMerged().
//
// Todo eso ya está corregido en app.js. Este archivo NO recalcula nada por
// su cuenta: parte del mismo análisis y solo lo ENRIQUECE con lo que faltaba
// (perfil de grasas, azúcar añadida, eficiencia nutricional, despensa,
// historial literal) y lo presenta.
//
// ─── CÓMO SE INSTALA ────────────────────────────────────────────────────
// No modifica app.js. Se carga DESPUÉS y reemplaza routes.nutricion.
//     <script src="/app.js"></script>
//     <script src="/nutricion-plus.js"></script>   ← agregar esta
// =====================================================

// ─── Estado propio de la sección (el de app.js sigue siendo _nut) ───────
const _np = {
  tab: 'resumen',
  literalQ: '',
  literalMeal: 'todas',
  rankMetric: 'kcal',
  mesAncla: null,      // 'YYYY-MM' del calendario; null = el de la semana activa
  literalRango: 'semana', // semana | 30d | todo
  focoIa: null,        // encargo con foco que se manda al agente
};

// =====================================================
// PERFIL DE GRASAS · estimación
// =====================================================
// El registro del Mealtracker guarda por alimento: kcal, proteína, carbos,
// grasa TOTAL, fibra, omega-3 y azúcar AÑADIDA (los tres últimos los estima
// el modelo al registrar). No guarda el desglose saturada/mono/poli, así que
// acá se reparte la grasa total del alimento según su perfil lipídico típico.
//
// Se reparte la grasa que YA está medida (no se inventan gramos nuevos): lo
// estimado es la PROPORCIÓN, que es lo estable de cada alimento. Cuando el
// alimento no se reconoce se usa el reparto de una dieta mixta y la ficha
// queda marcada como estimación de baja confianza.
//
// Fracciones sobre la grasa total del alimento (sat + mono + poli ≈ 1;
// el resto es glicerol/trans/no clasificada). Fuente: perfiles USDA SR.
const NP_LIPIDOS = {
  'aceite de coco':   { sat: 0.87, mono: 0.06, poli: 0.02 },
  'coco':             { sat: 0.85, mono: 0.06, poli: 0.02 },
  'aceite de oliva':  { sat: 0.14, mono: 0.73, poli: 0.11 },
  'aceite oliva':     { sat: 0.14, mono: 0.73, poli: 0.11 },
  'aceite de girasol':{ sat: 0.10, mono: 0.20, poli: 0.66 },
  'aceite de canola': { sat: 0.08, mono: 0.60, poli: 0.28 },
  'aceite':           { sat: 0.15, mono: 0.45, poli: 0.35 },
  'mantequilla de mani': { sat: 0.14, mono: 0.50, poli: 0.31 },
  'mantequilla mani': { sat: 0.14, mono: 0.50, poli: 0.31 },
  'mantequilla':      { sat: 0.63, mono: 0.26, poli: 0.04 },
  'manteca':          { sat: 0.39, mono: 0.45, poli: 0.11 },
  'margarina':        { sat: 0.20, mono: 0.40, poli: 0.35 },
  'tocino':           { sat: 0.38, mono: 0.46, poli: 0.11 },
  'chicharron':       { sat: 0.38, mono: 0.46, poli: 0.11 },
  'chorizo':          { sat: 0.38, mono: 0.45, poli: 0.10 },
  'salchicha':        { sat: 0.38, mono: 0.45, poli: 0.10 },
  'salchichon':       { sat: 0.38, mono: 0.45, poli: 0.10 },
  'jamon':            { sat: 0.35, mono: 0.45, poli: 0.12 },
  'mortadela':        { sat: 0.38, mono: 0.45, poli: 0.10 },
  'carne':            { sat: 0.40, mono: 0.45, poli: 0.04 },
  'res':              { sat: 0.40, mono: 0.45, poli: 0.04 },
  'lomo':             { sat: 0.38, mono: 0.45, poli: 0.05 },
  'cerdo':            { sat: 0.35, mono: 0.45, poli: 0.11 },
  'cordero':          { sat: 0.45, mono: 0.42, poli: 0.06 },
  'pollo':            { sat: 0.29, mono: 0.40, poli: 0.21 },
  'pechuga':          { sat: 0.29, mono: 0.40, poli: 0.21 },
  'pavo':             { sat: 0.30, mono: 0.35, poli: 0.25 },
  'salmon':           { sat: 0.20, mono: 0.40, poli: 0.30 },
  'atun':             { sat: 0.28, mono: 0.25, poli: 0.35 },
  'sardina':          { sat: 0.30, mono: 0.34, poli: 0.30 },
  'trucha':           { sat: 0.22, mono: 0.35, poli: 0.33 },
  'pescado':          { sat: 0.25, mono: 0.28, poli: 0.35 },
  'camaron':          { sat: 0.25, mono: 0.20, poli: 0.40 },
  'huevo':            { sat: 0.31, mono: 0.38, poli: 0.14 },
  'clara':            { sat: 0.31, mono: 0.38, poli: 0.14 },
  'queso':            { sat: 0.63, mono: 0.28, poli: 0.03 },
  'yogur':            { sat: 0.62, mono: 0.28, poli: 0.04 },
  'leche':            { sat: 0.62, mono: 0.28, poli: 0.04 },
  'kumis':            { sat: 0.62, mono: 0.28, poli: 0.04 },
  'crema de leche':   { sat: 0.62, mono: 0.28, poli: 0.04 },
  'aguacate':         { sat: 0.14, mono: 0.67, poli: 0.13 },
  'palta':            { sat: 0.14, mono: 0.67, poli: 0.13 },
  'almendra':         { sat: 0.08, mono: 0.63, poli: 0.25 },
  'mani':             { sat: 0.14, mono: 0.50, poli: 0.31 },
  'marmoson':         { sat: 0.20, mono: 0.55, poli: 0.17 },
  'maranon':          { sat: 0.20, mono: 0.55, poli: 0.17 },
  'pistacho':         { sat: 0.12, mono: 0.52, poli: 0.31 },
  'nueces':           { sat: 0.09, mono: 0.14, poli: 0.72 },
  'nuez':             { sat: 0.09, mono: 0.14, poli: 0.72 },
  'chia':             { sat: 0.11, mono: 0.07, poli: 0.78 },
  'linaza':           { sat: 0.09, mono: 0.18, poli: 0.69 },
  'ajonjoli':         { sat: 0.14, mono: 0.39, poli: 0.44 },
  'girasol':          { sat: 0.10, mono: 0.20, poli: 0.66 },
  'chocolate':        { sat: 0.60, mono: 0.33, poli: 0.03 },
  'galleta':          { sat: 0.45, mono: 0.35, poli: 0.15 },
  'torta':            { sat: 0.45, mono: 0.35, poli: 0.15 },
  'pastel':           { sat: 0.45, mono: 0.35, poli: 0.15 },
  'postre':           { sat: 0.45, mono: 0.35, poli: 0.15 },
  'helado':           { sat: 0.62, mono: 0.28, poli: 0.04 },
  'buñuelo':          { sat: 0.40, mono: 0.35, poli: 0.20 },
  'empanada':         { sat: 0.30, mono: 0.42, poli: 0.24 },
  'frito':            { sat: 0.22, mono: 0.45, poli: 0.30 },
  'papa a la francesa': { sat: 0.20, mono: 0.45, poli: 0.30 },
  'papas fritas':     { sat: 0.20, mono: 0.45, poli: 0.30 },
  'arepa':            { sat: 0.25, mono: 0.30, poli: 0.35 },
  'pan':              { sat: 0.22, mono: 0.28, poli: 0.40 },
  'arroz':            { sat: 0.25, mono: 0.30, poli: 0.38 },
  'pasta':            { sat: 0.20, mono: 0.15, poli: 0.45 },
  'avena':            { sat: 0.18, mono: 0.33, poli: 0.38 },
  'lenteja':          { sat: 0.15, mono: 0.10, poli: 0.50 },
  'frijol':           { sat: 0.14, mono: 0.09, poli: 0.52 },
  'garbanzo':         { sat: 0.11, mono: 0.24, poli: 0.45 },
  'soya':             { sat: 0.14, mono: 0.22, poli: 0.57 },
  'tofu':             { sat: 0.14, mono: 0.22, poli: 0.57 },
};
// Reparto por defecto: dieta mixta occidental (no se marca como conocido).
const NP_LIPIDOS_DEFAULT = { sat: 0.35, mono: 0.40, poli: 0.22 };

function npLipidoKey(nombre) {
  const n = normalizeName(nombre || '');
  if (!n) return null;
  // Las claves más largas primero: "aceite de oliva" debe ganarle a "aceite".
  const keys = Object.keys(NP_LIPIDOS).sort((a, b) => b.length - a.length);
  for (const k of keys) if (n.includes(k)) return k;
  return null;
}

// Reparte la grasa TOTAL de un item en saturada / mono / poli.
function npLipidosItem(it) {
  const grasa = Number(it.g) || 0;
  if (grasa <= 0) return { sat: 0, mono: 0, poli: 0, conocido: true };
  // Si algún día el registro trae el desglose real, manda ese.
  if (it.sat != null || it.mono != null || it.poli != null) {
    return {
      sat: Number(it.sat) > 0 ? Number(it.sat) : 0,
      mono: Number(it.mono) > 0 ? Number(it.mono) : 0,
      poli: Number(it.poli) > 0 ? Number(it.poli) : 0,
      conocido: true,
    };
  }
  const key = npLipidoKey(it.name);
  const perfil = key ? NP_LIPIDOS[key] : NP_LIPIDOS_DEFAULT;
  return {
    sat: grasa * perfil.sat,
    mono: grasa * perfil.mono,
    poli: grasa * perfil.poli,
    conocido: !!key,
  };
}

const npR1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const npR0 = (n) => Math.round(Number(n) || 0);

// =====================================================
// ENRIQUECIMIENTO DEL ANÁLISIS
// =====================================================
// Se engancha sobre analizarNutricionSemana() de app.js: la aritmética base
// (días, kcal, macros, metas) no se toca — se le AGREGAN las dimensiones que
// faltaban. Como el enganche es global, la IA de "Oportunidades" recibe
// también estos campos sin cambiar nada más.
const _npAnalizarBase = analizarNutricionSemana;

window.analizarNutricionSemana = function (d, semanaISO, cliente, pesoKg) {
  const a = _npAnalizarBase(d, semanaISO, cliente, pesoKg);
  try { return npEnriquecer(a, d, semanaISO, cliente); } catch (e) { return a; }
};

function npEnriquecer(a, d, semanaISO, cliente) {
  const fechas = nutFechasSemana(semanaISO);
  const detalle = d.historyDetail || {};

  // ── Perfil de grasas y azúcar añadida, por alimento y por día ──
  const porAlimento = new Map();       // clave normalizada → acumulado
  const porDia = {};                   // fecha → {sat,mono,poli,azucar}
  const literal = [];                  // lo que el cliente escribió, tal cual
  const recetas = new Map();           // recetas del recetario que registró
  let itemsConocidos = 0, itemsTotal = 0;

  for (const fecha of fechas) {
    const entradas = Array.isArray(detalle[fecha]) ? detalle[fecha] : [];
    const acc = { sat: 0, mono: 0, poli: 0, azucar: 0, grasa: 0 };
    for (const e of entradas) {
      // Historial literal: el texto EXACTO que escribió (o dictó) el cliente.
      // Es la materia prima de todo lo demás y la que deja ver el hábito real
      // ("otra vez arroz con huevo a las 11pm") que ningún promedio muestra.
      const raw = String(e.rawInput || '').trim();
      literal.push({
        fecha,
        meal: String(e.meal || 'comida').toLowerCase(),
        time: e.time || '',
        texto: raw,
        items: (e.items || []).map(i => String(i.name || '')).filter(Boolean),
        kcal: npR0(e.kcal), p: npR1(e.p), c: npR1(e.c), g: npR1(e.g),
        // El Recetario marca sus registros con "receta: <nombre>"
        receta: /^receta\s*:/i.test(raw) ? raw.replace(/^receta\s*:\s*/i, '').trim() : null,
      });
      if (/^receta\s*:/i.test(raw)) {
        const nom = raw.replace(/^receta\s*:\s*/i, '').trim();
        const k = normalizeName(nom);
        const r = recetas.get(k) || { nombre: nom, veces: 0, kcal: 0, dias: new Set() };
        r.veces++; r.kcal += Number(e.kcal) || 0; r.dias.add(fecha);
        recetas.set(k, r);
      }

      for (const it of (e.items || [])) {
        const nombre = String(it.name || '').trim();
        if (!nombre) continue;
        itemsTotal++;
        const lip = npLipidosItem(it);
        if (lip.conocido) itemsConocidos++;
        const mic = nutMicrosItem(it);
        acc.sat += lip.sat; acc.mono += lip.mono; acc.poli += lip.poli;
        acc.azucar += mic.sugar; acc.grasa += Number(it.g) || 0;

        const key = normalizeName(nombre);
        const f = porAlimento.get(key) || { sat: 0, mono: 0, poli: 0, azucar: 0, conocido: false };
        f.sat += lip.sat; f.mono += lip.mono; f.poli += lip.poli;
        f.azucar += mic.sugar;
        f.conocido = f.conocido || lip.conocido;
        porAlimento.set(key, f);
      }
    }
    porDia[fecha] = {
      sat: npR1(acc.sat), mono: npR1(acc.mono), poli: npR1(acc.poli),
      azucar: npR1(acc.azucar), grasa: npR1(acc.grasa),
    };
  }

  // ── Se cuelga el perfil de grasas de cada alimento del análisis base ──
  for (const f of a.alimentos) {
    const extra = porAlimento.get(normalizeName(f.nombre)) || { sat: 0, mono: 0, poli: 0, azucar: 0, conocido: false };
    f.sat = npR1(extra.sat);
    f.mono = npR1(extra.mono);
    f.poli = npR1(extra.poli);
    f.perfil_conocido = extra.conocido;
    // El azúcar añadida ya venía del análisis base (f.azucar); se conserva.

    // ── EFICIENCIA NUTRICIONAL ──
    // Cuánto nutriente útil trae cada 100 kcal de ESE alimento, menos lo que
    // trae de lastre. No es un juicio moral sobre la comida: es cuánto rinde
    // cada caloría para el objetivo (saciedad + masa magra).
    //   + proteína (g/100 kcal) × 10   ← lo que más pesa en déficit
    //   + fibra    (g/100 kcal) × 8    ← saciedad y salud metabólica
    //   − azúcar añadida (g/100 kcal) × 6
    //   − grasa saturada (g/100 kcal) × 3
    const por100 = f.kcal > 0 ? 100 / f.kcal : 0;
    const pPor100 = npR1(f.p * por100);
    const fibPor100 = npR1(f.fibra * por100);
    const azPor100 = npR1(f.azucar * por100);
    const satPor100 = npR1(f.sat * por100);
    f.p_por_100kcal = pPor100;
    f.fibra_por_100kcal = fibPor100;
    f.azucar_por_100kcal = azPor100;
    f.sat_por_100kcal = satPor100;
    f.eficiencia = Math.round(pPor100 * 10 + fibPor100 * 8 - azPor100 * 6 - satPor100 * 3);
  }

  // "Significativos": lo mismo que ya usa el análisis base para no llenar los
  // tops con una pizca de sal — un alimento tiene que pesar en la semana.
  const signif = a.alimentos.filter(f => f.kcal >= 150);
  const top = (arr, key, min = 0) => arr.filter(f => (f[key] || 0) > min)
    .slice().sort((x, y) => (y[key] || 0) - (x[key] || 0)).slice(0, 8);

  a.rankings = {
    mas_caloricos: top(a.alimentos, 'kcal'),
    // "Más calórico por vez": no el que más sumó en la semana, sino el que
    // más pega en UNA sentada. Es el que hay que porcionar, no eliminar.
    mas_densos: a.alimentos.filter(f => f.kcal >= 100)
      .slice().sort((x, y) => (y.kcal_por_vez || 0) - (x.kcal_por_vez || 0)).slice(0, 8),
    mas_grasas: top(a.alimentos, 'g', 0.5),
    mas_saturadas: top(a.alimentos, 'sat', 0.3),
    mas_monoinsaturadas: top(a.alimentos, 'mono', 0.3),
    mas_poliinsaturadas: top(a.alimentos, 'poli', 0.3),
    mas_azucar_anadida: top(a.alimentos, 'azucar', 0.5),
    mas_eficientes: signif.slice().sort((x, y) => y.eficiencia - x.eficiencia).slice(0, 8),
    menos_eficientes: signif.slice().sort((x, y) => x.eficiencia - y.eficiencia).slice(0, 8),
    mas_proteina: top(a.alimentos, 'p', 1),
    mas_fibra: top(a.alimentos, 'fibra', 0.5),
  };

  // ── Totales y promedios de grasas y azúcar de la semana ──
  const conDetalle = a.dias.filter(x => x.comidas > 0);
  const nDet = conDetalle.length;
  const sumDia = (k) => conDetalle.reduce((s, x) => s + (porDia[x.fecha]?.[k] || 0), 0);
  a.grasas_perfil = {
    base_dias: nDet,
    // Confianza: qué parte de los alimentos tenía un perfil lipídico conocido.
    // Por debajo de ~60% el desglose es orientativo y así se rotula en pantalla.
    confianza_pct: itemsTotal ? Math.round((itemsConocidos / itemsTotal) * 100) : null,
    sat_dia: nDet ? npR1(sumDia('sat') / nDet) : null,
    mono_dia: nDet ? npR1(sumDia('mono') / nDet) : null,
    poli_dia: nDet ? npR1(sumDia('poli') / nDet) : null,
    azucar_dia: nDet ? npR1(sumDia('azucar') / nDet) : null,
    grasa_dia_detalle: nDet ? npR1(sumDia('grasa') / nDet) : null,
    // % de las kcal del día que vienen de grasa saturada. Referencia OMS/AHA:
    // por debajo del 10% (AHA baja a 6% en riesgo cardiovascular).
    sat_pct_kcal: (nDet && a.promedio.kcal) ? npR1(((sumDia('sat') / nDet) * 9 / a.promedio.kcal) * 100) : null,
    // % de las kcal del día que vienen de azúcar AÑADIDA. Referencia OMS: <10%,
    // ideal <5%.
    azucar_pct_kcal: (nDet && a.promedio.kcal) ? npR1(((sumDia('azucar') / nDet) * 4 / a.promedio.kcal) * 100) : null,
  };
  a.por_dia_grasas = porDia;

  // ── Historial literal de la semana ──
  a.literal = literal.sort((x, y) => (y.fecha + (y.time || '')).localeCompare(x.fecha + (x.time || '')));
  a.recetas_usadas = [...recetas.values()]
    .map(r => ({ nombre: r.nombre, veces: r.veces, kcal: npR0(r.kcal), dias: r.dias.size }))
    .sort((x, y) => y.veces - x.veces);

  // ── Su despensa: lo que el cliente guardó en su app ──
  const favs = Array.isArray(d.favorites) ? d.favorites : [];
  a.despensa = {
    ingredientes: (Array.isArray(d.favoriteIngredients) ? d.favoriteIngredients : []).slice(),
    comidas_favoritas: favs.filter(f => f && f.type !== 'day')
      .map(f => ({ nombre: f.name || '(sin nombre)', kcal: npR0(f.kcal), p: npR1(f.p), c: npR1(f.c), g: npR1(f.g), meal: f.meal || null, items: (f.items || []).map(i => i.name).filter(Boolean) })),
    menus_creados: favs.filter(f => f && f.type === 'day')
      .map(f => ({ nombre: f.name || '(sin nombre)', kcal: npR0(f.kcal), p: npR1(f.p), c: npR1(f.c), g: npR1(f.g), comidas: Array.isArray(f.days) ? f.days.length : 0, detalle: Array.isArray(f.days) ? f.days : [] })),
    // Menús armados en el Recetario. Solo aparecen si la app del cliente ya
    // los sincroniza (mealtracker: data.recetario_menus).
    menus_recetario: Array.isArray(d.recetario_menus) ? d.recetario_menus.map(m => ({
      nombre: m.nombre || 'Menú', creado: m.creado || null,
      comidas: Array.isArray(m.comidas) ? m.comidas.length : 0,
    })) : null,
  };

  // ── La semana anterior, para leer la actual contra algo ──
  const semPrev = fmt.semanaPrev(semanaISO);
  a.comparativa = { semana_anterior: semPrev, resumen_anterior: npResumenLigero(d, semPrev) };

  return a;
}

// Resumen compacto de una semana cualquiera desde el blob ya fusionado.
// Usa exactamente las mismas reglas que el análisis completo (día registrado,
// meta vigente ese día): por eso "semana a semana" y "resumen" nunca se
// contradicen.
function npResumenLigero(d, semanaISO) {
  const fechas = nutFechasSemana(semanaISO);
  const history = d.history || {};
  const detalle = d.historyDetail || {};
  const dias = [];
  for (const fecha of fechas) {
    const tot = history[fecha];
    const det = Array.isArray(detalle[fecha]) ? detalle[fecha] : [];
    if (!diaRegistradoMT(tot, det)) continue;
    dias.push({
      fecha,
      kcal: npR0(tot?.kcal), p: npR0(tot?.p), c: npR0(tot?.c), g: npR0(tot?.g),
      agua: npR0(tot?.water),
      meta: goalsMTEnFecha(d, fecha),
    });
  }
  const meta = goalsMTEnFecha(d, semanaISOToRange(semanaISO)[1]);
  if (!dias.length) return { semana: semanaISO, dias: 0, meta, kcal: null, p: null, c: null, g: null, balance: null };
  const prom = (k) => npR0(dias.reduce((s, x) => s + (x[k] || 0), 0) / dias.length);
  return {
    semana: semanaISO,
    dias: dias.length,
    meta,
    kcal: prom('kcal'), p: prom('p'), c: prom('c'), g: prom('g'),
    agua: prom('agua') || null,
    // Balance = suma de (kcal del día − meta de ESE día). Es el número que de
    // verdad manda en un déficit o un superávit: la semana, no el día.
    balance: dias.every(x => x.meta.kcal) ? npR0(dias.reduce((s, x) => s + (x.kcal - x.meta.kcal), 0)) : null,
    detalle_dias: dias,
  };
}

// =====================================================
// PIEZAS VISUALES COMPARTIDAS
// =====================================================
function npColorPct(p) {
  if (p == null) return 'text-slate-400';
  if (p >= 90 && p <= 110) return 'text-emerald-600';
  if (p >= 80 && p <= 120) return 'text-amber-600';
  return 'text-red-500';
}
function npFondoPct(p) {
  if (p == null) return '#e2e8f0';
  if (p >= 90 && p <= 110) return '#10b981';
  if (p >= 80 && p <= 120) return '#f59e0b';
  if (p > 120) return '#ef4444';
  return '#3b82f6';
}

function npKpi(label, valor, sub, color = 'text-slate-900') {
  return `<div class="bg-white rounded-xl border border-slate-200 p-3">
    <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">${label}</div>
    <div class="text-xl font-bold ${color} mt-0.5">${valor}</div>
    ${sub ? `<div class="text-[11px] text-slate-500 mt-0.5">${sub}</div>` : ''}
  </div>`;
}

// Barra "valor vs meta" con el porcentaje.
function npBarraMeta(label, valor, meta, unidad = '', color = '#0f172a') {
  const pct = (meta && valor != null) ? Math.round((valor / meta) * 100) : null;
  const ancho = pct == null ? 0 : Math.min(140, pct);
  return `<div class="mb-2">
    <div class="flex items-baseline justify-between text-xs mb-1">
      <span class="font-semibold" style="color:${color}">${label}</span>
      <span class="text-slate-500">${valor == null ? '—' : valor.toLocaleString('es-CO')}${unidad}${meta ? ` <span class="text-slate-300">/</span> ${meta.toLocaleString('es-CO')}${unidad}` : ''}${pct != null ? ` · <strong class="${npColorPct(pct)}">${pct}%</strong>` : ''}</span>
    </div>
    <div class="h-2 bg-slate-100 rounded-full overflow-hidden relative">
      <div class="h-full rounded-full" style="width:${Math.min(100, ancho / 1.4)}%;background:${npFondoPct(pct)}"></div>
      <div class="absolute top-0 bottom-0" style="left:71.4%;width:1px;background:#94a3b8"></div>
    </div>
  </div>`;
}

// =====================================================
// PESTAÑA · CALENDARIO
// =====================================================
// El mes completo de un vistazo, cada día contra LA META QUE REGÍA ESE DÍA.
// Es la vista que reemplaza al "Calendario" del dashboard del Mealtracker, y
// da el mismo número porque usa la misma regla de día registrado.
function npMesDe(semanaISO) {
  const [ini] = semanaISOToRange(semanaISO);
  return ini.slice(0, 7);
}
function npMesShift(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
window.npMesNav = (delta) => {
  _np.mesAncla = npMesShift(_np.mesAncla || npMesDe(_nut.semana), delta);
  rerenderView();
};

function npVistaCalendario(a, d) {
  const ym = _np.mesAncla || npMesDe(_nut.semana);
  const [y, m] = ym.split('-').map(Number);
  const primero = new Date(y, m - 1, 1);
  const diasMes = new Date(y, m, 0).getDate();
  const offset = (primero.getDay() + 6) % 7;          // lunes = 0
  const history = d.history || {};
  const detalle = d.historyDetail || {};
  const hoy = fmt.hoy();

  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push('<div></div>');

  let regs = 0, sumKcal = 0, sumP = 0, enRango = 0, conMeta = 0;
  for (let dia = 1; dia <= diasMes; dia++) {
    const fecha = `${ym}-${String(dia).padStart(2, '0')}`;
    const tot = history[fecha];
    const det = Array.isArray(detalle[fecha]) ? detalle[fecha] : [];
    const registrado = diaRegistradoMT(tot, det);
    const meta = goalsMTEnFecha(d, fecha);
    const kcal = npR0(tot?.kcal);
    const pct = (registrado && meta.kcal) ? Math.round((kcal / meta.kcal) * 100) : null;
    if (registrado) {
      regs++; sumKcal += kcal; sumP += npR0(tot?.p);
      if (meta.kcal) { conMeta++; if (Math.abs(kcal - meta.kcal) <= meta.kcal * 0.1) enRango++; }
    }
    const futuro = fecha > hoy;
    const bg = !registrado ? (futuro ? '#f8fafc' : '#f1f5f9') : npFondoPct(pct);
    const fg = registrado ? '#ffffff' : '#94a3b8';
    celdas.push(`
      <button type="button"
        class="rounded-xl p-1.5 text-left transition ${registrado ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}"
        style="background:${bg};color:${fg};min-height:62px;${!registrado ? 'border:1px dashed #e2e8f0' : ''}"
        ${registrado ? `onclick="npAbrirDia('${fecha}')"` : ''}
        title="${fmt.fechaCorta(fecha)}${registrado ? ` · ${kcal} kcal${meta.kcal ? ` de ${meta.kcal} (${pct}%)` : ''}` : ' · sin registro'}">
        <div class="text-[10px] font-bold ${registrado ? 'opacity-80' : ''}">${dia}</div>
        ${registrado
          ? `<div class="text-[11px] font-bold leading-tight mt-0.5">${kcal.toLocaleString('es-CO')}</div>
             <div class="text-[9px] opacity-85">${pct != null ? `${pct}%` : 'sin meta'}</div>
             ${det.length ? `<div class="text-[9px] opacity-70">${det.length} comida(s)</div>` : '<div class="text-[9px] opacity-70">solo totales</div>'}`
          : `<div class="text-[9px] mt-1">${futuro ? '' : 'sin registro'}</div>`}
      </button>`);
  }

  const nombreMes = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const promKcal = regs ? npR0(sumKcal / regs) : null;
  const promP = regs ? npR0(sumP / regs) : null;

  return `
    <div class="card mb-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div class="sec-title !mb-0">📆 Calendario de registro</div>
          <div class="text-[11px] text-slate-400">Cada día contra la meta que regía ESE día. Toca un día para ver lo que comió.</div>
        </div>
        <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button class="btn btn-secondary btn-sm !py-1" onclick="npMesNav(-1)">←</button>
          <span class="text-sm font-bold text-slate-700 px-2 whitespace-nowrap capitalize">${nombreMes}</span>
          <button class="btn btn-secondary btn-sm !py-1" onclick="npMesNav(1)">→</button>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-2 mb-3">
        ${npKpi('Días registrados', `${regs}/${diasMes}`, `${Math.round((regs / diasMes) * 100)}% del mes`)}
        ${npKpi('kcal promedio', promKcal != null ? promKcal.toLocaleString('es-CO') : '—', 'de los días registrados')}
        ${npKpi('Proteína promedio', promP != null ? `${promP} g` : '—', 'de los días registrados')}
        ${npKpi('Días en rango', conMeta ? `${enRango}/${conMeta}` : '—', 'dentro de ±10% de su meta', enRango && conMeta && enRango / conMeta >= 0.6 ? 'text-emerald-600' : 'text-slate-900')}
      </div>

      <div class="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
        ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<div>${x}</div>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1.5">${celdas.join('')}</div>

      <div class="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        ${[['#10b981', 'En su meta (±10%)'], ['#f59e0b', 'Desviado (±20%)'], ['#ef4444', 'Muy por encima'], ['#3b82f6', 'Muy por debajo'], ['#f1f5f9', 'Sin registro']]
          .map(([c, l]) => `<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm" style="background:${c}"></span>${l}</span>`).join('')}
      </div>
    </div>`;
}

// Detalle de UN día en modal (desde el calendario o desde semana a semana).
window.npAbrirDia = (fecha) => {
  const d = _nut.data;
  if (!d) return;
  const tot = (d.history || {})[fecha];
  const entradas = Array.isArray((d.historyDetail || {})[fecha]) ? d.historyDetail[fecha] : [];
  const meta = goalsMTEnFecha(d, fecha);
  const wb = (d.wellbeing || {})[fecha] || null;
  const pct = meta.kcal ? Math.round(npR0(tot?.kcal) / meta.kcal * 100) : null;

  const cuerpo = `
    <div class="grid grid-cols-4 gap-2 mb-3">
      ${npKpi('Calorías', npR0(tot?.kcal).toLocaleString('es-CO'), meta.kcal ? `meta ${meta.kcal} · ${pct}%` : 'sin meta ese día', npColorPct(pct))}
      ${npKpi('Proteína', `${npR0(tot?.p)} g`, meta.p ? `meta ${meta.p} g` : '')}
      ${npKpi('Carbos', `${npR0(tot?.c)} g`, meta.c ? `meta ${meta.c} g` : '')}
      ${npKpi('Grasas', `${npR0(tot?.g)} g`, meta.g ? `meta ${meta.g} g` : '')}
    </div>
    ${tot?.water ? `<div class="text-xs text-slate-500 mb-2">💧 Agua registrada: <strong>${npR0(tot.water)} ml</strong></div>` : ''}
    ${wb ? `<div class="text-xs text-slate-500 mb-2">Ese día reportó: ${[wb.energy != null ? `energía ${wb.energy}/5` : '', wb.hunger != null ? `hambre ${wb.hunger}/5` : '', wb.mood != null ? `ánimo ${wb.mood}/5` : ''].filter(Boolean).join(' · ') || '—'}</div>` : ''}
    ${entradas.length ? `<div class="space-y-2">${entradas.map(e => `
      <div class="bg-slate-50 rounded-xl p-3">
        <div class="flex items-center justify-between text-xs mb-1.5">
          <span class="font-bold text-slate-700 uppercase tracking-wide">${escapeHtml(String(e.meal || 'comida'))}${e.time ? ` · ${escapeHtml(e.time)}` : ''}</span>
          <span class="text-slate-500 font-semibold">${npR0(e.kcal)} kcal · P ${npR1(e.p)} · C ${npR1(e.c)} · G ${npR1(e.g)}</span>
        </div>
        ${(e.items || []).length ? `<div class="space-y-0.5">${e.items.map(it => `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-700">${escapeHtml(String(it.name || ''))}${it.amount ? ` <span class="text-slate-400">(${escapeHtml(String(it.amount))})</span>` : ''}</span>
            <span class="text-slate-500 whitespace-nowrap pl-2">${npR0(it.kcal)} kcal${it.p ? ` · ${npR1(it.p)} g P` : ''}</span>
          </div>`).join('')}</div>` : ''}
        ${e.rawInput ? `<div class="text-[11px] text-slate-400 mt-1.5 italic">“${escapeHtml(String(e.rawInput))}”</div>` : ''}
      </div>`).join('')}</div>`
      : '<div class="text-xs text-slate-400">Ese día registró totales pero sin el desglose de alimentos.</div>'}`;

  openModal(modalShell(`${escapeHtml(_nut.cliente?.nombre || '')} · ${fmt.fecha(fecha)}`, cuerpo,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`));
};

// =====================================================
// PESTAÑA · SEMANA A SEMANA
// =====================================================
// La semana actual y la anterior lado a lado contra sus metas, más la
// tendencia de las últimas 6 semanas. Es la lectura que de verdad usas para
// el seguimiento: una semana sola no dice nada, dos ya cuentan una historia.
function npTarjetaSemana(r, titulo, destacada) {
  const meta = r.meta || {};
  const pct = (v, m) => (m && v != null) ? Math.round((v / m) * 100) : null;
  const pk = pct(r.kcal, meta.kcal);
  return `
    <div class="card ${destacada ? 'ring-2 ring-emerald-200' : ''}">
      <div class="flex items-baseline justify-between mb-2">
        <div>
          <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">${titulo}</div>
          <div class="font-bold text-slate-800">${fmt.labelSemana(r.semana)} <span class="text-xs font-normal text-slate-400">${fmt.rangoSemana(r.semana)}</span></div>
        </div>
        <div class="text-right">
          <div class="text-lg font-bold ${npColorPct(pk)}">${r.dias}/7</div>
          <div class="text-[10px] text-slate-400">días registrados</div>
        </div>
      </div>
      ${r.dias === 0
        ? '<div class="text-xs text-slate-400 py-4 text-center">Sin registros esa semana.</div>'
        : `
        ${npBarraMeta('Calorías', r.kcal, meta.kcal, '', '#059669')}
        ${npBarraMeta('Proteína', r.p, meta.p, ' g', '#2563eb')}
        ${npBarraMeta('Carbos', r.c, meta.c, ' g', '#d97706')}
        ${npBarraMeta('Grasas', r.g, meta.g, ' g', '#dc2626')}
        <div class="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
          ${r.balance != null
            ? `Balance de la semana: <strong style="color:${r.balance > 0 ? '#d97706' : '#2563eb'}">${r.balance > 0 ? '+' : ''}${r.balance.toLocaleString('es-CO')} kcal</strong> sobre la suma de sus metas${r.dias < 7 ? ` <span class="text-slate-400">(solo los ${r.dias} días que registró)</span>` : ''}`
            : 'Sin meta configurada esa semana: no se puede calcular el balance.'}
          ${r.agua ? `<br>💧 Agua: ${r.agua} ml/día en los días que la registró` : ''}
        </div>
        <div class="grid grid-cols-7 gap-1 mt-2">
          ${nutFechasSemana(r.semana).map((f, i) => {
            const dd = (r.detalle_dias || []).find(x => x.fecha === f);
            const p = dd && dd.meta.kcal ? Math.round(dd.kcal / dd.meta.kcal * 100) : null;
            return `<button type="button" class="rounded-lg py-1 text-center ${dd ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}"
              style="background:${dd ? npFondoPct(p) : '#f1f5f9'};color:${dd ? '#fff' : '#94a3b8'}"
              ${dd ? `onclick="npAbrirDia('${f}')"` : ''} title="${fmt.fechaCorta(f)}${dd ? ` · ${dd.kcal} kcal` : ' · sin registro'}">
              <div class="text-[9px] font-bold opacity-80">${['L', 'M', 'X', 'J', 'V', 'S', 'D'][i]}</div>
              <div class="text-[10px] font-bold">${dd ? npR0(dd.kcal / 100) / 10 + 'k' : '—'}</div>
            </button>`;
          }).join('')}
        </div>`}
    </div>`;
}

function npVistaSemanas(a, d) {
  const actual = npResumenLigero(d, _nut.semana);
  const previa = npResumenLigero(d, fmt.semanaPrev(_nut.semana));

  // Tendencia: 6 semanas hacia atrás desde la activa.
  const semanas = [];
  let s = _nut.semana;
  for (let i = 0; i < 6; i++) { semanas.unshift(s); s = fmt.semanaPrev(s); }
  const serie = semanas.map(x => npResumenLigero(d, x));
  const labels = semanas.map(x => fmt.labelSemana(x));

  const delta = (aVal, bVal, unidad = '') => {
    if (aVal == null || bVal == null) return '<span class="text-slate-300">—</span>';
    const x = aVal - bVal;
    if (!x) return '<span class="text-slate-400">igual</span>';
    return `<strong style="color:${x > 0 ? '#2563eb' : '#d97706'}">${x > 0 ? '+' : ''}${x}${unidad}</strong>`;
  };

  const kcalPts = serie.map(r => r.kcal);
  const metaPts = serie.map(r => r.meta?.kcal ?? null);
  const diasPts = serie.map(r => r.dias);
  const todos = [...kcalPts, ...metaPts].filter(v => v != null);

  return `
    <div class="grid md:grid-cols-2 gap-4 mb-4">
      ${npTarjetaSemana(actual, 'Semana activa', true)}
      ${npTarjetaSemana(previa, 'Semana anterior', false)}
    </div>

    <div class="card mb-4">
      <div class="sec-title">Actual vs. anterior</div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
            <th class="text-left pb-2">Indicador</th>
            <th class="text-right pb-2">${fmt.labelSemana(previa.semana)}</th>
            <th class="text-right pb-2">${fmt.labelSemana(actual.semana)}</th>
            <th class="text-right pb-2">Cambio</th>
          </tr></thead>
          <tbody>
            ${[
              ['Días registrados', previa.dias, actual.dias, ''],
              ['Calorías / día', previa.kcal, actual.kcal, ''],
              ['Proteína / día', previa.p, actual.p, ' g'],
              ['Carbos / día', previa.c, actual.c, ' g'],
              ['Grasas / día', previa.g, actual.g, ' g'],
            ].map(([l, prev, act, u]) => `
              <tr class="border-b border-slate-50">
                <td class="py-2 font-semibold text-slate-700">${l}</td>
                <td class="text-right text-slate-500">${prev == null ? '—' : prev.toLocaleString('es-CO') + u}</td>
                <td class="text-right font-bold text-slate-800">${act == null ? '—' : act.toLocaleString('es-CO') + u}</td>
                <td class="text-right">${delta(act, prev, u)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="text-[11px] text-slate-400 mt-2">Los promedios se calculan solo sobre los días registrados de cada semana — no sobre 7 — para que menos registro no se lea como "comió menos".</div>
    </div>

    <div class="card">
      <div class="sec-title">Últimas 6 semanas</div>
      ${todos.length >= 2 ? `
        ${lineChart([
          { label: 'kcal/día', color: '#059669', points: kcalPts },
          { label: 'meta', color: '#94a3b8', points: metaPts },
        ], labels, { height: 240, unidad: 'kcal', spanMin: 400, area: false })}
        <div class="mt-1">${legendDot('#059669', 'kcal registradas/día')}${legendDot('#94a3b8', 'meta vigente')}</div>
      ` : '<div class="text-xs text-slate-400">Aún no hay suficientes semanas con registro para dibujar la tendencia.</div>'}
      <div class="grid grid-cols-6 gap-1.5 mt-3">
        ${serie.map((r, i) => `
          <div class="text-center rounded-lg py-1.5" style="background:${r.dias >= 5 ? '#ecfdf5' : r.dias >= 3 ? '#fffbeb' : '#f8fafc'}">
            <div class="text-[9px] uppercase tracking-wide text-slate-400 font-bold">${labels[i]}</div>
            <div class="text-sm font-bold ${r.dias >= 5 ? 'text-emerald-700' : r.dias >= 3 ? 'text-amber-700' : 'text-slate-400'}">${r.dias}/7</div>
            <div class="text-[9px] text-slate-400">${r.kcal != null ? r.kcal.toLocaleString('es-CO') + ' kcal' : '—'}</div>
          </div>`).join('')}
      </div>
      <div class="text-[11px] text-slate-400 mt-2">Adherencia al registro por semana. Sin registro no hay nada que ajustar: es el primer indicador que se mira, antes que las calorías.</div>
    </div>`;
}

// =====================================================
// PESTAÑA · HISTORIAL LITERAL
// =====================================================
// Lo que el cliente ESCRIBIÓ, tal cual, sin procesar. El promedio dice "2.100
// kcal"; esta pestaña dice "arroz con huevo frito a las 11:40 pm, otra vez".
// Los dos hacen falta, pero el hábito solo se ve acá.
//
// Se lee de historyDetail[fecha][].rawInput — el texto original del chat del
// Mealtracker. Cuando una comida entró por el Recetario, el rawInput viene
// como "receta: <nombre>" y se marca con su etiqueta.
window.npLiteralQ = (v) => { _np.literalQ = v; npRepintarLiteral(); };
window.npLiteralMeal = (v) => { _np.literalMeal = v; npRepintarLiteral(); };
window.npLiteralRango = (v) => { _np.literalRango = v; rerenderView(); };

function npLiteralLista(d, rango) {
  const detalle = d.historyDetail || {};
  let fechas;
  if (rango === 'semana') fechas = nutFechasSemana(_nut.semana);
  else {
    fechas = Object.keys(detalle).sort().reverse();
    if (rango === '30d') {
      const corte = new Date(); corte.setDate(corte.getDate() - 30);
      const cs = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, '0')}-${String(corte.getDate()).padStart(2, '0')}`;
      fechas = fechas.filter(f => f >= cs);
    }
  }
  const out = [];
  for (const fecha of fechas) {
    for (const e of (Array.isArray(detalle[fecha]) ? detalle[fecha] : [])) {
      const raw = String(e.rawInput || '').trim();
      out.push({
        fecha, meal: String(e.meal || 'comida').toLowerCase(), time: e.time || '',
        texto: raw,
        receta: /^receta\s*:/i.test(raw) ? raw.replace(/^receta\s*:\s*/i, '').trim() : null,
        items: (e.items || []).map(i => ({ name: String(i.name || ''), amount: String(i.amount || '') })).filter(i => i.name),
        kcal: npR0(e.kcal), p: npR1(e.p), c: npR1(e.c), g: npR1(e.g),
      });
    }
  }
  return out.sort((x, y) => (y.fecha + ' ' + (y.time || '')).localeCompare(x.fecha + ' ' + (x.time || '')));
}

function npFilasLiteral(lista) {
  const q = normalizeName(_np.literalQ || '');
  const meal = _np.literalMeal || 'todas';
  const filtrada = lista.filter(e => {
    if (meal !== 'todas' && e.meal !== meal) return false;
    if (!q) return true;
    const heno = normalizeName(`${e.texto} ${e.items.map(i => i.name).join(' ')}`);
    return heno.includes(q);
  });
  if (!filtrada.length) {
    return '<div class="text-center text-xs text-slate-400 py-8">Nada con ese filtro.</div>';
  }
  let ultimaFecha = '';
  return filtrada.map(e => {
    const cabecera = e.fecha !== ultimaFecha
      ? `<div class="sticky top-0 bg-white/95 backdrop-blur-sm py-1.5 mt-2 first:mt-0 z-10">
           <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">${fmt.fecha(e.fecha)}</span>
           <button class="text-[11px] text-emerald-700 font-semibold ml-2 hover:underline" onclick="npAbrirDia('${e.fecha}')">ver el día</button>
         </div>`
      : '';
    ultimaFecha = e.fecha;
    return cabecera + `
      <div class="border-l-2 border-slate-200 pl-3 py-1.5 hover:border-emerald-400 transition">
        <div class="flex flex-wrap items-baseline gap-2 text-[11px]">
          <span class="font-bold uppercase tracking-wide text-slate-600">${escapeHtml(e.meal)}</span>
          ${e.time ? `<span class="text-slate-400">${escapeHtml(e.time)}</span>` : ''}
          ${e.receta ? '<span class="tag tag-violet">📖 del recetario</span>' : ''}
          <span class="text-slate-500 ml-auto">${e.kcal.toLocaleString('es-CO')} kcal · P${e.p} C${e.c} G${e.g}</span>
        </div>
        ${e.texto
          ? `<div class="text-sm text-slate-800 mt-0.5 whitespace-pre-line">“${escapeHtml(e.texto)}”</div>`
          : '<div class="text-xs text-slate-400 mt-0.5 italic">Sin texto original (registro antiguo o entrada del coach)</div>'}
        ${e.items.length ? `<div class="text-[11px] text-slate-500 mt-0.5">→ ${e.items.map(i => escapeHtml(i.name + (i.amount ? ` (${i.amount})` : ''))).join(' · ')}</div>` : ''}
      </div>`;
  }).join('');
}

window.npRepintarLiteral = () => {
  const cont = document.getElementById('np-literal-lista');
  if (!cont || !_nut.data) return;
  cont.innerHTML = npFilasLiteral(npLiteralLista(_nut.data, _np.literalRango || 'semana'));
};

function npVistaLiteral(a, d) {
  const rango = _np.literalRango || 'semana';
  const lista = npLiteralLista(d, rango);
  const conTexto = lista.filter(e => e.texto).length;
  const recetas = lista.filter(e => e.receta).length;
  const meals = ['todas', ...new Set(lista.map(e => e.meal))];

  return `
    <div class="card">
      <div class="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div class="sec-title !mb-0">✍️ Lo que escribió, tal cual</div>
          <div class="text-[11px] text-slate-400">El texto original de cada registro. Acá se ven los hábitos que el promedio esconde.</div>
        </div>
        <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          ${[['semana', 'Esta semana'], ['30d', 'Últimos 30 días'], ['todo', 'Todo']].map(([k, l]) =>
            `<button class="px-2.5 py-1 rounded-lg text-xs font-semibold ${rango === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}" onclick="npLiteralRango('${k}')">${l}</button>`).join('')}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-3">
        ${npKpi('Registros', String(lista.length), rango === 'semana' ? 'en la semana activa' : rango === '30d' ? 'en 30 días' : 'en todo el historial')}
        ${npKpi('Con texto original', String(conTexto), lista.length ? `${Math.round((conTexto / lista.length) * 100)}% — el resto son registros viejos` : '')}
        ${npKpi('Desde el recetario', String(recetas), recetas ? 'usó recetas en vez de improvisar' : 'no ha usado el recetario')}
      </div>

      <div class="flex flex-wrap gap-2 mb-3">
        <input type="text" class="text-sm !w-auto flex-1 min-w-[220px]" placeholder="Buscar en lo que escribió (ej: gaseosa, arroz, empanada…)"
          value="${escapeHtml(_np.literalQ || '')}" oninput="npLiteralQ(this.value)">
        <select class="text-sm !w-auto" onchange="npLiteralMeal(this.value)">
          ${meals.map(m => `<option value="${escapeHtml(m)}" ${(_np.literalMeal || 'todas') === m ? 'selected' : ''}>${m === 'todas' ? 'Todas las comidas' : escapeHtml(m)}</option>`).join('')}
        </select>
      </div>

      <div id="np-literal-lista" class="space-y-0 max-h-[62vh] overflow-y-auto pr-1 scrollbar-thin">
        ${npFilasLiteral(lista)}
      </div>
    </div>`;
}

// =====================================================
// PESTAÑA · SU DESPENSA
// =====================================================
// Lo que el cliente guardó por su cuenta en la app: comidas favoritas, menús
// de día que armó, ingredientes que declaró tener y recetas del recetario que
// registró. Es la lista de materiales con la que hay que trabajar: cualquier
// propuesta que no salga de acá tiene menos probabilidad de que la cumpla.
function npVistaDespensa(a, d) {
  const dp = a.despensa || { ingredientes: [], comidas_favoritas: [], menus_creados: [], menus_recetario: null };
  const recetas = a.recetas_usadas || [];

  const bloque = (titulo, nota, cuerpo, vacio) => `
    <div class="card">
      <div class="sec-title !mb-0">${titulo}</div>
      <div class="text-[11px] text-slate-400 mb-2">${nota}</div>
      ${cuerpo || `<div class="text-xs text-slate-400 py-3">${vacio}</div>`}
    </div>`;

  const macroLinea = (f) => `<span class="text-[11px] text-slate-500">${f.kcal.toLocaleString('es-CO')} kcal · P${f.p} C${f.c} G${f.g}</span>`;

  return `
  <div class="grid md:grid-cols-2 gap-4 mb-4">
    ${bloque('⭐ Comidas favoritas', `Platos que guardó para repetir de un toque. ${dp.comidas_favoritas.length} guardada(s).`,
      dp.comidas_favoritas.length ? `<div class="space-y-1.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">${dp.comidas_favoritas.map(f => `
        <div class="bg-slate-50 rounded-xl px-3 py-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(f.nombre)}</span>
            ${macroLinea(f)}
          </div>
          ${f.items.length ? `<div class="text-[11px] text-slate-500 mt-0.5">${f.items.map(i => escapeHtml(i)).join(' · ')}</div>` : ''}
          ${f.meal ? `<div class="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">${escapeHtml(f.meal)}</div>` : ''}
        </div>`).join('')}</div>` : '',
      'Todavía no ha guardado ninguna comida como favorita. Es la palanca más barata de adherencia: si guarda sus 5 platos habituales, registrar le toma 3 segundos.')}

    ${bloque('🍱 Menús de día que armó', `Días completos que guardó para reusar. ${dp.menus_creados.length} menú(s).`,
      dp.menus_creados.length ? `<div class="space-y-1.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">${dp.menus_creados.map(f => `
        <details class="bg-slate-50 rounded-xl px-3 py-2">
          <summary class="cursor-pointer list-none">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(f.nombre)}</span>
              ${macroLinea(f)}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">${f.comidas} comida(s) · toca para ver el día</div>
          </summary>
          <div class="mt-2 space-y-1">${(f.detalle || []).map(c => `
            <div class="text-[11px] text-slate-600">
              <span class="font-bold uppercase tracking-wide text-slate-500">${escapeHtml(String(c.meal || 'comida'))}</span>
              ${c.time ? `<span class="text-slate-400"> · ${escapeHtml(c.time)}</span>` : ''}
              <span class="text-slate-400"> · ${npR0(c.kcal)} kcal</span>
              <div>${(c.items || []).map(i => escapeHtml(String(i.name || ''))).filter(Boolean).join(' · ')}</div>
            </div>`).join('')}</div>
        </details>`).join('')}</div>` : '',
      'No ha armado menús de día. Cuando uno le funcione, decirle "guarda ese día" convierte un acierto suelto en un patrón repetible.')}
  </div>

  <div class="grid md:grid-cols-2 gap-4">
    ${bloque('🧺 Ingredientes que declaró tener', `Con estos ingredientes el asistente le propone comidas. ${dp.ingredientes.length} declarado(s).`,
      dp.ingredientes.length ? `<div class="flex flex-wrap gap-1.5">${dp.ingredientes.map(i => `<span class="tag-pill">${escapeHtml(i)}</span>`).join('')}</div>` : '',
      'No ha declarado ingredientes. Sin esa lista el asistente de su app no le puede proponer comidas concretas — solo generalidades.')}

    ${bloque('📖 Recetas del recetario que registró', `De la semana activa. ${recetas.length} receta(s) distinta(s).`,
      recetas.length ? `<div class="space-y-1.5">${recetas.map(r => `
        <div class="flex items-baseline justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
          <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(r.nombre)}</span>
          <span class="text-[11px] text-slate-500 whitespace-nowrap"><strong class="text-slate-700">${r.veces}×</strong> · ${r.dias} día(s) · ${r.kcal.toLocaleString('es-CO')} kcal</span>
        </div>`).join('')}</div>` : '',
      'Esta semana no registró ninguna receta del recetario. Si le cuesta improvisar, mandarlo al recetario suele resolver más que darle un consejo.')}
  </div>

  ${dp.menus_recetario === null ? `
    <div class="card mt-4 border-l-4 border-slate-300">
      <div class="text-xs text-slate-600">
        <strong>Menús armados en el Recetario:</strong> todavía no llegan al CRM. Viven solo en el teléfono del cliente
        (<code class="text-[11px] bg-slate-100 px-1 rounded">mt:menus_guardados</code>) y no viajan a la nube.
        Para verlos acá hay que activar su sincronización en la app del Mealtracker — está explicado en
        <code class="text-[11px] bg-slate-100 px-1 rounded">CAMBIOS-NUTRICION.md</code>.
        Los <strong>menús de día</strong> de arriba sí llegan: esos se guardan como favoritos y sí sincronizan.
      </div>
    </div>` : `
    <div class="card mt-4">
      <div class="sec-title">📋 Menús armados en el Recetario (${dp.menus_recetario.length})</div>
      ${dp.menus_recetario.length ? `<div class="space-y-1">${dp.menus_recetario.map(m => `
        <div class="flex items-baseline justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
          <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(m.nombre)}</span>
          <span class="text-[11px] text-slate-500">${m.comidas} comida(s)${m.creado ? ` · ${fmt.fechaCorta(m.creado)}` : ''}</span>
        </div>`).join('')}</div>` : '<div class="text-xs text-slate-400 py-2">No ha guardado menús en el recetario.</div>'}
    </div>`}`;
}

// =====================================================
// PESTAÑA · ALIMENTOS (rankings completos)
// =====================================================
// Los rankings que pediste, todos sobre la MISMA base: las calorías que vienen
// desglosadas en alimentos (registro.kcal_con_detalle). Un día sin desglose no
// hunde los porcentajes de los demás.
const NP_METRICAS = [
  ['kcal',    'Más calóricos',        'kcal',  'Dónde está de verdad la semana. El top 3 suele explicar más que toda la lista.', '#0f172a'],
  ['densos',  'Más calóricos por vez','kcal',  'No el que más sumó, el que más pega en UNA sentada: es el que hay que porcionar.', '#0f172a'],
  ['g',       'Más grasa total',      'g',     'Grasa total del alimento tal como la registró el cliente (dato medido, no estimado).', '#dc2626'],
  ['sat',     'Más grasa saturada',   'g',     'Reparto estimado de la grasa registrada según el perfil típico del alimento.', '#b91c1c'],
  ['mono',    'Más monoinsaturada',   'g',     'La grasa que conviene proteger: oliva, aguacate, frutos secos.', '#059669'],
  ['poli',    'Más poliinsaturada',   'g',     'Incluye los omega-3 y omega-6. También conviene protegerla.', '#0891b2'],
  ['azucar',  'Más azúcar añadida',   'g',     'SOLO azúcar añadida (gaseosa, dulces, salsas). No cuenta la fruta entera ni el lácteo.', '#d97706'],
  ['p',       'Más proteína',         'g',     'De dónde sale su proteína real. Si el top no tiene sus platos habituales, hay un problema estructural.', '#2563eb'],
  ['fibra',   'Más fibra',            'g',     'Saciedad y salud metabólica. Estimada por el modelo al registrar, o por tabla si el registro es viejo.', '#16a34a'],
  ['efi_top', 'Más eficientes',       '',      'Más proteína y fibra por caloría, menos azúcar añadida y saturada. Lo que conviene repetir.', '#059669'],
  ['efi_bot', 'Menos eficientes',     '',      'Muchas calorías con poco nutriente útil. Acá está el margen — porcionar, no prohibir.', '#d97706'],
];

window.npRank = (k) => { _np.rankMetric = k; rerenderView(); };

function npListaRanking(a, metrica) {
  const r = a.rankings || {};
  switch (metrica) {
    case 'densos': return r.mas_densos || [];
    case 'g': return r.mas_grasas || [];
    case 'sat': return r.mas_saturadas || [];
    case 'mono': return r.mas_monoinsaturadas || [];
    case 'poli': return r.mas_poliinsaturadas || [];
    case 'azucar': return r.mas_azucar_anadida || [];
    case 'p': return r.mas_proteina || [];
    case 'fibra': return r.mas_fibra || [];
    case 'efi_top': return r.mas_eficientes || [];
    case 'efi_bot': return r.menos_eficientes || [];
    default: return r.mas_caloricos || [];
  }
}
function npValorRanking(f, metrica) {
  switch (metrica) {
    case 'densos': return f.kcal_por_vez;
    case 'efi_top': case 'efi_bot': return f.eficiencia;
    case 'kcal': return f.kcal;
    default: return f[metrica];
  }
}

function npVistaAlimentosPlus(a) {
  if (!a.alimentos.length) {
    return '<div class="card">Esta semana no hay comidas registradas con detalle de alimentos, así que no hay nada que rankear. Lo primero es que registre.</div>';
  }
  const gp = a.grasas_perfil || {};
  const met = NP_METRICAS.find(m => m[0] === _np.rankMetric) || NP_METRICAS[0];
  const [key, titulo, unidad, nota, color] = met;
  const lista = npListaRanking(a, key);
  const maxV = Math.max(1, ...lista.map(f => Math.abs(npValorRanking(f, key) || 0)));

  // ── Perfil de grasas y azúcar de la semana, con sus referencias ──
  const refSat = gp.sat_pct_kcal;
  const refAz = gp.azucar_pct_kcal;
  const semaforo = (v, bueno, regular) => v == null ? 'text-slate-400' : v <= bueno ? 'text-emerald-600' : v <= regular ? 'text-amber-600' : 'text-red-500';

  const perfil = `
    <div class="card mb-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div class="sec-title !mb-0">🧈 Perfil de grasas y azúcar de la semana</div>
          <div class="text-[11px] text-slate-400">Promedio de los ${gp.base_dias || 0} día(s) con desglose de alimentos.</div>
        </div>
        ${gp.confianza_pct != null ? `<span class="tag ${gp.confianza_pct >= 60 ? 'tag-green' : 'tag-yellow'}">${gp.confianza_pct}% de los alimentos con perfil conocido</span>` : ''}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
        ${npKpi('Grasa total', gp.grasa_dia_detalle != null ? `${gp.grasa_dia_detalle} g` : '—', 'por día')}
        ${npKpi('Saturada', gp.sat_dia != null ? `${gp.sat_dia} g` : '—', refSat != null ? `${refSat}% de las kcal · ref. <10%` : 'por día', semaforo(refSat, 10, 13))}
        ${npKpi('Monoinsaturada', gp.mono_dia != null ? `${gp.mono_dia} g` : '—', 'por día · conviene protegerla', 'text-emerald-600')}
        ${npKpi('Poliinsaturada', gp.poli_dia != null ? `${gp.poli_dia} g` : '—', 'por día · incluye omega-3', 'text-cyan-600')}
        ${npKpi('Azúcar añadida', gp.azucar_dia != null ? `${gp.azucar_dia} g` : '—', refAz != null ? `${refAz}% de las kcal · ref. <10%` : 'por día', semaforo(refAz, 10, 15))}
      </div>
      ${gp.sat_dia != null && (gp.sat_dia + gp.mono_dia + gp.poli_dia) > 0 ? `
        <div class="flex h-2.5 rounded-full overflow-hidden mt-3" title="Reparto de la grasa registrada">
          ${[['sat', '#b91c1c'], ['mono', '#059669'], ['poli', '#0891b2']].map(([k, c]) => {
            const tot = gp.sat_dia + gp.mono_dia + gp.poli_dia;
            return `<div style="width:${(gp[k + '_dia'] / tot) * 100}%;background:${c}" class="h-full"></div>`;
          }).join('')}
        </div>
        <div class="flex gap-3 mt-1 text-[11px] text-slate-500">
          ${legendDot('#b91c1c', 'Saturada')}${legendDot('#059669', 'Mono')}${legendDot('#0891b2', 'Poli')}
        </div>` : ''}
      <div class="text-[11px] text-slate-400 mt-2">
        <strong>Cómo se calcula:</strong> el registro guarda la grasa TOTAL de cada alimento (dato medido) y el azúcar AÑADIDA
        (la estima el modelo al registrar). El desglose saturada / mono / poli reparte esa grasa medida según el perfil lipídico
        típico de cada alimento (tabla USDA). Se estima la proporción, nunca los gramos. Cuando un alimento no se reconoce se usa
        el reparto de una dieta mixta — por eso arriba se muestra el % de confianza.
      </div>
    </div>`;

  const chips = NP_METRICAS.map(([k, l]) =>
    `<button class="chip ${_np.rankMetric === k ? 'active' : ''}" onclick="npRank('${k}')">${l}</button>`).join('');

  const filas = lista.map(f => {
    const v = npValorRanking(f, key) || 0;
    return `
      <div class="py-2 border-b border-slate-50 last:border-0">
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(f.nombre)}${!f.perfil_conocido && ['sat', 'mono', 'poli'].includes(key) ? ' <span class="text-[10px] text-slate-400">(perfil genérico)</span>' : ''}</span>
          <span class="text-sm font-bold whitespace-nowrap" style="color:${color}">${key === 'efi_top' || key === 'efi_bot' ? v : v.toLocaleString('es-CO')}${unidad ? ` ${unidad}` : ''}</span>
        </div>
        <div class="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
          <div class="h-full rounded-full" style="width:${Math.min(100, (Math.abs(v) / maxV) * 100)}%;background:${color}"></div>
        </div>
        <div class="text-[11px] text-slate-400 mt-0.5">
          ${f.veces}× en ${f.dias} día(s) · ${f.kcal.toLocaleString('es-CO')} kcal (${f.pct_kcal_detalle}% del desglose) ·
          P${f.p} C${f.c} G${f.g}${f.azucar > 0.5 ? ` · ${f.azucar} g azúcar añadida` : ''}${f.fibra > 0.5 ? ` · ${f.fibra} g fibra` : ''}
        </div>
      </div>`;
  }).join('');

  const tablaFull = `
    <div class="card">
      <div class="sec-title">Todo lo que comió esta semana (${a.alimentos.length} alimentos)</div>
      <div class="text-[11px] text-slate-400 mb-2 -mt-1">Ordenado por calorías aportadas. Desliza para ver todas las columnas.</div>
      <div class="overflow-x-auto -mx-1">
        <table class="w-full text-sm">
          <thead><tr class="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
            <th class="text-left pb-2">Alimento</th>
            <th class="text-right pb-2">kcal</th>
            <th class="text-right pb-2">P</th><th class="text-right pb-2">C</th><th class="text-right pb-2">G</th>
            <th class="text-right pb-2">Sat</th><th class="text-right pb-2">Mono</th><th class="text-right pb-2">Poli</th>
            <th class="text-right pb-2">Az. añad.</th><th class="text-right pb-2">Fibra</th>
            <th class="text-right pb-2">Eficiencia</th>
          </tr></thead>
          <tbody>
            ${a.alimentos.map(f => `
              <tr class="border-b border-slate-50">
                <td class="py-2 pr-2">
                  <div class="font-semibold text-slate-800 text-sm">${escapeHtml(f.nombre)}</div>
                  <div class="text-[11px] text-slate-400">${f.veces}× · ${f.dias} día(s) · ${f.pct_kcal_detalle}% del desglose</div>
                </td>
                <td class="text-right font-bold whitespace-nowrap">${f.kcal.toLocaleString('es-CO')}</td>
                <td class="text-right text-xs" style="color:#2563eb">${f.p}</td>
                <td class="text-right text-xs" style="color:#d97706">${f.c}</td>
                <td class="text-right text-xs" style="color:#dc2626">${f.g}</td>
                <td class="text-right text-xs" style="color:#b91c1c">${f.sat}</td>
                <td class="text-right text-xs" style="color:#059669">${f.mono}</td>
                <td class="text-right text-xs" style="color:#0891b2">${f.poli}</td>
                <td class="text-right text-xs ${f.azucar > 5 ? 'font-bold text-amber-600' : 'text-slate-500'}">${f.azucar}</td>
                <td class="text-right text-xs text-slate-500">${f.fibra}</td>
                <td class="text-right text-xs font-bold ${f.eficiencia >= 20 ? 'text-emerald-600' : f.eficiencia >= 0 ? 'text-slate-500' : 'text-amber-600'}">${f.eficiencia}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="text-[11px] text-slate-400 mt-2">
        <strong>Eficiencia nutricional</strong> = proteína (g/100 kcal) ×10 + fibra (g/100 kcal) ×8 − azúcar añadida (g/100 kcal) ×6 − saturada (g/100 kcal) ×3.
        No es un juicio sobre la comida: es cuánto rinde cada caloría para saciedad y masa magra. Solo entran al top los alimentos con ≥150 kcal en la semana.
      </div>
    </div>`;

  return `
    ${perfil}
    <div class="card mb-4">
      <div class="sec-title">🏆 Rankings de la semana</div>
      <div class="flex flex-wrap gap-1.5 mb-3">${chips}</div>
      <div class="mb-1">
        <div class="font-bold text-slate-800">${titulo}</div>
        <div class="text-[11px] text-slate-400">${nota}</div>
      </div>
      ${lista.length ? filas : '<div class="text-xs text-slate-400 py-4">Sin alimentos con peso suficiente para este ranking esta semana.</div>'}
      <button class="btn btn-secondary btn-sm mt-3" onclick="npPropuestaSobre('${key}')">🧠 Pedirle propuestas al agente sobre esto</button>
    </div>
    ${tablaFull}`;
}

// Manda al agente con un foco concreto: rellena la nota de contexto de la
// pestaña de Oportunidades y salta allá. El coach sigue decidiendo cuándo
// generar (la llamada cuesta): esto solo prepara el encargo.
window.npPropuestaSobre = (key) => {
  const met = NP_METRICAS.find(m => m[0] === key) || NP_METRICAS[0];
  const focos = {
    kcal: 'Enfócate en los alimentos que más calorías le aportaron: cuáles porcionar y con qué de SU propia lista reemplazarlos.',
    densos: 'Enfócate en los alimentos que más calorías le meten por porción: cómo porcionarlos sin quitárselos.',
    g: 'Enfócate en la grasa total: de dónde sale y si el reparto le sirve al objetivo.',
    sat: 'Enfócate en la grasa saturada: de qué alimentos suyos viene y con cuáles de los que YA come se puede bajar sin quitarle el plato.',
    mono: 'Enfócate en la grasa monoinsaturada: qué está haciendo bien acá y cómo protegerlo.',
    poli: 'Enfócate en la grasa poliinsaturada y el omega-3: si está corto, con qué alimentos suyos se sube.',
    azucar: 'Enfócate en el azúcar añadida: de dónde viene exactamente y el cambio más pequeño que la baja de verdad.',
    p: 'Enfócate en la proteína: de dónde sale, si le alcanza para su objetivo y cómo subirla con lo que ya come.',
    fibra: 'Enfócate en la fibra: de dónde sale y el cambio más simple para subirla.',
    efi_top: 'Enfócate en sus alimentos más eficientes: cuáles proteger y cómo hacer que aparezcan más veces por semana.',
    efi_bot: 'Enfócate en sus alimentos menos eficientes: cuáles porcionar (no prohibir) y por cuáles de los suyos cambiarlos.',
  };
  _np.focoIa = `FOCO PEDIDO POR EL COACH: ${focos[key] || met[1]}`;
  _np.tab = 'ia';
  rerenderView();
  setTimeout(() => {
    const t = document.getElementById('nut-ia-nota');
    if (t) {
      const prev = t.value.trim();
      t.value = prev && !prev.includes('FOCO PEDIDO') ? `${prev}\n${_np.focoIa}` : _np.focoIa;
      const det = t.closest('details');
      if (det) det.open = true;
      t.focus();
    }
  }, 60);
  toast('Foco cargado. Dale "Generar oportunidades".');
};

// =====================================================
// LA VISTA · reemplaza routes.nutricion
// =====================================================
// Mismas cabecera y carga de datos que antes (nutCargar sigue siendo el único
// que habla con el Mealtracker); lo que cambia es que ahora las pestañas
// cubren TODO lo que el dashboard de coach mostraba, y algunas cosas que no.
window.nutTab = (t) => { _np.tab = t; _nut.diaAbierto = null; rerenderView(); };

const NP_TABS = [
  ['resumen',   '📊 Resumen'],
  ['lecturas',  '🔎 Lecturas'],
  ['calendario', '📆 Calendario'],
  ['semanas',   '🗓 Semana a semana'],
  ['detalle',   '📅 Día a día'],
  ['literal',   '✍️ Historial literal'],
  ['despensa',  '⭐ Su despensa'],
  ['alimentos', '🍽 Alimentos'],
  ['ia',        '🧠 Propuestas'],
];

routes.nutricion = async () => {
  // Solo ACTIVOS en el selector. Los de pausa y los finalizados viven en
  // Clientes, en su subsección. Excepción: si vienes de la ficha de uno que
  // no está activo, ese sí se muestra — si no, la pantalla quedaría vacía y
  // el atajo desde la ficha no serviría para nada.
  const todos = await db.clientes.list();
  const clientes = todos.filter(c => c.estado === 'activo'
    || (_nut.clienteId && c.id === _nut.clienteId));

  if (!_nut.semana) _nut.semana = fmt.semanaISO();
  if (!_nut.clienteId && clientes.length) {
    const pref = clientes.find(c => c.mealtracker_id) || clientes[0];
    _nut.clienteId = pref.id;
    nutCargar(pref.id, _nut.semana);
    cargando('Cargando alimentación…');
    return;
  }

  const cliente = clientes.find(c => c.id === _nut.clienteId) || _nut.cliente;

  const selector = `
    <div class="flex flex-wrap items-center gap-2">
      <select class="text-sm !w-auto min-w-[200px]" onchange="nutElegirCliente(this.value)">
        ${clientes.map(c => `<option value="${c.id}" ${c.id === _nut.clienteId ? 'selected' : ''}>${escapeHtml(c.nombre)}${c.mealtracker_id ? '' : ' (sin vincular)'}</option>`).join('')}
      </select>
      <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        <button class="btn btn-secondary btn-sm !py-1" onclick="nutSemana(-1)" title="Semana anterior">←</button>
        <span class="text-sm font-bold text-slate-700 px-2 whitespace-nowrap">${fmt.labelSemana(_nut.semana)} <span class="font-normal text-slate-400">${fmt.rangoSemana(_nut.semana)}</span></span>
        <button class="btn btn-secondary btn-sm !py-1" onclick="nutSemana(1)" title="Semana siguiente">→</button>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="nutRefrescar()" title="Volver a leer el Mealtracker">🔄 Actualizar</button>
      ${cliente ? `<button class="btn btn-secondary btn-sm" onclick="verComposicionCliente('${cliente.id}')" title="Peso, medidas, metas y actividad">🧬 Composición</button>` : ''}
    </div>`;

  const cabecera = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900">🥗 Nutrición · ${escapeHtml(cliente?.nombre || 'cliente')}</h2>
        <p class="text-xs text-slate-500">Todo lo que registró en su app, en vivo. Semanas ISO (lunes a domingo), las mismas del seguimiento.</p>
      </div>
      ${selector}
    </div>`;

  if (_nut.cargando) { view.innerHTML = `${cabecera}<div class="card">Leyendo el Mealtracker…</div>`; return; }

  // Aviso de lectura bloqueada. Va ANTES que "sin datos" porque las dos
  // pantallas se ven igual y solo una es culpa del cliente: con RLS activada
  // sin políticas, Supabase devuelve cero filas sin error, y el CRM diría
  // "no registró nada" de todos por igual.
  const npBloqueo = typeof mtMotivoSinDatos === 'function' ? mtMotivoSinDatos() : null;
  if (npBloqueo) {
    view.innerHTML = `${cabecera}
      <div class="card border-l-4 border-amber-400">
        <div class="font-bold text-slate-800 mb-1">⚠️ No estoy leyendo el Mealtracker</div>
        <p class="text-sm text-slate-600 mb-2">${escapeHtml(npBloqueo)}</p>
        <button class="btn btn-primary btn-sm" onclick="navigate('ajustes')">Ir a Ajustes</button>
      </div>`;
    return;
  }

  if (_nut.error) {
    view.innerHTML = `${cabecera}<div class="card border-l-4 border-amber-400"><div class="font-bold text-slate-800 mb-1">No pude leer la alimentación</div><p class="text-sm text-slate-600">${escapeHtml(_nut.error)}</p></div>`;
    return;
  }
  const a = _nut.analisis;
  const d = _nut.data;
  if (!a || !d) { view.innerHTML = `${cabecera}<div class="card">Sin datos.</div>`; return; }

  const tabs = NP_TABS.map(([k, l]) =>
    `<button class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${_np.tab === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}" onclick="nutTab('${k}')">${l}</button>`).join('');

  // Barra de confianza del dato: de dónde salió cada número. Sin esto, dos
  // tableros que no cuadran se leen como "uno miente"; con esto se ve cuál
  // es la base de cada cosa.
  const cuentas = d._cuentas || 1;
  const barraFuente = `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 mb-4">
      <span>📥 Fuente: <strong class="text-slate-700">Mealtracker en vivo</strong>${cuentas > 1 ? ` · ${cuentas} cuentas del mismo nombre fusionadas` : ''}</span>
      <span>🎯 Meta usada: <strong class="text-slate-700">${a.meta.origen === 'mealtracker' ? 'la de su app (la que él ve)' : a.meta.origen === 'crm' ? 'la de la ficha del CRM (su app no tiene meta)' : 'sin meta configurada'}</strong>${a.meta.kcal ? ` · ${a.meta.kcal} kcal · P${a.meta.p ?? '—'} C${a.meta.c ?? '—'} G${a.meta.g ?? '—'}` : ''}</span>
      <span>📅 Días registrados: <strong class="text-slate-700">${a.registro.dias_registrados}/7</strong> · con desglose de alimentos: <strong class="text-slate-700">${a.registro.dias_con_detalle}/7</strong></span>
    </div>`;

  view.innerHTML = `${cabecera}
    <div class="bg-slate-100 rounded-xl p-1 flex gap-1 mb-4 overflow-x-auto">${tabs}</div>
    ${barraFuente}
    ${_np.tab === 'resumen' ? nutVistaResumen(a)
      : _np.tab === 'lecturas' ? npVistaLecturas(a)
      : _np.tab === 'calendario' ? npVistaCalendario(a, d)
      : _np.tab === 'semanas' ? npVistaSemanas(a, d)
      : _np.tab === 'detalle' ? nutVistaDetalle(a, d)
      : _np.tab === 'literal' ? npVistaLiteral(a, d)
      : _np.tab === 'despensa' ? npVistaDespensa(a, d)
      : _np.tab === 'alimentos' ? npVistaAlimentosPlus(a)
      : nutVistaIA(a)}`;
};

// Atajo desde la ficha del cliente (sobrescribe el de app.js para que además
// deje la pestaña en Resumen).
window.verNutricionCliente = (clienteId) => {
  _nut.clienteId = clienteId;
  _nut.semana = _nut.semana || fmt.semanaISO();
  _nut.ia = null;
  _np.tab = 'resumen';
  _np.mesAncla = null;
  closeModal();
  navigate('nutricion');
  nutCargar(clienteId, _nut.semana);
};

// Al cambiar de cliente se resetea el ancla del calendario (si no, quedaba
// mostrando el mes que se estaba mirando del cliente anterior).
const _npElegirBase = window.nutElegirCliente;
window.nutElegirCliente = (id) => { _np.mesAncla = null; _np.literalQ = ''; return _npElegirBase(id); };

// ═══════════════════════════════════════════════════════════════════════
// LECTURAS DE LA SEMANA  ·  sin agente, sin tokens
// ═══════════════════════════════════════════════════════════════════════
// Todo lo de esta pestaña se calcula AQUÍ, en el navegador, con los datos que
// ya están cargados. Cero llamadas al modelo, cero costo, y sale al instante.
//
// La idea: el 80% de lo que uno le pregunta al agente cada semana son las
// mismas cinco preguntas — de dónde salieron las calorías, qué está frenando,
// qué mejoró, qué vigilar. Eso no necesita un modelo: necesita que alguien lo
// haya calculado una vez. El agente queda para lo que sí es conversación
// ("y si le quito el arroz de la cena, ¿qué le pongo?").
//
// REGLA DE HONESTIDAD: cada lectura dice el número que la sustenta. Nada de
// afirmaciones sin cifra detrás, y nada que los datos no puedan respaldar —
// por eso aquí NO hay un "índice de hinchazón": con lo que registra el cliente
// no se puede medir eso sin inventarlo.

const NP_MIN_DIAS = 3;      // menos de esto y casi todo es ruido
const NP_MIN_KCAL_ALIMENTO = 150;  // un alimento por debajo no explica nada

// Un hallazgo: tono, título y el dato que lo respalda.
//   tono: 'bien' (felicítalo) · 'ojo' (vigílalo) · 'idea' (refuérzalo) · 'dato'
function npHallazgo(tono, titulo, detalle, dato) {
  return { tono, titulo, detalle, dato };
}

const NP_TONOS = {
  bien: { icono: '✅', clase: 'border-emerald-300 bg-emerald-50', tinta: 'text-emerald-900' },
  ojo:  { icono: '⚠️', clase: 'border-amber-300 bg-amber-50',   tinta: 'text-amber-900' },
  idea: { icono: '💡', clase: 'border-blue-300 bg-blue-50',     tinta: 'text-blue-900' },
  dato: { icono: '•',  clase: 'border-slate-200 bg-slate-50',   tinta: 'text-slate-700' },
};

// ─── Las lecturas, una por una ──────────────────────────────────────────
function npLecturas(a) {
  const H = [];
  const r = a.registro || {};
  const c = a.cumplimiento || {};
  const cons = a.consistencia || {};
  const meta = a.meta || {};
  const prom = a.promedio || {};

  // 1. ¿Hay con qué? Sin registro no hay lectura que valga.
  if (r.dias_registrados < NP_MIN_DIAS) {
    H.push(npHallazgo('ojo', 'Esta semana casi no registró',
      `Con ${r.dias_registrados} de 7 días no se puede leer un patrón. Lo único honesto que se puede trabajar esta semana es el registro mismo.`,
      `${r.dias_registrados}/7 días`));
    return H;
  }

  // 2. Adherencia al registro
  if (r.dias_registrados === 7) {
    H.push(npHallazgo('bien', 'Registró los 7 días',
      'Semana completa. Es el hábito que sostiene todo lo demás, y no es fácil.', '7/7 días'));
  } else if (r.dias_registrados >= 5) {
    H.push(npHallazgo('bien', `Registró ${r.dias_registrados} de 7 días`,
      `Le faltaron ${(r.dias_sin_registro || []).join(', ')}. Con esto ya se puede leer la semana.`,
      `${r.pct}%`));
  } else {
    H.push(npHallazgo('ojo', `Solo registró ${r.dias_registrados} de 7 días`,
      `Sin registro en ${(r.dias_sin_registro || []).join(', ')}. Los promedios de abajo salen de los días que sí registró, no de la semana entera.`,
      `${r.pct}%`));
  }

  // 3. LA BRECHA: qué macro está más lejos de su meta
  const brechas = [
    { k: 'Proteína', pct: c.prote_pct, prom: prom.p, meta: meta.p, u: 'g' },
    { k: 'Calorías', pct: c.kcal_pct, prom: prom.kcal, meta: meta.kcal, u: '' },
    { k: 'Carbohidratos', pct: c.carbos_pct, prom: prom.c, meta: meta.c, u: 'g' },
    { k: 'Grasas', pct: c.grasas_pct, prom: prom.g, meta: meta.g, u: 'g' },
  ].filter(b => b.pct != null && b.meta);
  if (brechas.length) {
    const peor = brechas.reduce((x, y) => (Math.abs(y.pct - 100) > Math.abs(x.pct - 100) ? y : x));
    if (Math.abs(peor.pct - 100) >= 12) {
      const falta = Math.round(Math.abs(peor.meta - peor.prom));
      H.push(npHallazgo('idea', `La brecha está en ${peor.k.toLowerCase()}`,
        peor.pct < 100
          ? `Le faltan ${falta}${peor.u} al día para su meta. Es la palanca más grande que tiene esta semana.`
          : `Se pasa ${falta}${peor.u} al día de su meta. Es lo que más se aleja.`,
        `${peor.pct}% de la meta`));
    } else {
      H.push(npHallazgo('bien', 'Sus macros están donde deben',
        'Ninguno se aparta más de un 12% de su meta. Cuando esto pasa, lo que toca es no tocar nada.',
        `${peor.k} ${peor.pct}%`));
    }
  }

  // 4. Proteína por kilo — el número que de verdad manda en composición
  if (c.prote_g_por_kg != null) {
    const g = c.prote_g_por_kg;
    if (g >= 1.6) H.push(npHallazgo('bien', 'La proteína está sólida', `${g} g por kilo de peso al día. Ese es el rango donde la masa magra se protege.`, `${g} g/kg`));
    else if (g >= 1.2) H.push(npHallazgo('idea', 'La proteína se puede subir', `Va en ${g} g por kilo. Llevarla a 1,6 suele ser el cambio que más se nota, y casi siempre cabe en lo que ya come.`, `${g} g/kg`));
    else H.push(npHallazgo('ojo', 'La proteína está baja', `${g} g por kilo al día. Por debajo de 1,2 cuesta sostener masa magra, sobre todo en déficit.`, `${g} g/kg`));
  }

  // 5. Fin de semana vs. entre semana — el patrón que más repite la gente
  if (cons.entre_semana_kcal && cons.fin_de_semana_kcal) {
    const dif = cons.fin_de_semana_kcal - cons.entre_semana_kcal;
    const pct = Math.round((dif / cons.entre_semana_kcal) * 100);
    if (pct >= 20) {
      H.push(npHallazgo('ojo', 'El fin de semana se le va',
        `Come ${Math.abs(dif)} kcal más al día el sábado y domingo que entre semana. Dos días así borran buena parte del déficit de los otros cinco.`,
        `+${pct}% finde`));
    } else if (pct <= -20) {
      H.push(npHallazgo('ojo', 'El fin de semana come bastante menos',
        `${Math.abs(dif)} kcal menos al día que entre semana. A veces es que no registra el finde, no que no coma — vale la pena preguntarle.`,
        `${pct}% finde`));
    } else {
      H.push(npHallazgo('bien', 'Sostiene el fin de semana',
        `Solo ${Math.abs(pct)}% de diferencia entre sus días de semana y el finde. Es lo que separa a quien avanza de quien va y viene.`,
        `${pct >= 0 ? '+' : ''}${pct}%`));
    }
  }

  // 6. Consistencia día a día
  if (cons.desviacion_kcal != null && meta.kcal) {
    const varia = Math.round((cons.desviacion_kcal / meta.kcal) * 100);
    if (varia >= 25) {
      H.push(npHallazgo('ojo', 'Los días le varían mucho',
        `Sus calorías oscilan ±${cons.desviacion_kcal} kcal entre un día y otro. El promedio de la semana puede verse bien y aun así estar comiendo a saltos.`,
        `±${varia}%`));
    }
  }

  // 7. Días en rango
  if (c.dias_en_rango_kcal != null && r.dias_registrados) {
    const d = c.dias_en_rango_kcal;
    if (d >= r.dias_registrados - 1 && d >= 4) {
      H.push(npHallazgo('bien', `${d} de ${r.dias_registrados} días dentro de la meta`,
        'Dar en el blanco casi todos los días es más difícil que un buen promedio. Vale decírselo.', `${d} días`));
    }
  }

  // 8. Horarios
  if (cons.primera_comida_prom && cons.ultima_comida_prom) {
    H.push(npHallazgo('dato', 'Su ventana de comidas',
      `Primera comida ${cons.primera_comida_prom}, última ${cons.ultima_comida_prom}. Útil si está peleando con hambre nocturna o con el desayuno.`,
      `${cons.primera_comida_prom} → ${cons.ultima_comida_prom}`));
  }

  // 9. EL PLATO QUE REPITE — la lectura más accionable de todas.
  // Un alimento suelto no se cambia; un plato sí. Si su almuerzo es el mismo
  // cuatro veces por semana, ese plato ES su dieta entre semana, y subirle
  // 20 g de proteína ahí vale más que cualquier consejo general.
  const platos = a.platos || [];
  const plato = platos.find(pl => pl.veces >= 2);
  if (plato) {
    const meta_p = meta.p ? Math.round(meta.p / Math.max(3, Math.round(prom.comidas || 4))) : null;
    const flojo = meta_p && plato.p_prom < meta_p * 0.7;
    H.push(npHallazgo(flojo ? 'idea' : 'dato', `Su plato de siempre: ${plato.nombre}`,
      `Lo repitió ${plato.veces} ${plato.veces === 1 ? 'vez' : 'veces'} en ${plato.dias} ${plato.dias === 1 ? 'día' : 'días'}`
      + `${plato.tipo ? ` (casi siempre en ${plato.tipo}${plato.hora_prom ? `, sobre las ${plato.hora_prom}` : ''})` : ''}. `
      + `Cada vez: ${plato.kcal_prom} kcal · ${plato.p_prom} g de proteína · ${plato.c_prom} g de carbos · ${plato.g_prom} g de grasa`
      + `${plato.fibra_prom > 0 ? ` · ${plato.fibra_prom} g de fibra` : ''}. `
      + (flojo
        ? `Es el plato que más pesa en su semana y se le queda corto de proteína: ajustar ESTE plato le cambia la semana entera.`
        : `Es su plato ancla. Cualquier ajuste que le hagas aquí se multiplica por ${plato.veces}.`),
      `${plato.veces}× · ${plato.kcal_prom} kcal`));
  }

  // 10. DÓNDE ESTÁ (Y DÓNDE FALTA) LA PROTEÍNA
  // El promedio diario puede verse bien y aun así tener toda la proteína
  // concentrada en la cena, que es la peor forma de repartirla.
  const porComida = (a.comidas_por_tipo || []).filter(c => c.veces >= 2 && c.tipo !== 'sin tipo');
  if (porComida.length >= 2) {
    const fuerte = porComida.reduce((x, y) => (y.p_prom > x.p_prom ? y : x));
    const debil = porComida.reduce((x, y) => (y.p_prom < x.p_prom ? y : x));
    if (fuerte.p_prom >= 5) {
      H.push(npHallazgo(debil.p_prom < fuerte.p_prom * 0.4 ? 'idea' : 'dato',
        `Su proteína se concentra en ${fuerte.tipo}`,
        `${fuerte.tipo} le aporta ${fuerte.p_prom} g de proteína en promedio (el ${fuerte.pct_prote}% de toda la semana) y ${debil.tipo} solo ${debil.p_prom} g. `
        + `Repartirla mejor sube la saciedad sin tocar las calorías del día.`,
        `${fuerte.p_prom} g vs ${debil.p_prom} g`));
    }
  }

  // 11. EL DESAYUNO — el sitio donde más veces falta proteína
  const desayuno = porComida.find(c => c.tipo === 'desayuno');
  if (desayuno) {
    if (desayuno.p_prom < 20) {
      H.push(npHallazgo('idea', 'El desayuno va corto de proteína',
        `${desayuno.p_prom} g en promedio (${desayuno.kcal_prom} kcal). Por debajo de 20 g casi nadie llega saciado al almuerzo, y es la comida más fácil de arreglar porque suele ser la misma todos los días.`,
        `${desayuno.p_prom} g`));
    } else if (desayuno.p_prom >= 30) {
      H.push(npHallazgo('bien', 'Arranca el día con proteína',
        `${desayuno.p_prom} g en el desayuno. Es la comida donde más gente falla y él la tiene resuelta.`, `${desayuno.p_prom} g`));
    }
  }

  // 12. VARIEDAD Y CONCENTRACIÓN — de cuántos alimentos vive de verdad
  const v = a.variedad || {};
  if (v.pct_kcal_top5 != null && v.alimentos_distintos) {
    if (v.pct_kcal_top5 >= 60) {
      H.push(npHallazgo('dato', 'Su dieta vive de muy pocos alimentos',
        `Cinco alimentos explican el ${v.pct_kcal_top5}% de lo que comió, sobre ${v.alimentos_distintos} distintos en la semana. `
        + `No es bueno ni malo por sí solo: significa que un cambio pequeño en esos cinco mueve casi todo, y también que se aburre pronto.`,
        `${v.pct_kcal_top5}% en 5`));
    } else if (v.alimentos_distintos >= 30) {
      H.push(npHallazgo('bien', 'Come variado',
        `${v.alimentos_distintos} alimentos distintos y ninguno domina la semana (los cinco primeros son el ${v.pct_kcal_top5}%). La variedad cubre micronutrientes sin que nadie tenga que pensarlo.`,
        `${v.alimentos_distintos} alimentos`));
    }
  }
  if (v.columna_vertebral && v.columna_vertebral.length) {
    H.push(npHallazgo('dato', 'Lo que come casi todos los días',
      `${v.columna_vertebral.slice(0, 6).join(', ')}. Aparecen en 5 días o más: son el esqueleto de su alimentación y lo que hay que respetar al proponerle cambios.`,
      `${v.columna_vertebral.length} fijos`));
  }

  // 13. CONTRA LA SEMANA PASADA — la pregunta que siempre se hace
  const cp = a.comparativa;
  if (cp) {
    if (cp.delta_dias >= 2) {
      H.push(npHallazgo('bien', 'Registró más que la semana pasada',
        `${r.dias_registrados} días esta semana contra ${cp.dias_registrados} la anterior. El registro es el hábito que sostiene todo lo demás.`,
        `+${cp.delta_dias} días`));
    } else if (cp.delta_dias <= -2) {
      H.push(npHallazgo('ojo', 'Registró menos que la semana pasada',
        `${r.dias_registrados} días contra ${cp.dias_registrados} la anterior. Antes de leer los números, vale la pena preguntarle qué pasó.`,
        `${cp.delta_dias} días`));
    }
    if (cp.delta_p != null && Math.abs(cp.delta_p) >= 15) {
      H.push(npHallazgo(cp.delta_p > 0 ? 'bien' : 'ojo',
        cp.delta_p > 0 ? 'Subió la proteína respecto a la semana pasada' : 'Bajó la proteína respecto a la semana pasada',
        `${prom.p} g al día esta semana contra ${cp.p} g la anterior.`,
        `${cp.delta_p > 0 ? '+' : ''}${cp.delta_p} g`));
    }
    if (cp.delta_kcal != null && Math.abs(cp.delta_kcal) >= 200) {
      H.push(npHallazgo('dato',
        cp.delta_kcal > 0 ? 'Comió más que la semana pasada' : 'Comió menos que la semana pasada',
        `${prom.kcal} kcal al día contra ${cp.kcal} la anterior. Con dos semanas ya se puede hablar de dirección, no de un día suelto.`,
        `${cp.delta_kcal > 0 ? '+' : ''}${cp.delta_kcal} kcal`));
    }
  }

  // 14. FIBRA Y AZÚCAR AÑADIDA — los dos micros que sí se sostienen
  if (prom.fibra != null && r.dias_con_detalle >= NP_MIN_DIAS) {
    if (prom.fibra >= 25) {
      H.push(npHallazgo('bien', 'La fibra está bien', `${prom.fibra} g al día. Por encima de 25 g se nota en saciedad y en digestión.`, `${prom.fibra} g`));
    } else if (prom.fibra < 15) {
      H.push(npHallazgo('idea', 'La fibra está baja',
        `${prom.fibra} g al día sobre los ${r.dias_con_detalle} días con desglose. Subirla con legumbres, avena, verdura y fruta entera baja el hambre sin quitar comida.`,
        `${prom.fibra} g`));
    }
  }
  if (prom.azucar != null && r.dias_con_detalle >= NP_MIN_DIAS && prom.azucar >= 25) {
    H.push(npHallazgo('ojo', 'El azúcar añadida se pasa de la referencia',
      `${prom.azucar} g al día (la OMS sugiere menos de 25). Esto NO cuenta la fruta entera ni el lácteo natural: es azúcar que alguien le agregó a la comida.`,
      `${prom.azucar} g`));
  }

  // 15. AGUA — solo si la registra, y diciendo sobre cuántos días
  if (prom.agua && prom.dias_agua >= 3) {
    H.push(npHallazgo(prom.agua >= 2000 ? 'bien' : 'idea',
      prom.agua >= 2000 ? 'La hidratación está cubierta' : 'Se queda corto de agua',
      `${(prom.agua / 1000).toFixed(1)} litros al día, sobre ${prom.dias_agua} días en que la registró.`,
      `${(prom.agua / 1000).toFixed(1)} L`));
  }

  // 16. Cuántas comidas hace al día
  if (prom.comidas) {
    H.push(npHallazgo('dato', `Hace ${prom.comidas} comidas al día`,
      `Promedio sobre los ${r.dias_con_detalle} días con desglose, con ${prom.items} alimentos registrados por día. `
      + (prom.comidas <= 2
        ? 'Con dos comidas cuesta repartir la proteína: casi siempre conviene una más.'
        : 'Útil para saber en cuántos sitios se puede repartir la proteína del día.'),
      `${prom.comidas} comidas`));
  }

  // 17. Bienestar — solo si lo registró
  const b = a.bienestar || {};
  if (b.energia != null && b.energia <= 2.5) {
    H.push(npHallazgo('ojo', 'Reportó energía baja',
      `Promedio de ${b.energia}/5 esta semana. Con déficit agresivo o proteína baja suele ser lo primero que cae.`, `${b.energia}/5`));
  } else if (b.energia != null && b.energia >= 4) {
    H.push(npHallazgo('bien', 'Se sintió con energía', `Promedio de ${b.energia}/5. Buena señal de que el plan le está cayendo bien.`, `${b.energia}/5`));
  }
  if (b.hambre != null && b.hambre >= 4) {
    H.push(npHallazgo('ojo', 'Reportó hambre alta',
      `Promedio de ${b.hambre}/5. Antes de bajar calorías, mirar proteína y fibra: casi siempre el problema es de saciedad, no de cantidad.`, `${b.hambre}/5`));
  }

  return H;
}

// ─── Los alimentos, ordenados por lo que de verdad se pregunta ──────────
// "Qué le está costando caro" no es lo mismo que "qué come más veces", y
// ninguno de los dos es "qué le está rindiendo". Son tres preguntas distintas
// y aquí van las tres, cada una con su número.
function npRankings(a) {
  const todos = (a.alimentos || []).filter(f => f.kcal >= NP_MIN_KCAL_ALIMENTO);
  if (!todos.length) return null;

  // Grasa: qué parte de las calorías de ESE alimento vino de grasa. Sin esto,
  // el aceite (que es 100% grasa pero poca cantidad) se perdía detrás de
  // cualquier plato grande.
  const conGrasa = todos.map(f => ({
    ...f,
    pct_grasa: f.kcal > 0 ? Math.round(((f.g * 9) / f.kcal) * 100) : 0,
    kcal_grasa: Math.round(f.g * 9),
  }));

  return {
    // De dónde salieron sus calorías
    calorico: [...todos].sort((x, y) => y.kcal - x.kcal).slice(0, 5),
    // Dónde está la grasa — por CANTIDAD de calorías que aporta como grasa
    graso: [...conGrasa].filter(f => f.g >= 8).sort((x, y) => y.kcal_grasa - x.kcal_grasa).slice(0, 5),
    // Lo que le rinde: proteína y fibra por caloría
    eficiente: [...todos].filter(f => f.calidad > 0).sort((x, y) => y.calidad - x.calidad).slice(0, 5),
    // Lo que le cuesta: muchas calorías, poco aporte
    flojo: [...todos].filter(f => f.calidad <= 5).sort((x, y) => y.kcal - x.kcal).slice(0, 5),
    // Azúcar añadida — el único dato de "hinchazón/vacío" que los registros
    // sostienen de verdad. No inventamos un índice de hinchazón: con lo que
    // el cliente escribe no se puede medir eso sin mentir.
    azucar: [...todos].filter(f => f.azucar >= 5).sort((x, y) => y.azucar - x.azucar).slice(0, 5),
    // Lo que más repite: cambiar aquí pesa más que cualquier alimento nuevo
    repetido: [...todos].sort((x, y) => y.veces - x.veces).slice(0, 5),
  };
}

function npRankCard(titulo, nota, items, valor, unidad, extra) {
  if (!items || !items.length) return '';
  const max = Math.max(1, ...items.map(valor));
  return `
    <div class="card">
      <div class="font-bold text-slate-900 text-sm">${titulo}</div>
      <div class="text-xs text-slate-500 mb-3 mt-0.5">${nota}</div>
      ${items.map(f => `
        <div class="py-1.5" style="border-bottom:1px solid #f1f5f9">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(f.nombre)}</span>
            <span class="text-sm font-bold text-slate-900 whitespace-nowrap">${valor(f)}${unidad}</span>
          </div>
          <div class="h-1.5 rounded-full mt-1 overflow-hidden bg-slate-100">
            <div style="width:${(valor(f) / max) * 100}%;height:100%;background:#0E8060;border-radius:999px"></div>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">${extra(f)}</div>
        </div>`).join('')}
    </div>`;
}

function npVistaLecturas(a) {
  const H = npLecturas(a);
  const R = npRankings(a);
  const r = a.registro || {};

  const tarjetas = H.map(h => {
    const t = NP_TONOS[h.tono] || NP_TONOS.dato;
    return `
      <div class="rounded-xl border ${t.clase} p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-bold text-sm ${t.tinta}">${t.icono} ${escapeHtml(h.titulo)}</div>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed">${escapeHtml(h.detalle)}</p>
          </div>
          <span class="text-xs font-bold ${t.tinta} whitespace-nowrap flex-shrink-0">${escapeHtml(h.dato)}</span>
        </div>
      </div>`;
  }).join('');

  const porTono = (t) => H.filter(h => h.tono === t).length;

  const platos = (a.platos || []).filter(pl => pl.veces >= 2).slice(0, 6);
  const porComida = (a.comidas_por_tipo || []).filter(c => c.tipo !== 'sin tipo');
  const v = a.variedad || {};
  const cp = a.comparativa;

  // ── Sus platos de siempre ──────────────────────────────────────────────
  // Lo que pidió el coach: el plato que se repite, cuántas veces y con qué
  // macros. Un alimento suelto no se cambia; un plato sí.
  const tarjetaPlatos = platos.length ? `
    <div class="card mb-3">
      <div class="font-bold text-slate-900 text-sm">🍽 Sus platos de siempre</div>
      <div class="text-xs text-slate-500 mb-3 mt-0.5">
        La combinación completa, no el alimento suelto. Si un plato se repite cuatro veces, ajustar ESE plato vale por cuatro consejos.
      </div>
      <div class="overflow-x-auto -mx-1 px-1">
      <table class="w-full text-sm">
        <thead><tr class="text-[11px] text-slate-400 uppercase tracking-wide">
          <th class="text-left font-semibold py-1">Plato</th>
          <th class="text-right font-semibold">Veces</th>
          <th class="text-right font-semibold">kcal</th>
          <th class="text-right font-semibold">P</th>
          <th class="text-right font-semibold">C</th>
          <th class="text-right font-semibold">G</th>
          <th class="text-right font-semibold">Fibra</th>
        </tr></thead>
        <tbody>
        ${platos.map(pl => `
          <tr style="border-top:1px solid #f1f5f9">
            <td class="py-1.5 pr-2">
              <div class="font-semibold text-slate-800 leading-tight">${escapeHtml(pl.nombre)}</div>
              <div class="text-[11px] text-slate-400">
                ${pl.tipo ? escapeHtml(pl.tipo) : 'sin tipo'}${pl.hora_prom ? ` · ~${pl.hora_prom}` : ''} · en ${pl.dias} ${pl.dias === 1 ? 'día' : 'días'}
                · ${pl.densidad_proteica_pct}% de sus kcal en proteína
              </div>
            </td>
            <td class="text-right font-bold text-slate-900 whitespace-nowrap">${pl.veces}×</td>
            <td class="text-right text-slate-700 whitespace-nowrap">${pl.kcal_prom}</td>
            <td class="text-right whitespace-nowrap font-semibold ${pl.p_prom >= 30 ? 'text-emerald-600' : pl.p_prom >= 18 ? 'text-slate-700' : 'text-amber-600'}">${pl.p_prom} g</td>
            <td class="text-right text-slate-500 whitespace-nowrap">${pl.c_prom} g</td>
            <td class="text-right text-slate-500 whitespace-nowrap">${pl.g_prom} g</td>
            <td class="text-right text-slate-500 whitespace-nowrap">${pl.fibra_prom} g</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
      <div class="text-[11px] text-slate-400 mt-2">
        Macros por vez, no de la semana. Se cuenta como plato una comida con dos alimentos o más; el orden no importa.
        ${v.platos_distintos ? `Registró ${v.platos_distintos} combinaciones distintas.` : ''}
      </div>
    </div>` : '';

  // ── Cómo reparte el día ────────────────────────────────────────────────
  const maxKcalComida = Math.max(1, ...porComida.map(c => c.kcal_prom));
  const tarjetaReparto = porComida.length ? `
    <div class="card mb-3">
      <div class="font-bold text-slate-900 text-sm">🕐 Cómo reparte el día</div>
      <div class="text-xs text-slate-500 mb-3 mt-0.5">
        Dónde están sus calorías y —más importante— dónde está su proteína. Un promedio diario correcto puede esconder toda la proteína en la cena.
      </div>
      ${porComida.map(c => `
        <div class="py-1.5" style="border-bottom:1px solid #f1f5f9">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold text-slate-800 capitalize">${escapeHtml(c.tipo)}</span>
            <span class="text-sm text-slate-900 whitespace-nowrap">
              <strong>${c.kcal_prom}</strong> kcal
              <span class="text-slate-400">·</span>
              <span class="font-semibold ${c.p_prom >= 25 ? 'text-emerald-600' : 'text-slate-600'}">${c.p_prom} g P</span>
            </span>
          </div>
          <div class="h-1.5 rounded-full mt-1 overflow-hidden bg-slate-100">
            <div style="width:${(c.kcal_prom / maxKcalComida) * 100}%;height:100%;background:#0E8060;border-radius:999px"></div>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            ${c.veces}× en ${c.dias} ${c.dias === 1 ? 'día' : 'días'}${c.hora_prom ? ` · ~${c.hora_prom}` : ''}
            · ${c.pct_kcal}% de sus calorías y ${c.pct_prote}% de su proteína
            · C ${c.c_prom} g · G ${c.g_prom} g
          </div>
        </div>`).join('')}
    </div>` : '';

  // ── Contra la semana pasada ────────────────────────────────────────────
  const flecha = (n, mejorArriba = true) => {
    if (n == null || n === 0) return '<span class="text-slate-400">=</span>';
    const sube = n > 0;
    const bien = mejorArriba ? sube : !sube;
    return `<span class="${bien ? 'text-emerald-600' : 'text-amber-600'} font-bold">${sube ? '▲' : '▼'} ${Math.abs(n)}</span>`;
  };
  const tarjetaComparativa = cp ? `
    <div class="card mb-3">
      <div class="font-bold text-slate-900 text-sm">📈 Contra la semana pasada</div>
      <div class="text-xs text-slate-500 mb-3 mt-0.5">Misma cuenta, semana anterior. Es la dirección, que casi siempre importa más que el número suelto.</div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-slate-50 rounded-xl p-2">
          <div class="text-[11px] text-slate-400">Días registrados</div>
          <div class="text-lg font-bold text-slate-900">${a.registro.dias_registrados}<span class="text-xs text-slate-400 font-normal"> vs ${cp.dias_registrados}</span></div>
          <div class="text-xs">${flecha(cp.delta_dias)}</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-2">
          <div class="text-[11px] text-slate-400">kcal / día</div>
          <div class="text-lg font-bold text-slate-900">${a.promedio.kcal ?? '—'}<span class="text-xs text-slate-400 font-normal"> vs ${cp.kcal}</span></div>
          <div class="text-xs">${cp.delta_kcal == null || cp.delta_kcal === 0 ? '<span class="text-slate-400">=</span>' : `<span class="text-slate-600 font-bold">${cp.delta_kcal > 0 ? '▲' : '▼'} ${Math.abs(cp.delta_kcal)}</span>`}</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-2">
          <div class="text-[11px] text-slate-400">Proteína / día</div>
          <div class="text-lg font-bold text-slate-900">${a.promedio.p ?? '—'}<span class="text-xs text-slate-400 font-normal"> vs ${cp.p}</span></div>
          <div class="text-xs">${flecha(cp.delta_p)}</div>
        </div>
      </div>
      <div class="text-[11px] text-slate-400 mt-2">
        Las calorías no tienen flecha de color a propósito: si va en déficit, comer menos es bueno; si va en volumen, es lo contrario. El número está, el juicio es tuyo.
      </div>
    </div>` : '';

  return `
    <div class="card mb-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 class="font-bold text-slate-900">🔎 Lecturas de la semana</h3>
          <p class="text-xs text-slate-500 mt-1 max-w-2xl">
            Calculado aquí mismo con lo que ya está cargado — sin consultar al modelo, sin costo y al instante.
            Cada lectura trae el número que la sustenta, para que puedas decírselo al cliente tal cual.
          </p>
        </div>
        <div class="flex gap-2 text-xs flex-shrink-0">
          ${porTono('bien') ? `<span class="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold">✅ ${porTono('bien')} para felicitar</span>` : ''}
          ${porTono('ojo') ? `<span class="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold">⚠️ ${porTono('ojo')} para cuidar</span>` : ''}
          ${porTono('idea') ? `<span class="px-2 py-1 rounded-lg bg-blue-50 text-blue-800 font-semibold">💡 ${porTono('idea')} para reforzar</span>` : ''}
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">${tarjetas}</div>
    </div>

    ${tarjetaComparativa}
    ${tarjetaPlatos}
    ${tarjetaReparto}

    ${R ? `
    <div class="text-xs font-semibold text-slate-500 mb-2 px-1">
      SUS ALIMENTOS · sobre ${r.dias_con_detalle} ${r.dias_con_detalle === 1 ? 'día' : 'días'} en que registró QUÉ comió, no solo el total
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      ${npRankCard('🔥 De aquí salieron sus calorías', 'Los cinco que más aportaron. Suelen explicar la semana entera.',
        R.calorico, f => f.kcal, ' kcal', f => `${f.pct_kcal_detalle}% de lo que registró · ${f.veces} ${f.veces === 1 ? 'vez' : 'veces'}`)}
      ${npRankCard('🧈 Dónde está la grasa', 'Calorías que aportó como grasa. El aceite y los frutos secos suelen aparecer aquí sin que nadie los note.',
        R.graso, f => f.kcal_grasa, ' kcal', f => `${f.g} g de grasa · el ${f.pct_grasa}% de sus calorías`)}
      ${npRankCard('💪 Lo que más le rinde', 'Proteína y fibra por caloría. Estos son los que hay que pedirle que repita.',
        R.eficiente, f => f.calidad, '', f => `${f.densidad_proteica_pct}% de sus kcal en proteína · ${f.fibra} g de fibra`)}
      ${npRankCard('🪨 Lo que le cuesta caro', 'Muchas calorías y poco aporte. No para prohibir: para saber dónde hay margen.',
        R.flojo, f => f.kcal, ' kcal', f => `${f.veces} ${f.veces === 1 ? 'vez' : 'veces'} · ${f.kcal_por_vez} kcal cada vez`)}
      ${npRankCard('🍬 Azúcar añadida', 'Solo el azúcar que alguien le AGREGÓ a la comida. La fruta entera, el lácteo natural y la verdura no suman aquí: su azúcar viene con fibra y agua, y ninguna guía la cuenta.',
        R.azucar, f => f.azucar, ' g', f => `${f.veces} ${f.veces === 1 ? 'vez' : 'veces'} esta semana`)}
      ${npRankCard('🔁 Lo que más repite', 'Su dieta real. Un cambio aquí pesa más que cualquier alimento nuevo.',
        R.repetido, f => f.veces, '×', f => `${f.kcal_por_vez} kcal por vez · P ${f.p} g · C ${f.c} g · G ${f.g} g · en ${f.dias} ${f.dias === 1 ? 'día' : 'días'}`)}
    </div>` : `
    <div class="card text-sm text-slate-500">
      Para los rankings de alimentos hace falta que registre QUÉ comió, no solo el total del día.
      Esta semana tiene ${r.dias_con_detalle || 0} ${r.dias_con_detalle === 1 ? 'día' : 'días'} con ese desglose.
    </div>`}
  `;
}
