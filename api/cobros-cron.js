// /api/cobros-cron.js
// GENERA LOS COBROS DEL MES, solo. Corre el día 1 de cada mes.
//
// POR QUÉ EXISTE
// La tabla de pagos es la única fuente de verdad: un mes con cobro registrado
// y sin marcar pagado es deuda, y un mes sin fila significa que esa persona no
// tuvo coaching. Esa regla es la correcta, pero tiene un filo: si nadie crea
// las filas del mes nuevo, en ese mes NADIE recibe recordatorio. Hasta ahora
// las creaba un botón que había que acordarse de apretar.
//
// QUÉ HACE, EXACTAMENTE
// Por cada cliente ACTIVO que no tenga ya una fila de ese mes, crea un cobro
// pendiente con el monto del último mes que pagó (o el de su ficha si no tiene
// historial). Nada más: no marca pagos, no borra, no toca a los que están en
// pausa o finalizados, y no le escribe nada al cliente.
//
// Es idempotente: correrlo dos veces no duplica nada.
//
// EL MARGEN DE ERROR ES A PROPÓSITO
// Si crea un cobro que no correspondía (alguien que pausó, un mes de cortesía),
// el coach tiene hasta el día de corte de ese cliente para corregirlo: el
// recordatorio al cliente solo empieza al día SIGUIENTE del corte. Con cortes
// típicos del 1 al 28, eso son días de margen.
//
// SEGURIDAD
// Escribe en la base, así que no puede quedar abierto: exige CRON_SECRET, que
// Vercel manda como "Authorization: Bearer <CRON_SECRET>" en sus crons. Sin la
// variable puesta, el endpoint no hace nada.
//
// Env (Vercel → proyecto del CRM):
//   SUPABASE_URL          → Project URL del Supabase del CRM
//   SUPABASE_SERVICE_KEY  → key service_role (hace falta: un cron no tiene
//                           sesión, y las tablas están protegidas por RLS)
//   CRON_SECRET           → cualquier texto largo; el mismo que Vercel manda

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY_SB = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.CRON_SECRET;

const headers = () => ({
  apikey: KEY_SB,
  Authorization: `Bearer ${KEY_SB}`,
  'Content-Type': 'application/json',
});

// El mes en curso en hora de Colombia. Los servidores corren en UTC (5 horas
// adelante): sin esto, un cron de la medianoche del día 1 generaría el mes
// equivocado.
function mesEnBogota() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  return { mes: ymd.slice(0, 7), ymd };
}

function autorizado(req) {
  if (!SECRET) return false;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return bearer === SECRET || req.query?.key === SECRET;
}

export default async function handler(req, res) {
  if (!autorizado(req)) return res.status(401).json({ error: 'no autorizado' });
  if (!URL_SB || !KEY_SB) {
    return res.status(500).json({ error: 'faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en las variables del proyecto del CRM en Vercel' });
  }

  // ?mes=YYYY-MM para regenerar un mes concreto a mano; por defecto, el actual.
  const { mes } = mesEnBogota();
  const mesObjetivo = /^\d{4}-\d{2}$/.test(String(req.query?.mes || '')) ? req.query.mes : mes;
  // ?dry=1 dice qué HARÍA sin escribir nada. Para probarlo sin consecuencias.
  const ensayo = req.query?.dry === '1' || req.query?.dry === 'true';

  try {
    const traer = async (ruta) => {
      const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, { headers: headers() });
      if (!r.ok) throw new Error(`${ruta} → HTTP ${r.status}`);
      return r.json();
    };

    const clientes = await traer('clientes?select=id,user_id,nombre,estado,monto,moneda,fecha_inicio');
    const activos = (clientes || []).filter(c => String(c.estado || '').toLowerCase() === 'activo');

    const yaTiene = new Set(
      (await traer(`pagos?select=cliente_id&mes=eq.${mesObjetivo}`) || []).map(p => p.cliente_id)
    );

    // El monto: el del último mes en que se le cobró algo > 0. Es más fiel que
    // el de la ficha, que puede estar viejo si le subiste el precio.
    const previos = await traer('pagos?select=cliente_id,monto,moneda,mes&monto=gt.0&order=mes.desc');
    const ultimo = {};
    for (const p of previos || []) if (!ultimo[p.cliente_id]) ultimo[p.cliente_id] = p;

    const nuevos = [];
    const saltados = [];
    for (const c of activos) {
      if (yaTiene.has(c.id)) { saltados.push({ nombre: c.nombre, motivo: 'ya tenía cobro de ese mes' }); continue; }
      // Nunca crear un cobro de un mes anterior a que fuera cliente.
      const inicio = String(c.fecha_inicio || '').slice(0, 7);
      if (inicio && inicio > mesObjetivo) { saltados.push({ nombre: c.nombre, motivo: `empezó en ${inicio}` }); continue; }
      const ult = ultimo[c.id];
      const monto = Number(ult?.monto) || Number(c.monto) || 0;
      if (monto <= 0) { saltados.push({ nombre: c.nombre, motivo: 'sin monto conocido (ni historial ni ficha)' }); continue; }
      nuevos.push({
        user_id: c.user_id,          // el cron no tiene sesión: el dueño va explícito
        cliente_id: c.id,
        mes: mesObjetivo,
        pagado: false,
        monto,
        moneda: ult?.moneda || c.moneda || 'COP',
      });
    }

    if (!ensayo && nuevos.length) {
      const r = await fetch(`${URL_SB}/rest/v1/pagos`, {
        method: 'POST',
        // merge-duplicates: si dos corridas se cruzan, no revienta ni duplica.
        headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(nuevos),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        return res.status(500).json({ error: `no pude crear los cobros (HTTP ${r.status})`, detalle: detalle.slice(0, 300) });
      }
    }

    return res.status(200).json({
      ok: true,
      mes: mesObjetivo,
      ensayo,
      creados: nuevos.length,
      clientes_creados: nuevos.map(n => activos.find(c => c.id === n.cliente_id)?.nombre).filter(Boolean),
      saltados,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
  }
}
