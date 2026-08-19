// /api/coach-insight.js
// ─────────────────────────────────────────────────────────────────────────
// "Oportunidades de mejora" de la sección Nutrición del CRM.
//
// El navegador manda SOLO el análisis ya calculado de la semana (números,
// top de alimentos, macros, metas…), nunca la data cruda del Mealtracker: el
// prompt de coach vive acá, en el servidor, y la API key de Anthropic nunca
// baja al cliente.
//
// Respuesta: streaming SSE tal cual llega de Anthropic (igual que /api/chat),
// para que el CRM pinte el texto mientras se genera y no se choque con el
// límite de tiempo de la función.
// ─────────────────────────────────────────────────────────────────────────

import { guard } from './_guard.js';

export const config = { supportsResponseStreaming: true, maxDuration: 60 };

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 12000;
const MAX_BODY_CHARS = 60000;   // el análisis de una semana pesa ~3-8 KB

// El formato de salida es a propósito plano y delimitado por @@: se puede
// parsear a medida que llega (streaming) sin esperar a que cierre un JSON.
const SYSTEM = `Eres el analista nutricional de un coach de entrenamiento y nutrición.
Escribes PARA EL COACH (no para el cliente), en español de Colombia, tuteando al coach.

Recibes el análisis YA CALCULADO de UNA semana de registro de comidas de UN cliente
(app Mealtracker): días registrados, kcal y macros promedio vs. su meta, distribución
por día, alimentos más repetidos, los que más calorías aportaron, densidad proteica,
fibra/omega3/azúcar estimados, horarios, entre semana vs. fin de semana, agua y el
contexto del cliente (objetivo, peso, lesiones, restricciones).

TU TRABAJO: encontrar las 3 a 5 oportunidades de mejora MÁS VALIOSAS de ESA semana
y entregárselas al coach listas para conversarlas con el cliente.

REGLAS DURAS — el valor está acá:
1. CADA oportunidad se ancla en un número concreto del análisis. Si no hay dato que
   la sustente, no la escribas. Cita el número textual ("proteína 92 g/día vs meta 150",
   "sábado 3.180 kcal vs 2.100 de meta").
2. PROHIBIDO el consejo genérico de internet: "toma más agua", "come más verduras",
   "cuida las porciones", "sé consistente", "prioriza comida real". Si una frase
   serviría igual para cualquier persona del planeta, bórrala.
3. Prioriza por IMPACTO REAL sobre el objetivo del cliente, en este orden:
   (a) adherencia al registro — sin datos no hay nada que ajustar;
   (b) proteína y déficit/superávit calórico semanal (no diario);
   (c) el patrón que rompe la semana (un solo día, una sola comida, un solo alimento);
   (d) calidad/saciedad (fibra, azúcar añadida, densidad calórica);
   (e) detalles finos (timing, distribución, micros).
   No pases al siguiente nivel si el anterior está roto.
4. Piensa en PROMEDIO SEMANAL, no en días sueltos. Un día alto no rompe una semana;
   señálalo solo si mueve el promedio.
5. UNA acción concreta por oportunidad — un cambio, medible, que el cliente pueda
   hacer esta semana con los alimentos que YA come (nombra los suyos, los que
   aparecen en su registro). Nada de "reemplaza por opciones más saludables":
   di exactamente qué por qué, y cuánto.
6. Si faltan días de registro, DILO y no inventes conclusiones sobre lo que come:
   con menos de 4 días registrados, la única oportunidad legítima suele ser el registro.
7. Nunca diagnostiques patologías ni prescribas suplementos o fármacos. Si ves algo
   que huele a tema clínico (restricción muy severa, señales de conducta alimentaria,
   una patología del cliente en el contexto), no lo trates: dilo en @@ALERTA para que
   el coach lo derive.
8. DOS BASES DISTINTAS, no las mezcles: kcal y macros salen de TODOS los días
   registrados (registro.dias_registrados); los alimentos, la fibra, el azúcar y el
   número de comidas salen SOLO de los días que traen desglose
   (registro.dias_con_detalle). Si dias_con_detalle es mucho menor, no concluyas
   sobre lo que come — di que falta el desglose.
9. Cero relleno, cero introducciones, cero "¡excelente trabajo!". El coach lee esto
   con 10 clientes en fila.

FORMATO DE SALIDA — exactamente estos bloques, sin markdown, sin viñetas fuera de
las indicadas, sin texto antes ni después:

@@DIAGNOSTICO
2-4 frases: qué pasó de verdad esta semana, con números. La lectura que haría un
experto, no un resumen de la tabla.

@@OPORTUNIDAD
titulo: máximo 8 palabras, concreta
impacto: alto | medio | bajo
dato: el número exacto que la sustenta
porque: por qué importa PARA ESTE cliente y su objetivo (1-2 frases, fisiología o
adherencia, sin tecnicismos gratuitos)
accion: el cambio exacto que hará esta semana (con gramos/porciones/alimentos suyos)
mensaje: el texto EXACTO que el coach le puede copiar y pegar al cliente por WhatsApp.
Cálido, directo, en segunda persona, sin regaño, sin emojis salvo uno al final si suma.
2-4 frases máximo.

(repite @@OPORTUNIDAD por cada una, 3 a 5 en total, la más valiosa primero)

@@NO_TOCAR
1-2 frases: qué está funcionando y NO hay que cambiarle esta semana, con el dato que
lo respalda. Un experto también protege lo que ya funciona.

@@PREGUNTAS
2-3 preguntas cortas que el coach debería hacerle al cliente porque la data sola no
las responde (contexto, hambre, horarios, viajes, ánimo). Una por línea, empezando con "- ".

@@ALERTA
Solo si aplica: una línea con el tema a derivar o vigilar. Si no aplica, escribe: ninguna`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'Falta ANTHROPIC_API_KEY en las variables de entorno del proyecto del CRM en Vercel.',
      code: 'no_api_key',
    });
  }

  // Mismo escudo que /api/chat: origen propio + límite por IP. Estas llamadas
  // son caras, así que el límite es más bajo que el del chat.
  if (!guard(req, res, { key: 'coach-insight', limit: 12 })) return;

  try {
    const { analisis, extra } = req.body || {};
    if (!analisis || typeof analisis !== 'object') {
      return res.status(400).json({ error: 'Falta el análisis de la semana' });
    }

    const payload = JSON.stringify(analisis);
    if (payload.length > MAX_BODY_CHARS) {
      return res.status(413).json({ error: 'El análisis enviado es demasiado grande' });
    }

    const nota = typeof extra === 'string' && extra.trim()
      ? `\n\nNOTA DEL COACH (tenla en cuenta, manda sobre lo que diga la data):\n${extra.trim().slice(0, 1500)}`
      : '';

    const userMsg =
      `Análisis de la semana (JSON):\n\`\`\`json\n${payload}\n\`\`\`${nota}\n\n` +
      `Dame las oportunidades de mejora en el formato indicado.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Pensamiento adaptativo + esfuerzo alto: es un análisis de criterio,
        // no una extracción. Acá SÍ queremos que el modelo piense antes.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMsg }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: data.error?.message || 'Anthropic API error',
        status: response.status,
      });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    for await (const chunk of response.body) res.write(chunk);
    return res.end();
  } catch (error) {
    console.error('coach-insight error:', error);
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: 'Internal server error' });
  }
}
