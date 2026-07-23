// /api/push-cron.js
// El emisor de recordatorios push. Lo dispara un cron EXTERNO cada hora en
// punto (GitHub Action del repo: .github/workflows/push-cron.yml) con
// ?key=<CRON_SECRET>. En cada corrida revisa la hora LOCAL de cada
// suscripción (tz capturada del teléfono al suscribirse) y envía el
// recordatorio del turno si corresponde:
//
//   08:00 local → arranque del día (registra tu desayuno)
//   12:00 local → medio día (skip si ya registró algo hoy: no molestamos
//                 a quien ya está usando la app)
//   20:00 local → cierre del día (skip si ya lleva 3+ registros hoy)
//   12:00 local → ADEMÁS recordatorio de pago SOLO a quien está en deuda
//                 (misma regla que el banner de payment-status: corte
//                 vencido y mes sin pago marcado en el CRM)
//
// Mensajes rotativos (por día del año) para no sonar a robot repetido.
// Suscripciones muertas (410/404) se eliminan solas.
//
// Env (Vercel): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET,
//               SUPABASE_URL, SUPABASE_SERVICE_KEY (ya existentes),
//               CRM_SUPABASE_URL, CRM_SUPABASE_SERVICE_KEY (ya existentes).

import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRM_URL = process.env.CRM_SUPABASE_URL;
const CRM_KEY = process.env.CRM_SUPABASE_SERVICE_KEY;

const sbHeaders = (key) => ({ 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' });

const normalizeName = (str) => String(str || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim();

// ── Copys: profesionales, cálidos, accionables — 3 variantes por turno ──
const MSGS = {
  morning: [
    'Buenos días ☀️ Un registro a tiempo vale más que uno perfecto. Cuando desayunes, cuéntamelo.',
    'Arranca el día con claridad: registra tu desayuno y el resto fluye ☀️',
    'Nuevo día, mismo método. Tu primer registro marca la pauta 💪',
  ],
  midday: [
    '¿Almuerzo listo? Dos líneas en tu registro y tu día sigue en orden 🍽',
    'Mitad del día: registrar ahora te ahorra hacer memoria en la noche.',
    'Tu almuerzo cuenta — regístralo y sigue en lo tuyo 🍽',
  ],
  evening: [
    'Cierra el día como se debe: registra tu cena y mira tu jornada completa 🌙',
    'Último empujón: tu cena al registro y quedas al día 🌙',
    'Antes de desconectar, registra la cena — un día cerrado es un día que cuenta.',
  ],
  payment: [
    'Recordatorio: tu mensualidad del programa está pendiente. Ponerte al día toma un minuto — gracias por entrenar con método 🤝',
  ],
};

const dayOfYear = () => Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
const pick = (arr) => arr[dayOfYear() % arr.length];

// Hora y fecha locales de una zona horaria
function localNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { hour: Number(get('hour')), date: `${get('year')}-${get('month')}-${get('day')}` };
  } catch (e) {
    return { hour: -1, date: '' };
  }
}

export default async function handler(req, res) {
  const key = req.query.key || req.headers['x-cron-key'];
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'vapid not configured' });
  }
  webpush.setVapidDetails('mailto:morongmauro@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  try {
    // 1) Todas las suscripciones
    const rs = await fetch(`${SUPABASE_URL}/rest/v1/push_subs?select=endpoint,user_id,name,tz,sub`, { headers: sbHeaders(SUPABASE_SERVICE_KEY) });
    const subs = rs.ok ? await rs.json() : [];
    if (!Array.isArray(subs) || subs.length === 0) return res.status(200).json({ ok: true, sent: 0, subs: 0 });

    // 2) Actividad de HOY por cliente (para no molestar a quien ya registró).
    //    Una sola consulta liviana: user_id + fecha del día + nº de entries.
    const ra = await fetch(`${SUPABASE_URL}/rest/v1/user_data?select=user_id,today:data->today,today_entries:data->today_entries`, { headers: sbHeaders(SUPABASE_SERVICE_KEY) });
    const rows = ra.ok ? await ra.json() : [];
    const activity = new Map(); // user_id → { date, count }
    for (const r of rows) {
      activity.set(r.user_id, { date: r.today || '', count: Array.isArray(r.today_entries) ? r.today_entries.length : 0 });
    }

    // 3) Deudores (solo se consulta si alguna suscripción está en su mediodía)
    let deudores = null; // Set de nombres normalizados
    const cargarDeudores = async () => {
      if (deudores || !CRM_URL || !CRM_KEY) return;
      deudores = new Set();
      const rc = await fetch(`${CRM_URL}/rest/v1/clientes?select=id,nombre,estado,dia_pago`, { headers: sbHeaders(CRM_KEY) });
      const clientes = rc.ok ? await rc.json() : [];
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      const mes = ymd.slice(0, 7);
      const diaHoy = Number(ymd.slice(8));
      const candidatos = (clientes || []).filter(c =>
        String(c.estado || 'activo').toLowerCase() === 'activo' &&
        Number.isFinite(Number(c.dia_pago)) && Number(c.dia_pago) >= 1 && Number(c.dia_pago) <= 31 &&
        diaHoy > Number(c.dia_pago)
      );
      for (const c of candidatos) {
        const rp = await fetch(`${CRM_URL}/rest/v1/pagos?select=pagado,monto&cliente_id=eq.${c.id}&mes=eq.${mes}`, { headers: sbHeaders(CRM_KEY) });
        const pagos = rp.ok ? await rp.json() : [];
        const cubierto = Array.isArray(pagos) && pagos.some(p => p.pagado === true || Number(p.monto) === 0);
        if (!cubierto) deudores.add(normalizeName(c.nombre));
      }
    };

    let sent = 0, removed = 0;
    for (const s of subs) {
      const { hour, date } = localNow(s.tz || 'America/Bogota');
      const act = activity.get(s.user_id) || { date: '', count: 0 };
      const registrosHoy = act.date === date ? act.count : 0;

      const payloads = [];
      if (hour === 8) {
        payloads.push({ title: 'Entrena con Método', body: pick(MSGS.morning), tag: 'ecm-m' });
      } else if (hour === 12) {
        if (registrosHoy < 1) payloads.push({ title: 'Entrena con Método', body: pick(MSGS.midday), tag: 'ecm-d' });
        // Pago: CADA 3 DÍAS mientras dure la deuda (no diario — presión
        // sostenida sin sonar a cobrador intenso). Determinístico por día
        // del año: no requiere guardar estado.
        if (dayOfYear() % 3 === 0) {
          await cargarDeudores();
          if (deudores && s.name && deudores.has(normalizeName(s.name))) {
            payloads.push({ title: 'Entrena con Método', body: pick(MSGS.payment), tag: 'ecm-p' });
          }
        }
      } else if (hour === 20) {
        if (registrosHoy < 3) payloads.push({ title: 'Entrena con Método', body: pick(MSGS.evening), tag: 'ecm-n' });
      }

      for (const p of payloads) {
        try {
          await webpush.sendNotification(s.sub, JSON.stringify({ ...p, url: '/' }));
          sent++;
        } catch (e) {
          const code = e && e.statusCode;
          if (code === 404 || code === 410) {
            // Suscripción muerta (app desinstalada / permiso revocado): fuera
            await fetch(`${SUPABASE_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
              method: 'DELETE', headers: sbHeaders(SUPABASE_SERVICE_KEY),
            });
            removed++;
          }
        }
      }
    }

    return res.status(200).json({ ok: true, subs: subs.length, sent, removed });
  } catch (e) {
    return res.status(500).json({ error: 'cron failed', detail: String(e) });
  }
}
