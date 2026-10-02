// =====================================================
// CRM EntrenaConMétodo · BANDEJA DEL COACH
// =====================================================
// Todo lo que tus clientes hacen en la app, en UN sitio y ordenado, para
// saber cómo va el día a día sin abrir ficha por ficha:
//
//   1. NECESITA TU ATENCIÓN — lo que pide que hagas algo: una nota que te
//      dejaron, un entreno saltado, una medida nueva, alguien que lleva días
//      sin registrar, proteína corta la semana entera, un ejercicio que no se
//      mueve, tres sesiones seguidas al límite. Cada cosa se marca «Listo» y
//      desaparece.
//   2. PARA FELICITAR — récords, semanas cumplidas. Lo que se le dice.
//   3. DÍA A DÍA — los últimos 7 días, cliente por cliente: qué entrenó, cómo
//      se sintió, cuánto comió frente a su meta, su cardio, sus medidas, sus
//      notas. Una fila por cliente y día; tocarla abre su ficha.
//
// Todo sale de lo que ya se guarda (sesiones, series, notas, mediciones,
// actividades, y la comida del mealtracker). Nada se escribe salvo marcar
// una nota como leída.
//
// ─── CÓMO SE INSTALA ────────────────────────────────────────────────
// Como entrenamiento.js: se auto-registra (ruta + botón en la barra). En
// index.html, una línea DESPUÉS de entrenamiento.js:
//     <script src="/bandeja.js"></script>
// Necesita carga/migracion-bandeja.sql para las notas; sin ella funciona con
// todo lo demás.
// =====================================================

const BDJ_DIAS_VISTA = 7;          // el «día a día» enseña una semana
const BDJ_DIAS_DATOS = 14;         // lo que se lee (para comparar semanas)
const BDJ_DIAS_SERIES = 56;        // para el estancamiento: ocho semanas
const BDJ_CLAVE_VISTOS = 'bdj:vistos:v1';

const _bdj = { filtro: 'todo', datos: null, cargando: null, cargadoEn: 0 };

