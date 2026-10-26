// =====================================================
// DIÁLOGOS · la galería de mensajes para copiar y pegar en WhatsApp
// =====================================================
// Lo que más se repite al acompañar a un cliente (el saludo de la semana,
// pedir un video, decirle que suba el peso…) ya escrito con la voz del coach.
// Se abre desde la ficha del cliente y desde su seguimiento semanal.
//
//   {nombre}  → cómo le dice el coach (campo «Cómo le digo» del cliente; si
//               está vacío, su primer nombre).
//   [algo]    → lo que el coach rellena antes de mandarlo (el ejercicio, los
//               kilos, el día…). Si queda alguno sin rellenar, se avisa.
//
// Las plantillas base viven aquí. Lo que el coach edita o crea se guarda en
// `settings.dialogos` (carga/migracion-dialogos.sql): { editados: {id: texto},
// propios: [{id, cat, titulo, texto}], ocultos: [id] }. Sin esa columna la
// galería funciona igual, solo que sin guardar ediciones.
//
// Carga DESPUÉS de app.js (usa db, sb, openModal, toast, escapeHtml…).

const DLG_CATS = [
  ['saludos', '👋', 'Saludos'],
  ['semana', '📅', 'Seguimiento semanal'],
  ['explicar', '🧭', 'Explicar el plan'],
  ['tecnica', '🎯', 'Revisión de ejercicio'],
  ['video', '🎥', 'Pedir video'],
  ['peso', '🏋️', 'Peso y progresión'],
  ['comida', '🥗', 'Alimentación'],
  ['analisis', '📈', 'Análisis y progreso'],
  ['recordatorio', '🔔', 'Recordatorios'],
  ['bienestar', '🌙', 'Recuperación y agenda'],
  ['propios', '⭐', 'Mis diálogos'],
];

