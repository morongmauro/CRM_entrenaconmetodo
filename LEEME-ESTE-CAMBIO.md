# CRM Entrena con Método · qué subir al repo

Copia estos archivos sobre los del repo respetando las carpetas
(`icons/` dentro de `icons/`, `api/` dentro de `api/`).

## 1 · Los cinco arreglos

| Archivo | Qué cambia |
|---|---|
| `index.html` | Logo de marca, menú lateral, viewport de iPhone, botón de login con estado |
| `app.js` | Caché de datos, router, login, gráficas, retorno tras guardar |
| `composicion.js` | Recarga sin parpadeo, gráficas con unidades |
| `nutricion-plus.js` | Placeholder diferido, gráfica de kcal con eje ajustado |
| `entrenamiento.js` | Placeholder diferido |
| `styles.css` | Menú lateral, esqueletos, selector de periodo, asistente |
| `movil.css` | Ajustes del nuevo shell en el teléfono |
| `marca.css` | Estilo de marca del menú, las gráficas y el asistente |
| `manifest.json` | Iconos y colores de la marca |
| `sw.js` | Service worker con tope de 3,5 s a la red |
| `icons/logo.svg` | **NUEVO** · logo de marca (cabecera, login, favicon) |
| `icons/logo-mark.svg` | **NUEVO** · variante sin fondo, para sobre crema |
| `icons/logo-192.png` `logo-512.png` `logo-maskable.png` | **NUEVO** · iconos PWA |
| `icons/apple-touch-icon.png` | **NUEVO** · "Agregar a inicio" en iPhone |
| `icons/icon.svg` `icon-maskable.svg` | Reemplazan el sello "EM" por el logo real |

## 2 · El asistente

| Archivo | Qué es |
|---|---|
| `asistente.js` | **NUEVO** · la sección "💬 Asistente" y las ocho herramientas que leen tus datos |
| `api/coach-ask.js` | **NUEVO** · el puente con la API de Claude (guarda la clave, no toca Supabase) |

### Variables de entorno en Vercel

| Variable | Necesaria | Para qué |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Sí** | La misma que ya usa la pestaña de oportunidades de Nutrición. Si esa funciona, el asistente funciona sin tocar nada. |
| `CRM_ASK_MODEL` | No | Modo rápido. Por defecto `claude-sonnet-5`. |
| `CRM_ASK_MODEL_FONDO` | No | Modo "a fondo". Por defecto `claude-opus-5`. |

### Los dos modos

- **⚡ Rápido** (por defecto) — Sonnet 5, esfuerzo bajo. Para consultar:
  "¿cuántos días entrena Amali?", "¿cuál fue su última tarea?", "¿quién debe
  pagar?". Unos **30-60 pesos** por pregunta.
- **🧠 A fondo** — Opus 5, esfuerzo alto. Para pedir criterio: adaptar una
  rutina, comparar clientes, decidir qué cambiar. Unos **150-250 pesos**.

El costo real de cada conversación se muestra bajo la caja de texto.

## 3 · Después de subirlo

El service worker cambió de nombre de caché (`ecm-crm-v1` → `ecm-crm-v2`), así
que al entrar se limpia sola la caché vieja. Si el teléfono te sigue mostrando
lo anterior, cierra la app y vuelve a abrirla.

**No hay migraciones de Supabase.** Nada que correr en la base de datos.
