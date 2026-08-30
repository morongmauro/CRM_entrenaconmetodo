// =====================================================
// CRM EntrenaConMétodo · SECCIÓN COMPOSICIÓN DEL CLIENTE
// =====================================================
// Una sola pantalla con la película física del cliente:
//
//   · Registros de peso, % de grasa y medidas, con su evolución.
//   · Historial de metas nutricionales: qué meta rigió, desde cuándo y con
//     qué peso y objetivo se calculó.
//   · Historial de actividad física: nivel/PAL con el que se calculó cada
//     meta, y la asistencia semanal real que registra el seguimiento.
//   · AVISO de meta desactualizada: cuando el peso o el % de grasa cambian
//     lo suficiente como para que la meta ya no cuadre. AVISA, no toca nada.
//   · La calculadora completa de meta nutricional (la misma de la sección 5
//     de la ficha), para no tener que salir de acá.
//
// ─── LO QUE ESTA SECCIÓN NO HACE ────────────────────────────────────────
// No cambia la meta sola. Nunca. El aviso es un aviso: te dice cuánto se
// movió el peso, qué meta saldría hoy y cuánto se aparta de la vigente. El
// botón que la cambia es el mismo de siempre y pide confirmación mostrando
// el antes y el después. Quien decide eres tú.
//
// ─── CÓMO SE INSTALA ────────────────────────────────────────────────────
// No modifica app.js. Se auto-registra en el router y clona su botón en la
// barra de navegación, igual que entrenamiento.js.
//     <script src="/app.js"></script>
//     <script src="/composicion.js"></script>   ← agregar esta
// =====================================================

const _comp = {
  clienteId: null,
  cliente: null,
  meds: null,
  metas: null,       // null = tabla inexistente; [] = sin filas
  segs: null,
  cargando: false,
  error: null,
  tab: 'panorama',   // panorama | corporal | metas | actividad | calculadora
};

// =====================================================
// UMBRALES DEL AVISO DE META DESACTUALIZADA
// =====================================================
// El gasto energético se calcula sobre el peso: si el peso se movió, la meta
// que se fijó con el peso viejo ya no describe al cliente de hoy. Pero no
// toda variación merece recalcular — el peso oscila 1-2 kg por agua, sal y
// tránsito intestinal, y perseguir ese ruido produce metas nerviosas que el
// cliente no alcanza a asentar.
//
// Se avisa cuando pasa CUALQUIERA de estas:
//   · el peso se movió ≥ 2.5 kg respecto al peso con el que se calculó la
//     meta vigente (o ≥ 3% del peso, lo que sea mayor: 2.5 kg no significan
//     lo mismo en alguien de 55 kg que en alguien de 110);
//   · el % de grasa se movió ≥ 2 puntos (cambia el método de cálculo y la
//     masa magra, que es lo que fija la proteína);
//   · la meta recalculada hoy se aparta ≥ 100 kcal de la vigente;
//   · hay medición nueva y la meta vigente se calculó SIN peso de referencia
//     (metas viejas, anteriores al historial).
const COMP_UMBRALES = { kg: 2.5, kg_pct: 0.03, grasa_pp: 2.0, kcal: 100 };

// Devuelve el diagnóstico del aviso, o null si no hay nada que avisar.
// NUNCA escribe: solo compara y explica.
function compEvaluarMeta(cliente, meds, metas) {
  const conPeso = (meds || []).filter(m => m.peso != null)
    .slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const ultima = conPeso[conPeso.length - 1];
  if (!ultima) return null;                          // sin mediciones no hay nada que comparar

  // La meta vigente y el peso con el que se calculó. El historial es la
  // fuente buena (guarda peso_kg y grasa_pct del cálculo); si no existe, se
  // cae a la ficha, que no guarda el peso de referencia.
  const filas = (metas || []).filter(m => m.kcal);
  const vigente = filas[0] || null;
  const metaFicha = cliente.meta_calorias ? {
    kcal: cliente.meta_calorias, proteina_g: cliente.meta_proteina_g,
    carbos_g: cliente.meta_carbos_g, grasas_g: cliente.meta_grasas_g,
    fecha: (cliente.meta_calculada_en || '').slice(0, 10) || null,
    peso_kg: null, grasa_pct: null,
  } : null;
  const ref = vigente || metaFicha;
  if (!ref) {
    return {
      nivel: 'sin_meta',
      titulo: 'Este cliente no tiene meta nutricional',
      detalle: `Ya tiene medición (${ultima.peso} kg del ${fmt.fechaCorta(ultima.fecha)}) pero ninguna meta calculada. Sin meta, su app no tiene contra qué comparar lo que come.`,
      medicion: ultima,
    };
  }

  // ¿La medición es posterior a la meta? Si la meta es más nueva, ya está al día.
  const fechaMeta = ref.fecha || null;
  const medPosterior = !fechaMeta || (ultima.fecha || '') >= fechaMeta;

  const razones = [];
  const pesoRef = ref.peso_kg != null ? Number(ref.peso_kg) : null;
  const grasaRef = ref.grasa_pct != null ? Number(ref.grasa_pct) : null;

  let dPeso = null, dGrasa = null;
  if (pesoRef != null) {
    dPeso = +(Number(ultima.peso) - pesoRef).toFixed(1);
    const umbral = Math.max(COMP_UMBRALES.kg, pesoRef * COMP_UMBRALES.kg_pct);
    if (Math.abs(dPeso) >= umbral) {
      razones.push(`El peso se movió <strong>${dPeso > 0 ? '+' : ''}${dPeso} kg</strong> desde que se calculó la meta (${pesoRef} kg → ${ultima.peso} kg). El umbral para este cliente es ${umbral.toFixed(1)} kg.`);
    }
  } else if (medPosterior) {
    razones.push('La meta vigente no guarda con qué peso se calculó (es anterior al historial de metas), así que no se puede saber si sigue cuadrando. Recalcularla deja la trazabilidad al día.');
  }

  if (ultima.grasa_pct != null && grasaRef != null) {
    dGrasa = +(Number(ultima.grasa_pct) - grasaRef).toFixed(1);
    if (Math.abs(dGrasa) >= COMP_UMBRALES.grasa_pp) {
      razones.push(`El % de grasa se movió <strong>${dGrasa > 0 ? '+' : ''}${dGrasa} puntos</strong> (${grasaRef}% → ${ultima.grasa_pct}%). Cambia la masa magra, que es la que fija la proteína.`);
    }
  }

  // Qué saldría HOY con el peso y el %grasa nuevos (mismo motor de la ficha).
  const grasaHoy = ultima.grasa_pct != null ? Number(ultima.grasa_pct) : grasaRef;
  const sug = metaSugeridaDesdeMedicion(cliente, Number(ultima.peso), grasaHoy);
  let dKcal = null, propuesta = null;
  if (sug && sug.meta) {
    propuesta = sug.meta.redondeo;
    if (ref.kcal) {
      dKcal = propuesta.kcal - ref.kcal;
      if (Math.abs(dKcal) >= COMP_UMBRALES.kcal) {
        razones.push(`Recalculada hoy daría <strong>${propuesta.kcal} kcal</strong> contra las ${ref.kcal} vigentes: <strong>${dKcal > 0 ? '+' : ''}${dKcal} kcal</strong> de diferencia.`);
      }
    }
  }

  if (!razones.length) {
    return {
      nivel: 'ok',
      titulo: 'La meta sigue cuadrando',
      detalle: `Última medición: ${ultima.peso} kg${ultima.grasa_pct ? ` · ${ultima.grasa_pct}% grasa` : ''} (${fmt.fechaCorta(ultima.fecha)}). ${pesoRef != null ? `Se calculó con ${pesoRef} kg${dPeso != null ? `, ${dPeso > 0 ? '+' : ''}${dPeso} kg de diferencia` : ''}.` : ''}${dKcal != null ? ` Recalculada hoy daría ${propuesta.kcal} kcal (${dKcal > 0 ? '+' : ''}${dKcal}).` : ''} No hace falta tocarla.`,
      medicion: ultima, propuesta, ref, dPeso, dGrasa, dKcal,
    };
  }

  return {
    nivel: 'revisar',
    titulo: 'Conviene revisar la meta nutricional',
    razones,
    faltan: sug && sug.faltan ? sug.faltan : null,
    medicion: ultima, propuesta, ref, dPeso, dGrasa, dKcal,
    objetivo: sug && sug.objetivo ? sug.objetivo : null,
    metaCalc: sug && sug.meta ? sug.meta : null,
  };
}

