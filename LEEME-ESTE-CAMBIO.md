# CRM Entrena con Método · qué subir al repo

Copia estos archivos sobre los del repo respetando las carpetas
(`icons/` dentro de `icons/`, `api/` dentro de `api/`).

> ⚠️ Este paquete **reemplaza** a los dos anteriores. Trae un arreglo
> importante que los otros no tenían (ver "Arreglos" abajo).

## 1 · Los cinco arreglos originales

| Archivo | Qué cambia |
|---|---|
| `index.html` | Logo de marca, menú lateral, viewport de iPhone, login con estado |
| `app.js` | Caché de datos, router, login, gráficas, retorno tras guardar |
| `composicion.js` | Recarga sin parpadeo, gráficas con unidades |
| `nutricion-plus.js` | Placeholder diferido, gráfica de kcal con eje ajustado |
| `styles.css` `movil.css` `marca.css` | Menú lateral, esqueletos, gráficas, calendario, agentes |
| `manifest.json` | Iconos y colores de la marca |
| `sw.js` | Service worker con tope de 3,5 s a la red |
| `icons/*` | El logo real (M + anillo) en todos sus tamaños |

## 2 · Entrenamiento: vista nueva + agente

| Archivo | Qué es |
|---|---|
| `entrenamiento.js` | Calendario de la fase, rutinas desplegables con sus ejercicios, lectura del historial de entreno |
| `asistente-rutinas.js` | **NUEVO** · el agente de la sección, con sus 11 herramientas |
| `asistente.js` | El asistente general + el motor que ahora comparten los dos |
| `api/coach-ask.js` | El puente con Claude, ahora con dos perfiles (general y rutinas) |

### Al entrar a un cliente ahora ves

- **📅 Calendario** — la semana con qué rutina cae qué día, en qué semana de
  la fase vas, y aviso si hay más rutinas que días declarados.
- **📋 Rutinas** — cada una se despliega con todos sus ejercicios (series,
  reps, peso, descanso, patrón) sin entrar al constructor.
- **🗂️ Fases** — lo de antes, intacto.

### El agente

Botón "💬 Preguntarle al agente sobre este plan" al final de la sección.

**Lee:** el plan y su calendario, cada rutina, la galería de ejercicios, la
cobertura por patrón y músculo, y los pesos que el cliente ha registrado en
su app (serie a serie, con su récord).

**Escribe: nada, sin tu permiso.** Cuando le pides un cambio te lo deja
*propuesto* en una tarjeta amarilla con "Aplicar todo" y "Descartar". Nada
toca la base de datos hasta que pulses Aplicar.

## 3 · Variables de entorno en Vercel

| Variable | Necesaria | Para qué |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Sí** | La misma que ya usa Nutrición → Oportunidades |
| `CRM_ASK_MODEL` | No | Modo rápido. Por defecto `claude-sonnet-5` |
| `CRM_ASK_MODEL_FONDO` | No | Modo "a fondo". Por defecto `claude-opus-5` |

## 4 · Arreglos que venían con bug en los zips anteriores

- **El esqueleto de carga borraba la pantalla.** Las pestañas internas de
  Entrenamiento, Pagos, Pendientes, Seguimiento e IA llaman a su vista sin
  pasar por el router, y nadie cancelaba el temporizador del "Cargando…": la
  pantalla se pintaba bien y 160 ms después se quedaba en blanco. Si ya
  subiste alguno de los zips anteriores, **sube este**.

## 5 · Después de subirlo

El service worker cambió de nombre de caché (`ecm-crm-v1` → `ecm-crm-v2`),
así que se limpia sola la caché vieja al entrar.

**No hay migraciones de Supabase.** El agente lee `sesiones` y `series_log`,
que ya existen si corriste el schema del módulo de entrenamiento. Si no lo
corriste, la herramienta de pesos avisa en vez de romperse.
