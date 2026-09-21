# Calendario mensual, arrastre y eventos

Qué cambia y qué hay que hacer para que funcione.

---

## 1. Primero el SQL (una sola vez)

**Supabase del CRM → SQL Editor.** Es el único Supabase que hay: el módulo de
entrenamiento vive en la misma base que los clientes.

Pega y corre:

```
entrenamientoecm/carga/migracion-eventos.sql
```

Es idempotente: si lo corres dos veces no pasa nada. Y no depende de que
hayas corrido antes la migración de visibilidad — si le falta alguna columna
de `fases`, se la pone sola.

Si prefieres correr el `schema.sql` completo, también trae los eventos. Las
dos vías llegan al mismo sitio.

**Qué crea:** las tablas `eventos` y `evento_registros`, la función
`evento_fechas()` y la vista `eventos_visibles`.

**Si no lo corres:** el calendario funciona igual, pero sin eventos, y te lo
dice en un recuadro amarillo en vez de fallar.

---

## 2. Los archivos

### Repo `CRM_entrenaconmetodo`

| Archivo | |
|---|---|
| `eventos.js` | **nuevo** |
| `pruebas/` (carpeta entera) | **nueva** |
| `entrenamiento.js` | reemplaza |
| `styles.css` | reemplaza |
| `index.html` | reemplaza |
| `asistente-rutinas.js` | reemplaza |
| `api/coach-ask.js` | reemplaza |
| `musculos-figura.js` | reemplaza |

### Repo `entrenamientoecm`

| Archivo | |
|---|---|
| `carga/migracion-eventos.sql` | **nuevo** |
| `schema.sql` | reemplaza |
| `src/FiguraMusculos.jsx` | reemplaza |

Todo va en la raíz del repo, sin carpetas nuevas salvo `pruebas/`.

`index.html` trae una línea más: carga `eventos.js` después de
`entrenamiento.js`. El orden importa — `eventos.js` usa el catálogo de días
que declara `entrenamiento.js`.

---

## 3. Qué vas a ver

### El calendario ahora es mensual

Antes era una tira de siete casillas: la semana tipo, siempre la misma.
Servía para ver "los lunes hace Push", pero no para lo que de verdad se
pregunta al planificar: en qué fecha empieza, cuándo se acaba, en qué semana
vamos, y qué días entrenó de verdad.

- Las flechas cambian de mes. El botón **Hoy** vuelve.
- Los días fuera de la fase salen apagados y con borde punteado. No se
  esconden, para que el mes siga leyéndose como un mes.
- Los lunes llevan **S1, S2, S3…**: la semana dentro de la fase, que es como
  se habla de la planificación.
- Si la fase no tiene fecha de inicio, te lo dice arriba con el botón para
  ponerla. Sin esa fecha el calendario no sabe dónde cae nada.
- Abre en el mes de la fase, no en el de hoy: al abrir una fase que empieza
  el mes que viene, lo que quieres ver es esa fase.

### Lo que el cliente registró

Cada rutina lleva una marca de lo que pasó ese día:

| | |
|---|---|
| ✓ | lo marcó como hecho |
| ✕ | la saltó |
| ◐ | la empezó y no la cerró |
| · | día pasado con rutina y sin nada registrado |

El punto gris es el que importa: es la ausencia. Un día futuro no lleva nada
porque todavía no ha llegado.

Si el cliente registró un entreno que no estaba en el plan, sale igual, en
cursiva. Antes ese dato no tenía dónde pintarse y se perdía.

### Arrastrar

**En el calendario:** agarra una rutina y suéltala en otro día. Si ese día ya
tiene otra, se intercambian — apiladas, una quedaría invisible. Soltar fuera
del rango de la fase no hace nada.

Las rutinas con borde punteado son **sugeridas**: no tienen día fijo, salen
del reparto por orden sobre los días de la fase. Arrastrarlas las fija.

Ojo: soltar en otro día le fija ese DÍA DE LA SEMANA, no esa fecha. Una fase
de 8 semanas son 8 lunes, no uno.

**En el editor de rutinas:** los ejercicios se arrastran por el puño ⠿ de la
izquierda. La línea verde marca dónde va a caer antes de soltar. Soltar
dentro de un circuito lo mete al circuito; sacarlo lo deja suelto. Las
flechas ↑↓ siguen ahí para el teléfono, donde arrastrar es incómodo.

### Eventos: lo que no es una rutina

Natación, medición de peso, una cita, "esa semana está de viaje". Se crean
con **+ Evento**, o tocando cualquier día del calendario.

Dos formas:
- **Se repite** — unos días de la semana, mientras dure la fase. Opcionalmente
  solo en ciertas semanas ("los viernes de la semana 1 y la 4").
- **Un solo día** — una fecha concreta.

No son rutinas a propósito. Si metieras la natación como rutina, contaría
como rutina no hecha cada vez que el cliente no la marca, y le arruinaría la
adherencia por algo que sí hizo.

Los eventos **heredan de la fase** si el cliente los ve o no. Con la fase sin
enviar, no los ve. Puedes forzarlo por evento.

### El asistente los entiende

> *agrégale natación los lunes y miércoles*
> *ponle medición de peso los viernes de la semana 1 y la 4*
> *quítale el control médico*

Como siempre, **no guarda nada**: deja el cambio propuesto y tú lo apruebas.

### Ejercicios sin descripción

Un ejercicio sin descripción le llega al cliente sin una sola línea de cómo
hacerlo. Ahora se avisa donde importa: al armar la rutina.

- En cada fila, un botón amarillo **⚠ Sin descripción · escribirla** que abre
  el editor de ese ejercicio.
- Arriba, cuántos van así y cuáles.
- En la ficha (👁), el recuadro amarillo en el sitio de la descripción.

De la galería importada de Trainerize son 2.063 los que están así, de 2.226.

### La figura muscular, también aquí

Cada fila del editor lleva la silueta en miniatura con lo que trabaja ese
ejercicio, para reconocerlo sin leer las etiquetas.

---

## 4. Comprobar que quedó

1. Entra a un cliente → **📅 Calendario**. Debe verse un mes, no una tira.
2. Arrastra una rutina a otro día. Debe quedarse ahí al recargar.
3. **+ Evento** → "Natación", se repite, lunes y miércoles → Guardar. Deben
   aparecer los puntos azules en todos los lunes y miércoles de la fase.
4. Abre una rutina y arrastra un ejercicio por el puño ⠿.

Si el paso 3 no deja guardar y sale un error de tabla, es que falta el SQL
del punto 1.