function compAvisoHTML(av, clienteId) {
  if (!av) {
    return `<div class="card border-l-4 border-slate-300">
      <div class="font-bold text-slate-800 mb-1">📏 Sin mediciones</div>
      <p class="text-sm text-slate-600">Este cliente no tiene ninguna medición corporal registrada, así que no hay con qué evaluar la meta. Registra la primera y este panel empieza a vigilarla.</p>
      <button class="btn btn-primary btn-sm mt-3" onclick="nuevaMedicion('${clienteId}')">📏 Registrar medición</button>
    </div>`;
  }

  if (av.nivel === 'ok') {
    return `<div class="card border-l-4 border-emerald-400">
      <div class="font-bold text-emerald-800 mb-1">✅ ${av.titulo}</div>
      <p class="text-sm text-slate-600">${av.detalle}</p>
      <div class="text-[11px] text-slate-400 mt-2">Umbrales de aviso: ±${COMP_UMBRALES.kg} kg (o ±${COMP_UMBRALES.kg_pct * 100}% del peso) · ±${COMP_UMBRALES.grasa_pp} puntos de grasa · ±${COMP_UMBRALES.kcal} kcal de diferencia.</div>
    </div>`;
  }

  if (av.nivel === 'sin_meta') {
    return `<div class="card border-l-4 border-amber-400">
      <div class="font-bold text-amber-800 mb-1">⚠️ ${av.titulo}</div>
      <p class="text-sm text-slate-600">${av.detalle}</p>
      <button class="btn btn-primary btn-sm mt-3" onclick="compTab('calculadora')">🧮 Calcular su meta</button>
    </div>`;
  }

  const p = av.propuesta;
  const ref = av.ref || {};
  const linea = (label, nuevo, actual, color) => {
    const d = actual != null && nuevo != null ? nuevo - actual : null;
    return `<div class="flex justify-between gap-2 text-sm py-0.5">
      <span style="color:${color};font-weight:600">${label}</span>
      <span>${actual != null ? `<span class="text-slate-400">${actual}</span> → ` : ''}<strong>${nuevo ?? '—'}</strong>${d ? ` <span style="color:${d > 0 ? '#2563eb' : '#d97706'}">(${d > 0 ? '+' : ''}${d})</span>` : ''}</span>
    </div>`;
  };

  return `<div class="card border-l-4 border-amber-400">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div class="font-bold text-amber-800">⚠️ ${av.titulo}</div>
        <p class="text-xs text-slate-500 mt-0.5">Última medición: <strong>${av.medicion.peso} kg</strong>${av.medicion.grasa_pct ? ` · ${av.medicion.grasa_pct}% grasa` : ''} · ${fmt.fechaCorta(av.medicion.fecha)}</p>
      </div>
      <span class="tag tag-yellow">pendiente de tu decisión</span>
    </div>

    <ul class="text-sm text-slate-700 mt-3 space-y-1 list-disc pl-5">
      ${av.razones.map(r => `<li>${r}</li>`).join('')}
    </ul>

    ${av.faltan ? `
      <div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
        Para poder proponerte la meta nueva falta en el perfil: <strong>${av.faltan.join(', ')}</strong>.
        Complétalo en la ficha del cliente y vuelve.
      </div>`
    : p ? `
      <div class="bg-slate-50 rounded-xl p-3 mt-3">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Lo que saldría hoy (propuesta, no aplicada)</div>
        ${linea('Calorías', p.kcal, ref.kcal, '#059669')}
        ${linea('Proteína (g)', p.proteina, ref.proteina_g, '#2563eb')}
        ${linea('Carbos (g)', p.carbos, ref.carbos_g, '#d97706')}
        ${linea('Grasas (g)', p.grasas, ref.grasas_g, '#dc2626')}
        ${av.metaCalc ? `<div class="text-[11px] text-slate-500 mt-2">${av.metaCalc.metodo} · ${av.objetivo ? escapeHtml(av.objetivo.label) : ''} · TDEE ${av.metaCalc.tdee} · ritmo ≈ ${av.metaCalc.cambioSemanalKg > 0 ? '+' : ''}${av.metaCalc.cambioSemanalKg} kg/semana</div>` : ''}
        ${av.metaCalc ? av.metaCalc.avisos.map(x => `<div class="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">⚠️ ${escapeHtml(x)}</div>`).join('') : ''}
      </div>` : ''}

    <div class="text-xs text-slate-500 mt-3 bg-white rounded-lg px-3 py-2 ring-1 ring-slate-100">
      <strong>Nada de esto se aplicó.</strong> El CRM no cambia metas solo: te avisa y te muestra el número.
      Cuando decidas, hazlo desde la calculadora (queda registrado en el historial con el peso y el objetivo del cálculo)
      y desde ahí decides si se la envías a su app.
    </div>

    <div class="flex flex-wrap gap-2 mt-3">
      <button class="btn btn-primary btn-sm" onclick="compTab('calculadora')">🧮 Abrir la calculadora con estos datos</button>
      <button class="btn btn-secondary btn-sm" onclick="nuevaMedicion('${clienteId}')">📏 Registrar otra medición</button>
      <button class="btn btn-secondary btn-sm" onclick="compAplazarAviso('${clienteId}')">🔕 Ya lo revisé, no me avises de esta medición</button>
    </div>
  </div>`;
}