const DLG_BASE = [
  // ── SALUDOS ──
  { id: 'sal-bienvenida', cat: 'saludos', titulo: 'Bienvenida al programa', texto:
`Hola {nombre}! Qué bueno arrancar contigo.

Ya tienes tu acceso a la app. Ahí está todo tu proceso: entrenamiento, alimentación, aprendizaje y tu avance. Haz el recorrido guiado y lee «Sobre el programa», son cinco minutos y te ahorran muchas dudas.

Esta primera semana el foco es uno solo: hacer los entrenos con buena técnica y registrar. El peso y lo demás lo vamos ajustando con tus datos.

Cualquier duda me escribes por aquí.` },
  { id: 'sal-semana', cat: 'saludos', titulo: 'Arranque de semana', texto:
`Hola {nombre}! Arrancamos semana.

Tienes [N] entrenos en el plan. Si ya sabes qué día se te complica, muévelo desde hoy en el calendario de la app y así no se te acumula.

Vamos con toda 💪` },
  { id: 'sal-ciclo', cat: 'saludos', titulo: 'Ciclo nuevo', texto:
`Hola {nombre}! Ya tienes tu ciclo nuevo en la app.

Cambian algunos ejercicios y subimos un poco el reto en [qué cambia]. Las primeras dos sesiones tómalas para conocer los ejercicios nuevos: peso cómodo, técnica limpia y anota todo. Desde ahí empezamos a cargar.` },
  { id: 'sal-regreso', cat: 'saludos', titulo: 'Retomar después de unos días', texto:
`Hola {nombre}! Hace unos días no te veo por la app, ¿cómo vas?

No pasa nada. La idea es retomar sin querer recuperar todo de golpe. Esta semana hagamos [N] entrenos y el registro de comidas, y desde ahí volvemos al ritmo.

¿Qué día te queda bien empezar?` },
  { id: 'sal-gracias', cat: 'saludos', titulo: 'Gracias por la constancia', texto:
`{nombre}, te quería decir algo: llevas [N] semanas sin soltar el proceso, y eso se nota en tus datos.

La constancia es lo que menos se ve y lo que más resultado da. Gracias por tomártelo en serio. Seguimos.` },

  // ── SEGUIMIENTO SEMANAL ──
  { id: 'sem-pregunta', cat: 'semana', titulo: 'Pedir el reporte de la semana', texto:
`Hola {nombre}! Para tu seguimiento de esta semana cuéntame en dos líneas:

1. Cómo te sentiste entrenando.
2. Cómo dormiste y cómo estuvo tu energía.
3. Si hubo alguna molestia.

Con eso y tus datos de la app ajusto lo que haga falta.` },
  { id: 'sem-buena', cat: 'semana', titulo: 'Semana muy buena', texto:
`Hola {nombre}! Revisé tu semana: [x] de [x] entrenos y [x] días registrando comida.

Así se construye. Lo que más me gustó: [detalle concreto].

Esta semana mantenemos la misma estructura y vamos por [objetivo concreto].` },
  { id: 'sem-mixta', cat: 'semana', titulo: 'Semana a medias', texto:
`Hola {nombre}! Revisé tu semana. Entrenaste [x] de [x] y la alimentación estuvo [más irregular / bien encaminada].

No hace falta hacerlo perfecto, hace falta hacerlo seguido. Para esta semana te propongo una sola cosa: [ajuste concreto].

¿Te parece?` },
  { id: 'sem-dificil', cat: 'semana', titulo: 'Semana difícil', texto:
`Hola {nombre}! Vi que esta semana estuvo pesada con [trabajo / viaje / salud].

Pasa, y es parte del proceso. Lo importante es no soltarlo todo: con [N] entrenos y registrar lo principal ya mantienes el avance.

Si necesitas que ajuste la rutina a menos tiempo, me dices y lo hago.` },

  // ── EXPLICAR EL PLAN ── (el porqué de un ciclo o una alimentación nueva)
  { id: 'exp-ciclo', cat: 'explicar', titulo: 'Por qué cambia el ciclo', texto:
`Hola {nombre}. Ya tienes el ciclo nuevo en la app.

Te explico el porqué. En estas [N] semanas tu cuerpo ya se adaptó a lo que veníamos haciendo: [lo que logró, ej. pasaste de 50 a 60 kg en press banca]. Si seguimos igual, el progreso se frena. Por eso cambio el estímulo.

Qué cambia: [qué cambia, ej. bajamos un poco las repeticiones y subimos la carga en los básicos]. [Ejercicio nuevo] entra en lugar de [el que sale] porque [razón concreta, ej. te deja cargar más sin molestar el hombro].

Las dos primeras sesiones son de reconocimiento: técnica limpia, peso cómodo y anota todo. Con esos datos ajusto la carga la semana siguiente.` },
  { id: 'exp-primeros', cat: 'explicar', titulo: 'Por qué estos primeros ejercicios', texto:
`Hola {nombre}. Ya está tu primera rutina en la app.

La armé con lo que me contaste: [objetivo], [N] días por semana y [contexto, ej. la molestia en la rodilla]. Por eso ves pocos ejercicios y bien escogidos: los básicos que más rinden para tu objetivo, más [accesorio] para [razón].

Estas primeras semanas la meta es que aprendas cada movimiento bien y que yo vea cómo respondes. Usa un peso con el que te sobren 2 o 3 repeticiones y anota todo. Con eso subo la carga con criterio, no a ojo.

Si un ejercicio te molesta o no tienes la máquina, me dices y lo cambio.` },
  { id: 'exp-alimentacion', cat: 'explicar', titulo: 'Por qué cambia la alimentación', texto:
`Hola {nombre}. Te ajusté la alimentación en la app.

Revisé tus últimas [N] semanas: [qué vi, ej. bajaste 2,1 kg y la fuerza se mantuvo]. [Lectura, ej. vamos bien, pero el ritmo se está frenando]. Por eso [el cambio, ej. bajo 150 kcal y subo la proteína a 150 g].

[Por qué ese cambio, ej. la proteína alta es la que protege el músculo mientras sigues bajando grasa].

En tu día a día casi no se nota: [ej. una porción menos de arroz en la cena y un yogur griego en la tarde]. Lo revisamos en [N] semanas con tus números.` },
  { id: 'exp-primera-alimentacion', cat: 'explicar', titulo: 'Por qué esta meta de alimentación', texto:
`Hola {nombre}. Ya tienes tu plan de alimentación en la app.

Tu meta la calculé con tu composición. Hoy estás en [peso] kg con [%] % de grasa, o sea [masa magra] kg de masa magra. Con tu actividad gastas cerca de [kcal] kcal al día.

Por eso tu meta es [kcal meta] kcal, [déficit/superávit] de [diferencia] kcal: suficiente para [bajar grasa / ganar músculo] a un ritmo que se sostiene, sin pasar hambre ni perder lo que entrenas. La proteína va en [g] g porque es la que [protege/construye] tu músculo.

Las primeras dos semanas no busques perfección: registra todo, aunque te salgas. Con eso ajusto con tus números reales.` },

  // ── REVISIÓN DE EJERCICIO ──
  { id: 'tec-bien', cat: 'tecnica', titulo: 'Técnica bien hecha', texto:
`{nombre}, revisé tu video de [ejercicio]: muy bien.

[Lo que está bien: rango completo, espalda neutra, control en la bajada].

Así como lo hiciste, cuando llegues arriba del rango de repeticiones en todas las series, subes el peso.` },
  { id: 'tec-ajuste', cat: 'tecnica', titulo: 'Un ajuste puntual', texto:
`{nombre}, revisé tu [ejercicio]. Va bien, solo un ajuste: [corrección].

Una idea que ayuda: [indicación corta, por ejemplo «empuja el piso» o «pecho arriba»].

Esta semana bájale un poco el peso para fijarlo, y en dos semanas me mandas otro video para ver cómo va.` },
  { id: 'tec-corregir', cat: 'tecnica', titulo: 'Corregir antes de cargar', texto:
`{nombre}, vi tu video de [ejercicio]. Antes de subir peso quiero que corrijamos [punto].

No es un tema de fuerza, es de patrón: [qué hacer].

Trabájalo con [peso más liviano / menos repeticiones] y lo volvemos a revisar. Primero bien hecho, después pesado.` },
  { id: 'tec-molestia', cat: 'tecnica', titulo: 'Molestia en un ejercicio', texto:
`{nombre}, gracias por avisarme lo de [zona] en [ejercicio].

Por ahora cámbialo por [alternativa], o hazlo con menos rango hasta donde no moleste.

Si la molestia sigue al día siguiente o es un dolor punzante, me cuentas y lo revisamos con calma.` },
  { id: 'tec-nuevo', cat: 'tecnica', titulo: 'Ejercicio nuevo en el ciclo', texto:
`{nombre}, en este ciclo entró [ejercicio], que es nuevo para ti.

Las primeras dos sesiones hazlo liviano y concéntrate en sentirlo donde es: [músculo]. Si puedes, grábate una serie y me la mandas, así lo afinamos desde el principio.` },

  // ── PEDIR VIDEO ──
  { id: 'vid-uno', cat: 'video', titulo: 'Pedir un video', texto:
`Hola {nombre}! Para revisar tu técnica, cuando puedas mándame un video de [ejercicio].

Grábalo de lado, con el cuerpo completo en cuadro y una serie normal de trabajo. No tiene que ser perfecto: lo que quiero ver es cómo lo haces de verdad.` },
  { id: 'vid-varios', cat: 'video', titulo: 'Pedir varios videos', texto:
`Hola {nombre}! Esta semana quiero revisarte [ejercicio 1] y [ejercicio 2].

Grábalos de lado, cuerpo completo, en una serie de trabajo. Con eso ajusto lo que haga falta para que sigas progresando sin riesgo.` },
  { id: 'vid-recordar', cat: 'video', titulo: 'Recordar el video', texto:
`{nombre}, te recuerdo el video de [ejercicio] que te pedí.

Si esta semana se te complica grabarlo, me dices y lo dejamos para la próxima.` },
  { id: 'vid-otra-vez', cat: 'video', titulo: 'Pedirlo de nuevo tras corregir', texto:
`{nombre}, ya trabajaste [ejercicio] con el ajuste que te dije. Mándame otro video cuando puedas, desde el mismo ángulo, para comparar con el anterior.` },

  // ── PESO Y PROGRESIÓN ──
  { id: 'pes-subir', cat: 'peso', titulo: 'Toca subir el peso', texto:
`{nombre}, en [ejercicio] ya estás haciendo [reps] con [kg] en todas las series.

Llegaste arriba del rango, así que la próxima sesión sube a [kg] y vuelve a empezar desde abajo del rango. Así se progresa.` },
  { id: 'pes-mantener', cat: 'peso', titulo: 'Mantener el peso', texto:
`{nombre}, en [ejercicio] mantén el peso esta semana.

Todavía no llegas arriba del rango en todas las series, y eso es lo que nos dice que toca subir. Primero consolidamos, después cargamos.` },
  { id: 'pes-bajar', cat: 'peso', titulo: 'Bajar el peso por técnica', texto:
`{nombre}, en [ejercicio] bájale a [kg].

Con el peso que tenías se te estaba yendo [la técnica / el rango]. Menos peso bien hecho es lo que te hace avanzar de verdad, y en dos o tres semanas lo vuelves a pasar.` },
  { id: 'pes-elegir', cat: 'peso', titulo: 'Cómo elegir el peso', texto:
`{nombre}, una guía para elegir el peso de cada ejercicio:

Tiene que dejarte hacer todas las repeticiones con buena técnica, quedando con una o dos en reserva. Si terminas sobrado, subes. Si se rompe la técnica, bajas.

Y anótalo siempre en la app: así la próxima vez sabes exactamente de dónde partir.` },
  { id: 'pes-record', cat: 'peso', titulo: 'Récord', texto:
`{nombre}, ¡récord en [ejercicio]! [kg] por [reps].

Eso no es suerte, es lo que vienes haciendo semana a semana. Bien ahí 💪` },
  { id: 'pes-registrar', cat: 'peso', titulo: 'Registrar pesos y repeticiones', texto:
`{nombre}, vi que en varias series no quedó anotado el peso. Anótalo en cada serie, aunque sea el mismo de la vez anterior.

Ese dato es el que me dice cuándo subirte y cuándo no. Sin él te ajusto a ciegas.` },

  // ── ALIMENTACIÓN ──
  { id: 'com-proteina', cat: 'comida', titulo: 'Subir la proteína', texto:
`{nombre}, revisando tus registros vas bien con las calorías, pero la proteína se queda corta: en promedio [x] g y tu meta es [x] g.

Una forma fácil de cubrirla: suma una porción de proteína en [desayuno / merienda], por ejemplo [huevos, yogur griego, atún]. No es comer más, es repartir mejor.` },
  { id: 'com-registro', cat: 'comida', titulo: 'Volver a registrar', texto:
`{nombre}, esta semana se te pasaron varios días sin registrar la comida.

Sé que a veces da pereza, pero sin ese dato te ajusto a ciegas. Anota aunque sea lo principal y aproximado: me sirve mucho más que nada.` },
  { id: 'com-evento', cat: 'comida', titulo: 'Evento o fin de semana', texto:
`{nombre}, para [el evento / el fin de semana]: no hace falta llegar en ayunas ni compensar después.

Durante el día come normal, con proteína en cada comida. En el evento disfruta con criterio. Y al día siguiente vuelves a tu plan como siempre.` },
  { id: 'com-pasado', cat: 'comida', titulo: 'Un día por encima de la meta', texto:
`{nombre}, vi que ayer quedaste por encima de tu meta. Tranquilidad: un día no define nada, lo que cuenta es el promedio de la semana.

Hoy vuelves a tu plan normal, sin castigarte ni recortar de más.` },
  { id: 'com-hambre', cat: 'comida', titulo: 'Hambre o ansiedad en la tarde', texto:
`{nombre}, si te está dando mucha hambre en la tarde, prueba dos cosas: más proteína y fibra en el almuerzo, y un snack ya planeado para esa hora ([fruta con yogur / un puñado de frutos secos]).

El hambre se maneja con estructura, no con fuerza de voluntad.` },
  { id: 'com-receta', cat: 'comida', titulo: 'Recomendar una receta', texto:
`{nombre}, en la app, en Alimentación, tienes recetas que encajan en tu meta. Te recomiendo [receta] para [momento del día]: es fácil y te ayuda con la proteína.` },
  { id: 'com-agua', cat: 'comida', titulo: 'Hidratación', texto:
`{nombre}, un detalle que hace diferencia: el agua. Apunta a [x] litros al día, más si entrenas o hace calor. Ten una botella a la vista; lo que no se ve, no se toma.` },

  // ── ANÁLISIS Y PROGRESO ──
  { id: 'ana-bueno', cat: 'analisis', titulo: 'Análisis del mes: va muy bien', texto:
`{nombre}, hice el análisis de tu último mes y los números hablan solos:

· Peso: [antes] → [ahora]
· % de grasa: [antes] → [ahora]
· Fuerza: [ejercicio] de [kg] a [kg]

Esto viene de la constancia: [x] entrenos y [x] días registrados. Seguimos en la misma línea y en el próximo ciclo subimos un poco el reto.` },
  { id: 'ana-grasa', cat: 'analisis', titulo: 'La báscula no se mueve, pero la grasa sí', texto:
`{nombre}, en tu medición la báscula casi no se movió, pero el % de grasa bajó de [x] a [x].

Eso significa que estás perdiendo grasa y manteniendo o ganando músculo, que es justo lo que buscamos. No te guíes solo por el peso.` },
  { id: 'ana-estanco', cat: 'analisis', titulo: 'El avance se frenó', texto:
`{nombre}, revisé tus datos de las últimas [x] semanas y el avance se frenó un poco en [área].

Es normal en un proceso, y para eso están los datos. Vamos a ajustar [entreno / alimentación]: [cambio concreto]. En dos semanas lo volvemos a revisar.` },
  { id: 'ana-cierre', cat: 'analisis', titulo: 'Cierre de ciclo', texto:
`{nombre}, cerramos el ciclo. Resumen de lo que lograste: [lo logrado].

En el ciclo nuevo cambian algunos ejercicios y subimos el reto en [aspecto]. Antes de arrancar, actualiza tu peso, % de grasa y fotos en la app, así medimos bien el punto de partida.` },
  { id: 'ana-fotos', cat: 'analisis', titulo: 'Comentar las fotos de progreso', texto:
`{nombre}, revisé tus fotos frente a las de [mes]. Se nota [el cambio: más definición en hombros, cintura más marcada…].

Las fotos muestran lo que la báscula no cuenta. Guárdalas, en unos meses vas a agradecer tenerlas.` },

  // ── RECORDATORIOS ──
  { id: 'rec-medicion', cat: 'recordatorio', titulo: 'Registro mensual', texto:
`Hola {nombre}! Esta semana toca tu registro mensual: peso, % de grasa y fotos.

Hazlo en la app, en ayunas y en las mismas condiciones de siempre, así la comparación es real.` },
  { id: 'rec-app', cat: 'recordatorio', titulo: 'Usar la app', texto:
`{nombre}, te recuerdo que todo lo de tu proceso está en la app: tu rutina de hoy, tu meta de comida y tu avance. Marca las series y registra lo que comes, así cada semana te ajusto con datos y no a ojo.` },
  { id: 'rec-pago', cat: 'recordatorio', titulo: 'Mensualidad', texto:
`Hola {nombre}! Te recuerdo la mensualidad de [mes]. Cuando la hagas me avisas.

¡Seguimos con toda! 💪` },

  // ── RECUPERACIÓN Y AGENDA ──
  { id: 'bie-sueno', cat: 'bienestar', titulo: 'Dormir poco o mucho estrés', texto:
`{nombre}, me contaste que estás durmiendo poco. Esta semana prioriza eso, aunque tengas que acortar algún entreno: el músculo se construye cuando descansas.

Si un día llegas sin energía, haz la rutina con una serie menos por ejercicio y listo. Mejor eso que no entrenar.` },
  { id: 'bie-enfermo', cat: 'bienestar', titulo: 'Se enfermó', texto:
`{nombre}, primero mejórate. No entrenes con fiebre ni con malestar general.

Cuando te sientas bien, retomamos con una sesión más suave y en pocos días volvemos al ritmo. Avísame cómo sigues.` },
  { id: 'bie-viaje', cat: 'bienestar', titulo: 'Viaje', texto:
`{nombre}, para tu viaje: si hay gimnasio, sigue con tu rutina normal. Si no, en la app tienes [rutina para casa / sin equipo].

Con dos o tres entrenos esa semana mantienes perfectamente. En comida, proteína en cada comida y agua. Y disfruta el viaje.` },
  { id: 'bie-agenda', cat: 'bienestar', titulo: 'Semana con poco tiempo', texto:
`{nombre}, si esta semana tienes poco tiempo, mejor hacer la rutina corta que saltarla.

Haz los primeros [N] ejercicios de fuerza, que son los que más pesan en tu progreso, y deja el resto para cuando tengas más espacio.` },
];

