# Pruebas

Son scripts sueltos de Node, sin framework. Se corren a mano cuando tocas lo
que prueban.

## `eventos-fechas.mjs`

Compara `evtFechasDe()` (JS, en `eventos.js`) con `evento_fechas()` (SQL, en
`entrenamientoecm/carga/migracion-eventos.sql`) sobre los mismos eventos.

Las dos calculan lo mismo a propósito: el CRM necesita pintar el mes entero
sin ir al servidor por cada evento, y la app del cliente lee la función de la
base. El día que se separen, el CRM te mostraría la natación un lunes y al
cliente le aparecería otro día, y no hay nada que lo avise solo.

Necesita un Postgres con el esquema y unos eventos de ejemplo cargados
(`fases` + `eventos` con los ids que están dentro del archivo). Si no lo
tienes levantado, el script falla al llamar a `psql` — no es un fallo de la
lógica.

```
node pruebas/eventos-fechas.mjs
```

Cubre también los bordes que el SQL no puede dar: evento sin fase, fase sin
fecha de inicio, un código de día inventado, una semana fuera del rango, y el
domingo — que es el que más se rompe, porque `getDay()` lo numera 0 y
descuadra la semana española entera si se usa tal cual.

## `rutina-reordenar.mjs`

Prueba `entReordenarRE()` (en `entrenamiento.js`) en seco: sin DOM y sin red,
con la capa de datos sustituida por un espía que anota qué filas se
escribirían.

```
node pruebas/rutina-reordenar.mjs
```

Reordenar arrastrando es fácil de escribir mal de formas que solo se notan
tres movimientos después. Los casos que cubre:

- **Arriba y abajo.** Mover hacia abajo y hacia arriba no son simétricos:
  al sacar el elemento de la lista, los índices de todo lo que venía detrás
  se corren uno. Si eso no se tiene en cuenta, soltar "después de D" deja el
  ejercicio antes de D.
- **`orden` sin huecos ni empates.** Cada caso comprueba que la columna
  queda 1..n exacta. Dos ejercicios con el mismo `orden` se pintan en un
  orden que depende de cómo venga la consulta, y cambia entre recargas.
- **Escrituras mínimas.** Mover el penúltimo al final toca 2 filas, no 5.
- **Bloques.** Soltar dentro de un circuito hereda el bloque, y moverse
  entre sueltos no escribe `bloque_id`. Un ejercicio que se ve dentro del
  recuadro del circuito pero está suelto en la base es el error mudo que
  más caro sale: el cliente lo ejecuta aparte.
- **Arrastrar algo que ya no está** (se borró en otra pestaña) no escribe
  nada en vez de renumerar la lista contra un fantasma.

## `arrastre-rutina.mjs` y `arrastre-calendario.mjs`

Abren en Chromium las páginas de `arnes/`, que montan el editor de rutinas y
el calendario con datos inventados y la capa de datos sustituida por un
espía. Luego disparan los eventos de arrastre a mano y comprueban qué se
habría escrito.

```
npm i -D playwright        # solo la primera vez
node pruebas/arrastre-rutina.mjs
node pruebas/arrastre-calendario.mjs
```

Los eventos van a mano y no con el ratón de Playwright porque el arrastre
nativo de HTML5 no se dispara de forma fiable con movimientos de ratón
sintéticos en headless: la prueba quedaría en verde sin haber probado nada.

Qué cubren:

**Editor de rutinas.** Que la línea de inserción salga arriba o abajo según
por dónde pase el cursor; que soltar dentro de un circuito le herede el
bloque y sacarlo de ahí se lo quite; que soltar en un bloque vacío funcione
(sin filas dentro no hay sobre qué soltar, así que es el único camino); y
que soltar un ejercicio sobre sí mismo no escriba nada.

**Calendario.** Que no se pueda soltar fuera del rango de la fase; que
soltar en un día ocupado intercambie las dos rutinas en vez de apilarlas
(apiladas, una queda invisible); que arrastrar una rutina "sugerida" le fije
el día; y que soltarla en el día que ya tenía no escriba nada.

### `arnes/`

Las dos páginas cargan `entrenamiento.js`, `eventos.js` y
`musculos-figura.js` de verdad, con un sustituto mínimo de lo que aporta
`app.js` (`$`, `escapeHtml`, `fmt`, `toast`, el router). Sirven también para
mirar el render sin levantar el CRM entero: ábrelas en el navegador.

Ojo: no cargan Tailwind, así que la maquetación se ve más pobre que en la
app. Lo que prueban es la lógica y el CSS propio de `styles.css`, no el
aspecto final.

## `actividad-perfil.mjs`

Renderiza `compRegistradaHTML()` (en `composicion.js`) con datos de ejemplo,
sin DOM ni red.

```
node pruebas/actividad-perfil.mjs
```

Es una plantilla de cien líneas con sumas, agrupaciones y un gráfico de
barras. `node --check` la da por buena aunque tenga un `${}` a medio cerrar
o una división entre cero: eso solo se ve al pintarla. La prueba comprueba
que no salgan `undefined`, `NaN` ni llaves sin sustituir, y los tres casos
que cambian lo que se enseña:

- **Sin la migración corrida** (devuelve `null`): tiene que decir qué archivo
  falta, y no inventar ceros. Un "0 minutos" cuando en realidad no hay tabla
  es peor que no mostrar nada.
- **Sin registros** (`[]`): explica que lo registra el cliente desde su app,
  para que no parezca que el CRM está roto.
- **Un registro pelado** (sin minutos ni kilómetros): el caso que produce
  `NaN` en cuanto alguien divide sin comprobar.