// ─── Utilidades de fecha (en local, como todo el CRM) ────────────────
function bdjSumarDias(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function bdjDiasEntre(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
const bdjNum = (n, dec = 0) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: dec });
const bdjFecha = (ymd) => new Date(ymd + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

// Lo que te escriben va primero; después lo que pide actuar; al final los
// patrones que conviene mirar con calma.
// Los eventos del calendario que el cliente REGISTRA (tipo del evento → cómo
// se cuenta en la bandeja). `medicion` es el tipo viejo, antes de separarlos.
const BDJ_REGISTRO = {
  medidas:  { icono: '📏', titulo: 'Hizo su medición corporal', corto: 'Medición corporal', detalle: 'pídele los números si no te los mandó' },
  medicion: { icono: '📏', titulo: 'Hizo su medición', corto: 'Medición', detalle: null },
  peso:     { icono: '⚖️', titulo: 'Se pesó', corto: 'Peso', detalle: null },
  fotos:    { icono: '📸', titulo: 'Envió su registro fotográfico', corto: 'Fotos', detalle: 'míralas en tu WhatsApp' },
};

const BDJ_PRIORIDAD = { nota: 0, cierre: 0, salto: 1, medida: 1, rpe: 2, sinentreno: 2, sincomida: 3, prot: 3, estanc: 4 };

// ═════════════════════════════════════════════════════════════════════
// LA LÓGICA  ·  pura: recibe datos, devuelve la bandeja. Sin DOM ni red.
// (pruebas/bandeja.mjs la prueba tal cual)
// ═════════════════════════════════════════════════════════════════════
//
// d = { hoy, clientes, fases, rutinas, sesiones, series, notas, mediciones,
//       actividades, comida: { [cliente_id]: { last_active, recent_days } },
//       lecturas: (sesiones, series) => entLecturasDatos(...) }
function bdjArmar(d) {
  const hoy = d.hoy;
  const desdeVista = bdjSumarDias(hoy, -(BDJ_DIAS_VISTA - 1));
  const clientes = (d.clientes || []).filter(c => (c.estado || 'activo') === 'activo');
  const nombreDe = Object.fromEntries((d.clientes || []).map(c => [c.id, c.nombre]));
  const rutinaDe = Object.fromEntries((d.rutinas || []).map(r => [r.id, r.nombre]));
  const deCliente = (lista, id) => (lista || []).filter(x => x.cliente_id === id);

  const atencion = [];
  const felicitar = [];
  const add = (lista, item) => lista.push({ ...item, cliente: nombreDe[item.cliente_id] || 'Cliente' });

  // Sesiones que cuentan: las del cliente (lo importado de Trainerize no es
  // actividad nueva).
  const sesiones = (d.sesiones || []).filter(s => (s.origen || 'cliente') === 'cliente');

  // ── 1. Notas que te dejó en la app ──
  (d.notas || []).forEach(n => {
    if (n.leida_en) return;
    add(atencion, {
      id: `nota:${n.id}`, tipo: 'nota', cliente_id: n.cliente_id, fecha: n.fecha || String(n.created_at || '').slice(0, 10),
      icono: '💬', titulo: `Te escribió${n.rutina_id && rutinaDe[n.rutina_id] ? ` sobre ${rutinaDe[n.rutina_id]}` : ''}`,
      detalle: n.texto, nota_id: n.id, ejercicio: n.ejercicio_nombre || null,
    });
  });

  sesiones.forEach(s => {
    if (s.fecha < bdjSumarDias(hoy, -6)) return;
    const rutina = rutinaDe[s.rutina_id] || 'su rutina';
    // ── 2. Entreno saltado ──
    if (s.estado === 'saltada') {
      add(atencion, {
        id: `salto:${s.id}`, tipo: 'salto', cliente_id: s.cliente_id, fecha: s.fecha,
        icono: '✕', titulo: `No pudo entrenar ${rutina}`,
        detalle: s.notas_cliente || 'No dejó motivo.',
      });
      return;
    }
    // ── 3. Nota al cerrar un entreno («me molestó el hombro») ──
    if (s.estado === 'completada' && s.notas_cliente && String(s.notas_cliente).trim()) {
      add(atencion, {
        id: `cierre:${s.id}`, tipo: 'nota', cliente_id: s.cliente_id, fecha: s.fecha,
        icono: '💬', titulo: `Al terminar ${rutina} te dijo`, detalle: s.notas_cliente,
      });
    }
    // ── Récords: para felicitar ──
    if (Array.isArray(s.records) && s.records.length) {
      add(felicitar, {
        id: `record:${s.id}`, tipo: 'record', cliente_id: s.cliente_id, fecha: s.fecha, icono: '🏆',
        titulo: s.records.length === 1 ? 'Batió un récord' : `Batió ${s.records.length} récords`,
        detalle: s.records.map(r => `${r.nombre || 'Ejercicio'} ${r.peso ? `${bdjNum(r.peso, 1)} ${r.unidad || 'kg'} × ${r.reps}` : `${r.reps} reps`}`).join(' · '),
      });
    }
  });

  // ── 4. Medida nueva que registró él ──
  const medsPorCliente = {};
  (d.mediciones || []).forEach(m => { (medsPorCliente[m.cliente_id] ||= []).push(m); });
  Object.values(medsPorCliente).forEach(l => l.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))));
  (d.mediciones || []).forEach(m => {
    if (m.origen !== 'cliente' || m.fecha < bdjSumarDias(hoy, -13)) return;
    const l = medsPorCliente[m.cliente_id];
    const prev = l[l.indexOf(m) - 1] || null;
    const dif = (a, b, u) => (a != null && b != null ? ` (${Number(a) - Number(b) > 0 ? '+' : ''}${bdjNum(Number(a) - Number(b), 1)} ${u})` : '');
    add(atencion, {
      id: `medida:${m.id}`, tipo: 'medida', cliente_id: m.cliente_id, fecha: m.fecha, icono: '📏',
      titulo: 'Registró su medida',
      detalle: [
        m.peso != null ? `${bdjNum(m.peso, 1)} kg${dif(m.peso, prev && prev.peso, 'kg')}` : null,
        m.grasa_pct != null ? `${bdjNum(m.grasa_pct, 1)}% grasa${dif(m.grasa_pct, prev && prev.grasa_pct, 'pts')}` : null,
      ].filter(Boolean).join(' · ') + ' — mira en Composición si la meta sigue vigente.',
    });
  });

  // ── 4b. Lo que le pusiste en el calendario y marcó hecho: medición
  //        corporal, peso, registro fotográfico ──
  (d.registros || []).forEach(r => {
    const tipo = r.eventos?.tipo;
    if (!BDJ_REGISTRO[tipo] || r.estado === 'saltado' || r.fecha < bdjSumarDias(hoy, -13)) return;
    const q = BDJ_REGISTRO[tipo];
    add(atencion, {
      id: `registro:${r.id}`, tipo: 'medida', cliente_id: r.cliente_id, fecha: r.fecha, icono: q.icono,
      titulo: q.titulo,
      detalle: [r.valor != null && tipo === 'peso' ? `${bdjNum(r.valor, 1)} kg` : null, r.nota ? `«${r.nota}»` : null, q.detalle]
        .filter(Boolean).join(' · '),
    });
  });

  // ── Por cliente: lo que no es un evento suelto sino un patrón ──
  const semana = hoy.slice(0, 4) + '-' + bdjSemanaNum(hoy);
  clientes.forEach(c => {
    const suyas = deCliente(sesiones, c.id);
    const completadas = suyas.filter(s => s.estado === 'completada').sort((a, b) => b.fecha.localeCompare(a.fecha));
    const fase = (d.fases || []).find(f => f.cliente_id === c.id);

    // 5. Tres seguidas al límite
    const ult3 = completadas.slice(0, 3);
    if (ult3.length === 3 && ult3.every(s => Number(s.rpe) >= 9)) {
      add(atencion, {
        id: `rpe:${c.id}:${ult3[0].id}`, tipo: 'entreno', cliente_id: c.id, fecha: ult3[0].fecha, icono: '🔥',
        titulo: 'Tres entrenos seguidos al límite', detalle: `Esfuerzo ${ult3.map(s => s.rpe).join(', ')}/10. Sostenido, deja de ser intensidad y pasa a ser fatiga.`,
      });
    }

    // 6. Tiene rutina enviada y no entrenó en 7 días
    if (fase) {
      const ultima = completadas[0] ? completadas[0].fecha : null;
      const dias = ultima ? bdjDiasEntre(ultima, hoy) : null;
      if (dias == null ? (fase.fecha_inicio && bdjDiasEntre(fase.fecha_inicio, hoy) >= 7) : dias >= 7) {
        add(atencion, {
          id: `sinentreno:${c.id}:${semana}`, tipo: 'entreno', cliente_id: c.id, fecha: hoy, icono: '⏸',
          titulo: dias == null ? 'Aún no completa ningún entreno en la app' : `Lleva ${dias} días sin registrar un entreno`,
          detalle: 'Puede que entrene y no lo marque, o que no esté entrenando. Vale preguntar antes de asumir.',
        });
      }
      // Semana cumplida: para felicitar
      const lunes = bdjLunes(hoy);
      const estaSemana = completadas.filter(s => s.fecha >= lunes).length;
      const plan = (fase.dias_semana || []).length;
      if (plan > 0 && estaSemana >= plan) {
        add(felicitar, {
          id: `semana:${c.id}:${semana}`, tipo: 'entreno', cliente_id: c.id, fecha: hoy, icono: '✅',
          titulo: 'Semana de entreno cumplida', detalle: `${estaSemana} de ${plan} días.`,
        });
      }
    }

    // 7. Estancado (misma lectura que la ficha de Entrenamiento)
    if (d.lecturas) {
      const sesCli = deCliente(d.sesiones, c.id);
      const idsCli = new Set(sesCli.map(s => s.id));
      const serCli = (d.series || []).filter(s => idsCli.has(s.sesion_id));
      if (serCli.length) {
        const lec = d.lecturas(sesCli, serCli);
        const e = lec.estancados && lec.estancados[0];
        if (e) {
          add(atencion, {
            id: `estanc:${c.id}:${e.id}:${e.desde}`, tipo: 'entreno', cliente_id: c.id, fecha: hoy, icono: '🟰',
            titulo: `${e.nombre}: ${e.diasEnMax} días sin superar su mejor marca`,
            detalle: `${e.marca} desde el ${bdjFecha(e.desde)}, en ${e.sesionesDesde} sesiones.${lec.estancados.length > 1 ? ` Hay ${lec.estancados.length} ejercicios así.` : ''}`,
          });
        }
      }
    }

    // 8 y 9. Comida: días sin registrar y proteína de la semana
    const com = d.comida && d.comida[c.id];
    if (com) {
      if (com.last_active) {
        const sin = bdjDiasEntre(com.last_active, hoy);
        if (sin >= 3) {
          add(atencion, {
            id: `sincomida:${c.id}:${com.last_active}`, tipo: 'comida', cliente_id: c.id, fecha: hoy, icono: '🍽',
            titulo: `Lleva ${sin} días sin registrar comida`, detalle: `Último registro: ${bdjFecha(com.last_active)}.`,
          });
        }
      }
      const semanaCom = Object.entries(com.recent_days || {})
        .filter(([f]) => f >= bdjSumarDias(hoy, -6) && f < hoy)   // hoy aún no termina
        .map(([, v]) => v);
      const conMetaP = semanaCom.filter(v => v.goal_p > 0);
      if (conMetaP.length >= 3) {
        const pct = conMetaP.reduce((a, v) => a + v.p / v.goal_p, 0) / conMetaP.length;
        if (pct < 0.8) {
          add(atencion, {
            id: `prot:${c.id}:${semana}`, tipo: 'comida', cliente_id: c.id, fecha: hoy, icono: '🥩',
            titulo: `Proteína al ${Math.round(pct * 100)}% de su meta esta semana`,
            detalle: `Promedio de ${conMetaP.length} días registrados.`,
          });
        }
        const enMeta = semanaCom.filter(v => v.goal_kcal > 0 && Math.abs(v.kcal - v.goal_kcal) <= v.goal_kcal * 0.1).length;
        if (enMeta >= 5) {
          add(felicitar, {
            id: `metas:${c.id}:${semana}`, tipo: 'comida', cliente_id: c.id, fecha: hoy, icono: '🎯',
            titulo: `Cumplió su meta de calorías ${enMeta} de 7 días`, detalle: 'Constancia en la cocina: eso también se le dice.',
          });
        }
      }
    }
  });

  // ── DÍA A DÍA ── una fila por cliente y día, con todo lo que hizo
  const filas = {};   // fecha → cliente_id → { chips }
  const fila = (fecha, cid) => ((filas[fecha] ||= {})[cid] ||= { cliente_id: cid, cliente: nombreDe[cid] || 'Cliente', chips: [] });
  const enVista = (f) => f && f >= desdeVista && f <= hoy;

  sesiones.forEach(s => {
    if (!enVista(s.fecha)) return;
    const rutina = rutinaDe[s.rutina_id] || 'Entreno';
    const min = s.duracion_seg ? Math.round(s.duracion_seg / 60) : null;
    if (s.estado === 'completada') {
      fila(s.fecha, s.cliente_id).chips.push({
        tipo: 'entreno', tono: 'ok', icono: '🏋️',
        texto: `${rutina} ✓${min ? ` · ${min} min` : ''}${s.rpe ? ` · esfuerzo ${s.rpe}/10` : ''}${s.cerrada_auto ? ' · no pulsó «Terminar»' : ''}`,
      });
      if (Array.isArray(s.records) && s.records.length) {
        fila(s.fecha, s.cliente_id).chips.push({ tipo: 'entreno', tono: 'ok', icono: '🏆', texto: `${s.records.length} récord${s.records.length > 1 ? 's' : ''}` });
      }
    } else if (s.estado === 'saltada') {
      fila(s.fecha, s.cliente_id).chips.push({ tipo: 'entreno', tono: 'ojo', icono: '✕', texto: `${rutina}: no pudo` });
    } else {
      fila(s.fecha, s.cliente_id).chips.push({ tipo: 'entreno', tono: 'neutro', icono: '◐', texto: `${rutina} a medias` });
    }
    if (s.notas_cliente) fila(s.fecha, s.cliente_id).chips.push({ tipo: 'nota', tono: 'neutro', icono: '💬', texto: `«${s.notas_cliente}»` });
  });
  (d.actividades || []).forEach(a => {
    if (!enVista(a.fecha)) return;
    fila(a.fecha, a.cliente_id).chips.push({
      tipo: 'entreno', tono: 'neutro', icono: '🏃',
      texto: `${a.titulo || a.tipo}${a.duracion_min ? ` · ${a.duracion_min} min` : ''}${a.distancia_km ? ` · ${bdjNum(a.distancia_km, 1)} km` : ''}`,
    });
  });
  (d.mediciones || []).forEach(m => {
    if (!enVista(m.fecha)) return;
    fila(m.fecha, m.cliente_id).chips.push({
      tipo: 'medida', tono: 'neutro', icono: '📏',
      texto: [m.peso != null ? `${bdjNum(m.peso, 1)} kg` : null, m.grasa_pct != null ? `${bdjNum(m.grasa_pct, 1)}%` : null].filter(Boolean).join(' · ')
        + (m.origen === 'cliente' ? ' (desde su app)' : ''),
    });
  });
  (d.registros || []).forEach(r => {
    const q = BDJ_REGISTRO[r.eventos?.tipo];
    if (!q || r.estado === 'saltado' || !enVista(r.fecha)) return;
    fila(r.fecha, r.cliente_id).chips.push({ tipo: 'medida', tono: 'neutro', icono: q.icono, texto: q.corto + (r.valor != null && r.eventos.tipo === 'peso' ? ` · ${bdjNum(r.valor, 1)} kg` : '') });
  });
  (d.notas || []).forEach(n => {
    const f = n.fecha || String(n.created_at || '').slice(0, 10);
    if (!enVista(f)) return;
    fila(f, n.cliente_id).chips.push({ tipo: 'nota', tono: 'neutro', icono: '💬', texto: `«${n.texto}»${n.ejercicio_nombre ? ` — ${n.ejercicio_nombre}` : ''}` });
  });
  clientes.forEach(c => {
    const com = d.comida && d.comida[c.id];
    if (!com) return;
    Object.entries(com.recent_days || {}).forEach(([f, v]) => {
      if (!enVista(f) || !(v.kcal > 0)) return;
      const kcalOk = v.goal_kcal > 0 && Math.abs(v.kcal - v.goal_kcal) <= v.goal_kcal * 0.1;
      const pBaja = v.goal_p > 0 && v.p < v.goal_p * 0.8;
      fila(f, c.id).chips.push({
        tipo: 'comida', tono: f === hoy ? 'neutro' : pBaja ? 'ojo' : kcalOk ? 'ok' : 'neutro', icono: '🍽',
        texto: `${bdjNum(v.kcal)}${v.goal_kcal ? ` / ${bdjNum(v.goal_kcal)}` : ''} kcal · proteína ${bdjNum(v.p)}${v.goal_p ? ` / ${bdjNum(v.goal_p)}` : ''} g${f === hoy ? ' (en curso)' : ''}`,
      });
    });
  });

  const orden = (a, b) => String(b.fecha).localeCompare(String(a.fecha)) || a.cliente.localeCompare(b.cliente);
  const prio = (a) => BDJ_PRIORIDAD[a.id.split(':')[0]] ?? 5;
  atencion.sort((a, b) => prio(a) - prio(b) || orden(a, b));
  felicitar.sort(orden);
  const dias = Object.keys(filas).sort().reverse().map(fecha => ({
    fecha,
    filas: Object.values(filas[fecha]).sort((a, b) => a.cliente.localeCompare(b.cliente)),
  }));
  return { atencion, felicitar, dias };
}

