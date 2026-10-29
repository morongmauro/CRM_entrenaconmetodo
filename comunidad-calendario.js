// =====================================================
// CRM EntrenaConMétodo · COMUNIDAD · CALENDARIO DE PUBLICACIONES
// =====================================================
// Los mensajes que tienes listos para la Comunidad, en orden. Los subes o
// bajas con las flechas (la fecha se queda en su lugar: lo que se mueve es
// el mensaje), los editas y, el día que toca, «Publicar» lo manda a tu
// equipo como cualquier publicación. Nada sale solo.
//
// Vive en comunidad_borradores (migraciones/comunidad-borradores.sql). Sin
// esa tabla la tarjeta lo dice y lo demás de Comunidad sigue igual.
// «Quitar» no borra: lo archiva.
//
// Se pinta dentro de Comunidad (comunidad.js llama a ccalPintar).
// =====================================================

// Los 11 primeros, para cargar con un toque. Fechas: viernes 30 de octubre
// y luego cada lunes.
const CCAL_SUGERIDOS = [
  ['2026-10-30', `El orden en que comes importa casi tanto como lo que comes.

Este fin de semana van a aparecer dulces, antojos y alguna salida. No te voy a pedir que los evites: te voy a pedir que los acomodes. Cuando comes primero la proteína y la verdura, y lo dulce o la harina al final, el azúcar te sube en la sangre mucho menos que si empiezas por ahí. Misma comida, mismas calorías, otra respuesta en tu cuerpo.

Tres cosas para estos días:
• Lo dulce, después de comer, nunca con el estómago vacío.
• Elige el que de verdad te gusta y cómelo sentado y sin pantalla. Lo que más suma es el picoteo sin darte cuenta.
• Sírvete una porción y guarda el paquete. De la bolsa siempre se come más.

Y regístralo igual en la app: no es para juzgarte, es para que yo vea el panorama completo. El lunes no compenses nada. Sigues normal.

Fuente: Shukla y colaboradores, Diabetes Care (2015).`],
  ['2026-11-02', `Si tuviera que escoger un solo hábito para tu salud, sería este: caminar unos minutos después de comer.

Cuando comes, el azúcar de la comida llega a la sangre. Si te quedas sentado, se queda ahí más tiempo. Si te mueves, tus músculos lo usan como gasolina en ese mismo momento. Se ha visto que con apenas 2 a 5 minutos de caminata suave después de comer el pico de azúcar ya baja, comparado con quedarse sentado.

Cómo sacarle el jugo:
• El mejor momento es justo después de la comida más grande del día, en la primera media hora.
• No tiene que ser fuerte: paso de conversación.
• Si no puedes salir, sirve subir y bajar escaleras o caminar mientras hablas por teléfono.
• Tres caminatas cortas al día le ganan a una larga.

Hoy: 10 minutos después del almuerzo. Regístralos en Entreno → Hoy → «Registrar cardio o deporte» y cuéntame cómo te sentiste.

Fuente: Buffey y colaboradores, Sports Medicine (2022).`],
  ['2026-11-09', `No necesitas terminar cada serie arrastrándote para ganar músculo.

Mucha gente cree que si no llega al fallo, la serie no sirvió. Lo que muestran los estudios es otra cosa: quedarte a una o dos repeticiones del fallo te da prácticamente el mismo crecimiento, y te deja con energía para hacer bien las series que siguen y llegar fresco al próximo entreno.

La regla que quiero que uses: las repeticiones en reserva.
• En la mayoría de tus series, para cuando sientas que te quedaban 1 o 2 repeticiones con buena técnica.
• Si te quedaban 5 o más, el peso está liviano: súbelo la próxima vez. La app ya te muestra si subiste o bajaste.
• El fallo déjalo, si acaso, para la última serie de un ejercicio en máquina, nunca en una sentadilla pesada.

Por eso al terminar te pregunto qué tan intenso fue: del 6 al 9 es la zona donde se progresa. Si quieres ir más a fondo, en Aprendizaje → Videos tienes «Cómo se arma un plan de entrenamiento que sirve».

Fuente: Refalo y colaboradores, Sports Medicine (2023).`],
  ['2026-11-16', `Hay comidas que te hacen comer más sin que te des cuenta.

En un experimento muy famoso, las mismas personas vivieron dos semanas con comida ultraprocesada y dos semanas con comida casera. Podían comer todo lo que quisieran. Con los ultraprocesados comieron unas 500 calorías más al día y subieron de peso, sin sentir que tenían más hambre. No era falta de voluntad: era la comida.

La buena noticia es que se reconocen fácil. En tu próxima compra, voltea el paquete:
• Mira los tres primeros ingredientes: son la mayor parte del producto. Si el primero es azúcar, harina refinada o aceite, ya sabes lo que llevas.
• Si la lista es larga y tiene cosas que nunca usarías en tu cocina, es ultraprocesado.
• El azúcar se esconde con otros nombres: jarabe de maíz, maltodextrina, dextrosa, jugo concentrado.
• Revisa la porción: muchas veces el paquete trae tres y la tabla habla de una.

En Aprendizaje → Videos tienes «Leer etiquetas sin que te engañen», partes 1 y 2. Escúchalas antes de ir al súper.

Fuente: Hall y colaboradores, Cell Metabolism (2019).`],
  ['2026-11-23', `Dormir poco puede hacer que pierdas músculo en vez de grasa.

En un estudio, dos grupos siguieron exactamente la misma dieta. Unos dormían ocho horas y media y otros cinco y media. Bajaron un peso parecido, pero los que dormían poco perdieron mucha menos grasa y más músculo, y además pasaron más hambre. Es decir: el mismo esfuerzo, con peor resultado.

Tres ajustes que se notan en una semana:
• El último café, unas 8 horas antes de acostarte. La cafeína sigue trabajando horas después aunque no la sientas: tomada 6 horas antes de dormir ya puede quitarte más de una hora de sueño.
• Diez minutos de luz natural en la mañana, apenas te levantes. Así tu cuerpo sabe a qué hora darte sueño en la noche.
• Cuarto oscuro y fresco, y el celular lejos de la mano media hora antes de dormir.

Si te levantas cansado aunque duermas tus horas, en Aprendizaje → Videos tienes «Duermes ocho horas y sigues cansado».

Fuentes: Nedeltcheva y colaboradores, Annals of Internal Medicine (2010). Drake y colaboradores, Journal of Clinical Sleep Medicine (2013).`],
  ['2026-11-30', `Si sientes que nunca te llenas, casi siempre la respuesta está en la proteína.

Es lo que más sacia de todo lo que comes, y es lo que tu cuerpo usa para construir y mantener músculo. Al juntar decenas de estudios, el beneficio para el músculo sigue creciendo hasta unos 1,6 gramos por kilo de peso al día. Para alguien de 70 kilos, son unos 110 gramos repartidos en el día.

Suena a mucho, pero se logra así:
• Reparte en 3 o 4 comidas, de 25 a 40 gramos cada una.
• Para que te ubiques: 100 g de pechuga cocida dan unos 30 g; una lata de atún, unos 25; un huevo, 6; una taza de fríjoles o lentejas, unos 15.
• Sírvela primero y cómela primero.
• Come despacio, unos 20 minutos por comida: la señal de que ya estás lleno tarda en llegar.

Tu meta exacta ya está en la app, en Alimentación. Y si quieres entender por qué a veces no paras de comer, en Aprendizaje → Videos tienes «La hormona del hambre».

Fuente: Morton y colaboradores, British Journal of Sports Medicine (2018).`],
  ['2026-12-07', `Llegó diciembre, y con él las reuniones. Hablemos del trago sin rodeos.

El alcohol no solo suma calorías: también frena la recuperación de tus músculos. En un estudio, tomar después de entrenar bajó la construcción de músculo cerca de un 24 %, aunque las personas comieran proteína. Y un gramo de alcohol tiene 7 calorías, casi como la grasa, sin aportarte nada a cambio.

No te pido que no tomes. Te pido que lo hagas con estrategia:
• Nunca llegues con hambre a una reunión: come algo con proteína antes de salir.
• Un vaso de agua entre cada trago. Tomas menos y amaneces mucho mejor.
• Si vas a tomar, que no sea justo después de tu entreno más pesado de la semana.
• De la mesa, escoge las dos cosas que de verdad te encantan y disfrútalas. Lo demás, poquito.

Diciembre no se gana aguantando. Se gana decidiendo.

Fuente: Parr y colaboradores, PLOS ONE (2014).`],
  ['2026-12-14', `Si estas semanas andas sin tiempo, te tengo una buena noticia: mantener cuesta mucho menos que ganar.

En un estudio, personas que entrenaban tres veces por semana bajaron a una sola sesión semanal, con un tercio del trabajo. Mantuvieron su músculo y su fuerza durante 32 semanas. Lo que construiste no se va en un par de semanas difíciles.

Para estos días de afán:
• Con 2 entrenos a la semana conservas casi todo, siempre que mantengas el peso.
• Si solo tienes 30 o 40 minutos, haz los primeros ejercicios de fuerza de tu rutina. Son los que más trabajo te dan.
• Si hay que recortar, recorta series, no peso.
• Lo accesorio se puede saltar sin culpa.

Un entreno corto que sí pasó vale más que el largo que nunca hiciste.

Fuente: Bickel y colaboradores, Medicine & Science in Sports & Exercise (2011).`],
  ['2026-12-21', `Un dato que cambia cómo ves las fiestas: lo que se sube en esta época suele ser poco. El problema es que casi nunca se baja.

Cuando se siguió a un grupo de personas durante la temporada de fiestas, en promedio subieron menos de medio kilo. Pero la mayoría no lo bajó en todo el año siguiente. Y año tras año, eso se va sumando sin hacer ruido.

Para las noches de celebración:
• Ese día, desayuno y almuerzo normales, con proteína. Saltarte comidas para «guardar espacio» termina en comer de más en la noche.
• De los platos típicos, escoge tu favorito. No tienes que probar todo.
• Al día siguiente, una caminata con la familia y mucha agua.
• Vuelve a tu rutina el primer día hábil, sin compensar nada.

Un día no cambia tus resultados: lo que pesa es la semana. Disfruta con los tuyos. Feliz Navidad.

Fuente: Yanovski y colaboradores, New England Journal of Medicine (2000).`],
  ['2026-12-28', `Antes de escribir tus propósitos, tengo que contarte algo: un hábito no se forma en 21 días.

Cuando se siguió a personas que querían crear un hábito nuevo, tardaron en promedio 66 días en hacerlo sin pensar, y a algunos les tomó mucho más. Lo mejor del estudio: fallar un día no cambió nada. Lo que cuenta es volver al siguiente.

La técnica con más respaldo para que un propósito sí se cumpla es decidir antes el cuándo y el dónde, con la fórmula «si pasa esto, entonces hago aquello»:
• «Si son las 6 p. m. del lunes, miércoles y viernes, me voy al gimnasio.»
• «Si me sirvo el almuerzo, primero pongo la proteína.»
• Escoge uno solo, no diez.
• Hazlo tan fácil que no puedas decir que no: deja la ropa lista la noche anterior.

Para los días en que no quieras, en Aprendizaje → Videos tienes «De dónde sale la fuerza mental». Y cuéntame aquí abajo cuál es el tuyo para 2027.

Fuentes: Lally y colaboradores, European Journal of Social Psychology (2010). Gollwitzer y Sheeran, Advances in Experimental Social Psychology (2006).`],
  ['2027-01-04', `Volvemos. Y te tengo una buena noticia: tu cuerpo recuerda.

El músculo guarda memoria de lo que ya entrenaste. Cuando vuelves después de una pausa, recupera más rápido de lo que le costó ganarlo la primera vez. Diciembre no te devolvió a cero: te dejó a pocas semanas de donde estabas.

Cómo volver bien:
• La primera semana, al 80 %: el mismo plan, un poco menos de peso y técnica impecable.
• Si te duelen los músculos los primeros días, es normal: dura de uno a tres días y se va solo. No significa que lo estés haciendo mal.
• Retoma el registro de comida desde el desayuno de mañana, sin compensar nada de diciembre.
• En dos semanas vas a estar donde estabas.

Si quieres que ajustemos algo para este año, escríbeme. Vamos con todo, con método.

Fuente: Seaborne y colaboradores, Scientific Reports (2018).`],
];

