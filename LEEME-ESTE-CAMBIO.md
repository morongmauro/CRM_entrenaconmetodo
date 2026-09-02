# CRM Entrena con Método · qué subir

Copia estos archivos sobre los del repo respetando las carpetas.
**Reemplaza cualquier zip anterior.**

## Qué trae

**Los cinco arreglos originales** — velocidad, logo de marca, login y móvil,
gráficas legibles, menú lateral.

**Entrenamiento** — al entrar a un cliente: calendario de la semana, rutinas
que se despliegan con todos sus ejercicios, y el agente de rutinas.

**Los dos agentes** — `asistente.js` (💬 Asistente) y `asistente-rutinas.js`
(dentro de Entrenamiento). Los cambios que propone el de rutinas NO se
guardan hasta que pulses "Aplicar todo".

**Aviso de lectura del Mealtracker** (nuevo) — ver abajo.

## Configuración

| Variable en Vercel | ¿Necesaria? |
|---|---|
| `ANTHROPIC_API_KEY` | **Sí**, para los agentes y para las sugerencias de alimentación. Es UNA sola para las tres cosas. |
| `CRM_ASK_MODEL` | No. Modo rápido, por defecto `claude-sonnet-5`. |
| `CRM_ASK_MODEL_FONDO` | No. Modo "a fondo", por defecto `claude-opus-5`. |

Para saber si ya tienes la primera: entra a Nutrición → un cliente →
pestaña Oportunidades. Si genera el análisis, ya la tienes.

## Sobre el Mealtracker

La tabla `user_data` tiene RLS activada y sin políticas. Eso significa que
la lectura directa con la llave pública **devuelve cero filas sin dar
error**: el CRM no falla, muestra "no registró nada" para todos.

Este paquete lo detecta y lo dice, en vez de dejarte creer que tus clientes
no registran. Si ves el aviso en Nutrición, la solución es configurar la API
de coach en **Ajustes**:

- URL de la app del Mealtracker
- Contraseña de coach (la `COACH_PASSWORD` del proyecto del Mealtracker)

Con eso el CRM lee por el servidor, con permisos completos, y la RLS deja de
estorbar. Además la llave pública de `config.js` deja de usarse.

Si Nutrición ya te muestra datos hoy, no tienes que hacer nada: ya estás por
ese camino.

## Después de subirlo

El service worker cambió de nombre de caché, así que se limpia sola la vieja.
**No hay migraciones de Supabase.**
