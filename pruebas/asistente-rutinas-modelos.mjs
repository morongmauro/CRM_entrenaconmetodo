// El asistente de rutinas usa Haiku 5.5 (Rápido) y Opus 5.5 (Profundo y Muy
// profundo); el asistente general sigue igual. Si el modelo nuevo falla, la
// misma pregunta va al de siempre.
//   node pruebas/asistente-rutinas-modelos.mjs
process.env.ANTHROPIC_API_KEY = 'prueba';
const { default: handler } = await import('../api/coach-ask.js');

let fallas = 0;
const ok = (n, c, extra = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${c ? '' : ' ' + extra}`); if (!c) fallas++; };

let pedidos = [];
let responder = () => ({ status: 200, body: { content: [{ type: 'text', text: 'listo' }], stop_reason: 'end_turn', model: 'x', usage: {} } });
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  pedidos.push({ headers: init.headers, body });
  const r = responder(body);
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
};

async function preguntar(perfil, nivel) {
  pedidos = [];
  const req = { method: 'POST', headers: { host: 'crm.test', origin: 'https://crm.test', 'x-forwarded-for': `1.2.3.${Math.random()}` },
    body: { messages: [{ role: 'user', content: 'agrégale fondos al Push' }], nivel, perfil } };
  let estado = 0, salida = null;
  const res = { status(s) { estado = s; return this; }, json(o) { salida = o; return this; }, end() { return this; } };
  await handler(req, res);
  return { estado, salida };
}

let r = await preguntar('rutinas', 'rapido');
ok('rutinas · Rápido → Haiku 5.5, esfuerzo bajo', pedidos[0].body.model === 'claude-haiku-5-5' && pedidos[0].body.output_config.effort === 'low', JSON.stringify(pedidos[0].body.model));
ok('Haiku 5.5 sin respaldo del servidor (no lo acepta)', !('fallbacks' in pedidos[0].body) && !pedidos[0].headers['anthropic-beta']);
ok('responde 200', r.estado === 200);

r = await preguntar('rutinas', 'profundo');
ok('rutinas · Profundo → Opus 5.5, esfuerzo medio', pedidos[0].body.model === 'claude-opus-5-5' && pedidos[0].body.output_config.effort === 'medium');
ok('Opus 5.5 con respaldo ante rechazos por error', pedidos[0].body.fallbacks === 'default' && pedidos[0].headers['anthropic-beta'] === 'server-side-fallback-2026-07-01');
ok('pensamiento adaptativo, sin tool_choice forzado', pedidos[0].body.thinking.type === 'adaptive' && !('tool_choice' in pedidos[0].body));

r = await preguntar('rutinas', 'muy_profundo');
ok('rutinas · Muy profundo → Opus 5.5, esfuerzo alto', pedidos[0].body.model === 'claude-opus-5-5' && pedidos[0].body.output_config.effort === 'high');

for (const [nivel, modelo] of [['rapido', 'claude-sonnet-5'], ['profundo', 'claude-opus-5'], ['muy_profundo', 'claude-opus-5']]) {
  await preguntar('general', nivel);
  ok(`asistente general · ${nivel} sigue en ${modelo}`, pedidos[0].body.model === modelo && !('fallbacks' in pedidos[0].body) && !pedidos[0].headers['anthropic-beta']);
}

// Si el nuevo no está disponible, va al de siempre y responde igual.
responder = (b) => b.model === 'claude-haiku-5-5'
  ? { status: 404, body: { error: { message: 'model not found' } } }
  : { status: 200, body: { content: [{ type: 'text', text: 'listo' }], stop_reason: 'end_turn', model: b.model, usage: {} } };
const warn = console.warn; console.warn = () => {};
r = await preguntar('rutinas', 'rapido');
ok('Haiku 5.5 caído → repite con Sonnet 5 y responde', pedidos.length === 2 && pedidos[1].body.model === 'claude-sonnet-5' && r.estado === 200 && r.salida.model === 'claude-sonnet-5', JSON.stringify(pedidos.map(p => p.body.model)));
responder = (b) => b.model === 'claude-opus-5-5'
  ? { status: 400, body: { error: { message: 'fallbacks not supported' } } }
  : { status: 200, body: { content: [{ type: 'text', text: 'listo' }], stop_reason: 'end_turn', model: b.model, usage: {} } };
r = await preguntar('rutinas', 'profundo');
ok('Opus 5.5 rechaza la petición → repite con Opus 5 (sin respaldo)', pedidos.length === 2 && pedidos[1].body.model === 'claude-opus-5' && !('fallbacks' in pedidos[1].body) && !pedidos[1].headers['anthropic-beta'] && r.estado === 200);
responder = () => ({ status: 500, body: { error: { message: 'caída' } } });
r = await preguntar('general', 'rapido');
ok('el general no reintenta (nada cambió ahí)', pedidos.length === 1 && r.estado === 500);
console.warn = warn;

console.log(fallas ? `\n${fallas} falla(s)` : '\ntodo bien');
process.exit(fallas ? 1 : 0);