const _ccal = { ocupado: false, editando: null, verPublicados: false };
const ccalPrimeraLinea = (t) => String(t || '').split('\n').find(l => l.trim()) || '';
const ccalFecha = (f) => {
  if (!f) return 'Sin fecha';
  const [y, m, d] = String(f).split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

async function ccalCargar() {
  const { data, error } = await sb.from('comunidad_borradores')
    .select('id,orden,fecha,texto,publicado_en,post_id,archivado_en').is('archivado_en', null).order('orden', { ascending: true });
  if (error) return { error };
  return { filas: data || [] };
}

function ccalCajaHTML() {
  return `<div class="card" id="com-calendario"><h3 class="font-bold text-slate-900">Calendario de publicaciones</h3><div class="text-sm text-slate-500 mt-2">Cargando…</div></div>`;
}

async function ccalPintar() {
  const caja = document.getElementById('com-calendario');
  if (!caja) return;
  const d = await ccalCargar();
  const cab = (extra = '') => `<div class="flex items-center justify-between gap-3"><h3 class="font-bold text-slate-900">Calendario de publicaciones</h3>${extra}</div>`;
  if (d.error) {
    caja.innerHTML = `${cab()}<div class="text-sm text-slate-600 mt-2">Falta preparar la base: corre <strong>migraciones/comunidad-borradores.sql</strong> en Supabase (SQL Editor) y vuelve a entrar.</div>`;
    return;
  }
  const pend = d.filas.filter(f => !f.publicado_en);
  const hechos = d.filas.filter(f => f.publicado_en).sort((a, b) => (a.publicado_en < b.publicado_en ? 1 : -1));
  if (!d.filas.length) {
    caja.innerHTML = `${cab()}
      <p class="text-xs text-slate-500 mt-1 mb-3">Tus mensajes listos, en orden. Los mueves, los editas y los publicas el día que toca. Nada sale solo.</p>
      <button class="btn btn-primary btn-sm" data-ccal-cargar onclick="ccalCargarSugeridos()">Cargar los ${CCAL_SUGERIDOS.length} mensajes sugeridos</button>`;
    return;
  }
  const fila = (f, i) => {
    const editando = _ccal.editando === f.id;
    const titulo = ccalPrimeraLinea(f.texto);
    const resto = String(f.texto || '').slice(String(f.texto || '').indexOf(titulo) + titulo.length).trim();
    return `<div class="pt-3" style="border-top:1px solid #f1f5f9" data-ccal-fila="${f.id}">
      <div class="flex items-start gap-3">
        <div class="flex flex-col gap-1 flex-shrink-0">
          <button class="btn btn-secondary btn-sm" style="padding:2px 9px" title="Subir" aria-label="Subir" data-ccal-subir onclick="ccalMover('${f.id}', -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-secondary btn-sm" style="padding:2px 9px" title="Bajar" aria-label="Bajar" data-ccal-bajar onclick="ccalMover('${f.id}', 1)" ${i === pend.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold text-slate-500" data-ccal-fecha>${i + 1} · ${escapeHtml(ccalFecha(f.fecha))}</div>
          ${editando
            ? `<textarea id="ccal-edit-${f.id}" rows="12" class="w-full border border-slate-200 rounded-xl p-3 text-sm mt-1">${escapeHtml(f.texto)}</textarea>
               <div class="flex gap-2 mt-2"><button class="btn btn-primary btn-sm" onclick="ccalGuardar('${f.id}')">Guardar</button><button class="btn btn-secondary btn-sm" onclick="ccalEditar(null)">Cancelar</button></div>`
            : `<div class="text-sm font-semibold text-slate-900 mt-0.5" data-ccal-titulo>${escapeHtml(titulo)}</div>
               <div class="text-xs text-slate-500 mt-1" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(resto)}</div>
               <div class="flex flex-wrap gap-2 mt-2">
                 <button class="btn btn-primary btn-sm" data-ccal-publicar onclick="ccalPublicar('${f.id}')">Publicar</button>
                 <button class="btn btn-secondary btn-sm" onclick="ccalEditar('${f.id}')">Ver y editar</button>
                 <button class="btn btn-ghost btn-sm" title="Lo archiva: no se borra" onclick="ccalQuitar('${f.id}')">Quitar</button>
               </div>`}
        </div>
      </div>
    </div>`;
  };
  caja.innerHTML = `${cab(`<span class="text-xs text-slate-500">${pend.length} por publicar</span>`)}
    <p class="text-xs text-slate-500 mt-1">Muévelos con las flechas: la fecha se queda en su lugar y cambia el mensaje. «Publicar» lo manda a tu equipo.</p>
    <div class="space-y-3 mt-1">${pend.length ? pend.map(fila).join('') : '<div class="text-sm text-slate-500 pt-3">Ya publicaste todos.</div>'}</div>
    ${hechos.length ? `<div class="mt-4 pt-3" style="border-top:1px solid #f1f5f9">
      <button class="btn btn-ghost btn-sm" onclick="_ccal.verPublicados=!_ccal.verPublicados;ccalPintar()">${_ccal.verPublicados ? 'Ocultar' : 'Ver'} publicados (${hechos.length})</button>
      ${_ccal.verPublicados ? `<div class="space-y-1 mt-2">${hechos.map(f => `<div class="text-xs text-slate-500" data-ccal-publicado><strong class="text-slate-700">${escapeHtml(ccalPrimeraLinea(f.texto))}</strong> · publicado ${escapeHtml(comFecha(f.publicado_en))}</div>`).join('')}</div>` : ''}
    </div>` : ''}`;
}

