// /api/chat.js
// Proxy serverless que protege la API key de Anthropic.
// La key vive solo en variables de entorno de Vercel, nunca en el navegador.

import { guard } from './_guard.js';

// Solo los modelos que la app usa realmente. Sin esto, cualquiera que
// descubriera el endpoint podía usar nuestra key con el modelo más caro.
const ALLOWED_MODEL_PREFIXES = ['claude-haiku-', 'claude-sonnet-'];
const MAX_TOKENS_CAP = 4000;

// Permite enviar la respuesta por partes (streaming) en vez de esperar a que
// Anthropic termine de generar todo. El frontend muestra el avance en vivo.
export const config = { supportsResponseStreaming: true };

export default async function handler(req, res) {
  // Solo aceptamos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificamos que la API key esté configurada
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  if (!guard(req, res, { key: 'chat', limit: 20 })) return;

  try {
    const { model, max_tokens, system, messages, stream } = req.body;

    if (typeof model === 'string' && !ALLOWED_MODEL_PREFIXES.some(p => model.startsWith(p))) {
      return res.status(400).json({ error: 'Model not allowed' });
    }

    // Validación básica
    if (!model || !messages) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hasContent = (c) => {
      if (typeof c === 'string') return c.trim().length > 0;
      if (Array.isArray(c)) return c.length > 0;
      return c != null;
    };
    const cleanedMessages = Array.isArray(messages)
      ? messages.filter((m) => m && hasContent(m.content))
      : messages;

    if (Array.isArray(cleanedMessages) && cleanedMessages.length === 0) {
      return res.status(400).json({ error: 'No messages with content' });
    }

    // Llamada real a Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(Number(max_tokens) || 4000, MAX_TOKENS_CAP),
        // temperature 0 SIEMPRE, fijada en el server: el trabajo principal de
        // este endpoint es estimar macros, y con la temperature por defecto
        // (1.0) el mismo "arepa mediana" daba números distintos cada día —
        // el reporte de inconsistencia de los clientes. Determinismo primero.
        temperature: 0,
        system: system || '',
        messages: cleanedMessages,
        ...(stream ? { stream: true } : {}),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: data.error?.message || 'Anthropic API error',
        status: response.status,
      });
    }

    if (stream) {
      // Reenvía los eventos SSE de Anthropic tal cual llegan. Así la primera
      // parte de la respuesta viaja al navegador apenas se genera, en vez de
      // quedarse retenida acá hasta el final.
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      for await (const chunk of response.body) {
        res.write(chunk);
      }
      return res.end();
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    // Si el stream ya arrancó no se puede cambiar el status: solo cerramos y
    // el frontend detecta el JSON incompleto y reintenta.
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: 'Internal server error' });
  }
}
