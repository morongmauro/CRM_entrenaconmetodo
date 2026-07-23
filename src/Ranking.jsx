// ─────────────────────────────────────────────────────────────────────────
// RANKING PÚBLICO DEL RETO — /ranking
// "Camino a la Cima": tablero motivacional en vivo que cualquier cliente
// abre SIN login. El reto va del 9 de julio al 9 de agosto y se mide en
// tres vistas: HOY, SEMANA y RETO COMPLETO.
//
// No es por puntos: es % DE ADHERENCIA — mitad por registrar las comidas
// cada día, mitad por qué tan cerca se cierra de la meta diaria PROPIA
// (calorías y macros). Cada quien compite contra su propia meta.
//
// Se alimenta de /api/ranking (solo nombre de pila + inicial y porcentajes)
// y se refresca solo cada 60 segundos.
// ─────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCENT, ACCENT_DARK, ACCENT_PASTEL, ACCENT_LIGHT,
  C_PROTEIN, C_CARBS, C_FAT, C_WATER,
  BG, SURFACE, SURFACE_2, BORDER, BORDER_SOFT,
  TEXT, TEXT_MUTED, TEXT_LIGHT, SHADOW_CARD, FONT_DISPLAY,
} from './theme.js';

// Colores de avatar rotando por puesto (paleta de la marca)
const AVATAR_COLORS = [ACCENT, C_PROTEIN, C_FAT, C_CARBS, C_WATER];

// ── Fechas (strings YYYY-MM-DD, sin sorpresas de zona horaria) ────────────
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function diffDays(a, b) { // b - a en días
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da)) / 86400000);
}
function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' });

// ── Adherencia de un período ───────────────────────────────────────────────
// reg  = % de días del período con comidas registradas
// goal = promedio de cercanía a la meta diaria en los días registrados
// pct  = adherencia total del período: promedio de ambos (sin meta
//        configurada solo cuenta la mitad del registro)
function computeRanking(clients, dates) {
  if (!dates.length) return [];
  return clients.map(c => {
    let logged = 0, scoreSum = 0, scoreN = 0;
    for (const d of dates) {
      if (d in c.days) {
        logged++;
        if (c.days[d] != null) { scoreSum += c.days[d]; scoreN++; }
      }
    }
    const reg = Math.round((logged / dates.length) * 100);
    const goal = scoreN > 0 ? Math.round(scoreSum / scoreN) : null;
    const pct = goal == null ? Math.round(reg / 2) : Math.round((reg + goal) / 2);
    return { name: c.name, reg, goal, pct, logged };
  })
    .filter(r => r.logged > 0)
    .sort((a, b) => (b.pct - a.pct) || (b.logged - a.logged) || a.name.localeCompare(b.name))
    .slice(0, 10);
}

// ── Sendero de la montaña ──────────────────────────────────────────────────
// Waypoints (coordenadas % del lienzo 100×100) de un camino en zigzag desde
// la base (t=0) hasta la cima (t=1). pointAt(t) interpola sobre la polilínea.
const TRAIL = [
  [10, 93], [32, 88], [16, 80], [44, 72], [24, 63],
  [54, 55], [36, 47], [62, 38], [48, 30], [64, 22], [56, 13],
];
const SEGMENTS = TRAIL.slice(1).map((p, i) => {
  const [x0, y0] = TRAIL[i];
  return { x0, y0, dx: p[0] - x0, dy: p[1] - y0, len: Math.hypot(p[0] - x0, p[1] - y0) };
});
const TRAIL_LEN = SEGMENTS.reduce((s, seg) => s + seg.len, 0);

function pointAt(t) {
  let dist = Math.max(0, Math.min(1, t)) * TRAIL_LEN;
  for (const seg of SEGMENTS) {
    if (dist <= seg.len) {
      const f = seg.len === 0 ? 0 : dist / seg.len;
      return { x: seg.x0 + seg.dx * f, y: seg.y0 + seg.dy * f };
    }
    dist -= seg.len;
  }
  const last = TRAIL[TRAIL.length - 1];
  return { x: last[0], y: last[1] };
}

const trailPathD = 'M ' + TRAIL.map(([x, y]) => `${x} ${y}`).join(' L ');

// Iniciales para el avatar: "Diana M." → "DM", "Ana" → "A"
function initialsOf(name) {
  const parts = String(name || '').replace(/\./g, '').split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') || '?';
}