const _dlg = { custom: null, columna: true, cliente: null, cat: 'saludos', q: '', editando: null };

async function dlgCargarCustom(force = false) {
  if (_dlg.custom && !force) return _dlg.custom;
  try {
    const { data, error } = await sb.from('settings').select('dialogos').maybeSingle();
    if (error) { _dlg.columna = false; _dlg.custom = { editados: {}, propios: [], ocultos: [] }; return _dlg.custom; }
    const d = (data && data.dialogos) || {};
    _dlg.custom = { editados: d.editados || {}, propios: d.propios || [], ocultos: d.ocultos || [] };
  } catch (e) { _dlg.columna = false; _dlg.custom = { editados: {}, propios: [], ocultos: [] }; }
  return _dlg.custom;
}

async function dlgGuardarCustom() {
  if (!_dlg.columna) { toast('Para guardar tus cambios corre carga/migracion-dialogos.sql en Supabase'); return false; }
  const ok = await db.settings.save({ dialogos: _dlg.custom });
  if (!ok) toast('No se pudo guardar');
  return ok;
}

// Todos los diálogos de la galería: los base (con lo que el coach editó) y los suyos.
function dlgTodos() {
  const c = _dlg.custom || { editados: {}, propios: [], ocultos: [] };
  const base = DLG_BASE.filter(d => !c.ocultos.includes(d.id)).map(d => ({ ...d, texto: c.editados[d.id] ?? d.texto, editado: d.id in c.editados }));
  return [...base, ...c.propios.map(d => ({ ...d, cat: d.cat || 'propios', propio: true }))];
}