window.ccalCargarSugeridos = async () => {
  if (_ccal.ocupado) return;
  _ccal.ocupado = true;
  const filas = CCAL_SUGERIDOS.map(([fecha, texto], i) => ({ orden: (i + 1) * 10, fecha, texto }));
  const { error } = await sb.from('comunidad_borradores').insert(filas);
  _ccal.ocupado = false;
  if (error) { toastError('No se pudieron cargar: ' + (error.message || 'error')); return; }
  toast(`Listo: ${filas.length} mensajes en tu calendario.`);
  ccalPintar();
};

// Subir o bajar: el mensaje cambia de lugar con el vecino y cada lugar
// conserva su fecha.
window.ccalMover = async (id, paso) => {
  if (_ccal.ocupado) return;
  const d = await ccalCargar();
  if (d.error) return;
  const pend = d.filas.filter(f => !f.publicado_en);
  const i = pend.findIndex(f => f.id === id), j = i + paso;
  if (i < 0 || j < 0 || j >= pend.length) return;
  const a = pend[i], b = pend[j];
  _ccal.ocupado = true;
  const r1 = await sb.from('comunidad_borradores').update({ orden: b.orden, fecha: b.fecha }).eq('id', a.id);
  const r2 = await sb.from('comunidad_borradores').update({ orden: a.orden, fecha: a.fecha }).eq('id', b.id);
  _ccal.ocupado = false;
  if (r1.error || r2.error) { toastError('No se pudo mover: ' + ((r1.error || r2.error).message || 'error')); }
  ccalPintar();
};