function bdjLunes(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return bdjSumarDias(ymd, -((t.getDay() + 6) % 7));
}
function bdjSemanaNum(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return 'W' + String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7)).padStart(2, '0');
}

// Lo que ya marcaste «Listo». En el navegador (las notas, además, en la base).
function bdjVistos() {
  try { return new Set(JSON.parse(localStorage.getItem(BDJ_CLAVE_VISTOS) || '[]')); } catch (e) { return new Set(); }
}
function bdjMarcarVisto(id) {
  const v = bdjVistos(); v.add(id);
  try { localStorage.setItem(BDJ_CLAVE_VISTOS, JSON.stringify([...v].slice(-800))); } catch (e) {}
}

// ═════════════════════════════════════════════════════════════════════
// LOS DATOS
// ═════════════════════════════════════════════════════════════════════
async function bdjCargar(forzar = false) {
  if (!forzar && _bdj.datos && Date.now() - _bdj.cargadoEn < 60000) return _bdj.datos;
  if (_bdj.cargando) return _bdj.cargando;
  _bdj.cargando = (async () => {
    const hoy = fmt.hoy();
    const desde = bdjSumarDias(hoy, -(BDJ_DIAS_DATOS - 1));
    const desdeSeries = bdjSumarDias(hoy, -BDJ_DIAS_SERIES);
    const avisos = [];
    // Cada lectura por su cuenta: si falta una tabla (migración sin correr),
    // la bandeja sale con lo demás y dice qué falta.
    const leer = async (nombre, q) => {
      try { const { data, error } = await q; if (error) { avisos.push(nombre); return []; } return data || []; }
      catch (e) { avisos.push(nombre); return []; }
    };

    // Por páginas: Supabase corta cada respuesta en 1.000 filas sin avisar, y
    // con 30 clientes las sesiones de ocho semanas ya pasan de eso.
    const leerTodo = async (nombre, consulta) => {
      const out = [];
      for (let i = 0; ; i += 1000) {
        const r = await leer(nombre, consulta().range(i, i + 999));
        out.push(...r);
        if (r.length < 1000) return out;
      }
    };

    const [clientes, fases, sesiones, notas, mediciones, actividades, registros] = await Promise.all([
      db.clientes.list(),
      leer('fases', sb.from('fases').select('id,cliente_id,fecha_inicio,semanas,dias_semana,estado,visible_cliente').eq('estado', 'activa').eq('visible_cliente', true)),
      leerTodo('sesiones', () => sb.from('sesiones').select('*').gte('fecha', desdeSeries).order('fecha', { ascending: false }).order('id')),
      leer('notas_entreno', sb.from('notas_entreno').select('*, ejercicios(nombre, alias)').gte('fecha', desde).order('created_at', { ascending: false }).limit(500)),
      leerTodo('mediciones', () => sb.from('mediciones_corporales').select('*').gte('fecha', bdjSumarDias(hoy, -120)).order('fecha').order('id')),
      leerTodo('actividades', () => sb.from('actividades').select('*').gte('fecha', desde).order('fecha').order('id')),
      leer('evento_registros', sb.from('evento_registros').select('*, eventos(tipo,titulo)').gte('fecha', desde).order('fecha')),
    ]);
    const rutIds = [...new Set(sesiones.map(s => s.rutina_id).concat(notas.map(n => n.rutina_id)).filter(Boolean))];
    const rutinas = [];
    for (let i = 0; i < rutIds.length; i += 80) {
      rutinas.push(...await leer('rutinas', sb.from('rutinas').select('id,nombre').in('id', rutIds.slice(i, i + 80))));
    }
    // Series solo de lo completado: es lo que dice si un ejercicio se mueve.
    const completadas = sesiones.filter(s => s.estado === 'completada');
    const series = typeof entDb !== 'undefined' ? await entDb.seriesDeSesiones(completadas.map(s => s.id)) : [];

    // Comida: del mealtracker, emparejada por nombre como el resto del CRM.
    const comida = {};
    try {
      let lista = null;
      if (typeof mtApiBase === 'function' && mtApiBase()) {
        const r = await mtApiGet('/api/coach-data?action=list');
        lista = r && Array.isArray(r.clients) ? r.clients : null;
      }
      if (lista) {
        const porNombre = {};
        lista.forEach(u => {
          const k = normalizeName(u.name);
          // Varias cuentas con el mismo nombre (otro teléfono): gana la más reciente por día.
          const prev = porNombre[k];
          if (!prev) { porNombre[k] = { last_active: u.last_active, recent_days: { ...(u.recent_days || {}) } }; return; }
          if ((u.last_active || '') > (prev.last_active || '')) prev.last_active = u.last_active;
          Object.entries(u.recent_days || {}).forEach(([f, v]) => { if (!prev.recent_days[f]) prev.recent_days[f] = v; });
        });
        clientes.forEach(c => {
          const k = [c.nombre, ...(c.nombres_alternos || [])].map(normalizeName).find(n => porNombre[n]);
          if (k) comida[c.id] = porNombre[k];
        });
      } else {
        avisos.push('comida');
      }
    } catch (e) { avisos.push('comida'); }

    _bdj.datos = bdjArmar({
      hoy, clientes, fases, rutinas, sesiones, series,
      notas: notas.map(n => ({ ...n, ejercicio_nombre: n.ejercicios ? entNombres(n.ejercicios).grande : null })),
      mediciones, actividades, comida, registros,
      lecturas: typeof entLecturasDatos === 'function' ? entLecturasDatos : null,
    });
    _bdj.datos.avisos = avisos;
    _bdj.cargadoEn = Date.now();
    bdjPintarContador();
    return _bdj.datos;
  })();
  try { return await _bdj.cargando; } finally { _bdj.cargando = null; }
}

