// /api/_niveles.js
// ─────────────────────────────────────────────────────────────────────────
// Los tres niveles de análisis, en un solo sitio.
//
// Es la misma escala para todo lo que usa IA en el CRM: las oportunidades de
// alimentación, el asistente y el agente de rutinas. Que "profundo" signifique
// lo mismo en las tres pantallas es la mitad del valor: si cada una tuviera su
// propia idea de profundidad, el coach no podría predecir ni el resultado ni
// la factura.
//
// QUÉ MUEVE EL PRECIO
// El gasto se va casi todo en tokens de SALIDA, y el pensamiento del modelo se
// cobra como salida. Así que el 'effort' pesa tanto como el modelo:
//
//   Opus 5     5 USD por millón de entrada · 25 de salida
//   Sonnet 5   2 USD por millón de entrada · 10 de salida
//
// El prefijo "_" del archivo evita que Vercel lo publique como función.
// ─────────────────────────────────────────────────────────────────────────

// max_tokens es un TECHO, no un objetivo: no se paga por reservarlo, solo por
// lo que se escribe. Pero acotarlo evita que una respuesta se desmadre, y en
// los niveles bajos empuja a ser breve.
export const NIVELES = {
  rapido: {
    etiqueta: 'Rápido',
    modelo: 'claude-sonnet-5',
    effort: 'low',
    max_tokens_insight: 6000,
    max_tokens_chat: 4000,
    descripcion: 'Para consultar datos y cambios sencillos. Responde en segundos.',
  },
  profundo: {
    etiqueta: 'Profundo',
    modelo: 'claude-opus-5',
    effort: 'medium',
    max_tokens_insight: 10000,
    max_tokens_chat: 8000,
    descripcion: 'Para pedirle criterio: qué ajustar, qué falta, cómo adaptar.',
  },
  muy_profundo: {
    etiqueta: 'Muy profundo',
    modelo: 'claude-opus-5',
    effort: 'high',
    max_tokens_insight: 12000,
    max_tokens_chat: 8000,
    descripcion: 'Lo máximo. Piensa largo antes de responder; también tarda más.',
  },
};

export const NIVEL_POR_DEFECTO = 'profundo';

// Devuelve siempre un nivel válido, con las variables de entorno como último
// recurso para poder forzar uno sin tocar la pantalla.
export function resolverNivel(nivel, envVar) {
  if (NIVELES[nivel]) return { clave: nivel, ...NIVELES[nivel] };
  const forzado = envVar && NIVELES[envVar] ? envVar : NIVEL_POR_DEFECTO;
  return { clave: forzado, ...NIVELES[forzado] };
}