// Cómo le dice el coach: el campo «Cómo le digo», o su primer nombre.
function dlgTrato(c) {
  const t = String((c && c.trato) || '').trim();
  return t || String((c && c.nombre) || '').trim().split(/\s+/)[0] || '';
}

function dlgRellenar(texto, c) {
  return String(texto || '')
    .replace(/\{nombre\}/g, c ? dlgTrato(c) : '[nombre]')
    .replace(/\{coach\}/g, (typeof _settings !== 'undefined' && _settings.nombre_coach) || '');
}

// El texto con los [huecos] resaltados, para la vista previa.
function dlgHtml(texto) {
  return escapeHtml(texto).replace(/\[([^\]]+)\]/g, '<mark class="dlg-hueco">[$1]</mark>');
}

const dlgHuecos = (texto) => (String(texto).match(/\[[^\]]+\]/g) || []);

const DLG_ESTILOS = `
    <style>
      .dlg-hueco { background: #FEF3C7; color: #92400E; border-radius: 4px; padding: 0 2px; }
      .dlg-chip { border: 1px solid #e2e8f0; border-radius: 999px; padding: .3rem .7rem; font-size: .8rem; font-weight: 600; background: #fff; color: #334155; white-space: nowrap; }
      .dlg-chip.on { background: #1D1D1F; border-color: #1D1D1F; color: #fff; }
      .dlg-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: .8rem .9rem; background: #fff; }
      .dlg-texto { white-space: pre-line; font-size: .875rem; color: #334155; line-height: 1.45; }
    </style>`;