// ═════════════════════════════════════════════════════════════════════
// LA PANTALLA
// ═════════════════════════════════════════════════════════════════════
const BDJ_FILTROS = [
  ['todo', 'Todo'],
  ['entreno', '🏋️ Entreno'],
  ['comida', '🍽 Comida'],
  ['medida', '📏 Medidas'],
  ['nota', '💬 Notas'],
];
const BDJ_TONO = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  ojo: 'bg-amber-50 text-amber-800 border-amber-200',
  neutro: 'bg-slate-50 text-slate-700 border-slate-200',
};

routes.bandeja = async () => {
  cargando('Leyendo lo que hicieron tus clientes…');
  const d = await bdjCargar();
  const vistos = bdjVistos();
  const pasa = (tipo) => _bdj.filtro === 'todo' || tipo === _bdj.filtro;
  const pendientes = d.atencion.filter(a => !vistos.has(a.id) && pasa(a.tipo));
  const felicitar = d.felicitar.filter(a => !vistos.has(a.id) && pasa(a.tipo));

  const tarjeta = (a, accion) => `
    <div class="flex items-start gap-3 py-2.5" style="border-bottom:1px solid #f1f5f9">
      <div class="text-lg leading-none mt-0.5 w-6 text-center flex-shrink-0">${a.icono}</div>
      <div class="min-w-0 flex-1 cursor-pointer" onclick="verCliente('${a.cliente_id}')">
        <div class="text-sm"><strong class="text-slate-900">${escapeHtml(a.cliente)}</strong>
          <span class="text-slate-700"> · ${escapeHtml(a.titulo)}</span></div>
        ${a.detalle ? `<div class="text-xs text-slate-500 mt-0.5 leading-relaxed">${escapeHtml(a.detalle)}${a.ejercicio ? ` — <em>${escapeHtml(a.ejercicio)}</em>` : ''}</div>` : ''}
        <div class="text-[11px] text-slate-400 mt-0.5">${a.fecha === fmt.hoy() ? 'hoy' : fmt.fechaCorta(a.fecha)}</div>
      </div>
      <button class="btn btn-secondary btn-sm flex-shrink-0" onclick="bdjListo('${a.id}'${a.nota_id ? `, '${a.nota_id}'` : ''})">${accion}</button>
    </div>`;

  const hoyYmd = fmt.hoy();
  const diaTitulo = (f) => f === hoyYmd ? 'Hoy' : f === bdjSumarDias(hoyYmd, -1) ? 'Ayer'
    : new Date(f + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

  const faltan = (d.avisos || []).filter(x => x !== 'comida');
  view.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Bandeja</h2>
        <p class="text-sm text-slate-500">Lo que tus clientes hicieron en la app, ordenado. Toca a un cliente para abrir su ficha.</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="bdjRecargar()">↻ Actualizar</button>
    </div>

    <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
      ${BDJ_FILTROS.map(([id, lab]) => `<button class="chip ${_bdj.filtro === id ? 'active' : ''}" onclick="bdjFiltro('${id}')">${lab}</button>`).join('')}
    </div>

    ${faltan.length ? `<div class="card mb-4 text-xs text-amber-900 bg-amber-50 border border-amber-200">
      No pude leer: <strong>${faltan.join(', ')}</strong>. Si dice <code>notas_entreno</code>, corre <code>carga/migracion-bandeja.sql</code> en Supabase.</div>` : ''}
    ${(d.avisos || []).includes('comida') ? `<div class="card mb-4 text-xs text-slate-600">
      La comida no aparece porque el CRM no está conectado por la API segura del Mealtracker (Ajustes → Conexión Mealtracker).</div>` : ''}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <div class="card">
        <div class="flex items-baseline justify-between mb-1">
          <h3 class="font-bold text-slate-900">Necesita tu atención</h3>
          <span class="text-xs text-slate-400">${pendientes.length}</span>
        </div>
        ${pendientes.length ? pendientes.map(a => tarjeta(a, 'Listo')).join('')
          : '<div class="text-sm text-slate-500 py-3">Nada pendiente. 👌</div>'}
      </div>
      <div class="card">
        <div class="flex items-baseline justify-between mb-1">
          <h3 class="font-bold text-slate-900">Para felicitar</h3>
          <span class="text-xs text-slate-400">${felicitar.length}</span>
        </div>
        ${felicitar.length ? felicitar.map(a => tarjeta(a, 'Hecho')).join('')
          : '<div class="text-sm text-slate-500 py-3">Esta semana todavía nada que celebrar.</div>'}
      </div>
    </div>

    <div class="card">
      <h3 class="font-bold text-slate-900 mb-1">Día a día</h3>
      <p class="text-xs text-slate-500 mb-3">Los últimos ${BDJ_DIAS_VISTA} días, cliente por cliente.</p>
      ${d.dias.map(dia => {
        const filas = dia.filas.map(f => ({ ...f, chips: f.chips.filter(ch => pasa(ch.tipo)) })).filter(f => f.chips.length);
        if (!filas.length) return '';
        return `
          <div class="mt-3">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">${escapeHtml(diaTitulo(dia.fecha))}</div>
            ${filas.map(f => `
              <div class="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 cursor-pointer hover:bg-slate-50 rounded-lg px-1" onclick="verCliente('${f.cliente_id}')" style="border-bottom:1px solid #f8fafc">
                <div class="text-sm font-semibold text-slate-800 sm:w-36 flex-shrink-0 truncate">${escapeHtml(f.cliente)}</div>
                <div class="flex flex-wrap gap-1.5 min-w-0">
                  ${f.chips.map(ch => `<span class="text-xs border rounded-full px-2 py-0.5 ${BDJ_TONO[ch.tono] || BDJ_TONO.neutro}">${ch.icono} ${escapeHtml(ch.texto)}</span>`).join('')}
                </div>
              </div>`).join('')}
          </div>`;
      }).join('') || '<div class="text-sm text-slate-500 py-3">Sin actividad en estos días.</div>'}
    </div>
  `;
};

window.bdjFiltro = (f) => { _bdj.filtro = f; routes.bandeja(); };
window.bdjRecargar = async () => { await bdjCargar(true); routes.bandeja(); };
window.bdjListo = async (id, notaId) => {
  bdjMarcarVisto(id);
  if (notaId) {
    // La nota se marca en la base: así queda leída también en el teléfono.
    try { await sb.from('notas_entreno').update({ leida_en: new Date().toISOString() }).eq('id', notaId); } catch (e) {}
  }
  bdjPintarContador();
  routes.bandeja();
};

// El número en el botón de la barra: lo pendiente que aún no marcaste.
function bdjPintarContador() {
  const btn = document.querySelector('.nav-item[data-view="bandeja"]');
  if (!btn || !_bdj.datos) return;
  const vistos = bdjVistos();
  const n = _bdj.datos.atencion.filter(a => !vistos.has(a.id)).length;
  btn.textContent = n ? `📥 Bandeja (${n})` : '📥 Bandeja';
}

// =====================================================
// REGISTRO EN EL CRM  ·  mismo truco que entrenamiento.js
// =====================================================
(function addBandejaNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="bandeja"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'bandeja';
    btn.classList.remove('active');
    btn.textContent = '📥 Bandeja';
    // Justo después de Inicio: es lo primero que se mira cada día.
    const inicio = document.querySelector('.nav-item[data-view="dashboard"]');
    anchor.parentNode.insertBefore(btn, (inicio && inicio.nextSibling) || null);
    btn.addEventListener('click', () => navigate('bandeja'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();

// El contador se llena solo al rato de entrar, y cada 10 minutos, sin que
// tengas que abrir la bandeja. Solo con sesión iniciada.
setTimeout(function bdjSondeo() {
  try {
    if (typeof sb !== 'undefined') {
      sb.auth.getSession().then(({ data }) => { if (data && data.session) bdjCargar().catch(() => {}); });
    }
  } catch (e) {}
  setTimeout(bdjSondeo, 10 * 60 * 1000);
}, 4000);