window.ccalEditar = (id) => { _ccal.editando = id; ccalPintar(); };

window.ccalGuardar = async (id) => {
  const texto = (document.getElementById(`ccal-edit-${id}`)?.value || '').trim();
  if (!texto) { toast('El mensaje no puede quedar vacío'); return; }
  const { error } = await sb.from('comunidad_borradores').update({ texto }).eq('id', id);
  if (error) { toastError('No se pudo guardar: ' + (error.message || 'error')); return; }
  _ccal.editando = null;
  toast('Guardado');
  ccalPintar();
};

window.ccalQuitar = async (id) => {
  if (!confirm('Quitar este mensaje del calendario.\n\nNo se borra: queda archivado.')) return;
  const { error } = await sb.from('comunidad_borradores').update({ archivado_en: new Date().toISOString() }).eq('id', id);
  if (error) { toastError('No se pudo quitar: ' + (error.message || 'error')); return; }
  ccalPintar();
};

window.ccalPublicar = async (id) => {
  if (_ccal.ocupado) return;
  const d = await ccalCargar();
  const f = (d.filas || []).find(x => x.id === id);
  if (!f || f.publicado_en) return;
  if (!confirm(`Publicar en la Comunidad:\n\n«${ccalPrimeraLinea(f.texto)}»\n\nLe sale a todo tu equipo en su app.`)) return;
  _ccal.ocupado = true;
  const { data, error } = await sb.from('comunidad_posts').insert({ texto: f.texto, fijado: false }).select('id');
  if (error) { _ccal.ocupado = false; toastError('No se pudo publicar: ' + (error.message || 'error')); return; }
  const postId = Array.isArray(data) ? (data[0] || {}).id : (data || {}).id;
  await sb.from('comunidad_borradores').update({ publicado_en: new Date().toISOString(), post_id: postId || null }).eq('id', id);
  _ccal.ocupado = false;
  toast('Publicado. Ya le sale a tu equipo.');
  if (typeof routes !== 'undefined' && routes.comunidad) routes.comunidad(); else ccalPintar();
};