window.abrirDialogos = async (clienteId) => {
  const [c] = await Promise.all([db.clientes.get(clienteId), dlgCargarCustom()]);
  if (!c) return toast('No encuentro el cliente');
  _dlg.cliente = c; _dlg.q = ''; _dlg.editando = null;
  openModal(modalShell(`💬 Diálogos · ${escapeHtml(c.nombre)}`, `
    ${DLG_ESTILOS}
    <div class="space-y-3">
      <div class="flex items-end gap-2 flex-wrap bg-slate-50 rounded-xl p-3">
        <div class="flex-1 min-w-[180px]">
          <label>Cómo le digo</label>
          <input id="dlg-trato" value="${escapeHtml(c.trato || '')}" placeholder="${escapeHtml(dlgTrato({ nombre: c.nombre }))} (su primer nombre)" oninput="dlgCambioTrato(this.value)">
        </div>
        <button class="btn btn-secondary btn-sm" data-dlg-guardar-trato onclick="dlgGuardarTrato()">Guardar</button>
        <div class="text-xs text-slate-500 w-full">Así sale su nombre en cada diálogo. Lo que va entre <mark class="dlg-hueco">[corchetes]</mark> lo rellenas tú antes de mandarlo.</div>
      </div>
      <input id="dlg-q" placeholder="Buscar un diálogo…" oninput="_dlg.q = this.value; dlgPintar()">
      <div class="flex gap-1.5 overflow-x-auto pb-1" id="dlg-cats"></div>
      <div id="dlg-lista" class="space-y-2"></div>
    </div>
  `), { wide: true });
  dlgPintar();
};