// Posiciones en el sendero: t = adherencia/100, con separación mínima para
// que escaladores con porcentajes casi iguales no se encimen. Se recorre de
// mayor a menor empujando hacia abajo al que venga muy pegado.
function climberPositions(ranking) {
  const MIN_GAP = 0.082;
  let prevT = null;
  return ranking.map((r, i) => {
    let t = (r.pct / 100) * 0.96;
    if (prevT != null && t > prevT - MIN_GAP) t = prevT - MIN_GAP;
    t = Math.max(0.02, t);
    prevT = t;
    return { ...r, rank: i + 1, t, ...pointAt(t) };
  });
}

const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = ['day', 'week', 'total'];

export default function Ranking() {
  const [data, setData] = useState(null);     // { challenge, clients }
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false); // dispara la animación de subida
  const [period, setPeriod] = useState('total');

  const lastPayloadRef = useRef('');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      // Pestaña en segundo plano: no gastar red/batería; al volver se refresca.
      if (document.visibilityState === 'hidden') return;
      try {
        const r = await fetch('/api/ranking');
        if (!r.ok) throw new Error('bad status');
        const text = await r.text();
        if (!alive) return;
        setError(false);
        // El CDN cachea 60 s, así que la mayoría de sondeos traen el mismo
        // payload: si no cambió, conservamos la referencia anterior y React
        // no re-renderiza nada (los useMemo quedan estables).
        if (text === lastPayloadRef.current) return;
        lastPayloadRef.current = text;
        setData(JSON.parse(text));
      } catch (e) {
        if (alive) setError(true);
      }
    };
    load();
    const iv = setInterval(load, 60000); // en vivo: refresco silencioso cada minuto
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Un frame después de tener datos, mover los escaladores de la base a su
  // posición (la transición CSS hace la "subida")
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => setMounted(true), 120);
    return () => clearTimeout(t);
  }, [data]);

  // ── Períodos del reto ────────────────────────────────────────────────────
  const ch = data?.challenge || null;
  const info = useMemo(() => {
    if (!ch) return null;
    const { start, end, today } = ch;
    const notStarted = today < start;
    const finished = today > end;
    const ref = finished ? end : today;           // último día que cuenta
    const dayNum = notStarted ? 0 : diffDays(start, ref) + 1;
    const totalDays = diffDays(start, end) + 1;
    // Semana del reto en curso: S1 = primeros 7 días, S2 = siguientes 7…
    const weekIdx = notStarted ? 0 : Math.floor(diffDays(start, ref) / 7);
    const weekStart = addDays(start, weekIdx * 7);
    const weekEnd = addDays(weekStart, 6) < end ? addDays(weekStart, 6) : end;
    const periods = {
      day: { dates: notStarted ? [] : [ref], label: finished ? `Último día (${shortDate(ref)})` : 'Hoy' },
      week: { dates: notStarted ? [] : dateRange(weekStart, weekEnd > ref ? ref : weekEnd), label: `Semana ${weekIdx + 1} (${shortDate(weekStart)}–${shortDate(weekEnd)})` },
      total: { dates: notStarted ? [] : dateRange(start, ref), label: 'Reto completo' },
    };
    return { start, end, today, notStarted, finished, dayNum, totalDays, periods };
  }, [ch]);

  const ranking = useMemo(() => {
    if (!data || !info) return [];
    return computeRanking(data.clients || [], info.periods[period].dates);
  }, [data, info, period]);

  const climbers = useMemo(() => climberPositions(ranking), [ranking]);
  const base = pointAt(0);

  const PERIOD_TABS = { day: 'Hoy', week: 'Semana', total: 'Reto completo' };
  const PERIOD_DESC = {
    day: info?.finished
      ? 'Cómo cerró el último día del reto.'
      : 'Cómo va el día de HOY. Tu % sube durante el día a medida que registras y te acercas a tu meta.',
    week: `Adherencia de la ${info ? info.periods.week.label.toLowerCase() : 'semana en curso'}: días registrados + cercanía a tu meta diaria.`,
    total: `Adherencia acumulada del reto (${info ? `${shortDate(info.start)} – ${shortDate(info.end)}` : ''}): tu constancia día a día desde el inicio.`,
  };

  return (
    <div className="min-h-screen w-full" style={{ background: BG, color: TEXT }}>
      <style>{`
        @keyframes rkDrift { from { transform: translateX(-12%); } to { transform: translateX(112%); } }
        @keyframes rkFlag { 0%,100% { transform: skewX(0deg); } 50% { transform: skewX(-7deg); } }
        @keyframes rkPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes rkBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes rkRise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes rkPop { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
        .rk-climber { transition: left 2.2s cubic-bezier(0.33, 1, 0.4, 1), top 2.2s cubic-bezier(0.33, 1, 0.4, 1); }
      `}</style>

      {/* Encabezado — safe-area: en la app instalada no se mete bajo el notch */}
      <div className="relative px-5 pt-6 pb-3 text-center" style={{ paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))' }}>
        {/* Volver a la app (útil sobre todo en la PWA, donde no hay barra del navegador) */}
        {/* safe-area: sin esto el botón quedaba DEBAJO del notch/Dynamic
            Island en iPhone y los taps nunca llegaban — "no hace nada". */}
        <button onClick={() => { window.location.href = '/'; }}
          className="absolute left-4 w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition"
          style={{ top: 'calc(18px + env(safe-area-inset-top, 0px))', zIndex: 10, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_MUTED, fontSize: 18 }}
          title="Volver a la app" aria-label="Volver a la app">
          ←
        </button>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, letterSpacing: '0.06em', lineHeight: 1 }}>
          CAMINO A LA CIMA
        </div>
        <div className="flex items-center justify-center gap-2 mt-1.5">
          {info?.finished ? (
            <span className="text-[12px] uppercase tracking-[0.14em] font-semibold" style={{ color: TEXT_MUTED }}>
              🏁 Reto finalizado · {shortDate(info.start)} – {shortDate(info.end)}
            </span>
          ) : (
            <>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#C75A4A', animation: 'rkPulse 1.6s ease-in-out infinite' }} />
              <span className="text-[12px] uppercase tracking-[0.14em] font-semibold" style={{ color: TEXT_MUTED }}>
                {/* Las fechas SOLO vienen del API (única fuente de verdad) */}
                En vivo{info ? ` · Reto ${shortDate(info.start)} – ${shortDate(info.end)}` : ''}
              </span>
            </>
          )}
        </div>
        {info && !info.notStarted && !info.finished && (
          <div className="inline-block mt-2 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: ACCENT_PASTEL, color: ACCENT_DARK }}>
            Día {info.dayNum} de {info.totalDays} del reto
          </div>
        )}

        {/* Selector de período */}
        <div className="flex justify-center gap-1.5 mt-3">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition active:scale-95"
              style={period === p
                ? { background: TEXT, color: '#FFFFFF' }
                : { background: SURFACE, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
              {PERIOD_TABS[p]}
            </button>
          ))}
        </div>
        <div className="max-w-md mx-auto mt-2 text-[12px]" style={{ color: TEXT_LIGHT, lineHeight: 1.5 }}>
          {PERIOD_DESC[period]}
        </div>
      </div>

      {/* ── LA MONTAÑA ── */}
      <div className="max-w-xl mx-auto px-3">
        <div className="relative w-full overflow-hidden rounded-3xl"
          style={{ aspectRatio: '10 / 11', border: `1px solid ${BORDER_SOFT}`, boxShadow: SHADOW_CARD, background: 'linear-gradient(180deg, #EAF0F4 0%, #F4F3EA 55%, #F1F3E5 100%)' }}>

          {/* Sol */}
          <div className="absolute rounded-full" style={{ width: '14%', paddingTop: '14%', right: '9%', top: '6%', background: 'radial-gradient(circle, #F4DFA4 30%, rgba(244,223,164,0) 72%)' }} />

          {/* Nubes a la deriva */}
          {[{ top: '10%', dur: 75, delay: -20, w: '26%', op: 0.9 }, { top: '20%', dur: 95, delay: -60, w: '20%', op: 0.7 }, { top: '31%', dur: 115, delay: -35, w: '16%', op: 0.5 }].map((c, i) => (
            <div key={i} className="absolute" style={{ top: c.top, left: 0, width: c.w, opacity: c.op, animation: `rkDrift ${c.dur}s linear ${c.delay}s infinite` }}>
              <div style={{ height: 14, borderRadius: 999, background: '#FFFFFF' }} />
              <div style={{ height: 12, width: '62%', borderRadius: 999, background: '#FFFFFF', marginTop: -7, marginLeft: '18%' }} />
            </div>
          ))}

          {/* Montaña + sendero (SVG de fondo) */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Cordillera de fondo */}
            <path d="M -2 78 L 18 46 L 34 66 L 52 34 L 70 60 L 88 40 L 104 72 L 104 104 L -2 104 Z" fill={ACCENT_PASTEL} opacity="0.55" />
            {/* Montaña principal */}
            <path d="M -2 102 L 56 10 L 78 44 L 92 30 L 104 52 L 104 104 L -2 104 Z" fill={ACCENT} opacity="0.28" />
            <path d="M -2 102 L 56 10 L 104 86 L 104 104 L -2 104 Z" fill={ACCENT_DARK} opacity="0.22" />
            {/* Nieve en la cima */}
            <path d="M 56 10 L 62.5 20.5 L 59 19 L 56.5 22 L 53 18.5 L 50 20.5 Z" fill="#FFFFFF" opacity="0.9" />
            {/* Sendero */}
            <path d={trailPathD} fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
              strokeDasharray="0.2 3" />
            <path d={trailPathD} fill="none" stroke={ACCENT_DARK} strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35"
              strokeDasharray="2 2.4" />
          </svg>

          {/* Bandera META en la cima: 100% de adherencia */}
          <div className="absolute" style={{ left: '56%', top: '10%', transform: 'translate(-50%, -100%)' }}>
            <div className="flex items-end">
              <div style={{ width: 2, height: 26, background: TEXT, borderRadius: 2 }} />
              <div className="px-1.5 py-0.5 text-[9px] font-bold text-white"
                style={{ background: '#C75A4A', borderRadius: '0 4px 4px 0', transformOrigin: 'left center', animation: 'rkFlag 2.4s ease-in-out infinite', marginBottom: 14 }}>
                100%
              </div>
            </div>
          </div>

          {/* Escaladores */}
          {climbers.map((c, i) => {
            const color = c.rank <= 3 ? ['#D4A017', '#9AA0A6', '#B0793B'][c.rank - 1] : AVATAR_COLORS[i % AVATAR_COLORS.length];
            const left = mounted ? c.x : base.x;
            const top = mounted ? c.y : base.y;
            // Etiquetas alternando lado: con porcentajes parejos los escaladores
            // quedan casi en columna y del mismo lado se encimaban entre sí.
            // Cerca de los bordes manda el espacio disponible, no la alternancia.
            const labelRight = c.x < 32 ? true : c.x > 68 ? false : i % 2 === 0;
            return (
              <div key={c.name} className="absolute rk-climber" style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)', transitionDelay: `${i * 0.12}s`, zIndex: 20 - i }}>
                <div style={{ animation: `rkBob ${2.2 + (i % 3) * 0.4}s ease-in-out ${i * 0.3}s infinite` }}>
                  <div className="relative flex items-center">
                    {/* Avatar */}
                    <div className="rounded-full flex items-center justify-center font-bold text-white"
                      style={{ width: c.rank === 1 ? 34 : 28, height: c.rank === 1 ? 34 : 28, fontSize: c.rank === 1 ? 13 : 11, background: color, border: '2px solid #FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                      {initialsOf(c.name)}
                    </div>
                    {c.rank <= 3 && (
                      <div className="absolute text-[13px]" style={{ top: -11, left: '50%', transform: 'translateX(-50%)', animation: 'rkPop 0.5s ease-out both', animationDelay: `${2.3 + i * 0.12}s` }}>
                        {MEDALS[c.rank - 1]}
                      </div>
                    )}
                    {/* Etiqueta nombre + adherencia */}
                    <div className={`absolute whitespace-nowrap ${labelRight ? 'left-full ml-1.5' : 'right-full mr-1.5'}`}
                      style={{ top: '50%', transform: 'translateY(-50%)' }}>
                      <div className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.92)', border: `1px solid ${BORDER}`, color: TEXT, boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}>
                        {c.name} · <span style={{ color: ACCENT_DARK, fontWeight: 700 }}>{c.pct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Estados vacío / error / cargando */}
          {(!data && !error) && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px]" style={{ color: TEXT_MUTED }}>
              Preparando la montaña…
            </div>
          )}
          {error && !data && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] px-8 text-center" style={{ color: TEXT_MUTED }}>
              No se pudo cargar el reto. Revisa tu conexión — se reintenta solo.
            </div>
          )}
          {data && info?.notStarted && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] px-8 text-center" style={{ color: TEXT_MUTED }}>
              El reto arranca el {shortDate(info.start)}. ¡Prepara tus tenis! 🥾
            </div>
          )}
          {data && info && !info.notStarted && climbers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] px-8 text-center" style={{ color: TEXT_MUTED }}>
              {period === 'day'
                ? 'Nadie ha registrado hoy todavía. ¡El primero en registrar toma la delantera! 🏃'
                : 'Aún no hay días registrados en este período. ¡El primero en registrar toma la delantera!'}
            </div>
          )}
        </div>
      </div>

      {/* ── PODIO TOP 3 ── */}
      {climbers.length > 0 && (
        <div className="max-w-xl mx-auto px-3 mt-5">
          <div className="flex items-end justify-center gap-2">
            {[1, 0, 2].map(idx => {
              const c = climbers[idx];
              if (!c) return <div key={idx} className="flex-1" />;
              const heights = [116, 88, 68]; // 1º, 2º, 3º
              return (
                <div key={c.rank} className="flex-1 flex flex-col items-center" style={{ maxWidth: 150 }}>
                  <div className="text-[22px] mb-0.5">{MEDALS[c.rank - 1]}</div>
                  <div className="text-[13px] font-bold truncate max-w-full" style={{ color: TEXT }}>{c.name}</div>
                  <div className="text-[18px] font-bold num mb-1.5" style={{ color: ACCENT_DARK }}>{c.pct}%</div>
                  <div className="w-full rounded-t-xl flex items-start justify-center pt-1.5"
                    style={{
                      height: heights[c.rank - 1],
                      background: c.rank === 1 ? `linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 130%)` : SURFACE_2,
                      border: `1px solid ${c.rank === 1 ? ACCENT_DARK : BORDER}`, borderBottom: 'none',
                      color: c.rank === 1 ? '#FFFFFF' : TEXT_LIGHT, fontWeight: 800, fontSize: 20,
                      transformOrigin: 'bottom', animation: 'rkRise 0.9s cubic-bezier(0.33, 1, 0.4, 1) both',
                      animationDelay: `${0.15 * c.rank}s`,
                    }}>
                    {c.rank}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ height: 1, background: BORDER, marginTop: -1 }} />
        </div>
      )}

      {/* ── RESTO DEL TOP 10 ── */}
      {climbers.length > 3 && (
        <div className="max-w-xl mx-auto px-3 mt-4 space-y-1.5">
          {climbers.slice(3).map((c, i) => (
            <div key={c.rank} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: SURFACE, border: `1px solid ${BORDER_SOFT}` }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                style={{ background: SURFACE_2, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                {c.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold truncate">{c.name}</div>
                <div className="mt-1 rounded-full overflow-hidden" style={{ height: 5, background: ACCENT_LIGHT }}>
                  <div style={{ width: mounted ? `${c.pct}%` : 0, height: '100%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], borderRadius: 999, transition: 'width 1.6s cubic-bezier(0.33, 1, 0.4, 1)', transitionDelay: `${0.4 + i * 0.1}s` }} />
                </div>
              </div>
              <div className="text-[15px] font-bold num flex-shrink-0" style={{ color: TEXT_MUTED }}>{c.pct}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Pie: cómo se calcula, en palabras simples */}
      <div className="max-w-xl mx-auto px-6 py-6 text-center text-[11.5px]" style={{ color: TEXT_LIGHT, lineHeight: 1.65 }}>
        <b style={{ color: TEXT_MUTED }}>¿Cómo se calcula?</b> No son puntos: es tu <b>% de adherencia</b>.
        La mitad viene de <b>registrar tus comidas cada día</b> y la otra mitad de <b>qué tan cerca cierras de TU meta diaria</b> (calorías
        y macros). Cada quien compite contra su propia meta, así que la cancha es pareja: registra hoy y mira cómo subes la montaña. 🏔
        <div className="mt-1.5" style={{ fontFamily: FONT_DISPLAY, letterSpacing: '0.1em', fontSize: 13, color: TEXT_MUTED }}>
          MEAL TRACKER · ENTRENA CON MÉTODO
        </div>
      </div>
    </div>
  );
}
