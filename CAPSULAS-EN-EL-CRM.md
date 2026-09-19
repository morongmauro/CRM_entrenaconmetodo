# El Centro de Aprendizaje dentro del CRM

Qué material del Centro de Recursos —onboarding, guía de alimentación,
cápsulas y podcast— ha visto cada cliente. Todo llega solo: lo registra el
propio Centro de Recursos cuando el cliente abre cada pieza, y el CRM lo lee
de `reading_state` (Supabase del centro, solo lectura).

## Qué se ve y dónde

**1 · Sección “📚 Aprendizaje”** (barra lateral) — el módulo completo, con
todos los clientes a la vez. Tres pestañas:

- **Por cliente** — una fila por persona: onboarding, guía, cápsulas y
  podcast, cada uno con su barra y su total, más su última señal de vida en
  el centro. Ordenado por quien menos ha visto: arriba está a quien hay que
  empujar. Se despliega y muestra pieza por pieza qué vio y qué le falta,
  con un botón para **copiar lo que le falta** y pegárselo por chat.
- **Por contenido** — la misma pregunta al revés: de cada pieza publicada,
  cuántos la vieron y **quiénes no**. Si el 80% no abrió una cápsula, el
  problema es la cápsula, no el cliente.
- **Matriz** — la cuadrícula completa, clientes × contenido, con exportación
  a CSV.

Arriba, cuatro cifras: clientes en el filtro, cuántos han abierto algo,
avance promedio y cuántos no han abierto nada (con sus nombres).

**2 · Tarjeta del listado de clientes** — una línea: `Cápsulas 🖼️ 4/11`.
Verde si las vio todas, ámbar a medias, gris si ninguna.

**3 · Ficha del cliente → “📚 Centro de recursos · qué ha visto”** — lo
mismo pero de una sola persona: chips de resumen, las 5 secciones del
onboarding, **los 15 capítulos de la guía**, las 11 cápsulas agrupadas por
categoría, los podcast, y un atajo a la sección de Aprendizaje.

**4 · Journey del cliente** — los pasos “Leyó preguntas frecuentes”, “Leyó
la guía de alimentación” y “Empezó las cápsulas informativas” se marcan
solos.

## Lo único que hay que mantener

Cuando publiques algo nuevo en el Centro de Recursos, añádelo también al
catálogo del CRM: en `app.js` están `CENTRO_CAPSULAS`, `CENTRO_GUIA`,
`CENTRO_PODCASTS` y `CENTRO_HUB_SECCIONES`.

**El `id` tiene que ser EXACTAMENTE el del otro repo** (`capsulas/capsulas.js`,
`podcast/podcasts.js`, y el `data-section` del capítulo en
`guiaalimentacion.html`). Es lo que se cruza contra `section_key`.

El catálogo sirve para saber qué **falta**. Si se te olvida copiar algo, no
se rompe nada: lo que el cliente vio aparece igual en su ficha, bajo el grupo
“Otras”, con el título que quedó registrado. En la sección de Aprendizaje no
suma, porque allí se mide contra lo publicado.

## Detalle técnico

- Fuente: vista `reading_state` del Supabase del centro. Se pide con
  `select=*` (así se aprovecha la columna de fecha si la vista la expone) y
  se cae a las columnas seguras si no se puede.
- Fuentes que lee: `hub` (onboarding y FAQ), `guia` (capítulos de la guía —
  también se acepta `ga` por filas viejas), `capsula` (llave `cap:<id>`) y
  `podcast` (llave `pod:<id>`).
- Se pide **una sola vez por sesión** para todos los clientes y queda en
  cache; los botones ↻ / 🔄 la vacían.
- Los nombres se cruzan con `normalizeName`, así que tildes y mayúsculas no
  importan. **Sí importa que el cliente escriba su nombre igual que como está
  en el CRM** al entrar al centro. Cuando no cuadra, la sección de
  Aprendizaje lo avisa arriba con el nombre exacto que quedó registrado, en
  vez de dejarlo en cero sin explicación.

## Historial de arreglos

- Los `id` de `CENTRO_CAPSULAS` estaban puestos a ojo (`nutricion-proteina`
  en vez de `nut-07-cada-macro`): el CRM decía 0/10 siempre y mandaba todo lo
  visto al cajón de “Otras”. Corregidos contra el repo del centro.
- El CRM leía la guía de `source='ga'` pero el centro la escribe como
  `'guia'`: la guía salía en cero y el paso del journey “Leyó la guía de
  alimentación” no se marcaba nunca. Ahora se aceptan las dos.