window.dlgCambioTrato = (v) => { if (_dlg.cliente) { _dlg.cliente = { ..._dlg.cliente, trato: v }; dlgPintar(true); } };

window.dlgGuardarTrato = async () => {
  const c = _dlg.cliente;
  if (!c) return;
  const trato = ($('#dlg-trato')?.value || '').trim() || null;
  const { error } = await sb.from('clientes').update({ trato }).eq('id', c.id);
  if (error) {
    if (/trato/.test(error.message || '')) return toast('Falta la columna: corre carga/migracion-dialogos.sql en Supabase');
    return toast(error.message);
  }
  invalidarCache('clientes');
  toast(trato ? `✓ Le dices «${trato}»` : '✓ Se usa su primer nombre');
};

function dlgPintar(soloLista = false) {
  const todos = dlgTodos();
  const q = normalizeName(_dlg.q || '');
  if (!soloLista) {
    const n = (cat) => todos.filter(d => d.cat === cat).length;
    $('#dlg-cats').innerHTML = DLG_CATS.filter(([k]) => k !== 'propios' || n('propios'))
      .map(([k, ico, t]) => `<button type="button" class="dlg-chip ${!q && _dlg.cat === k ? 'on' : ''}" data-dlg-cat="${k}" onclick="_dlg.cat='${k}'; _dlg.q=''; $('#dlg-q').value=''; dlgPintar()">${ico} ${t} <span class="opacity-60">${n(k)}</span></button>`).join('')
      + `<button type="button" class="dlg-chip" data-dlg-nuevo onclick="dlgEditar(null)">+ Nuevo</button>`;
  }
  const lista = q
    ? todos.filter(d => normalizeName(`${d.titulo} ${d.texto}`).includes(q))
    : todos.filter(d => d.cat === _dlg.cat);
  const c = _dlg.cliente;
  $('#dlg-lista').innerHTML = lista.length ? lista.map(d => {
    const texto = dlgRellenar(d.texto, c);
    if (_dlg.editando === d.id) return dlgFormHtml(d);
    return `
      <div class="dlg-card" data-dlg="${d.id}">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <div class="font-bold text-slate-900 text-sm">${escapeHtml(d.titulo)}${d.editado ? ' <span class="tag tag-gray">editado</span>' : ''}</div>
          <div class="flex gap-1 flex-shrink-0">
            <button class="btn btn-ghost btn-sm" onclick="dlgEditar('${d.id}')" title="Cambiar la plantilla para todos los clientes">✎</button>
          </div>
        </div>
        <div class="dlg-texto">${dlgHtml(texto)}</div>
        <div class="mt-2">
          <textarea class="hidden w-full text-sm" rows="8" data-dlg-txt="${d.id}">${escapeHtml(texto)}</textarea>
          <div class="flex gap-1.5 flex-wrap mt-1.5">
            <button class="btn btn-primary btn-sm" data-dlg-usar onclick="dlgUsar('${d.id}')">Usar</button>
            <button class="btn btn-secondary btn-sm" data-dlg-copiar onclick="dlgCopiar('${d.id}')">📋 Copiar</button>
            ${c && c.telefono ? `<button class="btn btn-secondary btn-sm" data-dlg-wa onclick="dlgWhatsApp('${d.id}')">WhatsApp</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('') : '<div class="text-sm text-slate-500 text-center py-6">Nada por aquí todavía.</div>';
}

// «Usar»: abre el texto para rellenar los [huecos] antes de copiarlo.
window.dlgUsar = (id) => {
  const ta = document.querySelector(`[data-dlg-txt="${id}"]`);
  if (!ta) return;
  ta.classList.remove('hidden');
  ta.closest('.dlg-card').querySelector('.dlg-texto').classList.add('hidden');
  ta.focus();
  const m = ta.value.search(/\[[^\]]+\]/);
  if (m >= 0) { const fin = ta.value.indexOf(']', m) + 1; ta.setSelectionRange(m, fin); }
};

function dlgTextoFinal(id) {
  const ta = document.querySelector(`[data-dlg-txt="${id}"]`);
  return ta ? ta.value : '';
}

function dlgAvisarHuecos(texto) {
  const h = dlgHuecos(texto);
  if (!h.length) return true;
  return confirm(`Te falta rellenar: ${h.join(', ')}\n\n¿Lo copio igual?`);
}

window.dlgCopiar = async (id) => {
  const texto = dlgTextoFinal(id);
  if (!dlgAvisarHuecos(texto)) return dlgUsar(id);
  try { await navigator.clipboard.writeText(texto); toast('✓ Copiado, pégalo en WhatsApp'); }
  catch (e) { prompt('Copia manualmente:', texto); }
  dlgRegistrar(id, texto);
};

// Queda en su historial de seguimiento (seguimiento-semana.js).
function dlgRegistrar(id, texto) {
  const c = _dlg.cliente;
  if (!c || !c.id || typeof segRegistrar !== 'function') return;
  const titulo = document.querySelector(`.dlg-card[data-dlg="${id}"] .font-bold`)?.textContent.trim() || null;
  segRegistrar(c.id, { origen: 'dialogos', titulo, texto });
}

window.dlgWhatsApp = (id) => {
  const c = _dlg.cliente;
  const texto = dlgTextoFinal(id);
  if (!dlgAvisarHuecos(texto)) return dlgUsar(id);
  const tel = String((c && c.telefono) || '').replace(/[^\d]/g, '');
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  dlgRegistrar(id, texto);
};

// ── Editar la galería ──
function dlgFormHtml(d) {
  const nuevo = !d || !d.id;
  const cats = DLG_CATS.map(([k, ico, t]) => `<option value="${k}" ${(d?.cat || _dlg.cat) === k ? 'selected' : ''}>${ico} ${t}</option>`).join('');
  return `
    <div class="dlg-card" data-dlg-form="${nuevo ? 'nuevo' : d.id}" style="border-color:#93c5fd">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label>Título</label><input id="dlg-f-titulo" value="${escapeHtml(d?.titulo || '')}" placeholder="Ej.: Felicitar por el récord"></div>
        <div><label>Categoría</label><select id="dlg-f-cat" ${d && !d.propio && !nuevo ? 'disabled' : ''}>${cats}</select></div>
      </div>
      <label class="mt-2 block">Texto · usa {nombre} para su nombre y [corchetes] para lo que rellenas</label>
      <textarea id="dlg-f-texto" rows="9" class="w-full text-sm">${escapeHtml(d?.texto || 'Hola {nombre}! ')}</textarea>
      <div class="flex gap-1.5 flex-wrap mt-2">
        <button class="btn btn-primary btn-sm" data-dlg-f-guardar onclick="dlgGuardarForm('${nuevo ? '' : d.id}')">Guardar</button>
        <button class="btn btn-ghost btn-sm" onclick="_dlg.editando=null; dlgPintar()">Cancelar</button>
        ${!nuevo && d.editado ? `<button class="btn btn-ghost btn-sm" onclick="dlgRestaurar('${d.id}')">Volver al original</button>` : ''}
        ${!nuevo ? `<button class="btn btn-ghost btn-sm text-red-600" onclick="dlgOcultar('${d.id}')">${d.propio ? 'Eliminar' : 'Ocultar'}</button>` : ''}
      </div>
    </div>`;
}

window.dlgEditar = (id) => {
  if (id === null) {
    _dlg.editando = '__nuevo';
    $('#dlg-lista').insertAdjacentHTML('afterbegin', dlgFormHtml(null));
    return;
  }
  _dlg.editando = id;
  dlgPintar(true);
};

window.dlgGuardarForm = async (id) => {
  const titulo = ($('#dlg-f-titulo')?.value || '').trim();
  const texto = ($('#dlg-f-texto')?.value || '').trim();
  if (!titulo || !texto) return toast('Ponle título y texto');
  const c = _dlg.custom;
  const base = id && DLG_BASE.find(d => d.id === id);
  if (base) {
    if (texto === base.texto) delete c.editados[id]; else c.editados[id] = texto;
  } else if (id) {
    const p = c.propios.find(d => d.id === id);
    if (p) Object.assign(p, { titulo, texto, cat: $('#dlg-f-cat')?.value || p.cat });
  } else {
    c.propios.push({ id: 'p-' + Date.now().toString(36), cat: $('#dlg-f-cat')?.value || 'propios', titulo, texto });
  }
  if (!(await dlgGuardarCustom())) return;
  _dlg.editando = null;
  toast('✓ Guardado');
  dlgPintar();
};

window.dlgRestaurar = async (id) => {
  delete _dlg.custom.editados[id];
  if (await dlgGuardarCustom()) { _dlg.editando = null; dlgPintar(); }
};

window.dlgOcultar = async (id) => {
  const c = _dlg.custom;
  const propio = c.propios.some(d => d.id === id);
  if (!confirm(propio ? '¿Eliminar este diálogo tuyo?' : '¿Ocultar este diálogo de la galería? (Lo puedes recuperar después)')) return;
  if (propio) c.propios = c.propios.filter(d => d.id !== id);
  else if (!c.ocultos.includes(id)) c.ocultos.push(id);
  if (await dlgGuardarCustom()) { _dlg.editando = null; dlgPintar(); }
};

// =====================================================
// LA SECCIÓN «DIÁLOGOS» DEL MENÚ
// =====================================================
// Todo en un sitio, sin tener que entrar a un cliente:
//   · «Galería»: las plantillas para todos (editarlas, crear las tuyas). Sin
//     cliente, {nombre} sale como [nombre] para rellenar.
//   · Eligiendo un cliente: la galería con su nombre, y «Diálogo de su
//     semana», el guion de 6 pasos de Seguimiento → Diálogo (dialogo-tipo.js).
const _dlgV = { clienteId: '', modo: 'galeria' };

routes.dialogos = async () => {
  cargando();
  const [clientes] = await Promise.all([db.clientes.list(), dlgCargarCustom()]);
  finCargando();
  const activos = clientes.filter(c => c.estado === 'activo').sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  const c = activos.find(x => String(x.id) === String(_dlgV.clienteId)) || null;
  if (!c) { _dlgV.clienteId = ''; _dlgV.modo = 'galeria'; }
  _dlg.cliente = c; _dlg.q = ''; _dlg.editando = null;
  const pestana = (k, t) => `<button type="button" class="dlg-chip ${_dlgV.modo === k ? 'on' : ''}" data-dlgv-modo="${k}" onclick="dlgVista({ modo: '${k}' })">${t}</button>`;
  view.innerHTML = `
    ${DLG_ESTILOS}
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Diálogos</h2>
        <p class="text-sm text-slate-500">Las plantillas para todos y, eligiendo un cliente, sus diálogos con su nombre</p>
      </div>
    </div>
    <div class="card mb-4" data-dlgv>
      <div class="flex items-end gap-3 flex-wrap">
        <div class="min-w-[220px]">
          <label>Cliente</label>
          <select id="dlgv-cliente" onchange="dlgVista({ clienteId: this.value })">
            <option value="">Todos · solo las plantillas</option>
            ${activos.map(x => `<option value="${x.id}" ${c && x.id === c.id ? 'selected' : ''}>${escapeHtml(x.nombre)}</option>`).join('')}
          </select>
        </div>
        ${c ? `<div class="flex gap-1.5 pb-1">${pestana('galeria', 'Galería')}${pestana('semana', 'Diálogo de su semana')}</div>` : ''}
      </div>
    </div>
    ${_dlgV.modo === 'semana' && c
      ? '<div class="card" id="seg-dialogo"><div class="es-vacio">Armando su diálogo…</div></div>'
      : `<div class="card space-y-3">
          <input id="dlg-q" placeholder="Buscar un diálogo…" oninput="_dlg.q = this.value; dlgPintar()">
          <div class="flex gap-1.5 overflow-x-auto pb-1" id="dlg-cats"></div>
          <div id="dlg-lista" class="space-y-2"></div>
        </div>`}`;
  if (_dlgV.modo === 'semana' && c) { if (typeof dtPintar === 'function') dtPintar(c); }
  else dlgPintar();
};

window.dlgVista = (cambio) => {
  Object.assign(_dlgV, cambio);
  if ('clienteId' in cambio && !cambio.modo) _dlgV.modo = 'galeria';
  rerenderView();
};

window.DLG_BASE = DLG_BASE;