// "Ya lo revisé": silencia el aviso SOLO para la medición actual, en este
// navegador. Si mañana entra una medición nueva, el aviso vuelve. No toca la
// base de datos ni la meta.
function compClaveSilencio(clienteId, med) {
  return `comp:visto:${clienteId}:${med?.fecha || ''}:${med?.peso ?? ''}:${med?.grasa_pct ?? ''}`;
}
window.compAplazarAviso = (clienteId) => {
  const av = compEvaluarMeta(_comp.cliente, _comp.meds, _comp.metas);
  if (!av || !av.medicion) return;
  try { localStorage.setItem(compClaveSilencio(clienteId, av.medicion), new Date().toISOString()); } catch (e) { /* sin localStorage: no se silencia */ }
  toast('Aviso silenciado para esta medición');
  rerenderView();
};
function compSilenciado(clienteId, med) {
  try { return !!localStorage.getItem(compClaveSilencio(clienteId, med)); } catch (e) { return false; }
}

// =====================================================
// HISTORIAL DE ACTIVIDAD FÍSICA
// =====================================================
// No hay una tabla de "nivel de actividad histórico" — y no hace falta
// inventarla: cada meta del historial guarda el PAL con el que se calculó,
// y cada seguimiento semanal guarda los días planeados y asistidos. Juntos
// dan la película: qué nivel se le asumió y qué hizo de verdad.
function compActividadHTML(cliente, metas, segs) {
  const nivelActual = cliente.nivel_actividad
    ? `${String(cliente.nivel_actividad).replace('_', ' ')} · PAL ${cliente.pal_factor || PAL_MAP[cliente.nivel_actividad] || '—'}`
    : null;

  // ── Serie de PAL asumido, desde el historial de metas ──
  const conPal = (metas || []).filter(m => m.pal).slice().reverse();   // antiguo → nuevo
  const palHtml = conPal.length >= 2 ? `
    <div class="bg-slate-50 rounded-xl p-3 mb-3">
      <div class="text-xs font-bold text-slate-700 mb-2">Nivel de actividad asumido en cada cálculo de meta (PAL)</div>
      ${lineChart([{ label: 'PAL', color: '#8b5cf6', points: conPal.map(m => m.pal) }],
        conPal.map(m => m.fecha ? fmt.fechaCorta(m.fecha) : '—'),
        { escalaFija: true, yMin: 1.1, yMax: 2.0, height: 200, unidad: 'PAL', decimales: 2 })}
      <div class="text-[10px] text-slate-500 mt-1">1.2 sedentario · 1.375 ligero · 1.55 moderado · 1.725 activo · 1.9 muy activo (factores FAO/OMS). Un PAL que sube sin que suba la asistencia real es una meta inflada.</div>
    </div>` : '';

  // ── Asistencia semanal real, desde los seguimientos ──
  const conAsist = (segs || []).filter(s => s.dias_planeados)
    .slice().sort((a, b) => (a.semana || '').localeCompare(b.semana || ''));
  const ult12 = conAsist.slice(-12);
  const pctDe = (s) => Math.round(((s.dias_asistidos || 0) / s.dias_planeados) * 100);
  const promPct = ult12.length ? Math.round(ult12.reduce((acc, s) => acc + pctDe(s), 0) / ult12.length) : null;
  const totalPlan = ult12.reduce((acc, s) => acc + (s.dias_planeados || 0), 0);
  const totalAsis = ult12.reduce((acc, s) => acc + (s.dias_asistidos || 0), 0);

  const asistHtml = ult12.length ? `
    <div class="bg-slate-50 rounded-xl p-3 mb-3">
      <div class="text-xs font-bold text-slate-700 mb-2">Asistencia real a entreno · últimas ${ult12.length} semanas registradas</div>
      ${ult12.length >= 2 ? `
        ${lineChart([
          { label: 'Asistidos', color: '#10b981', points: ult12.map(s => s.dias_asistidos ?? null) },
          { label: 'Planeados', color: '#94a3b8', points: ult12.map(s => s.dias_planeados ?? null) },
        ], ult12.map(s => fmt.labelSemana(s.semana)), { escalaFija: true, yMin: 0, yMax: Math.max(7, ...ult12.map(s => s.dias_planeados || 0)) + 1, height: 210, unidad: 'días', decimales: 0, area: false })}
        <div class="mt-1">${legendDot('#10b981', 'Días asistidos')}${legendDot('#94a3b8', 'Días planeados')}</div>` : ''}
      <div class="grid grid-cols-12 gap-1 mt-3">
        ${ult12.map(s => {
          const p = pctDe(s);
          const col = p >= 85 ? '#10b981' : p >= 60 ? '#f59e0b' : '#ef4444';
          return `<div class="text-center rounded-lg py-1" style="background:${col}1A" title="${fmt.labelSemana(s.semana)} · ${s.dias_asistidos ?? 0}/${s.dias_planeados}">
            <div class="text-[8px] text-slate-400 font-bold">${fmt.labelSemana(s.semana).replace(/'.*/, '')}</div>
            <div class="text-[10px] font-bold" style="color:${col}">${p}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const complementarias = cliente.actividades_complementarias
    ? `<div class="text-sm text-slate-700 mt-2"><span class="font-semibold">Actividades complementarias:</span> ${escapeHtml(cliente.actividades_complementarias)}</div>`
    : '';

  return `
    <div class="card">
      <div class="sec-title">🏃 Historial de actividad física</div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div class="bg-white rounded-xl border border-slate-200 p-3">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Nivel declarado hoy</div>
          <div class="text-sm font-bold text-slate-900 mt-0.5 capitalize">${nivelActual || '—'}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">Es el que alimenta el cálculo de la meta</div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-3">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Meta de días/semana</div>
          <div class="text-xl font-bold text-slate-900 mt-0.5">${metaDiasEntreno(cliente) || '—'}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${(cliente.dias_entreno || []).join(' · ') || 'sin días fijos'}</div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-3">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Asistencia promedio</div>
          <div class="text-xl font-bold mt-0.5 ${promPct == null ? 'text-slate-400' : promPct >= 85 ? 'text-emerald-600' : promPct >= 60 ? 'text-amber-600' : 'text-red-500'}">${promPct != null ? promPct + '%' : '—'}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${totalPlan ? `${totalAsis}/${totalPlan} entrenos` : 'sin seguimientos'}</div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-3">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Lugar de entreno</div>
          <div class="text-sm font-bold text-slate-900 mt-0.5 capitalize">${(cliente.lugar_entreno || '—').replace('_', ' ')}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${cliente.antecedentes_deportivos ? 'con antecedentes deportivos' : 'sin antecedentes registrados'}</div>
        </div>
      </div>
      ${promPct != null && cliente.nivel_actividad ? compCoherenciaPal(cliente, promPct) : ''}
      ${palHtml}
      ${asistHtml}
      ${!palHtml && !asistHtml ? '<p class="text-xs text-slate-500">Todavía no hay historial: aparece cuando haya al menos dos metas calculadas o seguimientos semanales con días planeados.</p>' : ''}
      ${complementarias}
      ${cliente.antecedentes_deportivos ? `<div class="text-sm text-slate-600 mt-2">${campoColapsable('Antecedentes deportivos', cliente.antecedentes_deportivos, 'text-slate-600')}</div>` : ''}
    </div>`;
}

// Coherencia entre el nivel que se le asumió y lo que de verdad entrena. No
// es un juicio: es el aviso de que el TDEE puede estar inflado o corto.
function compCoherenciaPal(cliente, promPct) {
  const nivel = cliente.nivel_actividad;
  const pal = cliente.pal_factor || PAL_MAP[nivel];
  const altos = ['activo', 'muy_activo'];
  if (altos.includes(nivel) && promPct < 60) {
    return `<div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
      ⚠️ Está clasificado como <strong>${String(nivel).replace('_', ' ')}</strong> (PAL ${pal}) pero solo cumple el
      <strong>${promPct}%</strong> de sus entrenos. Si esa asistencia es la real, su TDEE está inflado y la meta le queda
      alta — revisa el nivel antes de recalcular.
    </div>`;
  }
  if (nivel === 'sedentario' && promPct >= 85) {
    return `<div class="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mb-3">
      ℹ️ Está clasificado como <strong>sedentario</strong> (PAL ${pal}) pero cumple el <strong>${promPct}%</strong> de
      sus entrenos. Puede que su TDEE esté subestimado y la meta le quede corta.
    </div>`;
  }
  return '';
}

// =====================================================
// CALCULADORA DE META NUTRICIONAL
// =====================================================
// La misma de la sección 5 de la ficha: mismo motor (calcMetaNutricional),
// mismos objetivos, mismos avisos, mismo redondeo direccional y las mismas
// bases científicas a la vista. Lo único distinto es que aquí los campos son
// propios (prefijo cmp-) para no pelear con el formulario de la ficha, y que
// al fijar la meta se guarda de una — no queda "pendiente de Guardar".
window.compCalcVivo = () => {
  const el = document.getElementById('cmp-live');
  if (!el) return;
  const i = compLeerInputs();
  if (i.faltan.length) {
    el.innerHTML = `<div class="text-xs text-slate-500">🧮 <strong>Cálculo en vivo:</strong> faltan datos → <strong class="text-amber-700">${i.faltan.join(' · ')}</strong>. Complétalos en la ficha del cliente (✎ Editar) y vuelve.</div>`;
    return;
  }
  const base = calcMetaNutricional({
    peso: i.peso, altura: i.estatura, edad: i.edad, sexo: i.sexo, grasa_pct: i.grasa,
    pal: i.pal, objetivo_pct: 0, proteina_g_kg: i.gkg, grasa_pct_kcal: i.fatPct,
  });
  if (!base) { el.innerHTML = '<div class="text-xs text-slate-500">Datos insuficientes.</div>'; return; }

  const gasto = `
    <div class="flex items-baseline gap-3 flex-wrap">
      <span class="text-xs font-bold text-slate-600 uppercase">🧮 En vivo</span>
      <span class="text-sm"><span class="text-slate-500">BMR</span> <strong>${base.bmr}</strong></span>
      <span class="text-sm"><span class="text-slate-500">TDEE (mantenimiento)</span> <strong class="text-emerald-700">${base.tdee} kcal</strong></span>
      <span class="text-xs text-slate-400">${base.metodo} · PAL ${i.pal}</span>
    </div>`;

  const objData = OBJETIVOS_KCAL.find(o => o.key === i.objetivoK);
  if (!objData) {
    el.innerHTML = gasto + '<div class="text-xs text-slate-500 mt-2">Ese TDEE es tu referencia: elige arriba el <strong>objetivo calórico</strong> y verás la meta, el reparto y el ritmo esperado.</div>';
    return;
  }

  const meta = calcMetaNutricional({
    peso: i.peso, altura: i.estatura, edad: i.edad, sexo: i.sexo, grasa_pct: i.grasa,
    pal: i.pal, objetivo_pct: objData.pct, proteina_g_kg: i.gkg, grasa_pct_kcal: i.fatPct,
  });
  window._compMetaCalc = { meta, objetivo: objData, peso: i.peso, grasa: i.grasa, gkg: i.gkg, pal: i.pal };

  const d = meta.detalle, rd = meta.redondeo;
  const c = _comp.cliente || {};
  const seg = (pct, color) => `<div style="width:${pct}%;background:${color}" class="h-full"></div>`;
  const fila = (nombre, dd, redond, color) => `
    <tr class="border-b border-slate-100">
      <td class="py-0.5 pr-2 font-semibold" style="color:${color}">${nombre}</td>
      <td class="py-0.5 pr-2 text-right text-slate-400">${dd.g} g</td>
      <td class="py-0.5 pr-2 font-bold text-right">${redond} g</td>
      <td class="py-0.5 pr-2 text-right text-slate-500">${dd.pct}%</td>
      <td class="py-0.5 text-right text-slate-500">${dd.gkg} g/kg</td>
    </tr>`;

  el.innerHTML = `
    ${gasto}
    <div class="mt-2 flex items-baseline gap-3 flex-wrap">
      <span class="text-lg font-bold text-emerald-700">Meta: ${rd.kcal} kcal</span>
      <span class="text-xs text-slate-400">(exacta: ${meta.kcal})</span>
      <span class="text-xs text-slate-500">= TDEE ${objData.pct >= 0 ? '+' : ''}${Math.round(objData.pct * 100)}% (${meta.kcal - meta.tdee >= 0 ? '+' : ''}${meta.kcal - meta.tdee} kcal/día)</span>
      <span class="text-xs font-semibold ${meta.cambioSemanalKg <= 0 ? 'text-blue-700' : 'text-orange-700'}">ritmo ≈ ${meta.cambioSemanalKg > 0 ? '+' : ''}${meta.cambioSemanalKg} kg/semana</span>
      ${c.meta_calorias ? `<span class="text-xs text-violet-700 bg-violet-50 rounded px-1.5 py-0.5">vs vigente (${c.meta_calorias} kcal): ${rd.kcal - c.meta_calorias >= 0 ? '+' : ''}${rd.kcal - c.meta_calorias} kcal</span>` : ''}
    </div>
    <div class="flex h-2.5 rounded-full overflow-hidden mt-2 mb-1" title="Reparto de las kcal">
      ${seg(d.proteina.pct, '#2563eb')}${seg(d.carbos.pct, '#d97706')}${seg(d.grasas.pct, '#dc2626')}
    </div>
    <table class="w-full text-sm">
      <tr class="text-[10px] uppercase text-slate-400"><td></td><td class="text-right pr-2">Exacto</td><td class="text-right pr-2">Cliente ve</td><td class="text-right pr-2">% kcal</td><td class="text-right">g/kg</td></tr>
      ${fila('Proteína', d.proteina, rd.proteina, '#2563eb')}
      ${fila('Carbos', d.carbos, rd.carbos, '#d97706')}
      ${fila('Grasas', d.grasas, rd.grasas, '#dc2626')}
    </table>
    <div class="text-[10px] text-slate-400 mt-0.5">"Cliente ve" = redondeo direccional (kcal a 50: ↓ en déficit / ↑ en superávit · proteína a 5 ↑ · grasa a 5 ↓ · carbo = resto). La precisión decimal es falsa: fórmula ±10%, etiquetado ±20%, registro ±10-20%.</div>
    <div class="text-[11px] text-emerald-800 bg-emerald-50/70 rounded-lg px-2 py-1 mt-1">💬 Para comunicárselo como rango: <strong>${rd.kcal - 50}–${rd.kcal + 50} kcal · mínimo ${rd.proteina} g de proteína</strong> · carbos ~${rd.carbos} g · grasas ~${rd.grasas} g</div>
    ${meta.avisos.map(x => `<div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1">⚠️ ${escapeHtml(x)}</div>`).join('')}`;
};

function compLeerInputs() {
  const c = _comp.cliente || {};
  const val = (id) => document.getElementById(id)?.value;
  const peso = Number(val('cmp-peso'));
  const grasaRaw = val('cmp-grasa');
  const faltan = [];
  if (!peso) faltan.push('peso');
  if (!c.estatura_cm) faltan.push('estatura (ficha, sección 3)');
  if (!c.fecha_nacimiento) faltan.push('fecha de nacimiento (ficha, sección 1)');
  if (!c.sexo) faltan.push('sexo (ficha, sección 1)');
  if (!c.pal_factor && !c.nivel_actividad) faltan.push('nivel de actividad (ficha, sección 4)');
  return {
    faltan, peso,
    estatura: c.estatura_cm,
    sexo: c.sexo,
    edad: c.fecha_nacimiento ? helpers.edadDe(c.fecha_nacimiento) : null,
    grasa: grasaRaw ? Number(grasaRaw) : null,
    pal: c.pal_factor || PAL_MAP[c.nivel_actividad] || null,
    objetivoK: val('cmp-objk') || '',
    gkg: val('cmp-gkg'),
    fatPct: val('cmp-fatpct'),
  };
}

// Fija la meta: la guarda en el cliente, deja el punto en el historial (con el
// peso, el objetivo y el PAL del cálculo) y pregunta si se la envía a su app.
// Pide confirmación mostrando el antes y el después: acá nada pasa solo.
window.compFijarMeta = async () => {
  const st = window._compMetaCalc;
  const c = _comp.cliente;
  if (!st || !c) { toast('Primero completa el cálculo'); return; }
  const r = st.meta.redondeo;
  const ok = confirm(
    `Cambiar la meta nutricional de ${c.nombre}\n\n` +
    `Vigente: ${c.meta_calorias ? `${c.meta_calorias} kcal · P${c.meta_proteina_g} C${c.meta_carbos_g} G${c.meta_grasas_g}` : 'sin meta'}\n` +
    `Nueva:   ${r.kcal} kcal · P${r.proteina} C${r.carbos} G${r.grasas}\n\n` +
    `Calculada con ${st.peso} kg${st.grasa != null ? ` y ${st.grasa}% grasa` : ''} · ${st.objetivo.label}\n\n` +
    `Esto cambia la meta en el CRM y la deja en el historial. ¿Confirmas?`
  );
  if (!ok) return;

  const { error } = await sb.from('clientes').update({
    meta_calorias: r.kcal,
    meta_proteina_g: r.proteina,
    meta_grasas_g: r.grasas,
    meta_carbos_g: r.carbos,
    meta_metodo: st.meta.metodo,
    meta_argumento: st.meta.argumento,
    meta_calculada_en: new Date().toISOString(),
    ...(st.objetivo ? { objetivo_calorico: st.objetivo.key } : {}),
    ...(st.gkg ? { proteina_g_kg: Number(st.gkg) } : {}),
    ...(st.meta.grasa_pct_kcal ? { grasa_pct_kcal: Number(st.meta.grasa_pct_kcal) } : {}),
  }).eq('id', c.id);
  if (error) { toast(error.message); return; }
  invalidarCache('clientes');

  await registrarMetaHistorial(c.id, {
    kcal: r.kcal, proteina_g: r.proteina, carbos_g: r.carbos, grasas_g: r.grasas,
    metodo: st.meta.metodo,
    argumento: st.meta.argumento,
    origen: 'calculo',
    nota: 'Calculada desde Composición del cliente',
    fecha: fmt.hoy(),
    peso_kg: st.peso,
    grasa_pct: st.grasa ?? null,
    objetivo: st.objetivo.label,
    objetivo_pct: st.objetivo.pct,
    proteina_g_kg: st.gkg ? Number(st.gkg) : null,
    grasa_pct_kcal: st.meta.grasa_pct_kcal ?? null,
    pal: st.pal || null,
    bmr: st.meta.bmr,
    tdee: st.meta.tdee,
    cambio_semanal_kg: st.meta.cambioSemanalKg,
  });

  toast('✓ Meta guardada y registrada en el historial');
  if (mtConfigured()) await enviarMetaMealtracker(c.id, { kcal: r.kcal, p: r.proteina, c: r.carbos, g: r.grasas });
  compCargar(c.id, { forzar: true });
};

function compCalculadoraHTML(cliente, meds, av) {
  const conPeso = (meds || []).filter(m => m.peso != null);
  const ult = conPeso[conPeso.length - 1] || null;
  const pesoPre = ult?.peso ?? '';
  const grasaPre = ult?.grasa_pct ?? '';

  return `
    <div class="card">
      <div class="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div class="sec-title !mb-0">🧮 Calculadora de meta nutricional</div>
          <div class="text-[11px] text-slate-400">La misma de la sección 5 de la ficha, con los datos de la última medición precargados.</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="verCliente('${cliente.id}')">📋 Abrir la ficha completa</button>
      </div>

      ${av && av.nivel === 'revisar' ? `<div class="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-3">⚠️ Hay un aviso abierto de meta desactualizada. Los campos ya vienen con la medición nueva.</div>` : ''}

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label>Peso para el cálculo (kg)</label>
          <input id="cmp-peso" type="number" step="0.1" min="30" max="250" value="${pesoPre}" oninput="compCalcVivo()">
          <p class="text-xs text-slate-500 mt-1">${ult ? `Precargado de la medición del ${fmt.fechaCorta(ult.fecha)}` : 'Sin mediciones: escríbelo a mano'}</p>
        </div>
        <div>
          <label>% grasa corporal (opcional)</label>
          <input id="cmp-grasa" type="number" step="0.1" min="3" max="60" value="${grasaPre}" oninput="compCalcVivo()">
          <p class="text-xs text-slate-500 mt-1">Con él uso Katch-McArdle (más preciso); sin él, Mifflin-St Jeor</p>
        </div>

        <div class="col-span-2 bg-white rounded-xl px-3 py-2 ring-1 ring-slate-100">${tablaGrasaHtml()}</div>

        <div>
          <label>Objetivo calórico</label>
          <select id="cmp-objk" onchange="compCalcVivo()">
            <option value="">—</option>
            ${OBJETIVOS_KCAL.map(o => `<option value="${o.key}" ${cliente.objetivo_calorico === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
          <p class="text-xs text-slate-500 mt-1">Elígelo VIENDO el TDEE del panel de abajo — cada % se aplica sobre ese gasto</p>
        </div>
        <div>
          <label>Proteína (g/kg de peso)</label>
          <input id="cmp-gkg" type="number" step="0.1" min="1" max="3.5" value="${cliente.proteina_g_kg ?? 1.8}" oninput="compCalcVivo()">
          <p class="text-xs text-slate-500 mt-1">Déficit 2.0-2.7 · recomp 1.8-2.2 · superávit 1.6-2.2</p>
        </div>
        <div>
          <label>Grasas (% de las kcal)</label>
          <input id="cmp-fatpct" type="number" step="1" min="15" max="40" value="${cliente.grasa_pct_kcal ?? 25}" oninput="compCalcVivo()">
          <p class="text-xs text-slate-500 mt-1">AMDR 20-35% · típico 25% · piso 0.5 g/kg</p>
        </div>
        <div class="flex items-end pb-1">
          <p class="text-xs text-slate-500">El carbohidrato no se configura: es el <strong>resto</strong> de las kcal tras proteína y grasa.</p>
        </div>

        <div class="col-span-2 bg-white rounded-xl p-3 ring-1 ring-emerald-200" id="cmp-live"></div>

        <div class="col-span-2 flex flex-wrap items-center gap-2">
          <button class="btn btn-primary" onclick="compFijarMeta()">📌 Fijar esta meta y guardarla</button>
          <span class="text-xs text-slate-500">Pide confirmación mostrando la meta vigente y la nueva. Después te ofrece enviarla a su app.</span>
        </div>

        <div class="col-span-2 bg-slate-50 rounded-xl px-3 py-2.5">
          <div class="text-xs font-bold text-slate-600 uppercase mb-1">Meta vigente en la ficha</div>
          ${cliente.meta_calorias ? `
            <div class="font-bold text-emerald-700">${cliente.meta_calorias} kcal · ${cliente.meta_proteina_g}g prote · ${cliente.meta_carbos_g}g carbos · ${cliente.meta_grasas_g}g grasas</div>
            <div class="text-xs text-slate-500 mt-1">${cliente.meta_metodo || ''}${cliente.meta_calculada_en ? ` · fijada el ${new Date(cliente.meta_calculada_en).toLocaleDateString('es-CO')}` : ''}</div>
            ${cliente.meta_argumento ? `<details class="mt-2"><summary class="text-xs text-emerald-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(cliente.meta_argumento)}</pre></details>` : ''}
          ` : '<div class="text-xs text-slate-500">Sin meta fijada.</div>'}
          <div class="text-xs mt-2 pt-2 border-t border-slate-200 ${cliente.meta_enviada_mt?.kcal ? 'text-violet-700' : 'text-slate-400'}">
            ${cliente.meta_enviada_mt?.kcal
              ? `📤 Último envío a su app: <strong>${cliente.meta_enviada_mt.kcal} kcal</strong> · P${cliente.meta_enviada_mt.p} C${cliente.meta_enviada_mt.c} G${cliente.meta_enviada_mt.g}${cliente.meta_enviada_mt.at ? ` · ${new Date(cliente.meta_enviada_mt.at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`
              : '📤 Aún no le has enviado ninguna meta a su app.'}
          </div>
        </div>

        <details class="col-span-2 bg-emerald-50/60 rounded-xl px-3 py-2 ring-1 ring-emerald-100">
          <summary class="text-xs font-bold text-emerald-800 cursor-pointer">📚 Guía de rangos por objetivo (respaldo científico)</summary>
          <div class="mt-2 space-y-3 text-xs">
            ${[['Proteína (g por kg de peso corporal)', GUIA_MACROS.proteina], ['Grasa (% de las kcal)', GUIA_MACROS.grasa], ['Carbohidrato (referencia, no se configura)', GUIA_MACROS.carbo]].map(([titulo, filas]) => `
              <div>
                <div class="font-bold text-slate-700 mb-1">${titulo}</div>
                <table class="w-full">
                  ${filas.map(([caso, rango, nota]) => `<tr class="border-b border-emerald-100/70"><td class="py-1 pr-2 text-slate-600">${caso}</td><td class="py-1 pr-2 font-semibold text-emerald-800 whitespace-nowrap">${rango}</td><td class="py-1 text-slate-500">${nota}</td></tr>`).join('')}
                </table>
              </div>`).join('')}
          </div>
        </details>

        <div class="col-span-2 bg-white rounded-xl px-3 py-2.5 ring-1 ring-emerald-100">
          <div class="text-xs font-bold text-emerald-800 mb-2">🔬 Bases científicas del cálculo</div>
          <div class="space-y-2">
            ${FORMULAS_META.map(([nombre, explicacion, formula]) => `
              <div class="text-xs border-b border-emerald-50 pb-2">
                <div class="font-bold text-slate-700">${nombre}</div>
                <div class="text-slate-600 mt-0.5">${explicacion}</div>
                <div class="font-mono text-[11px] text-emerald-700 mt-0.5 bg-emerald-50/70 rounded px-1.5 py-0.5 inline-block">${formula}</div>
              </div>`).join('')}
          </div>
          <details class="mt-2">
            <summary class="text-xs text-emerald-700 cursor-pointer font-semibold">📖 Referencias bibliográficas completas (${BIBLIOGRAFIA_META.length})</summary>
            <ol class="mt-1.5 space-y-1 list-decimal list-inside">
              ${BIBLIOGRAFIA_META.map(ref => `<li class="text-[11px] text-slate-500">${ref}</li>`).join('')}
            </ol>
          </details>
        </div>
      </div>
    </div>`;
}

// =====================================================
// CARGA Y VISTA
// =====================================================
async function compCargar(clienteId, { forzar = false } = {}) {
  const otroCliente = _comp.clienteId !== clienteId;
  _comp.cargando = true; _comp.error = null; _comp.clienteId = clienteId;
  // Si es el MISMO cliente (un 🔄 Actualizar, o volver de guardar una
  // medición) no se borra la pantalla: se deja lo que hay y se cambia por
  // debajo cuando llegan los datos. Vaciar para volver a llenar en 200 ms es
  // justo lo que hacía sentir lento el CRM.
  if (otroCliente) { _comp.cliente = null; _comp.meds = []; _comp.metas = null; _comp.segs = []; rerenderView(); }
  try {
    // 🔄 Actualizar tiene que traer datos frescos de verdad, no lo cacheado.
    if (forzar) invalidarCache('clientes', 'mediciones', 'metas', 'seguimientos');
    const [cliente, meds, metas, segs] = await Promise.all([
      db.clientes.get(clienteId),
      db.mediciones.listCliente(clienteId),
      db.metas.listCliente(clienteId),
      db.seguimientos.listCliente(clienteId),
    ]);
    if (!cliente) throw new Error('Cliente no encontrado');
    _comp.cliente = cliente;
    _comp.meds = meds || [];
    _comp.metas = metas;              // null = falta la migración de metas_historial
    _comp.segs = segs || [];
  } catch (e) {
    _comp.error = e.message || String(e);
    _comp.cliente = null;
  }
  _comp.cargando = false;
  rerenderView();
}

window.compElegirCliente = (id) => { _comp.tab = 'panorama'; compCargar(id); };
window.compTab = (t) => { _comp.tab = t; rerenderView(); setTimeout(() => { if (t === 'calculadora') compCalcVivo(); }, 0); };
window.compRefrescar = () => compCargar(_comp.clienteId, { forzar: true });

const COMP_TABS = [
  ['panorama',    '🧭 Panorama'],
  ['corporal',    '⚖️ Peso y medidas'],
  ['metas',       '🎯 Historial de metas'],
  ['actividad',   '🏃 Actividad física'],
  ['calculadora', '🧮 Calculadora de meta'],
];

routes.composicion = async () => {
  const clientes = (await db.clientes.list()).filter(c => c.estado !== 'finalizado');

  if (!_comp.clienteId && clientes.length) {
    _comp.clienteId = clientes[0].id;
    compCargar(clientes[0].id);
    cargando('Cargando composición…');
    return;
  }
  if (!clientes.length) { view.innerHTML = '<div class="card">Todavía no hay clientes activos.</div>'; return; }

  const cabecera = (nombre) => `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900">🧬 Composición · ${escapeHtml(nombre || 'cliente')}</h2>
        <p class="text-xs text-slate-500">Peso, medidas, metas y actividad, en una sola película. El CRM avisa cuando la meta se queda vieja — cambiarla la cambias tú.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select class="text-sm !w-auto min-w-[200px]" onchange="compElegirCliente(this.value)">
          ${clientes.map(c => `<option value="${c.id}" ${c.id === _comp.clienteId ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="compRefrescar()">🔄 Actualizar</button>
        <button class="btn btn-primary btn-sm" onclick="nuevaMedicion('${_comp.clienteId}')">📏 Nueva medición</button>
        ${_comp.clienteId ? `<button class="btn btn-secondary btn-sm" onclick="verNutricionCliente('${_comp.clienteId}')">🥗 Nutrición</button>` : ''}
      </div>
    </div>`;

  if (_comp.cargando && !_comp.cliente) {
    view.innerHTML = `${cabecera('')}<div class="card"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-card" style="margin:.9rem 0"></div><div class="sk sk-line" style="width:65%"></div></div>`;
    return;
  }
  if (_comp.error) {
    view.innerHTML = `${cabecera('')}<div class="card border-l-4 border-red-400"><div class="font-bold text-slate-800 mb-1">No pude cargar</div><p class="text-sm text-slate-600">${escapeHtml(_comp.error)}</p></div>`;
    return;
  }
  const c = _comp.cliente;
  if (!c) { view.innerHTML = `${cabecera('')}<div class="card">Sin datos.</div>`; return; }

  const meds = _comp.meds || [];
  const metas = _comp.metas;
  const avisoRaw = compEvaluarMeta(c, meds, metas);
  const silenciado = avisoRaw && avisoRaw.nivel === 'revisar' && compSilenciado(c.id, avisoRaw.medicion);
  const aviso = silenciado ? { ...avisoRaw, nivel: 'ok', titulo: 'Aviso silenciado por ti', detalle: `Marcaste como revisada la medición del ${fmt.fechaCorta(avisoRaw.medicion.fecha)}. Si entra una medición nueva, el aviso vuelve solo.` } : avisoRaw;

  const tabs = COMP_TABS.map(([k, l]) => {
    const alerta = k === 'panorama' && aviso && aviso.nivel === 'revisar';
    return `<button class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${_comp.tab === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}" onclick="compTab('${k}')">${l}${alerta ? ' <span class="tag tag-yellow ml-1">1</span>' : ''}</button>`;
  }).join('');

  // ── Panorama: el aviso arriba y las tres películas resumidas debajo ──
  const conPeso = meds.filter(m => m.peso != null);
  const ultima = conPeso[conPeso.length - 1] || null;
  const primera = conPeso[0] || null;
  const dTotal = primera && ultima && primera !== ultima ? +(ultima.peso - primera.peso).toFixed(1) : null;
  const comp = ultima ? calcComposicionCorporal({
    peso: ultima.peso, grasa_pct: ultima.grasa_pct, edad: helpers.edadDe(c.fecha_nacimiento),
    sexo: c.sexo, altura_cm: c.estatura_cm,
  }) : null;
  const nMetas = Array.isArray(metas) ? metas.length : 0;

  const panorama = `
    ${compAvisoHTML(aviso, c.id)}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 my-4">
      <div class="bg-white rounded-xl border border-slate-200 p-3">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Peso actual</div>
        <div class="text-xl font-bold text-slate-900 mt-0.5">${ultima ? `${ultima.peso} kg` : '—'}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">${ultima ? fmt.fechaCorta(ultima.fecha) : 'sin mediciones'}${dTotal != null ? ` · ${dTotal > 0 ? '+' : ''}${dTotal} kg desde el inicio` : ''}</div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">% de grasa</div>
        <div class="text-xl font-bold text-slate-900 mt-0.5">${ultima?.grasa_pct != null ? `${ultima.grasa_pct}%` : '—'}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">${comp?.masa_magra_kg != null ? `${comp.masa_magra_kg} kg de masa magra` : 'sin dato de grasa'}</div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Meta vigente</div>
        <div class="text-xl font-bold text-emerald-700 mt-0.5">${c.meta_calorias ? `${c.meta_calorias}` : '—'}<span class="text-xs font-normal text-slate-400"> kcal</span></div>
        <div class="text-[11px] text-slate-500 mt-0.5">${c.meta_calorias ? `P${c.meta_proteina_g} C${c.meta_carbos_g} G${c.meta_grasas_g}` : 'sin meta calculada'}</div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Historial</div>
        <div class="text-xl font-bold text-slate-900 mt-0.5">${meds.length} <span class="text-xs font-normal text-slate-400">medición(es)</span></div>
        <div class="text-[11px] text-slate-500 mt-0.5">${metas === null ? 'falta la migración de metas' : `${nMetas} meta(s) registradas`}</div>
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      <div class="card">
        <div class="flex items-center justify-between">
          <div class="sec-title !mb-0">⚖️ Peso y composición</div>
          <button class="btn btn-ghost text-xs" onclick="compTab('corporal')">ver todo →</button>
        </div>
        <div class="mt-2">${historialCorporalHTML(c, meds, { compacto: true })}</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between">
          <div class="sec-title !mb-0">🎯 Metas nutricionales</div>
          <button class="btn btn-ghost text-xs" onclick="compTab('metas')">ver todo →</button>
        </div>
        <div class="mt-2">${historialMetasHTML(c, metas, { max: 4, compacto: true })}</div>
      </div>
    </div>`;

  view.innerHTML = `${cabecera(c.nombre)}
    <div class="bg-slate-100 rounded-xl p-1 flex gap-1 mb-4 overflow-x-auto">${tabs}</div>
    ${_comp.tab === 'panorama' ? panorama
      : _comp.tab === 'corporal' ? `
        <div class="card">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <div class="sec-title !mb-0">⚖️ Historial de peso, % de grasa y medidas</div>
              <div class="text-[11px] text-slate-400">Cada registro con su delta contra el anterior y contra el primero. Magra, SMM y grasa en kg son estimaciones.</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="nuevaMedicion('${c.id}')">📏 Nueva medición</button>
          </div>
          ${historialCorporalHTML(c, meds, { editable: true })}
        </div>`
      : _comp.tab === 'metas' ? `
        <div class="card">
          <div class="sec-title">🎯 Historial de metas nutricionales</div>
          <div class="text-[11px] text-slate-400 mb-2 -mt-1">Qué meta rigió, desde cuándo, con qué peso y objetivo se calculó, y si llegó a su app.</div>
          ${historialMetasHTML(c, metas, { max: 30 })}
        </div>`
      : _comp.tab === 'actividad' ? compActividadHTML(c, metas, _comp.segs)
      : compCalculadoraHTML(c, meds, aviso)}`;

  if (_comp.tab === 'calculadora') setTimeout(compCalcVivo, 0);
};

// =====================================================
// REGISTRO EN EL CRM
// =====================================================
// Mismo truco que Nutrición y Entrenamiento: se clona un botón existente, así
// este archivo no obliga a tocar el HTML del shell más allá de cargarlo.
(function addComposicionNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="composicion"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'composicion';
    btn.classList.remove('active');
    btn.textContent = '🧬 Composición';
    // Justo después de Nutrición: las dos caras del mismo cliente, juntas.
    const nutricion = document.querySelector('.nav-item[data-view="nutricion"]');
    const negocio = document.querySelector('.nav-item[data-view="negocio"]');
    anchor.parentNode.insertBefore(btn, (nutricion && nutricion.nextSibling) || negocio || null);
    btn.addEventListener('click', () => navigate('composicion'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();

// Atajo desde cualquier lado (ficha del cliente, sección de nutrición).
window.verComposicionCliente = (clienteId) => {
  _comp.tab = 'panorama';
  closeModal();
  navigate('composicion');
  compCargar(clienteId);
};
