import React, { useState, useEffect, useRef, useMemo, useCallback, memo, startTransition, lazy, Suspense } from 'react';
import {
  ArrowUp, RotateCcw, Calendar, Sparkles, Loader2, Check, BarChart3, Settings, X, Mic,
  Star, Trash2, FileText, ChevronLeft, ChevronRight, Trophy, Info, ChevronDown, ChevronUp,
  SlidersHorizontal as Sliders, PieChart, Utensils, Download, Droplet, CheckCircle2, Pencil, LineChart, ChefHat, BookOpen,
  GraduationCap, Megaphone, Mountain, Repeat, ShoppingBasket, Pin, Scale, CalendarCheck, LayoutGrid
} from 'lucide-react';
import { canonicalizeItem } from './foods.js';

// Chunk aparte: el Recetario (~30KB de recetas + UI) solo se descarga la
// primera vez que el cliente lo abre, no en el arranque de la app.
const Recetario = lazy(() => import('./Recetario.jsx'));

// Paleta y tipografía: única fuente de verdad en src/theme.js.
import {
  ACCENT, ACCENT_DARK, ACCENT_PASTEL, ACCENT_LIGHT,
  C_PROTEIN, C_PROTEIN_PASTEL, C_CARBS, C_CARBS_PASTEL, C_FAT, C_FAT_PASTEL, C_WATER,
  BG, SURFACE, SURFACE_2, BORDER, BORDER_SOFT, TEXT, TEXT_MUTED, TEXT_LIGHT,
  SUCCESS, WARN, FONT_UI, FONT_DISPLAY, SHADOW_RAISED,
} from './theme.js';

// LLM model — single source of truth. To switch to Sonnet, change this one line:
//   'claude-haiku-4-5-20251001'  (rápido, económico, actual)
//   'claude-sonnet-4-6'          (más capaz, ~3x costo)
const CHAT_MODEL = 'claude-haiku-4-5-20251001';


// Display helpers — kills 25.100000004 floats once and for all.
// fmt1: at most 1 decimal, no trailing zeros. fmt0: rounded to integer.
const fmt1 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return parseFloat(v.toFixed(1)).toString();
};
const fmt0 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.round(v));
};

// La lista de clientes autorizados vive en el SERVIDOR (/api/authorize).
// Antes estaba acá y viajaba con los nombres reales dentro del JS público.
// Si el endpoint no responde (sin red, deploy a medias), dejamos pasar:
// la validación es una puerta de cortesía, no un control de seguridad.
// Devuelve { ok, status }. status viene del CRM: 'activo' | 'pausa' |
// 'finalizado' | 'not_found' | 'list' (autorizado por la lista de respaldo).
const checkAccess = async (name) => {
  try {
    const r = await fetch('/api/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) return { ok: true, status: 'offline' };
    const data = await r.json();
    return { ok: data.authorized === true, status: data.status || (data.authorized ? 'activo' : 'not_found') };
  } catch (e) {
    return { ok: true, status: 'offline' };
  }
};

// Separa un texto de ingredientes en alimentos individuales. Los clientes
// suelen escribir la lista completa de una ("pollo, arroz y carne") en vez de
// añadir de a uno: se corta por comas, punto y coma, saltos de línea y " y ".
// Lo usan el modal de Mis ingredientes y la ruta del chat (manage_favorites),
// así "ayuda con proporciones" y "arma mi día" reciben alimentos separados.
const splitIngredients = (text) => String(text || '')
  .split(/[,;\n]+|\sy\s/i)
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Traga el "click fantasma" de iOS. Al cerrar un overlay con onPointerDown
// (cierre instantáneo), Safari dispara ~50-300ms después su click sintético
// en las MISMAS coordenadas — y como el overlay ya no está, aterrizaba en lo
// que quedara debajo. Caso real: la X del modal de Desempeño caía justo
// sobre la tarjeta de anillos (que abre Desempeño al tocarla) y el modal se
// REABRÍA solo. Bloquea en fase captura el primer click de los próximos
// 600ms tras un cierre por pointerdown.
const swallowGhostClick = () => {
  if (typeof document === 'undefined') return;
  const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 600);
};

// Qué es cada macro, en una línea. Se muestra al TOCAR un anillo de la
// tarjeta de metas: educación en contexto sin ocupar espacio permanente.
const MACRO_INFO = {
  kcal: { t: 'Calorías:', d: 'tu presupuesto total de energía del día — la suma de todo lo que comes.' },
  p:    { t: 'Proteína:', d: 'construye y protege tu músculo. Es la meta que más conviene completar cada día.' },
  c:    { t: 'Carbos:', d: 'tu combustible para entrenar y rendir. Suben o bajan según la fase de tu plan.' },
  g:    { t: 'Grasas:', d: 'hormonas y absorción de vitaminas. Ni villanas ni libres: en su justa medida.' },
};

// Static SVG background — computed ONCE at module load. Previously this
// 60-line SVG string was URL-encoded on every parent render, which on
// mobile is a real cost. Defining it here removes that work entirely.
const FOOD_SILHOUETTES_BG_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='280' height='280' viewBox='0 0 280 280'>
              <g fill='none' stroke='%237A8450' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='0.28'>
                <g transform='translate(28,30) rotate(12)'>
                  <path d='M0,18 C0,7 8,0 16,0 C24,0 32,7 32,18 C32,32 24,42 16,42 C8,42 0,32 0,18 Z'/>
                  <ellipse cx='16' cy='22' rx='8' ry='9'/>
                </g>
                <path d='M75,38 Q92,30 105,42' stroke-opacity='0.18'/>
                <g transform='translate(108,22) rotate(-18)'>
                  <path d='M2,6 C12,0 28,2 38,12 C42,16 44,22 40,26 C36,22 28,18 20,18 C12,18 6,22 0,22 C-2,18 -2,10 2,6 Z'/>
                  <path d='M2,6 L0,2'/>
                </g>
                <g transform='translate(195,30) rotate(35)'>
                  <path d='M16,12 L24,12 L14,50 L4,50 L0,16 L4,14 Z'/>
                  <path d='M10,12 L7,2 M14,12 L15,0 M18,12 L22,3'/>
                </g>
                <path d='M40,90 Q90,75 140,95 T240,88' stroke-opacity='0.14'/>
                <g transform='translate(22,105) rotate(-8)'>
                  <path d='M0,16 C5,4 22,2 34,10 C40,14 40,22 34,26 C22,32 5,30 0,16 Z'/>
                  <path d='M34,10 L44,2 L44,26 L34,26'/>
                  <circle cx='26' cy='14' r='1.5'/>
                </g>
                <g transform='translate(105,108) rotate(8)'>
                  <path d='M6,12 C2,18 0,30 6,38 C10,44 16,46 22,42 C28,46 34,44 38,38 C44,30 42,18 38,12 C32,6 24,8 22,12 C20,8 12,6 6,12 Z'/>
                  <path d='M22,12 C22,6 26,2 30,4'/>
                  <path d='M28,2 L30,0'/>
                </g>
                <g transform='translate(195,108) rotate(22)'>
                  <circle cx='10' cy='10' r='8'/>
                  <circle cx='24' cy='8' r='8'/>
                  <circle cx='17' cy='20' r='8'/>
                  <path d='M17,28 L17,42 M14,38 L20,38'/>
                </g>
                <path d='M50,180 C70,170 80,195 100,185' stroke-opacity='0.18'/>
                <path d='M180,180 Q200,170 220,185' stroke-opacity='0.18'/>
                <g transform='translate(28,195) rotate(-12)'>
                  <path d='M0,0 L0,14 M4,0 L4,14 M8,0 L8,14 M12,0 L12,14 M0,14 L12,14 L8,42 L4,42 Z'/>
                  <path d='M24,4 C18,8 18,18 24,22 L24,42 L30,42 L30,22 C36,18 36,8 30,4 C28,2 26,2 24,4 Z'/>
                </g>
                <g transform='translate(115,200) rotate(5)'>
                  <ellipse cx='14' cy='20' rx='12' ry='18'/>
                </g>
                <g transform='translate(195,200) rotate(-25)'>
                  <path d='M10,4 C2,6 -2,16 4,22 C10,28 22,28 28,22 L40,34 L34,40 L22,28 C28,24 30,14 24,8 C20,4 14,2 10,4 Z'/>
                  <circle cx='14' cy='14' r='1' fill='%237A8450' fill-opacity='0.4' stroke='none'/>
                </g>
                <path d='M60,260 Q80,250 100,262' stroke-opacity='0.16'/>
                <path d='M170,255 C185,250 200,265 215,258' stroke-opacity='0.16'/>
              </g>
            </svg>`)}")`;

const haptic = (pattern = 10) => {
  if (typeof window !== 'undefined' && window.navigator?.vibrate) {
    window.navigator.vibrate(pattern);
  }
};

// Llave VAPID pública (base64url) → Uint8Array, formato que exige pushManager
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

// ─────────────────────────────────────────────────────────────────────────
// ANUNCIO DE ACTUALIZACIÓN DE LA APP (lo edita el coach, como _clients.js)
//
// Para avisar a los clientes que la app mejoró: cambia el `id` por uno NUEVO
// (por ejemplo la fecha) y escribe el mensaje en `text`. Commit → deploy →
// cada cliente ve el anuncio UNA sola vez en su chat al abrir la app.
// Deja text: '' para no mostrar nada.
// ─────────────────────────────────────────────────────────────────────────
const APP_UPDATE_ANNOUNCEMENT = {
  id: '2026-07-21-mi-semana',
  text: '📊 Nueva sección: Mi Semana. Toca el botón de arriba (el calendario con el ✓) y mira cómo te fue la semana pasada: tus entrenos cumplidos, tus días de registro y qué tan alineado quedaste con tu meta — todo resumido en tu nivel de la semana. Las gráficas de desempeño de siempre ahora viven ahí mismo, en las pestañas de al lado.',
};

// ─── GANCHOS DE APRENDIZAJE (los edita el coach, como _clients.js) ───────
// UN anuncio informativo por semana (para no saturar). En vez de "lee esto
// que te falta", capta la atención con un dato útil y cierra apuntando a la
// guía. Rotan solos en orden, una por semana; con esta lista hay para ~3
// meses sin repetir. Agrega, quita o edita libremente — cada string es un
// anuncio completo.
const LEARNING_HOOKS = [
  '¿Sabías que la proteína no es solo para el gimnasio? Construye y repara tejidos, piel, hormonas y defensas. En la Guía de alimentación ves cuánta necesitas tú y de dónde sacarla.',
  'Los carbohidratos no engordan por sí solos: son la gasolina de tu entreno y de tu cerebro. Lo que manda es el total del día — en la Guía de alimentación está explicado fácil.',
  'La grasa no es el enemigo: sin ella no produces hormonas ni absorbes varias vitaminas. La clave está en la cantidad y la fuente — profundiza en la Guía de alimentación.',
  '¿Sabías que dormir poco aumenta el hambre del día siguiente? El apetito también se gestiona. Dale 5 minutos al material de Aprendizaje.',
  'El músculo no crece entrenando: crece recuperando. La comida y el descanso hacen la mitad del trabajo — en Aprendizaje está el porqué.',
  'Un "día perfecto" no existe; existe la semana consistente. Repasa cómo gestionar tus días reales en la Guía de alimentación.',
  '¿Sabías que la fibra alimenta a las bacterias buenas de tu intestino? Frutas, verduras y granos enteros hacen más que "llenar". Más en la Guía de alimentación.',
  'El agua también cuenta en tus resultados: hasta una deshidratación leve baja tu rendimiento y se confunde con hambre. Regístrala en la app y revisa el tema en Aprendizaje.',
  'Comer más despacio le da tiempo a tu cerebro de registrar saciedad (~20 minutos). Un truco simple que suma — en la Guía de alimentación hay más como este.',
  'La báscula miente de un día a otro: agua, sal y hormonas la mueven hasta 2 kg sin que cambie tu grasa. Aprende a leer la tendencia en Aprendizaje.',
  '¿Sabías que la vitamina D se comporta más como una hormona? Sol, pescado graso y huevo son tus fuentes. Dale una mirada al material de Aprendizaje.',
  'Ningún alimento engorda o adelgaza por sí solo: manda el balance de la semana. Por eso registrar lo cambia todo — repásalo en la Guía de alimentación.',
];

// ─── CALENDARIO DE REFUERZO DEL RETO (lo edita el coach) ─────────────────
// Durante el reto (hasta el 9 de agosto) los anuncios de Aprendizaje suben
// a DOS por semana: lunes y jueves al mediodía, arrancando con el domingo
// 12 de julio. Cada momento muestra el siguiente gancho de LEARNING_HOOKS
// en orden, UNA sola vez por cliente, en la primera apertura de la app
// después de esa hora. Si el cliente estuvo días sin abrir, solo ve el más
// reciente (no se le acumulan). Pasada la última fecha, vuelve solo el
// ritmo normal de 1 por semana.
const LEARNING_BOOST_SCHEDULE = [
  '2026-07-12T12:00:00', // domingo de arranque
  '2026-07-13T12:00:00', '2026-07-16T12:00:00', // lunes y jueves
  '2026-07-20T12:00:00', '2026-07-23T12:00:00',
  '2026-07-27T12:00:00', '2026-07-30T12:00:00',
  '2026-08-03T12:00:00', '2026-08-06T12:00:00',
];

// Returns YYYY-MM-DD in user's LOCAL timezone (not UTC)
const getLocalDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

if (typeof window !== 'undefined' && !window.storage) {
  const PREFIX = 'mt:';
  window.storage = {
    get: async (key) => { try { const v = localStorage.getItem(PREFIX + key); return v !== null ? { value: v } : null; } catch (e) { return null; } },
    set: async (key, value) => { try { localStorage.setItem(PREFIX + key, value); return { value }; } catch (e) { return null; } },
    delete: async (key) => { try { localStorage.removeItem(PREFIX + key); return { deleted: true }; } catch (e) { return null; } },
    list: async (prefix = '') => { try { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length)); } return { keys }; } catch (e) { return null; } },
  };
}

export default function MealTracker() {
  const [view, setView] = useState('loading');
  const [goals, setGoals] = useState(null);
  // Historial de metas [{since:'YYYY-MM-DD', kcal,p,c,g}] — lo escribe el
  // coach vía coach-data. Permite evaluar cada día del pasado contra la meta
  // que regía ESE día (trazabilidad: cambiar la meta hoy no reescribe ayer).
  const [goalsHistory, setGoalsHistory] = useState(null);
  const [entries, setEntries] = useState([]);
  const [water, setWater] = useState(0);
  const [favorites, setFavorites] = useState([]);
  // Lápidas de favoritos: ids que el cliente BORRÓ a propósito. Se persisten
  // y se sincronizan con el server para que (a) una copia vieja nunca pueda
  // "resucitar" un favorito borrado, y (b) la fusión servidor↔dispositivos
  // nunca pierda un favorito que no fue borrado explícitamente.
  const [favoritesDeleted, setFavoritesDeleted] = useState([]);
  const [history, setHistory] = useState({});
  const [historyDetail, setHistoryDetail] = useState({});
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState('');
  const [name, setName] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [perfectDayShown, setPerfectDayShown] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [recording, setRecording] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // Espejo en ref para listeners de touch (no re-suscriben por render)
  const keyboardOpenRef = useRef(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [showRecetario, setShowRecetario] = useState(false);
  const [cardCompact, setCardCompact] = useState(false);
  const [frequentItems, setFrequentItems] = useState({}); // { itemName: { count, lastSeen, kcal, p, c, g, amount } }
  const [wellbeing, setWellbeing] = useState({}); // { 'YYYY-MM-DD': { energy, hunger, mood } }
  const [showWellbeingModal, setShowWellbeingModal] = useState(false);
  const [favoriteIngredients, setFavoriteIngredients] = useState([]); // ["pollo", "arroz", ...]
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [showPlannerModal, setShowPlannerModal] = useState(false);
  const [plannerProposal, setPlannerProposal] = useState(null); // result from LLM
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [showCapabilitiesModal, setShowCapabilitiesModal] = useState(false);
  const [showPerformanceModal, setShowPerformanceModal] = useState(false);
  // Anillo tocado → línea explicando ese macro (null = sin explicación abierta)
  const [macroTip, setMacroTip] = useState(null);
  useEffect(() => {
    if (!macroTip) return;
    const t = setTimeout(() => setMacroTip(null), 8000); // se esconde sola
    return () => clearTimeout(t);
  }, [macroTip]);
  const [transcribing, setTranscribing] = useState(false);
  const [pendingFavoriteEntry, setPendingFavoriteEntry] = useState(null);
  const [renamingFavoriteId, setRenamingFavoriteId] = useState(null);
  const [cloudConsent, setCloudConsent] = useState(null); // null = no decidido, 'accepted' | 'declined'
  // Acceso suspendido desde el CRM ('pausa' | 'finalizado' | null). No borra
  // nada: solo bloquea la pantalla hasta que el coach reactive el plan.
  const [accessBlocked, setAccessBlocked] = useState(null);
  // Recordatorio de pago (viene del CRM vía /api/payment-status). null = sin
  // recordatorio; objeto { dia_corte, monto, moneda } = la fecha de corte del
  // mes ya pasó y el coach aún no marcó el pago. Se muestra como banner (fuera
  // del chat) y desaparece solo cuando el coach marca el pago en el CRM.
  const [paymentDue, setPaymentDue] = useState(null);
  // Invitación a activar recordatorios push (visible solo si el permiso del
  // navegador está en 'default' y no la descartó hace poco)
  const [pushPrompt, setPushPrompt] = useState(false);
  // Adherencia de ENTRENAMIENTO de la semana pasada (viene del CRM vía
  // /api/adherence: seguimientos.dias_planeados/asistidos). null = aún sin
  // respuesta o sin datos; la parte de alimentación se calcula local.
  const [trainingWeek, setTrainingWeek] = useState(null);
  // Link al centro de recursos DEL CLIENTE (viene de /api/resources según su
  // nombre; los links se administran en api/_clients.js). Vacío = sin botón.
  const [learningUrl, setLearningUrl] = useState(() => {
    try { return localStorage.getItem('learningUrl') || ''; } catch (e) { return ''; }
  });
  const initialLoadDone = useRef(false);
  // Copia viva de favoritesDeleted para closures async (pull del server).
  const favoritesDeletedRef = useRef([]);
  const cloudUserIdRef = useRef(null);
  const cloudSyncedFromServer = useRef(false);
  const cloudPushTimerRef = useRef(null);
  // Versión de la meta que este dispositivo ya conoce/aplicó: { at, by }.
  // Sirve para detectar cambios hechos por el coach (aviso en el chat) y para
  // que un push con metas viejas no pise una meta más nueva en el server.
  const goalsMetaRef = useRef(null);
  // Identidad estable para usar desde efectos sin re-suscribirlos (se
  // reasigna en cada render, mismo patrón que latestHandlersRef).
  const applyServerGoalsRef = useRef(() => {});
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const voiceInputRef = useRef(false);
  // API imperativa de la barra de entrada (componente aislado InputBar).
  // Teclear ya NO re-renderiza este componente gigante: el texto vive en
  // InputBar y el padre solo lo lee/escribe a través de este ref.
  const inputApiRef = useRef(null);
  const actionsSheetRef = useRef(null);
  const actionsFabRef = useRef(null);
  const inputBarRef = useRef(null);
  const headerRef = useRef(null);
  const goalsCardRef = useRef(null);
  // El SCROLLER del chat: la página NO scrollea (body congelado); solo este
  // contenedor. Es la arquitectura de los chats nativos — con el body quieto,
  // el teclado de iOS ya no tiene un layout viewport que desplazar y el
  // header/tarjeta/barra dejan de vibrar al scrollear escribiendo.
  const chatScrollRef = useRef(null);

  // Closes the actions sheet INSTANTLY via direct DOM mutation + paint flush,
  // before letting React run its expensive re-render. On mobile the parent
  // component takes 1-2s to reconcile; without this, the user sees the menu
  // "frozen" for those seconds, AND the input bar / FAB stay hidden during
  // that gap. We toggle their display directly to keep the UI in sync.
  const closeActionsSheet = useCallback(() => {
    if (actionsSheetRef.current) actionsSheetRef.current.style.display = 'none';
    if (inputBarRef.current) inputBarRef.current.style.display = 'block';
    if (actionsFabRef.current) actionsFabRef.current.style.display = 'flex';
    // El sync de estado va en startTransition: React 18 lo marca como no
    // urgente y cede al paint, así el tap se siente instantáneo.
    startTransition(() => setActionsExpanded(false));
  }, []);

  // Identidades estables para props de componentes memoizados (ver InputBar).
  const latestHandlersRef = useRef({});
  const stableSend = useCallback((t) => latestHandlersRef.current.handleSend?.(t), []);
  const stableStartVoice = useCallback(() => latestHandlersRef.current.startVoice?.(), []);
  const stableStopVoice = useCallback(() => latestHandlersRef.current.stopVoice?.(), []);
  const stableFocusInput = useCallback(() => setActionsExpanded(false), []);

  const openActionsSheet = useCallback(() => {
    if (actionsSheetRef.current) actionsSheetRef.current.style.display = 'flex';
    if (inputBarRef.current) inputBarRef.current.style.display = 'none';
    if (actionsFabRef.current) actionsFabRef.current.style.display = 'none';
    startTransition(() => setActionsExpanded(true));
  }, []);

  const today = getLocalDate();

  useEffect(() => {
    (async () => {
      try {
        const [goalsRes, nameRes, lastDayRes, histRes, histDetailRes, favRes, msgsRes, perfectRes, freqRes, wellRes, favIngRes, goalsUpdRes, favDelRes] = await Promise.all([
          window.storage.get('goals').catch(() => null),
          window.storage.get('name').catch(() => null),
          window.storage.get('lastDay').catch(() => null),
          window.storage.get('history').catch(() => null),
          window.storage.get('historyDetail').catch(() => null),
          window.storage.get('favorites').catch(() => null),
          window.storage.get('messages').catch(() => null),
          window.storage.get('perfectDays').catch(() => null),
          window.storage.get('frequentItems').catch(() => null),
          window.storage.get('wellbeing').catch(() => null),
          window.storage.get('favoriteIngredients').catch(() => null),
          window.storage.get('goalsUpdated').catch(() => null),
          window.storage.get('favoritesDeleted').catch(() => null),
        ]);

        if (favDelRes?.value) {
          try {
            const dels = JSON.parse(favDelRes.value);
            if (Array.isArray(dels)) { favoritesDeletedRef.current = dels; setFavoritesDeleted(dels); }
          } catch (e) {}
        }

        if (goalsUpdRes?.value) {
          try { goalsMetaRef.current = JSON.parse(goalsUpdRes.value); } catch (e) {}
        }

        let storedHistory = histRes?.value ? JSON.parse(histRes.value) : {};
        let storedHistoryDetail = histDetailRes?.value ? JSON.parse(histDetailRes.value) : {};
        const storedName = nameRes?.value ? JSON.parse(nameRes.value) : '';
        const storedFav = favRes?.value ? JSON.parse(favRes.value) : [];
        let storedMsgs = msgsRes?.value ? JSON.parse(msgsRes.value) : [];
        const storedPerfect = perfectRes?.value ? JSON.parse(perfectRes.value) : [];
        const lastDay = lastDayRes?.value ? JSON.parse(lastDayRes.value) : null;

        // MIGRATION: collect all entry IDs from today + all historical days, drop orphan messages
        const todayRawRes = await window.storage.get(`day:${today}`).catch(() => null);
        const todayRawEntries = todayRawRes?.value ? JSON.parse(todayRawRes.value) : [];
        const allEntryIds = new Set(todayRawEntries.map(e => e.id));
        Object.values(storedHistoryDetail).forEach(arr => {
          (arr || []).forEach(e => allEntryIds.add(e.id));
        });
        const beforeCount = storedMsgs.length;
        storedMsgs = storedMsgs.filter(m => {
          if ((m.isLogged || m.isAppended) && m.entryId) return allEntryIds.has(m.entryId);
          return true;
        });
        if (storedMsgs.length !== beforeCount) {
          await window.storage.set('messages', JSON.stringify(storedMsgs)).catch(() => {});
        }

        if (lastDay && lastDay !== today) {
          const prevDayRes = await window.storage.get(`day:${lastDay}`).catch(() => null);
          const prevWaterRes = await window.storage.get(`water:${lastDay}`).catch(() => null);
          let yesterdayTotals = null;
          if (prevDayRes?.value) {
            const prevEntries = JSON.parse(prevDayRes.value);
            const totals = prevEntries.reduce((acc, e) => ({
              kcal: acc.kcal + (e.kcal || 0),
              p: acc.p + (e.p || 0),
              c: acc.c + (e.c || 0),
              g: acc.g + (e.g || 0),
            }), { kcal: 0, p: 0, c: 0, g: 0 });
            totals.water = prevWaterRes?.value ? JSON.parse(prevWaterRes.value) : 0;
            storedHistory[lastDay] = totals;
            storedHistoryDetail[lastDay] = prevEntries;
            yesterdayTotals = totals;
            await window.storage.set('history', JSON.stringify(storedHistory));
            await window.storage.set('historyDetail', JSON.stringify(storedHistoryDetail));
          }
          setEntries([]);
          setWater(0);

          const separator = { role: 'system', isDaySeparator: true, date: today, ts: Date.now() };
          const goalsRef = goalsRes?.value ? JSON.parse(goalsRes.value) : null;
          // Days elapsed since last use (for recovery messaging)
          let gapDays = 1;
          try {
            const [ly, lm, ld] = lastDay.split('-').map(Number);
            const [ty, tm, td] = today.split('-').map(Number);
            const diff = Math.round((new Date(ty, tm - 1, td) - new Date(ly, lm - 1, ld)) / 86400000);
            if (Number.isFinite(diff) && diff > 0) gapDays = diff;
          } catch (e) {}
          const greeting = {
            role: 'assistant',
            content: composeDayOpening(storedName, yesterdayTotals, goalsRef, { gapDays, hour: new Date().getHours() }),
            isWelcomeHints: !storedMsgs.length
          };
          setMessages([...storedMsgs, separator, greeting]);
        } else {
          const todayRes = await window.storage.get(`day:${today}`).catch(() => null);
          const todayWaterRes = await window.storage.get(`water:${today}`).catch(() => null);
          if (todayRes?.value) setEntries(JSON.parse(todayRes.value));
          if (todayWaterRes?.value) setWater(JSON.parse(todayWaterRes.value));
          if (storedMsgs.length > 0) setMessages(storedMsgs);
        }

        await window.storage.set('lastDay', JSON.stringify(today));
        setHistory(storedHistory);
        setHistoryDetail(storedHistoryDetail);
        setFavorites(storedFav);
        if (storedName) setName(storedName);
        if (storedPerfect.includes(today)) setPerfectDayShown(true);
        if (freqRes?.value) {
          try { setFrequentItems(JSON.parse(freqRes.value)); } catch (e) {}
        }
        if (wellRes?.value) {
          try { setWellbeing(JSON.parse(wellRes.value)); } catch (e) {}
        }
        if (favIngRes?.value) {
          try { setFavoriteIngredients(JSON.parse(favIngRes.value)); } catch (e) {}
        }

        // La puerta de entrada es el NOMBRE, no las metas: el cliente ya no
        // define su meta (la carga el coach y puede tardar), así que un
        // cliente con nombre pero sin meta entra igual a la app — antes
        // rebotaba a la bienvenida en cada apertura.
        if (goalsRes?.value || storedName) {
          if (goalsRes?.value) setGoals(JSON.parse(goalsRes.value));
          setView('main');
          if (storedMsgs.length === 0 && (!lastDay || lastDay === today)) {
            setMessages([{
              role: 'assistant',
              content: storedName
                ? `${storedName.split(' ')[0]}, todo en orden. Listo cuando quieras registrar.`
                : 'Todo en orden. Listo cuando quieras registrar.',
              isWelcomeHints: true,
              ts: Date.now()
            }]);
          }
        } else {
          setView('welcome');
        }
      } catch (e) {
        setView('welcome');
      } finally {
        initialLoadDone.current = true;
      }
    })();
  }, []);

  // ───────────────────────────────────────────────────────────────────────
  // CLOUD SYNC con Supabase (vía /api/sync)
  //
  // Estrategia:
  //  1. Cargar/generar un UUID anónimo en localStorage. Sirve como user_id.
  //  2. Mostrar consentimiento la primera vez. Sin consent, no sale nada.
  //  3. Si el server tiene datos para ese UUID, los aplicamos al state local
  //     (caso: usuario perdió la caché y recupera todo).
  //  4. Si el server no tiene nada, hacemos un primer push con los datos
  //     locales (caso: migración invisible de cliente existente).
  //  5. Cada cambio en colecciones críticas (favoritos, ingredientes,
  //     historial, etc.) dispara un push debounced 3s.
  //
  // Si el endpoint falla (sin red, env vars ausentes, etc.) la app sigue
  // funcionando normal con localStorage; el sync se reintenta en el próximo
  // cambio.
  // ───────────────────────────────────────────────────────────────────────

  // Carga el consentimiento guardado al arrancar
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cloudConsent');
      if (saved === 'accepted' || saved === 'declined') setCloudConsent(saved);
    } catch (e) {}
  }, []);

  // Una vez que la carga local terminó Y hay consentimiento, hace pull del server.
  // Depende también de `view` porque cuando el consentimiento ya estaba guardado,
  // cloudConsent se acepta ANTES de que la carga local async termine: con solo
  // [cloudConsent] este efecto corría una vez con initialLoadDone=false y no se
  // re-ejecutaba nunca — sin pull inicial y sin cloudUserIdRef (el sondeo de
  // metas y el push dependían de él). view cambia de 'loading' a 'main'/'welcome'
  // justo cuando la carga termina, así que re-dispara el intento en el momento
  // correcto. cloudPullStartedRef evita repetir el pull en cambios de view.
  const cloudPullStartedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current || cloudConsent !== 'accepted') return;
    if (cloudPullStartedRef.current) return;
    cloudPullStartedRef.current = true;
    let cancelled = false;

    (async () => {
      // Cargar el UUID local; si NO existe, ANTES de inventar uno nuevo se
      // pregunta al server si ya hay una cuenta con este NOMBRE. Es la clave
      // de "Agregar a inicio" en iPhone (el almacén es SEPARADO de Safari) y
      // de los teléfonos nuevos: sin esto se generaba un uid virgen y el
      // cliente veía chat/favoritos/historial vacíos ("se me borró todo").
      let uid = null;
      try { uid = localStorage.getItem('cloudUserId'); } catch (e) {}
      if (!uid) {
        if (!name) {
          // Aún no hay nombre (onboarding a medias): no crear identidad
          // todavía. Se libera el guard y se reintenta cuando lo haya.
          cloudPullStartedRef.current = false;
          return;
        }
        try {
          const ri = await fetch(`/api/sync?identity_for=${encodeURIComponent(name)}`);
          if (ri.ok) {
            const di = await ri.json();
            if (di && di.user_id) uid = di.user_id; // cuenta existente: adoptarla
            // di.user_id === null → el server confirmó que NO hay cuenta con
            // este nombre: crear una nueva abajo es seguro.
          } else {
            // No se pudo VERIFICAR (server caído): no inventar una identidad
            // nueva a ciegas — partiría la cuenta en dos. Reintento luego.
            cloudPullStartedRef.current = false;
            return;
          }
        } catch (e) {
          cloudPullStartedRef.current = false;
          return;
        }
      }
      if (!uid) {
        uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
      }
      try { localStorage.setItem('cloudUserId', uid); } catch (e) {}
      cloudUserIdRef.current = uid;

      try {
        const r = await fetch(`/api/sync?user_id=${uid}`);
        if (!r.ok) { cloudPullStartedRef.current = false; return; }
        const row = await r.json();
        // Cancelado (cambio de vista con el fetch en vuelo): NO empujar el
        // estado local — el server puede tener data aún sin fusionar y el
        // push la pisaría (teléfono nuevo = pisarla con vacío). Se libera el
        // guard para que el próximo cambio de vista reintente el pull.
        if (cancelled) { cloudPullStartedRef.current = false; return; }
        if (!row || !row.data) {
          // Server vacío → primer push con datos locales (migración invisible)
          schedulePushToCloud(0);
          return;
        }
        // Aplicar datos del server fusionando con el estado local. La data del
        // server NO debe pisar archivos recién creados localmente (por ejemplo,
        // el día de ayer que acabamos de archivar en el efecto de carga). Para
        // cada fecha de history/historyDetail, si la tenemos local y no en el
        // server, ese día sobrevive. Además, si el server trae `today_entries`
        // con fecha distinta a la actual del dispositivo, eso es data de un día
        // anterior que nunca llegó a archivarse en history en el server — lo
        // archivamos ahora antes de aplicar.
        const d = row.data;
        cloudSyncedFromServer.current = true;
        // FUSIONAR, nunca reemplazar. Antes el server PISABA el estado local
        // (setFavorites(d.favorites) directo): si el server tenía una copia
        // vieja o vacía —p. ej. el primer push se hizo con la app recién
        // instalada—, cada apertura de la app borraba los favoritos e
        // ingredientes que el cliente había guardado en su teléfono, y el
        // siguiente push consolidaba la pérdida. Era la causa de "guardé mis
        // ingredientes y hoy aparece vacío".
        // Lápidas: unión de las locales + las del server. Un id con lápida es
        // un borrado EXPLÍCITO del cliente (en este u otro dispositivo) y se
        // respeta en ambas direcciones; todo lo demás sobrevive a la fusión.
        const serverFavDeleted = Array.isArray(d.favoritesDeleted) ? d.favoritesDeleted : [];
        if (serverFavDeleted.length > 0) {
          const mergedDels = Array.from(new Set([...favoritesDeletedRef.current, ...serverFavDeleted])).slice(-300);
          favoritesDeletedRef.current = mergedDels;
          setFavoritesDeleted(mergedDels);
        }
        if ((Array.isArray(d.favorites) && d.favorites.length > 0) || serverFavDeleted.length > 0) {
          const dead = new Set([...favoritesDeletedRef.current, ...serverFavDeleted]);
          setFavorites(local => {
            const byId = new Map((local || []).filter(f => !dead.has(f.id)).map(f => [f.id, f]));
            for (const f of (Array.isArray(d.favorites) ? d.favorites : [])) {
              if (f && f.id != null && !byId.has(f.id) && !dead.has(f.id)) byId.set(f.id, f);
            }
            return Array.from(byId.values());
          });
        }
        if (Array.isArray(d.favoriteIngredients) && d.favoriteIngredients.length > 0) {
          setFavoriteIngredients(local => Array.from(new Set([...(local || []), ...d.favoriteIngredients])));
        }

        // Construir un archivo "rescatado" del today_entries server cuando ese
        // today ya quedó en el pasado (rollover ocurrido entre dispositivos o
        // sesiones).
        const cloudToday = d.today;
        const cloudEntries = Array.isArray(d.today_entries) ? d.today_entries : null;
        const cloudTotals = d.today_totals;
        const cloudWater = d.today_water || 0;
        const todayLocal = getLocalDate();
        const archiveFromCloud = (cloudToday && cloudToday !== todayLocal && cloudEntries && cloudEntries.length > 0);

        if (d.history && typeof d.history === 'object') {
          setHistory(local => {
            const merged = { ...(d.history || {}) };
            // Local wins para fechas que el server no tenga (recién archivadas)
            for (const date of Object.keys(local || {})) {
              if (!merged[date]) merged[date] = local[date];
            }
            // Rescate del today_entries server si quedó en el pasado
            if (archiveFromCloud && !merged[cloudToday]) {
              const tot = cloudTotals || cloudEntries.reduce((acc, e) => ({
                kcal: acc.kcal + (e.kcal || 0),
                p: acc.p + (e.p || 0),
                c: acc.c + (e.c || 0),
                g: acc.g + (e.g || 0),
              }), { kcal: 0, p: 0, c: 0, g: 0 });
              merged[cloudToday] = { ...tot, water: cloudWater };
            }
            return merged;
          });
        }
        if (d.historyDetail && typeof d.historyDetail === 'object') {
          setHistoryDetail(local => {
            const merged = { ...(d.historyDetail || {}) };
            for (const date of Object.keys(local || {})) {
              if (!merged[date]) merged[date] = local[date];
            }
            if (archiveFromCloud && !merged[cloudToday]) {
              merged[cloudToday] = cloudEntries;
            }
            return merged;
          });
        }
        // CHAT: en un dispositivo NUEVO (localmente solo está el saludo del
        // día) se adopta la conversación guardada en la nube — el cliente
        // reencuentra su chat tal cual. En un dispositivo con chat propio en
        // marcha NO se toca nada (regla: solo si hay menos de 4 burbujas).
        if (Array.isArray(d.messages) && d.messages.length > 0) {
          setMessages(local => (Array.isArray(local) && local.length < 4)
            ? d.messages.slice(-150)
            : local);
        }
        if (d.frequentItems && typeof d.frequentItems === 'object') {
          // Fusión: gana la entrada con más registros (count más alto)
          setFrequentItems(local => {
            const merged = { ...d.frequentItems };
            for (const [k, v] of Object.entries(local || {})) {
              if (!merged[k] || (v.count || 0) > (merged[k].count || 0)) merged[k] = v;
            }
            return merged;
          });
        }
        if (d.wellbeing && typeof d.wellbeing === 'object') {
          // Fusión por fecha: lo local gana en conflicto (es lo más reciente)
          setWellbeing(local => ({ ...d.wellbeing, ...(local || {}) }));
        }
        applyServerGoalsRef.current(d.goals, d.goals_updated);
        if (Array.isArray(d.goals_history) && d.goals_history.length > 0) setGoalsHistory(d.goals_history);
        if (typeof d.name === 'string' && d.name) setName(d.name);
      } catch (e) {
        // Falló el pull (red): liberar el guard para poder reintentar — el
        // pull es una fusión idempotente, repetirlo es seguro.
        cloudPullStartedRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [cloudConsent, view, name]);

  // Aplica metas que llegan del server (pull inicial o sondeo periódico).
  // Van versionadas con goals_updated { at, by }: solo se aplican si son más
  // nuevas que las que este dispositivo ya conoce. Si el cambio lo hizo el
  // coach, se avisa en el chat — el cliente se entera apenas entra (o mientras
  // usa la app), sin refresh. Solo cambia la meta: historial, chat, favoritos
  // y todo lo demás quedan intactos; anillos y recetario se ajustan solos
  // porque leen `goals` del estado.
  applyServerGoalsRef.current = (serverGoals, serverMeta) => {
    if (!serverGoals || typeof serverGoals !== 'object') return;
    const knownAt = goalsMetaRef.current?.at || '';
    const serverAt = serverMeta?.at || '';
    if (serverMeta && serverAt) {
      if (serverAt <= knownAt) return; // ya la tenemos (o tenemos una más nueva)
      goalsMetaRef.current = serverMeta;
      window.storage.set('goalsUpdated', JSON.stringify(serverMeta)).catch(() => {});
      setGoals(serverGoals);
      window.storage.set('goals', JSON.stringify(serverGoals)).catch(() => {});
      // Trazabilidad local: el cambio en vivo también entra al historial de
      // metas de este dispositivo (el server ya lo guardó por su lado).
      setGoalsHistory(prev => {
        const today = getLocalDate();
        const base = Array.isArray(prev) ? prev.filter(h => h.since !== today) : [];
        return [...base, { since: today, ...serverGoals }].sort((a, b) => (a.since < b.since ? -1 : 1));
      });
      if (serverMeta.by === 'coach') {
        const firstName = name ? name.split(' ')[0] : '';
        setMessages(m => [...m, {
          role: 'assistant',
          isAnnouncement: true,
          tag: 'Aviso de tu coach',
          content: `${firstName ? firstName + ', ' : ''}tu coach actualizó tu meta nutricional diaria: ${serverGoals.kcal} kcal · P ${serverGoals.p}g · C ${serverGoals.c}g · G ${serverGoals.g}g. Los anillos y el recetario ya quedaron ajustados a la nueva meta — tu historial y todos tus datos siguen intactos.`,
          ts: Date.now(),
        }]);
        haptic([20, 40, 20]);
      }
    } else if (!knownAt) {
      // Metas sin versión (datos de antes de este cambio): comportamiento
      // anterior — el server manda y se aplican directo, sin aviso.
      setGoals(serverGoals);
    }
  };

  // Sondeo de metas: mientras la app está abierta chequea cada 60s (y al
  // volver a primer plano) si el coach cambió la meta. Payload mínimo
  // (goals_only=1), así el cliente NO tiene que recargar para enterarse.
  useEffect(() => {
    if (view !== 'main' || cloudConsent !== 'accepted') return;
    let stopped = false;
    const check = async () => {
      // El pull inicial fija cloudUserIdRef; si aún no corrió, caemos al
      // localStorage directamente para no depender de ese orden.
      let uid = cloudUserIdRef.current;
      if (!uid) { try { uid = localStorage.getItem('cloudUserId'); } catch (e) {} }
      if (!uid || stopped) return;
      try {
        const r = await fetch(`/api/sync?user_id=${uid}&goals_only=1`);
        if (!r.ok) return;
        const row = await r.json();
        if (!stopped && row) applyServerGoalsRef.current(row.goals, row.goals_updated);
      } catch (e) {}
    };
    const interval = setInterval(check, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [view, cloudConsent]);

  // Helper: empuja el snapshot completo al server, con debounce.
  // CRÍTICO: incluye también `entries` (comidas de HOY, antes de cerrar el día)
  // y `water` para que el coach lo vea EN TIEMPO REAL en su dashboard.
  // El backend reconstruye el history[today] cuando llega esto, así no
  // necesitamos esperar a que el cliente cambie de día.
  const schedulePushToCloud = useCallback((delayMs = 3000) => {
    if (cloudConsent !== 'accepted' || !cloudUserIdRef.current) return;
    if (cloudPushTimerRef.current) clearTimeout(cloudPushTimerRef.current);
    cloudPushTimerRef.current = setTimeout(async () => {
      try {
        const todayTotals = entries.reduce((acc, e) => ({
          kcal: acc.kcal + (e.kcal || 0),
          p: acc.p + (e.p || 0),
          c: acc.c + (e.c || 0),
          g: acc.g + (e.g || 0),
        }), { kcal: 0, p: 0, c: 0, g: 0 });
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: cloudUserIdRef.current,
            name,
            data: {
              favorites, favoritesDeleted, favoriteIngredients, history, historyDetail,
              frequentItems, wellbeing, goals, name,
              // Versión de la meta que este dispositivo conoce; el server la
              // compara y NO deja que un push viejo pise una meta más nueva
              // (p.ej. recién cambiada por el coach).
              goals_updated: goalsMetaRef.current || undefined,
              // CHAT: las últimas ~150 burbujas también viajan a la nube. Sin
              // esto, un teléfono nuevo o la app instalada (Agregar a inicio)
              // recuperaba los DATOS pero el chat aparecía casi vacío — y la
              // conversación es parte de la memoria del asistente.
              messages: messages.slice(-150),
              // En vivo: comidas y agua de HOY
              today,
              today_entries: entries,
              today_water: water,
              today_totals: todayTotals,
            },
          }),
        });
      } catch (e) {}
    }, delayMs);
  }, [cloudConsent, name, favorites, favoritesDeleted, favoriteIngredients, history, historyDetail, frequentItems, wellbeing, goals, entries, water, today, messages]);

  // Watch: cualquier cambio en colecciones críticas dispara un push debounced.
  // Incluimos `entries` y `water` para que se sincronicen en vivo, NO solo al cambiar de día.
  useEffect(() => {
    if (!initialLoadDone.current || cloudConsent !== 'accepted') return;
    schedulePushToCloud();
  }, [favorites, favoritesDeleted, favoriteIngredients, history, historyDetail, frequentItems, wellbeing, goals, name, entries, water, messages, cloudConsent, schedulePushToCloud]);

  const acceptCloudConsent = useCallback(() => {
    try { localStorage.setItem('cloudConsent', 'accepted'); } catch (e) {}
    setCloudConsent('accepted');
  }, []);
  const declineCloudConsent = useCallback(() => {
    try { localStorage.setItem('cloudConsent', 'declined'); } catch (e) {}
    setCloudConsent('declined');
  }, []);

  // Proactive favorites suggestion: if user has 3+ days with registrations and no favoriteIngredients, suggest once (dismissible)
  useEffect(() => {
    if (view !== 'main') return;
    if (favoriteIngredients.length > 0) return;
    if (Object.keys(history).length < 3) return;
    const check = async () => {
      const dismissedRes = await window.storage.get('favSuggestionDismissed').catch(() => null);
      if (dismissedRes?.value) return;
      const shownRes = await window.storage.get('favSuggestionShown').catch(() => null);
      if (shownRes?.value) return;
      await window.storage.set('favSuggestionShown', JSON.stringify(Date.now())).catch(() => {});
      const firstName = name ? name.split(' ')[0] : '';
      setMessages(m => [...m, {
        role: 'assistant',
        isFavSuggestion: true,
        content: `${firstName ? firstName + ', ' : ''}veo que ya llevas varios días registrando. Si me dices qué ingredientes sueles comprar, te puedo armar el día con eso cuando quieras y no pierdes tiempo decidiendo. ¿Te interesa?`,
        ts: Date.now()
      }]);
    };
    const t = setTimeout(check, 8000);
    return () => clearTimeout(t);
  }, [view, name, favoriteIngredients.length, history]);

  // Closing narrative: at 21:30+ (or on open after that), drop a coach-style end-of-day message once per day
  useEffect(() => {
    if (view !== 'main' || !goals) return;
    const check = async () => {
      const now = new Date();
      const isEvening = now.getHours() > 21 || (now.getHours() === 21 && now.getMinutes() >= 30);
      if (!isEvening) return;
      const key = `closingSent:${today}`;
      const sentRes = await window.storage.get(key).catch(() => null);
      if (sentRes?.value) return; // already sent today
      if (entries.length === 0) return; // no data to summarize
      // Recompute totals locally to avoid TDZ on outer `totals`
      const t = entries.reduce((acc, e) => ({
        kcal: acc.kcal + (e.kcal || 0),
        p: acc.p + (e.p || 0),
        c: acc.c + (e.c || 0),
        g: acc.g + (e.g || 0),
      }), { kcal: 0, p: 0, c: 0, g: 0 });
      const firstName = name ? name.split(' ')[0] : '';
      const intro = firstName ? `${firstName}, ` : '';
      const diff = (v, g) => v - g;
      const pDiff = diff(t.p, goals.p);
      const cDiff = diff(t.c, goals.c);
      const gDiff = diff(t.g, goals.g);
      const kDiff = diff(t.kcal, goals.kcal);
      const inRange = (v, g, tol = 0.07) => Math.abs(v - g) <= g * tol;
      const allInRange = inRange(t.kcal, goals.kcal) && inRange(t.p, goals.p) && inRange(t.c, goals.c) && inRange(t.g, goals.g);
      let narrative;
      if (allInRange) {
        narrative = `${intro}cerraste el día en línea con las cuatro metas. Día sólido. Mañana seguimos con el mismo ritmo.`;
      } else {
        const offs = [
          { name: 'proteína', diff: pDiff, unit: 'g' },
          { name: 'carbos', diff: cDiff, unit: 'g' },
          { name: 'grasas', diff: gDiff, unit: 'g' },
        ].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        const main = offs[0];
        const dir = main.diff > 0 ? 'por encima' : 'por debajo';
        const ajuste = main.diff > 0
          ? `mañana moderamos ${main.name} desde el desayuno`
          : `mañana sumamos ${main.name} desde el desayuno`;
        narrative = `${intro}cerraste con ${t.kcal} kcal (meta ${goals.kcal}, ${kDiff >= 0 ? '+' : ''}${kDiff}). ${main.name.charAt(0).toUpperCase() + main.name.slice(1)} quedó ${Math.abs(main.diff)}${main.unit} ${dir}. Plan: ${ajuste}.`;
      }
      setMessages(m => [...m, { role: 'assistant', content: narrative, ts: Date.now() }]);
      await window.storage.set(key, JSON.stringify(Date.now())).catch(() => {});
      // Also append gap suggestion if any macro is in deficit ≥25%
      maybeAppendGapSuggestion();
    };
    const timer = setTimeout(check, 6000);
    const interval = setInterval(check, 5 * 60 * 1000); // re-check every 5 min in case user is on app
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [view, name, today, goals, entries]);

  // Midnight watcher: detects day change while app is open, archives entries, resets rings
  useEffect(() => {
    if (view !== 'main') return;
    const checkDayChange = () => {
      const now = getLocalDate();
      if (now !== today) {
        // Archive current day's entries to history
        if (entries.length > 0) {
          const dayTotals = entries.reduce((acc, e) => ({
            kcal: acc.kcal + (e.kcal || 0),
            p: acc.p + (e.p || 0),
            c: acc.c + (e.c || 0),
            g: acc.g + (e.g || 0),
          }), { kcal: 0, p: 0, c: 0, g: 0 });
          setHistory(h => ({ ...h, [today]: { ...dayTotals, water } }));
          setHistoryDetail(hd => ({ ...hd, [today]: entries }));
        }
        // Reset for new day
        setEntries([]);
        setWater(0);
        setPerfectDayShown(false);
        setMessages(m => [
          ...m,
          { role: 'system', isDaySeparator: true, date: now, ts: Date.now() }
        ]);
        window.storage.set('lastDay', JSON.stringify(now)).catch(() => {});
        // Force re-render with new `today` by reloading; simpler: just leave anillos at 0 (totals recompute from entries)
      }
    };
    const interval = setInterval(checkDayChange, 30000); // every 30s
    return () => clearInterval(interval);
  }, [view, today, entries, water]);

  // Altura REAL del header. El header crece cuando el título o "Entrena con
  // Método" se parten en varias líneas (pantallas angostas, fuente grande del
  // sistema): con un top fijo de 40px la tarjeta de anillos quedaba METIDA
  // debajo del header. Se mide con ResizeObserver y la tarjeta y el padding
  // del contenido se calculan a partir de esta medida.
  const [headerH, setHeaderH] = useState(40);
  useEffect(() => {
    if (view !== 'main' || !headerRef.current) return;
    const el = headerRef.current;
    const measure = () => setHeaderH(el.offsetHeight || 40);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // Keyboard detection (mobile) + iOS visualViewport tracking.
  // Cuando se abre el teclado en iOS Safari, el "layout viewport" no cambia,
  // pero el "visual viewport" se hace más chico y se desplaza. Los elementos
  // `position: fixed` quedan anclados al layout viewport (fuera de la pantalla
  // visible). Para que el header y la barra de macros se queden VISIBLES,
  // les aplicamos transform: translateY(offsetTop) en cada movimiento del
  // visual viewport. Y también pegamos el inputBar al borde inferior del
  // visual viewport para que no quede oculto detrás del teclado.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const updateFixed = () => {
      const offsetTop = vv.offsetTop || 0;
      const heightDiff = window.innerHeight - vv.height;
      const kbOpen = heightDiff > 100;
      keyboardOpenRef.current = kbOpen;
      setKeyboardOpen(kbOpen);
      const t = `translate3d(0, ${offsetTop}px, 0)`;
      if (headerRef.current) headerRef.current.style.transform = t;
      if (goalsCardRef.current) goalsCardRef.current.style.transform = t;
      const fromBottom = window.innerHeight - (offsetTop + vv.height);
      // El SCROLLER se encoge por encima del teclado: así el final de la
      // conversación queda visible sobre la barra, y scrollear con el
      // teclado abierto es scroll nativo del contenedor (cero persecución).
      if (chatScrollRef.current) {
        chatScrollRef.current.style.bottom = fromBottom > 0 ? `${fromBottom}px` : '';
        if (kbOpen && !keyboardOpenRef.current_prev) {
          const sc = chatScrollRef.current;
          requestAnimationFrame(() => sc.scrollTo({ top: sc.scrollHeight, behavior: 'auto' }));
        }
      }
      keyboardOpenRef.current_prev = kbOpen;
      if (inputBarRef.current) {
        // Mover el input bar arriba para que quede sobre el teclado
        inputBarRef.current.style.transform = `translate3d(0, -${fromBottom}px, 0)`;
        // COLCHÓN anti-superposición: iOS dibuja su pastilla de AutoFill
        // (llave/tarjeta/ubicación) y el botón de teclado flotando PEGADOS
        // al borde del área visible. Si la barra queda al ras del teclado,
        // esos íconos del sistema la tapan. Con el teclado abierto dejamos
        // ~52px de fondo sólido bajo el campo: los íconos flotan sobre ese
        // espacio vacío y el texto queda siempre visible y clickeable.
        inputBarRef.current.style.paddingBottom = kbOpen
          ? '52px'
          : 'calc(20px + env(safe-area-inset-bottom, 0px))';
      }
      // Mientras se escribe, el botón flotante "Herramientas" solo estorba:
      // se oculta con el teclado abierto y reaparece al cerrarlo.
      if (actionsFabRef.current) {
        actionsFabRef.current.style.visibility = kbOpen ? 'hidden' : '';
      }
    };
    // rAF-throttle: los eventos del visual viewport llegan en ráfaga durante
    // el scroll y aplicar transforms en cada uno producía la vibración —
    // como máximo un reposicionamiento por frame de pintura.
    let raf = 0;
    const requestUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; updateFixed(); });
    };
    vv.addEventListener('resize', requestUpdate);
    vv.addEventListener('scroll', requestUpdate);
    updateFixed();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', requestUpdate);
      vv.removeEventListener('scroll', requestUpdate);
    };
  }, []);

  // SCROLL PARA CERRAR EL TECLADO — el patrón de WhatsApp/Telegram/iMessage.
  // El estado "teclado abierto + usuario scrolleando" es imposible de pintar
  // estable en iOS (los eventos del visual viewport llegan tarde y la barra
  // persigue al teclado a los tirones). En vez de perseguirlo: si el cliente
  // arrastra la conversación con el teclado abierto, el teclado se cierra y
  // el layout vuelve a su estado estable. touchmove solo lo disparan dedos
  // reales, así que los auto-scrolls programáticos (llegada de mensajes) no
  // cierran el teclado por accidente.
  useEffect(() => {
    let startY = null;
    const onTouchStart = (e) => { startY = e.touches && e.touches[0] ? e.touches[0].clientY : null; };
    const onTouchMove = (e) => {
      if (startY == null || !keyboardOpenRef.current) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      // Arrastres DENTRO de la barra de escribir (seleccionar texto, mover el
      // cursor) no cierran el teclado.
      if (inputBarRef.current && e.target && inputBarRef.current.contains(e.target)) return;
      if (Math.abs(t.clientY - startY) > 24) {
        const ae = document.activeElement;
        if (ae && typeof ae.blur === 'function') ae.blur();
        startY = null;
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    // Scroll al fondo del SCROLLER del chat (la página ya no scrollea)
    requestAnimationFrame(() => {
      const sc = chatScrollRef.current;
      if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, loading]);

  // On mount/load: jump (no animation) to the last message so users open at the most recent
  useEffect(() => {
    if (view === 'main' && messages.length > 0) {
      // Use a small delay so layout settles first
      const t = setTimeout(() => {
        const sc = chatScrollRef.current;
        if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'auto' });
      }, 80);
      return () => clearTimeout(t);
    }
  }, [view]);

  // Con el scroller interno, el body NO debe scrollear nunca en la vista
  // principal (Safari le encantaría hacer rubber-band igual).
  useEffect(() => {
    if (view !== 'main') return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [view]);

  // Track if user is scrolled away from bottom (to show "go to latest" button)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  useEffect(() => {
    const sc = chatScrollRef.current;
    if (!sc) return;
    const onScroll = () => {
      const distFromBottom = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
      setShowJumpToLatest(distFromBottom > 220);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => sc.removeEventListener('scroll', onScroll);
  }, [messages.length, view]);

  useEffect(() => {
    if (view === 'main') {
      window.storage.set(`day:${today}`, JSON.stringify(entries)).catch(() => {});
    }
  }, [entries, today, view]);

  useEffect(() => {
    if (view === 'main') {
      window.storage.set(`water:${today}`, JSON.stringify(water)).catch(() => {});
    }
  }, [water, today, view]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    window.storage.set('favorites', JSON.stringify(favorites)).catch(() => {});
  }, [favorites]);
  useEffect(() => {
    favoritesDeletedRef.current = favoritesDeleted;
    if (!initialLoadDone.current) return;
    window.storage.set('favoritesDeleted', JSON.stringify(favoritesDeleted)).catch(() => {});
  }, [favoritesDeleted]);

  // Persistir historial (incluye registros retroactivos a días pasados).
  useEffect(() => {
    if (!initialLoadDone.current) return;
    window.storage.set('history', JSON.stringify(history)).catch(() => {});
  }, [history]);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    window.storage.set('historyDetail', JSON.stringify(historyDetail)).catch(() => {});
  }, [historyDetail]);

  useEffect(() => {
    if (view === 'main') {
      const toStore = messages.slice(-200);
      window.storage.set('messages', JSON.stringify(toStore)).catch(() => {});
    }
  }, [messages, view]);

  const totals = useMemo(() => entries.reduce((acc, e) => ({
    kcal: acc.kcal + (e.kcal || 0),
    p: acc.p + (e.p || 0),
    c: acc.c + (e.c || 0),
    g: acc.g + (e.g || 0),
  }), { kcal: 0, p: 0, c: 0, g: 0 }), [entries]);

  useEffect(() => {
    if (!goals || perfectDayShown || entries.length === 0) return;
    const tolerance = 0.05;
    const isInRange = (val, goal) => val >= goal * (1 - tolerance) && val <= goal * (1 + tolerance);
    if (isInRange(totals.kcal, goals.kcal) && isInRange(totals.p, goals.p) &&
        isInRange(totals.c, goals.c) && isInRange(totals.g, goals.g)) {
      haptic([30, 50, 30, 50, 60]);
      setActiveModal('perfect');
      setPerfectDayShown(true);
      window.storage.get('perfectDays').then(res => {
        const arr = res?.value ? JSON.parse(res.value) : [];
        if (!arr.includes(today)) {
          arr.push(today);
          window.storage.set('perfectDays', JSON.stringify(arr));
        }
      }).catch(() => {});
    }
  }, [totals, goals, entries.length, perfectDayShown, today]);

  // Serialize the recent chat into plain text so the model has conversation memory.
  // We embed it in the prompt (instead of a multi-turn array) to avoid API alternating constraints.
  const buildHistoryText = (maxTurns = 16) => {
    const recent = messages.slice(-maxTurns);
    const lines = [];
    for (const m of recent) {
      if (m.isDaySeparator) continue;
      if (m.role === 'user') {
        lines.push(`Cliente: ${m.content}`);
        continue;
      }
      // assistant / system messages — serialize the meaningful action
      if (m.isLogged && m.entryId) {
        const e = entries.find(x => x.id === m.entryId);
        if (e) lines.push(`Asistente: (registré ${e.meal || 'comida'}: ${e.items.map(i => `${i.name}${i.amount ? ' ' + i.amount : ''}`).join(', ')} — total ${Math.round(e.kcal)} kcal)`);
      } else if (m.isAppended && m.entryId) {
        const e = entries.find(x => x.id === m.entryId);
        const added = (m.addedItems || []).map(i => `${i.name}${i.amount ? ' ' + i.amount : ''}`).join(', ');
        if (e) lines.push(`Asistente: (sumé a ${e.meal || 'comida'}: ${added} — nuevo total ${Math.round(e.kcal)} kcal)`);
      } else if (m.isMacroQuery && m.data) {
        lines.push(`Asistente: (consulta sin registrar — ${m.data.food}: ${Math.round(m.data.kcal)} kcal)`);
      } else if (m.isWater) {
        lines.push(`Asistente: (registré ${m.ml} ml de agua)`);
      } else if (m.isSummaryDetailed) {
        lines.push(`Asistente: (mostré el resumen del día)`);
      } else if (m.isMealSuggestion || m.isGapSuggestions) {
        lines.push(`Asistente: (di opciones de alimentos)`);
      } else if (typeof m.content === 'string' && m.content && !['logged', 'appended', 'water', 'macro_query', 'summary', 'summary_detailed', 'proportion'].includes(m.content)) {
        lines.push(`Asistente: ${m.content}`);
      }
    }
    return lines.join('\n');
  };

  // Lee la respuesta SSE (streaming) de /api/chat acumulando los pedazos de
  // texto a medida que llegan. onDelta recibe el texto acumulado en cada
  // avance — sirve para mostrar progreso en vivo sin esperar el final.
  const readClaudeStream = async (response, onDelta) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let done = false;
    while (!done) {
      const { value, done: rDone } = await reader.read();
      done = rDone;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      // Los eventos SSE vienen separados por líneas; puede llegar media línea
      // en un chunk, así que guardamos el resto en buffer hasta completarla.
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          text += ev.delta.text || '';
          if (onDelta) { try { onDelta(text); } catch (e) {} }
        } else if (ev.type === 'error') {
          throw new Error(`stream:${ev.error?.message || 'error'}`);
        }
      }
    }
    if (!text) throw new Error('stream:empty');
    return text;
  };

  const callClaude = async (prompt, systemPrompt, opts = {}) => {
    const { retries = 2, onDelta = null } = opts;
    let lastError = null;
    // Send the system prompt as a cacheable block. If it's identical across calls
    // (and reused within ~5 min), Anthropic charges ~10% for it (prompt caching).
    const systemBlocks = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CHAT_MODEL,
            max_tokens: 4000,
            system: systemBlocks,
            messages: [{ role: "user", content: prompt }],
            ...(onDelta ? { stream: true } : {}),
          })
        });
        if (!response.ok) {
          if (response.status === 429 || response.status === 529 || response.status >= 500) {
            throw new Error(`overloaded:${response.status}`);
          }
          throw new Error(`http:${response.status}`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
          return await readClaudeStream(response, onDelta);
        }
        // Respuesta clásica (sin streaming, o servidor aún sin la versión nueva).
        const data = await response.json();
        return data.content.map(c => c.text || '').join('');
      } catch (e) {
        lastError = e;
        if (i < retries) {
          const wait = 300 * Math.pow(2, i);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
    throw lastError;
  };

  // Siempre por hora del día. Antes la PRIMERA comida del día se etiquetaba
  // "desayuno" sin importar la hora: si el cliente empezaba a registrar a las
  // 9pm, su cena quedaba como desayuno.
  const predictMealType = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'desayuno';
    if (hour < 16) return 'almuerzo';
    if (hour < 21) return 'cena';
    return 'snack';
  };

  // ─── Streak: consecutive days with any registration (today counts if entries>0) ───
  const streak = useMemo(() => {
    let count = 0;
    const d = new Date();
    // include today only if it has entries already
    if (entries.length === 0) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const key = getLocalDate(d);
      const dayTotals = key === today
        ? entries.reduce((s, e) => s + (e.kcal || 0), 0)
        : (history[key]?.kcal || 0);
      if (dayTotals > 0) {
        count++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return count;
  }, [entries, history, today]);

  // ─── Top frequent items (by count, recency tiebreaker) for quick-add bar ───
  const topFrequent = useMemo(() => Object.entries(frequentItems)
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => (b.count - a.count) || ((b.lastSeen || 0) - (a.lastSeen || 0)))
    .slice(0, 6), [frequentItems]);

  // Scroll listener: shrink card when scrolled down. Con HISTÉRESIS: se
  // compacta al pasar 90px y se expande recién al volver bajo 25px. Antes el
  // umbral único (60px) hacía que la tarjeta rebotara al scrollear cerca del
  // límite, porque el cambio de padding movía el scroll y re-cruzaba el umbral.
  useEffect(() => {
    const sc = chatScrollRef.current;
    if (!sc) return;
    const onScroll = () => {
      const y = sc.scrollTop || 0;
      setCardCompact(prev => prev ? y > 25 : y > 90);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [view]);

  // Listen for "open capabilities" custom event dispatched from welcome card
  useEffect(() => {
    const handler = () => setShowCapabilitiesModal(true);
    window.addEventListener('openCapabilities', handler);
    return () => window.removeEventListener('openCapabilities', handler);
  }, []);

  // Centro de recursos del cliente: consulta el link según su nombre y lo
  // cachea para que el botón aparezca al instante en próximas aperturas.
  // Además de al abrir, se re-consulta al volver a primer plano y cada 5
  // minutos: así, si el coach configura o cambia el link, el botón
  // "Aprendizaje" aparece SOLO incluso en una pestaña que lleva rato
  // abierta — nunca hay que pedirle refresh al cliente.
  useEffect(() => {
    if (!name || view !== 'main') return;
    const fetchResources = async () => {
      try {
        const r = await fetch('/api/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!r.ok) return;
        const data = await r.json();
        const url = typeof data.url === 'string' ? data.url : '';
        setLearningUrl(url);
        try { localStorage.setItem('learningUrl', url); } catch (e) {}
      } catch (e) { /* sin red: se usa el cache local */ }
    };
    fetchResources();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchResources(); };
    const interval = setInterval(fetchResources, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [name, view]);

  // Verificación de acceso al abrir la app — el CRM manda: si el coach puso
  // el plan en 'pausa' o 'finalizado', se bloquea la pantalla SIN borrar
  // nada (historial, chat y datos quedan intactos esperando la
  // reactivación). Si no hay red, se deja pasar: es una puerta de cortesía.
  useEffect(() => {
    if (view !== 'main' || !name) return;
    let cancelled = false;
    (async () => {
      const a = await checkAccess(name);
      if (cancelled) return;
      // Solo los estados EXPLÍCITOS del CRM bloquean a un usuario que ya
      // está dentro. 'not_found' (nombre que no aparece en CRM ni lista,
      // p.ej. por un desfase de ortografía o una migración a medias) NUNCA
      // debe dejar por fuera a un cliente con su app funcionando — la
      // puerta de entrada para nombres desconocidos es el onboarding.
      setAccessBlocked(!a.ok && ['pausa', 'finalizado'].includes(a.status) ? a.status : null);
    })();
    return () => { cancelled = true; };
  }, [view, name]);

  // Recordatorio de pago: consulta al CRM (vía /api/payment-status) si la fecha
  // de corte del mes ya pasó y el pago aún no está marcado. Se revisa al abrir
  // la app y cada vez que vuelve a primer plano, de modo que en cuanto el coach
  // marca el pago en el CRM, el banner desaparece la próxima vez que el cliente
  // ve la app. No toca el chat ni bloquea nada.
  useEffect(() => {
    if (view !== 'main' || !name) return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`/api/payment-status?name=${encodeURIComponent(name)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setPaymentDue(d && d.due ? { dia_corte: d.dia_corte, monto: d.monto, moneda: d.moneda } : null);
      } catch (e) { /* sin red: no mostramos recordatorio */ }
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [view, name]);

  // ─── Recordatorios push ────────────────────────────────────────────────
  // Suscribe este dispositivo al push (idempotente) y registra en el server
  // la zona horaria del teléfono — así los recordatorios llegan a las 8am /
  // 12m / 8pm HORA LOCAL de cada cliente, esté en el país que esté.
  const ensurePushSubscription = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const r = await fetch('/api/push-subscribe');
        const { publicKey } = await r.json();
        if (!publicKey) return false;
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      }
      let uid = cloudUserIdRef.current;
      if (!uid) { try { uid = localStorage.getItem('cloudUserId'); } catch (e) {} }
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Bogota';
      await fetch('/api/push-subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, name, tz, sub: sub.toJSON() }),
      });
      return true;
    } catch (e) { return false; }
  }, [name]);

  useEffect(() => {
    if (view !== 'main' || !name) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') { ensurePushSubscription(); return; }
    if (Notification.permission === 'default') {
      // No insistir: si la descartó, se re-ofrece a la semana
      try {
        const dismissed = Number(localStorage.getItem('pushPromptDismissedAt') || 0);
        if (Date.now() - dismissed > 7 * 86400000) setPushPrompt(true);
      } catch (e) { setPushPrompt(true); }
    }
  }, [view, name, ensurePushSubscription]);

  // El permiso DEBE pedirse desde un toque del usuario (regla de iOS/Safari)
  const activarPush = useCallback(async () => {
    haptic(8);
    setPushPrompt(false);
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const ok = await ensurePushSubscription();
        setMessages(m => [...m, {
          role: 'assistant', isAnnouncement: true, tag: 'Recordatorios',
          content: ok
            ? '🔔 Listo — te acompaño con recordatorios durante el día para que ningún registro se te pase. Los puedes apagar cuando quieras desde los ajustes del teléfono.'
            : 'El permiso quedó activo; la suscripción se completará la próxima vez que abras la app.',
          ts: Date.now(),
        }]);
      } else {
        try { localStorage.setItem('pushPromptDismissedAt', String(Date.now())); } catch (e) {}
      }
    } catch (e) {}
  }, [ensurePushSubscription]);

  const posponerPush = useCallback(() => {
    haptic(6);
    setPushPrompt(false);
    try { localStorage.setItem('pushPromptDismissedAt', String(Date.now())); } catch (e) {}
  }, []);

  // Adherencia de entreno de la semana pasada, para el tablero "Mi Semana" y
  // el chip de nivel en la tarjeta del día. Una consulta por apertura basta:
  // el seguimiento lo carga el coach una vez por semana, no cambia en vivo.
  useEffect(() => {
    if (view !== 'main' || !name) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/adherence?name=${encodeURIComponent(name)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && d && d.ok) setTrainingWeek(d.entreno || null);
      } catch (e) { /* sin red: el tablero muestra solo alimentación */ }
    })();
    return () => { cancelled = true; };
  }, [view, name]);

  // Abre el centro de recursos (Aprendizaje) pasando la identidad del cliente
  // en la URL (mt_user = UUID del tracker, mt_name = nombre). Así el centro,
  // si es una webapp propia, reconoce al usuario automáticamente — misma
  // persona en ambos lados, sin segundo login — y conserva su avance de
  // lectura. Si el link es Notion/Drive, los parámetros simplemente se
  // ignoran y no molestan.
  const openLearning = useCallback(() => {
    if (!learningUrl) return;
    haptic(8);
    let uid = cloudUserIdRef.current;
    if (!uid) { try { uid = localStorage.getItem('cloudUserId'); } catch (e) {} }
    let url = learningUrl;
    try {
      const u = new URL(learningUrl);
      if (uid) u.searchParams.set('mt_user', uid);
      if (name) u.searchParams.set('mt_name', name);
      url = u.toString();
    } catch (e) { /* URL inválida: se abre tal cual */ }
    window.open(url, '_blank', 'noopener');
  }, [learningUrl, name]);

  // Anuncio de actualización de la app: se muestra UNA vez por id (ver
  // APP_UPDATE_ANNOUNCEMENT arriba). Con un pequeño delay para no pisar el
  // saludo del día.
  useEffect(() => {
    if (view !== 'main') return;
    const { id, text } = APP_UPDATE_ANNOUNCEMENT || {};
    if (!id || !text) return;
    let acked = null;
    try { acked = localStorage.getItem('updateAnnouncementAck'); } catch (e) {}
    if (acked === id) return;
    const t = setTimeout(() => {
      try { localStorage.setItem('updateAnnouncementAck', id); } catch (e) {}
      setMessages(m => [...m, {
        role: 'assistant', isAnnouncement: true, tag: 'La app mejoró',
        content: text, ts: Date.now(),
      }]);
    }, 4000);
    return () => clearTimeout(t);
  }, [view]);

  // Anuncio informativo de Aprendizaje — solo si el cliente tiene centro de
  // recursos configurado. Dos modos:
  //  · RETO (hasta la última fecha de LEARNING_BOOST_SCHEDULE): dos por
  //    semana según el calendario, en la primera apertura después de cada
  //    momento. Solo se muestra el más reciente pendiente — quien estuvo
  //    fuera una semana no recibe tres seguidos.
  //  · NORMAL (después del reto): uno por semana, en la primera apertura de
  //    la semana, como siempre.
  useEffect(() => {
    if (view !== 'main' || !learningUrl) return;
    const t = setTimeout(() => {
      const now = new Date();
      const firstName = name ? name.split(' ')[0] : '';
      const emit = (hook) => {
        // Minúscula en la primera LETRA (saltando ¿ o ¡) al anteponer el nombre
        const hookLower = hook.replace(/^([¿¡]?)(\p{L})/u, (m, signo, letra) => signo + letra.toLowerCase());
        const text = firstName ? `${firstName}, ${hookLower}` : hook;
        setMessages(m => [...m, {
          role: 'assistant', isAnnouncement: true, tag: 'Aprendizaje',
          content: text, showLearnButton: true, ts: Date.now(),
        }]);
      };

      // REGLA ESTRICTA: los anuncios de Aprendizaje salen SOLO lunes y
      // jueves, EL MISMO DÍA. Sin "recuperación": antes, quien no abría el
      // lunes recibía el anuncio pendiente el martes o miércoles, y el del
      // jueves salía viernes o sábado — a cada cliente le caían en días
      // distintos y se sentía como anuncio diario.
      const todayKey = getLocalDate(now);
      const boostEnd = new Date(LEARNING_BOOST_SCHEDULE[LEARNING_BOOST_SCHEDULE.length - 1]);
      if (now <= boostEnd) {
        // MODO RETO — solo si HOY es exactamente un momento del calendario
        const momento = LEARNING_BOOST_SCHEDULE.find(s => s.slice(0, 10) === todayKey && new Date(s) <= now);
        if (!momento) return;
        const key = `learnNudge:boost:${momento}`;
        try { if (localStorage.getItem(key)) return; } catch (e) {}
        try { localStorage.setItem(key, '1'); } catch (e) {}
        // Marca también la semana normal en curso: sin esto, al terminar el
        // reto el modo semanal veía la última semana como "sin anuncio" y
        // soltaba un tercero en la misma semana.
        try {
          const dowB = (now.getDay() + 6) % 7;
          const mondayB = new Date(now);
          mondayB.setDate(now.getDate() - dowB);
          localStorage.setItem(`learnNudge:${getLocalDate(mondayB)}`, '1');
        } catch (e) {}
        emit(LEARNING_HOOKS[LEARNING_BOOST_SCHEDULE.indexOf(momento) % LEARNING_HOOKS.length]);
        return;
      }

      // MODO NORMAL — uno por semana, SOLO el lunes
      const dow = (now.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
      if (dow !== 0) return;
      const monday = new Date(now);
      const weekId = getLocalDate(monday);
      const key = `learnNudge:${weekId}`;
      try { if (localStorage.getItem(key)) return; } catch (e) {}
      try { localStorage.setItem(key, '1'); } catch (e) {}
      // Gancho educativo rotativo: uno por semana, en orden — todos los
      // clientes ven el mismo tema esa semana.
      const weekNum = Math.floor(monday.getTime() / (7 * 86400000));
      emit(LEARNING_HOOKS[((weekNum % LEARNING_HOOKS.length) + LEARNING_HOOKS.length) % LEARNING_HOOKS.length]);
    }, 9000);
    return () => clearTimeout(t);
  }, [view, learningUrl, name]);

  // Persist frequentItems & wellbeing when they change
  useEffect(() => {
    if (Object.keys(frequentItems).length > 0) {
      window.storage.set('frequentItems', JSON.stringify(frequentItems)).catch(() => {});
    }
  }, [frequentItems]);
  useEffect(() => {
    if (Object.keys(wellbeing).length > 0) {
      window.storage.set('wellbeing', JSON.stringify(wellbeing)).catch(() => {});
    }
  }, [wellbeing]);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    window.storage.set('favoriteIngredients', JSON.stringify(favoriteIngredients)).catch(() => {});
  }, [favoriteIngredients]);

  // Aviso estándar cuando una función necesita la meta y el coach aún no la
  // ha cargado (cliente nuevo): el cliente puede seguir registrando comida.
  const avisarMetaPendiente = () => {
    setMessages(m => [...m, {
      role: 'assistant',
      content: 'Para eso necesito tu meta nutricional, y tu coach aún la está preparando — te avisaré aquí en cuanto la cargue. Mientras tanto puedo registrar todo lo que comas y llevar tus totales.',
      ts: Date.now(),
    }]);
  };

  // Generate a daily meal plan from favorite ingredients
  // Compute deficit % for each macro. Returns the macro with the biggest gap, or null.
  const computeBiggestGap = () => {
    if (!goals) return null;
    const gaps = [
      { key: 'kcal', label: 'calorías', remaining: Math.max(0, goals.kcal - totals.kcal), goal: goals.kcal, unit: ' kcal' },
      { key: 'p', label: 'proteína', remaining: Math.max(0, goals.p - totals.p), goal: goals.p, unit: 'g' },
      { key: 'c', label: 'carbohidratos', remaining: Math.max(0, goals.c - totals.c), goal: goals.c, unit: 'g' },
      { key: 'g', label: 'grasas', remaining: Math.max(0, goals.g - totals.g), goal: goals.g, unit: 'g' },
    ];
    const withPct = gaps.map(g => ({ ...g, pct: g.goal > 0 ? g.remaining / g.goal : 0 }));
    return withPct.sort((a, b) => b.pct - a.pct)[0];
  };

  // If a macro has >=25% deficit, ask the LLM for equivalences using ONLY favoriteIngredients.
  // Append a gap_suggestions message. Safe: no prescription, no "you should X", no value judgment.
  const maybeAppendGapSuggestion = async () => {
    const biggest = computeBiggestGap();
    if (!biggest || biggest.pct < 0.25) return;
    const allGaps = [
      { key: 'kcal', label: 'calorías', remaining: Math.max(0, goals.kcal - totals.kcal), goal: goals.kcal, unit: ' kcal' },
      { key: 'p', label: 'proteína', remaining: Math.max(0, goals.p - totals.p), goal: goals.p, unit: 'g' },
      { key: 'c', label: 'carbohidratos', remaining: Math.max(0, goals.c - totals.c), goal: goals.c, unit: 'g' },
      { key: 'g', label: 'grasas', remaining: Math.max(0, goals.g - totals.g), goal: goals.g, unit: 'g' },
    ];

    // Not enough ingredients in client's list — nudge to add more
    if (favoriteIngredients.length < 3) {
      setMessages(m => [...m, {
        role: 'assistant',
        isGapSuggestions: true,
        data: {
          gaps: allGaps,
          missingFavorites: true,
        },
        ts: Date.now()
      }]);
      return;
    }

    const sys = `Eres una calculadora de equivalencias nutricionales. Devuelves SOLO JSON válido, sin markdown.

IDIOMA: español neutro latinoamericano. PROHIBIDO voseo argentino.

LISTA DE INGREDIENTES DEL CLIENTE: ${favoriteIngredients.join(', ')}
DÉFICITS PENDIENTES:
- kcal: faltan ${allGaps[0].remaining} de meta ${allGaps[0].goal}
- proteína: faltan ${allGaps[1].remaining}g de meta ${allGaps[1].goal}g
- carbohidratos: faltan ${allGaps[2].remaining}g de meta ${allGaps[2].goal}g
- grasas: faltan ${allGaps[3].remaining}g de meta ${allGaps[3].goal}g

REGLAS DURAS:
- Genera 2 a 3 "opciones" de combinaciones de alimentos que aproximadamente cubran lo que falta.
- USA EXCLUSIVAMENTE los ingredientes de la lista del cliente. Está PROHIBIDO inventar o sugerir alimentos que no estén en la lista.
- Cada opción es una COMBINACIÓN de 2 a 4 alimentos con cantidades en gramos o unidades.
- Los valores nutricionales son REALES (USDA, alimentos cocidos por defecto).
- PROHIBIDO dar juicios de valor sobre alimentos ("X es mejor", "X es bueno para Y", "evita Z"). PROHIBIDO recomendar prescriptivamente ("deberías", "te recomiendo"). Solo enumeras equivalencias matemáticas.
- Si los déficits son muy pequeños y no merece la pena sugerir, devuelve "options": [].

SCHEMA:
{
  "options": [
    {
      "items": [{"name": "...", "amount": "Xg" o "X unidades", "kcal": N, "p": N, "c": N, "g": N}],
      "subtotal": {"kcal": N, "p": N, "c": N, "g": N}
    }
  ]
}`;
    try {
      const result = await callClaude('Genera 2 a 3 opciones para cubrir lo que falta usando solo los ingredientes del cliente.', sys);
      const clean = result.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : clean);
      if (!parsed.options || parsed.options.length === 0) return;
      setMessages(m => [...m, {
        role: 'assistant',
        isGapSuggestions: true,
        data: {
          gaps: allGaps,
          options: parsed.options,
        },
        ts: Date.now()
      }]);
    } catch (e) {
      // silent fail — gap suggestion is a nice-to-have
    }
  };

  // Suggest 2-3 meal combos based on the client's favorite ingredients
  const handleMealSuggestion = async (mealType) => {
    if (!goals) { avisarMetaPendiente(); return; }
    const remaining = {
      kcal: Math.max(0, goals.kcal - totals.kcal),
      p: Math.max(0, goals.p - totals.p),
      c: Math.max(0, goals.c - totals.c),
      g: Math.max(0, goals.g - totals.g),
    };

    if (favoriteIngredients.length < 3) {
      setMessages(m => [...m, {
        role: 'assistant',
        isMealSuggestion: true,
        data: { missingFavorites: true, mealType, remaining },
        ts: Date.now()
      }]);
      return;
    }

    const sys = `Eres una calculadora de combinaciones de alimentos. Devuelves SOLO JSON válido, sin markdown.

IDIOMA: español neutro latinoamericano. PROHIBIDO voseo argentino.

LISTA DE INGREDIENTES DEL CLIENTE: ${favoriteIngredients.join(', ')}
COMIDA SOLICITADA: ${mealType || 'cualquiera (elige tú)'}
MACROS RESTANTES DEL DÍA: ${remaining.kcal} kcal · ${remaining.p}g P · ${remaining.c}g C · ${remaining.g}g G

REGLAS DURAS:
- Genera 2 o 3 "opciones" de combinaciones para esa comida.
- USA EXCLUSIVAMENTE los ingredientes de la lista del cliente. PROHIBIDO inventar o sugerir alimentos fuera de la lista.
- Cada opción es una COMBINACIÓN de 2 a 4 alimentos con cantidades en gramos o unidades.
- Valores nutricionales REALES (USDA, alimentos cocidos).
- Los subtotales de cada opción deberían encajar en lo que falta del día (sin pasarse mucho), pero no obsesionarte: el cliente decide.
- PROHIBIDO juicios de valor sobre alimentos ("X es mejor", "X es bueno para Y", "evita Z").
- PROHIBIDO prescribir ("deberías", "te recomiendo"). Solo enumeras opciones matemáticas.
- Si la lista no es suficiente para esa comida, devuelve "options": [].

SCHEMA:
{
  "options": [
    {
      "items": [{"name": "...", "amount": "Xg" o "X unidades", "kcal": N, "p": N, "c": N, "g": N}],
      "subtotal": {"kcal": N, "p": N, "c": N, "g": N}
    }
  ]
}`;
    try {
      const result = await callClaude(`Genera 2 o 3 opciones para ${mealType || 'una comida'} usando solo los ingredientes del cliente.`, sys);
      const clean = result.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : clean);
      setMessages(m => [...m, {
        role: 'assistant',
        isMealSuggestion: true,
        data: { options: parsed.options || [], mealType, remaining },
        ts: Date.now()
      }]);
    } catch (e) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: 'No pude armar opciones ahora, intenta de nuevo en un momento.',
        ts: Date.now()
      }]);
    }
  };

  const generatePlan = async () => {
    if (!goals) { setShowPlannerModal(false); avisarMetaPendiente(); return; }
    // Allow planning if has either ingredients or saved meal menus
    if (favoriteIngredients.length === 0 && favorites.length === 0) {
      setShowIngredientsModal(true);
      return;
    }
    setPlannerLoading(true);
    setPlannerProposal(null);

    // Build favorite menus block (combos the client already validated as "this works for me")
    const favoriteMenusBlock = favorites.length > 0
      ? `\nMENÚS FAVORITOS DEL CLIENTE (combos completos que ya validó, puedes reutilizarlos enteros para una comida):\n${favorites.slice(0, 20).map((f, i) => `[Menú ${i + 1}] "${f.name}" — ${f.kcal} kcal · P${f.p}g C${f.c}g G${f.g}g — items: ${f.items.map(it => `${it.name}${it.amount ? ' ' + it.amount : ''}`).join(', ')}`).join('\n')}\n`
      : '';

    const sys = `Eres un organizador de macros. Devuelves SOLO JSON válido, sin markdown.

CLIENTE: ${name || 'Cliente'}
META DIARIA: ${goals.kcal} kcal · P ${goals.p}g · C ${goals.c}g · G ${goals.g}g
INGREDIENTES QUE LE GUSTAN Y COMPRA: ${favoriteIngredients.join(', ') || '(ninguno)'}
${favoriteMenusBlock}
REGLAS DURAS:
- Puedes elegir LIBREMENTE entre: (a) combinar ingredientes sueltos para armar una comida, o (b) reutilizar un MENÚ FAVORITO completo como una comida del día. Mezcla ambos según convenga para cuadrar macros.
- Si reutilizas un menú favorito, copia sus items tal cual (mismo nombre, amount, kcal, macros) y opcionalmente indícalo en el campo "from_favorite" del meal con el nombre del menú.
- NO es recetario. NO indiques modo de preparación, recetas, salsas ni guarniciones.
- Devuelve SOLO los ingredientes de la lista o los items de los menús favoritos (cocidos por defecto) con kcal y macros REALES (USDA).
- NO inventes alimentos fuera de la lista ni de los menús favoritos.
- OBLIGATORIO: la suma total del día debe quedar dentro del ±5% de CADA meta (kcal, P, C, G). Ajusta gramos de cada item hasta cuadrar. Si una cantidad típica no encaja, modifica los gramos hacia arriba o abajo libremente — no estás limitado a porciones estándar.
- Reparte proteína entre comidas. Carbos más altos en desayuno/almuerzo. Grasas moderadas en todo.
- "warning" SOLO debe llenarse en estos dos casos:
  1) La lista tiene menos de 4 ingredientes: warning="La lista es muy corta para armar un día completo. Agrega más alimentos para una distribución mejor."
  2) Es matemáticamente imposible cuadrar la meta con esos ingredientes (ej: solo dan grasas y la meta es alta en carbos): warning describe brevemente qué macro no se puede alcanzar.
- En cualquier otro caso, "warning" debe ser null. NUNCA llenes warning con frases tipo "considera aumentar X o reducir Y" — esos ajustes los haces TÚ directamente en los gramos antes de devolver el JSON.
- Antes de responder, VERIFICA que tu total esté en ±5% de cada meta. Si no lo está, vuelve a ajustar los gramos.
- Frase de introducción FIJA: "Bueno, entendiendo que estos son los ingredientes que te gustan y compras, la distribución podría ser esta."

SCHEMA:
{
  "intro": "Bueno, entendiendo que estos son los ingredientes que te gustan y compras, la distribución podría ser esta.",
  "meals": [
    {
      "meal": "desayuno | almuerzo | snack | cena",
      "from_favorite": "nombre del menú favorito si reutilizaste uno entero | null",
      "items": [{"name": "...", "amount": "Xg" o "X unidades", "kcal": N, "p": N, "c": N, "g": N}],
      "subtotal": {"kcal": N, "p": N, "c": N, "g": N}
    }
  ],
  "total": {"kcal": N, "p": N, "c": N, "g": N},
  "warning": "string | null"
}`;
    try {
      const result = await callClaude('Arma la distribución del día con los ingredientes que te di.', sys);
      const clean = result.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : clean);
      setPlannerProposal(parsed);
    } catch (e) {
      setPlannerProposal({ error: 'No pude armar la propuesta ahora. Prueba de nuevo en un momento.' });
    }
    setPlannerLoading(false);
  };

  // Register all proposed meals as today's entries
  const registerPlan = () => {
    if (!plannerProposal?.meals) return;
    haptic(15);
    const newEntries = plannerProposal.meals.map((m, idx) => ({
      id: Date.now() + idx,
      meal: m.meal,
      items: m.items.map(it => ({ ...it, needs_quantity: false })),
      kcal: m.subtotal?.kcal || m.items.reduce((s, i) => s + (i.kcal || 0), 0),
      p: m.subtotal?.p || m.items.reduce((s, i) => s + (i.p || 0), 0),
      c: m.subtotal?.c || m.items.reduce((s, i) => s + (i.c || 0), 0),
      g: m.subtotal?.g || m.items.reduce((s, i) => s + (i.g || 0), 0),
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      rawInput: 'plan del día',
      hasMissingQuantity: false,
    }));
    setEntries(e => [...e, ...newEntries]);
    setPlannerProposal(null);
    setShowPlannerModal(false);
    setMessages(m => [...m, { role: 'assistant', content: 'Plan del día registrado. Suerte con esa distribución.', ts: Date.now() }]);
  };

  // Save proposed meals as a favorite menu
  const savePlanAsFavorite = () => {
    if (!plannerProposal?.meals) return;
    haptic(12);
    const newFavorites = plannerProposal.meals.map((m, idx) => ({
      id: Date.now() + idx,
      name: `${m.meal}: ${m.items.map(i => i.name).join(', ').slice(0, 50)}`,
      items: m.items.map(it => ({ ...it, needs_quantity: false })),
      kcal: m.subtotal?.kcal || 0,
      p: m.subtotal?.p || 0,
      c: m.subtotal?.c || 0,
      g: m.subtotal?.g || 0,
      meal: m.meal,
    }));
    setFavorites(f => [...f, ...newFavorites]);
    setPlannerProposal(null);
    setShowPlannerModal(false);
    setMessages(m => [...m, { role: 'assistant', content: 'Guardé esa propuesta en tus menús favoritos. Los puedes usar cuando quieras.', ts: Date.now() }]);
  };

  const trackFrequency = (items) => {
    const newlyHotKeys = []; // items that just crossed the favorite-suggestion threshold
    setFrequentItems(prev => {
      const next = { ...prev };
      const now = Date.now();
      for (const it of items) {
        const key = (it.name || '').trim().toLowerCase();
        if (!key) continue;
        const existing = next[key] || { count: 0, kcal: it.kcal, p: it.p, c: it.c, g: it.g, amount: it.amount, displayName: it.name, suggested: false };
        const newCount = existing.count + 1;
        next[key] = {
          ...existing,
          count: newCount,
          lastSeen: now,
          kcal: it.kcal || existing.kcal,
          p: it.p || existing.p,
          c: it.c || existing.c,
          g: it.g || existing.g,
          amount: it.amount || existing.amount,
          displayName: it.name || existing.displayName,
        };
        // Crossed threshold: 3+ times AND not yet suggested AND not already in favoriteIngredients
        if (newCount >= 3 && !existing.suggested && !favoriteIngredients.includes(key)) {
          newlyHotKeys.push({ key, displayName: it.name || key });
          next[key].suggested = true;
        }
      }
      return next;
    });
    // After state updates, push a suggestion bubble for each newly-hot item (max 1 at a time to avoid spam)
    if (newlyHotKeys.length > 0) {
      const { key, displayName } = newlyHotKeys[0];
      setTimeout(() => {
        setMessages(m => [...m, {
          role: 'assistant',
          isAutoFavoriteSuggestion: true,
          suggestedKey: key,
          suggestedName: displayName,
          ts: Date.now()
        }]);
      }, 600);
    }
  };

  const acceptAutoFavorite = useCallback((key) => {
    haptic(10);
    setFavoriteIngredients(prev => prev.includes(key) ? prev : [...prev, key]);
  }, []);
  const dismissAutoFavorite = useCallback((key) => {
    // Already marked as suggested in frequentItems; nothing else needed
  }, []);

  // Repeat last meal from yesterday matching predicted meal type
  const repeatYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = getLocalDate(yesterday);
    const yEntries = historyDetail[yKey];
    if (!yEntries || yEntries.length === 0) {
      setMessages(m => [...m, { role: 'assistant', content: 'No tengo registro de ayer. Cuando me cuentes qué comiste hoy, lo guardo.', ts: Date.now() }]);
      return;
    }
    const targetMeal = predictMealType();
    const match = yEntries.find(e => e.meal === targetMeal) || yEntries[yEntries.length - 1];
    haptic(12);
    const newEntry = {
      ...match,
      id: Date.now(),
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      rawInput: 'repetido de ayer',
    };
    setEntries(e => [...e, newEntry]);
    setMessages(m => [...m, {
      role: 'assistant', content: 'logged', isLogged: true,
      entryId: newEntry.id, quantityWarning: null, ts: Date.now()
    }]);
  };

  // Quick-add a single frequent item (1 unit)
  const quickAddItem = (item) => {
    haptic(10);
    const newEntry = {
      id: Date.now(),
      meal: predictMealType(),
      items: [{ name: item.displayName || item.name, amount: item.amount || '', kcal: item.kcal, p: item.p, c: item.c, g: item.g, needs_quantity: false }],
      kcal: item.kcal || 0,
      p: item.p || 0,
      c: item.c || 0,
      g: item.g || 0,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      rawInput: `quick: ${item.displayName || item.name}`,
      hasMissingQuantity: false,
    };
    setEntries(e => [...e, newEntry]);
    setMessages(m => [...m, {
      role: 'assistant', content: 'logged', isLogged: true,
      entryId: newEntry.id, quantityWarning: null, ts: Date.now()
    }]);
    trackFrequency([{ name: item.displayName || item.name, kcal: item.kcal, p: item.p, c: item.c, g: item.g, amount: item.amount }]);
  };

  // Save wellbeing for today
  const saveWellbeing = (energy, hunger, mood) => {
    setWellbeing(prev => ({ ...prev, [today]: { energy, hunger, mood, ts: Date.now() } }));
    setShowWellbeingModal(false);
    haptic(15);
    const firstName = name ? name.split(' ')[0] : '';
    setMessages(m => [...m, {
      role: 'assistant',
      content: `${firstName ? firstName + ', ' : ''}guardé tu check-in. Esto le sirve mucho a Mauro para afinar la estrategia.`,
      ts: Date.now()
    }]);
  };

  const parseFoodEntry = async (text, opts = {}) => {
    const { voiceInput = false, lastEntry = null, hasExplicitAppendIntent = false } = opts;
    let lastEntrySnippet;
    let minutesAgo = 0;
    if (lastEntry) {
      // Calculate minutes since last entry (rough — using time field "HH:MM")
      const [lh, lm] = (lastEntry.time || '00:00').split(':').map(Number);
      const lastDate = new Date();
      lastDate.setHours(lh || 0, lm || 0, 0, 0);
      minutesAgo = Math.max(0, Math.round((Date.now() - lastDate.getTime()) / 60000));
      const hoursAgo = (minutesAgo / 60).toFixed(1);
      lastEntrySnippet = `\nÚLTIMA COMIDA REGISTRADA HOY (id=${lastEntry.id}, meal=${lastEntry.meal}, time=${lastEntry.time}, hace ${hoursAgo} horas / ${minutesAgo} minutos):\n${JSON.stringify(lastEntry.items.map(i => ({ name: i.name, amount: i.amount, kcal: i.kcal, p: i.p, c: i.c, g: i.g })))}\n`;
    } else {
      lastEntrySnippet = '\nÚLTIMA COMIDA REGISTRADA HOY: ninguna aún.\n';
    }
    const appendHint = lastEntry
      ? `\nSEÑAL DETERMINÍSTICA DEL FRONTEND sobre intención de adición: ${hasExplicitAppendIntent ? 'TRUE — el cliente usó palabras explícitas de "agregar a la anterior" ("me faltó", "olvidé", "agrégale", "súmale", etc.). Considera APPEND.' : 'FALSE — el cliente NO usó palabras explícitas de adición. Considera log_meal NUEVO por default a menos que el contexto sea inequívoco.'}\n`
      : '';
    const voiceHint = voiceInput
      ? '\nIMPORTANTE: este texto vino por DICTADO DE VOZ. Puede haber errores de transcripción y faltar puntuación. Corrige palabras mal transcritas por contexto (ej: si dictado dice "quesito" pero hablaban de un postre, probablemente es "ponquecito/ponqué"; "faena" probablemente es "fainá"). Separa los items por contexto (ej: "3 arepas 2 huevos un café con leche" → 3 items distintos).\n'
      : '';
    const historyText = buildHistoryText();
    const historyBlock = historyText
      ? `\n═══ HISTORIAL RECIENTE DE LA CONVERSACIÓN (úsalo para mantener coherencia; si el cliente se refiere a algo dicho antes, recuérdalo) ═══\n${historyText}\n`
      : '';
    // Detalle de las comidas de hoy (necesario para retro_advice y para mejor contexto en general).
    // Sin esto el LLM solo ve los totales y no puede dar consejos basados en qué item específico
    // está empujando los macros fuera de meta.
    const todayMealsDetail = entries.length > 0
      ? `\nDETALLE COMIDAS DE HOY (para consultas retrospectivas):\n${entries.map((e, i) => `  [#${i+1} ${e.meal || 'comida'} ${e.time || ''}] items: ${(e.items || []).map(it => `${it.name}${it.amount ? ' ' + it.amount : ''} (${it.kcal||0}kcal P${it.p||0} C${it.c||0} G${it.g||0})`).join(', ')}`).join('\n')}\n`
      : '';
    const macroDeltas = goals
      ? `\nBRECHAS vs META: kcal ${totals.kcal - (goals.kcal||0)} (${totals.kcal > (goals.kcal||0) ? 'excedido' : 'faltante'}), P ${totals.p - (goals.p||0)}g, C ${totals.c - (goals.c||0)}g, G ${totals.g - (goals.g||0)}g.\n`
      : '';
    // Bloque de favoritos del cliente — menús individuales y días completos.
    // Se inyecta SIEMPRE en el chat general para que el modelo pueda razonar
    // sobre ellos cuando el cliente pida ajustes ("ajusta mis favoritos para
    // llegar a la meta", "qué cambio en mis menús"...). Sin esto, Claude no
    // conoce las cantidades y termina preguntándole al cliente.
    const favoritesBlock = favorites.length > 0
      ? `\nMENÚS Y DÍAS FAVORITOS DEL CLIENTE (cantidades y macros ya guardados — NUNCA preguntes por ellos, ya los tienes acá):
${favorites.slice(0, 25).map((f, i) => {
  if (f.type === 'day' && Array.isArray(f.days) && f.days.length > 0) {
    return `[Día Fav #${f.id}] "${f.name}" — Total: ${Math.round(f.kcal||0)} kcal · P${Math.round(f.p||0)}g C${Math.round(f.c||0)}g G${Math.round(f.g||0)}g
${f.days.map(d => `  · ${d.meal || 'comida'}: ${(d.items||[]).map(it => `${it.name}${it.amount ? ' ' + it.amount : ''}`).join(', ')} (${Math.round(d.kcal||0)} kcal)`).join('\n')}`;
  }
  return `[Menú Fav #${f.id}] "${f.name}" — ${Math.round(f.kcal||0)} kcal · P${Math.round(f.p||0)}g C${Math.round(f.c||0)}g G${Math.round(f.g||0)}g
  items: ${(f.items || []).map(it => `${it.name}${it.amount ? ' ' + it.amount : ''} (${Math.round(it.kcal||0)} kcal)`).join(', ')}`;
}).join('\n')}
`
      : '';
    // Tabla de los últimos 14 días con su fecha exacta ya resuelta. El LLM es
    // poco confiable haciendo aritmética de calendario ("el lunes pasado" =
    // ¿qué YYYY-MM-DD?): cuando la calculaba mal, la comida quedaba registrada
    // en el día equivocado. Con la tabla solo tiene que COPIAR la fecha.
    const dateTable = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const rel = i === 0 ? 'HOY' : i === 1 ? 'ayer' : i === 2 ? 'antier/anteayer' : `hace ${i} días`;
      return `  · ${rel} — ${d.toLocaleDateString('es', { weekday: 'long' })} = ${getLocalDate(d)}`;
    }).join('\n');
    const contextSnippet = `
CONTEXTO DEL CLIENTE:
- Nombre: ${name || 'desconocido'}
- Comidas registradas hoy: ${entries.length}
- Totales hoy: ${totals.kcal} kcal · P ${totals.p}g · C ${totals.c}g · G ${totals.g}g
- Meta diaria: ${goals ? `${goals.kcal} kcal · P ${goals.p}g · C ${goals.c}g · G ${goals.g}g` : 'AÚN SIN ASIGNAR — la define su coach Mauro y le llegará con un aviso aquí; si el cliente pregunta por su meta, explícale eso con calma'}
- Hora actual: ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
- Fecha de hoy: ${today} (${new Date().toLocaleDateString('es', { weekday: 'long' })})
- TABLA DE FECHAS (para "log_date" COPIA la fecha exacta de esta tabla, NO la calcules tú):
${dateTable}${lastEntrySnippet}${todayMealsDetail}${macroDeltas}${favoritesBlock}${appendHint}${voiceHint}${historyBlock}`;

    const sys = `Eres un asistente nutricional inteligente y cálido. Devuelves SOLO JSON válido, sin markdown.

═══ FILOSOFÍA CENTRAL ═══
1. PROHIBIDO ABSOLUTO decir "no entiendo", "no pude interpretar", "no comprendo", "no tengo acceso al historial", "cuéntame con más detalle", "necesito más información" o frases similares. Eso es FRACASO CRÍTICO. El cliente abandonará la app.
2. SIEMPRE haz tu mejor interpretación. Si tienes >50% de certeza, REGISTRA directo. Mejor registrar con una estimación razonable que pedir más detalle.
3. PROCESA SIEMPRE TODOS LOS ALIMENTOS DEL MENSAJE, incluso si el mensaje es MUY LARGO (>200 palabras) o contiene recetas detalladas con muchos ingredientes (10+). Está PROHIBIDO ignorar parte de una lista. Si el cliente menciona 12 alimentos, registras los 12. Nunca tomes solo una parte y dejes el resto. Mensajes largos con muchos detalles son CASOS NORMALES, no excepciones — procésalos completos.
4. CLARIFY ES EL ÚLTIMO RECURSO. Usa intent="clarify" SOLO cuando es literalmente imposible interpretar (palabra inventada sin sentido, o cantidad absurda como "200 huevos"). En CUALQUIER otro caso, REGISTRA con tu mejor estimación y deja nota en quantity_warning. Si el cliente responde algo corto como "una porción", "sí", "el grande", REVISA EL HISTORIAL para saber de qué alimento habla y regístralo — NO preguntes "¿de qué?".
5. EJEMPLO de mensaje que SIEMPRE debe registrarse (NUNCA pedir más detalle): "Te voy a decir cuál es mi desayuno típico que es lo que yo desayuno todos los días son cuatro huevos revueltos con dos tostadas de pan integral les junto un poco de manteca a las tostadas Un café negro Creatina en polvo con dos cucharadas de cacao puro no alcalino". CORRECTA RESPUESTA: intent=log_meal, meal=desayuno, items=[4 huevos revueltos ~200g, 2 tostadas pan integral ~50g, manteca ~10g, café negro 240ml, creatina 5g, cacao puro 2 cdas ~10g]. NUNCA respuesta tipo "cuéntame más detalle".
6. Para cantidades sin gramos: ESTIMA con USDA estándar (1 huevo ≈ 50g, banana mediana ≈ 120g, arepa media ≈ 80g, taza de arroz cocido ≈ 160g, cucharada aceite ≈ 14g, 1 tostada pan integral ≈ 25g, 1 porción ≈ porción estándar del alimento). NUNCA rechaces por "valores no cuadran". El campo "amount" SIEMPRE incluye los gramos: si el cliente dio unidades, escribe la unidad Y los gramos estimados ("2 huevos (100g)", "1 arepa mediana (75g)", "1 taza (160g)"). Usa nombres SIMPLES y ESTÁNDAR en "name" (ej: "arroz blanco cocido", "pechuga de pollo", "huevo"), con los detalles en "amount" — así el mismo alimento se llama igual siempre.
7. COHERENCIA: si el cliente se refiere a algo que dijo antes ("esos ponquecitos", "lo que te dije", "la receta de antes"), búscalo en el HISTORIAL RECIENTE y sé consistente. NUNCA digas que no recuerdas.
8. IDIOMA: español neutro latinoamericano estándar. Trato de "tú" siempre, nunca "vos" ni "usted".
   PROHIBIDO ABSOLUTO:
   - Voseo argentino: "querés/tenés/decís/podés/registrá/armá/guardá/olvidá/sumá/pedí/dale". USA: quieres, tienes, dices, puedes, registra, arma, guarda, olvida, suma, pide.
   - Colombianismos: "regálame, parce, parcero, chévere, bacano, qué hubo, qué más, porfa, listo pues, ¡rico!, sabroso". USA: por favor, amigo (evítalo), bien, hola, listo (a secas), sabroso (evita), gracias.
   - Mexicanismos coloquiales: "órale, qué onda, chido, padre (=cool), híjole, ándale". USA equivalentes neutros.
   - Españolismos: "vale, tío/tía, mola, currar, guay, vosotros/vosotras". USA: bien, listo, está bien, trabajar, ustedes.
   Mantén tono cálido y profesional pero geográficamente neutro.
9. PRIORIDAD DE INTENT (orden estricto al clasificar). Aplica la PRIMERA que matchee:
   a) Si menciona "resumen", "reenvíame", "mándame", "muéstrame", "qué llevo", "cómo voy", "cuánto llevo", "qué he comido", "qué comí hoy" → SIEMPRE intent=summary_day (aunque mencione alimentos previos para contexto, tu trabajo es mostrar el día actual, NO registrar ni preguntar).
   b) Si menciona "semana", "semanal", "resumen semanal", "cómo voy esta semana" → intent=summary_week.
   c) APPEND_TO_LAST tiene un umbral ESTRICTO. Para clasificar como append_to_last DEBEN cumplirse las DOS condiciones siguientes:
      i) La SEÑAL DETERMINÍSTICA DEL FRONTEND es TRUE (el cliente usó palabras explícitas tipo "me faltó", "olvidé", "agrégale a lo anterior", "súmale", "también comí en ese snack/desayuno"). Si esa señal es FALSE, NO uses append_to_last.
      ii) La última comida fue hace ≤60 minutos. Si pasó >60 minutos, NO uses append_to_last incluso si el cliente menciona la comida anterior.
      Si SÓLO una de las dos se cumple, prefiere log_meal NUEVA.
      Ejemplos:
      • Cliente registra snack a las 10:00. A las 10:15 dice "me faltó decir que también comí una banana en el snack" → señal TRUE + 15 min → append_to_last ✓
      • Cliente registra snack a las 10:00. A las 14:00 dice "comí una manzana" → señal FALSE + 240 min → log_meal NUEVO ✓
      • Cliente registra snack a las 10:00. A las 10:30 dice "comí una manzana" → señal FALSE + 30 min → log_meal NUEVO (no usó palabras explícitas) ✓
      • Cliente registra snack a las 10:00. A las 13:00 dice "agrégale una manzana al snack" → señal TRUE pero pasaron 180 min → log_meal NUEVO (la regla de tiempo manda) ✓
   d) Si describe alimentos por primera vez sin las palabras de (a)(b)(c) → intent=log_meal.
   e) Resto de casos según las reglas de intents abajo.

═══ CÓMO REGISTRAR COMIDAS (categorización) ═══
El cliente puede registrar de dos formas. Adáptate a su intención:
- Si ETIQUETA explícitamente la comida ("desayuno: X", "en la cena comí Y", "almuerzo Z") → respeta esa etiqueta.
- Si dicta UNA LISTA LARGA de TODO el día de una vez:
  · Si hay PISTAS de momento ("en la mañana / al desayuno / al almuerzo / en la tarde / en la noche / de cena / de snack") → DIVIDE en varias comidas, una por cada bloque. Usa el campo "meals" (array) con un objeto por comida.
  · Si NO hay pistas de momento → regístralo TODO como UNA sola comida con meal="comida" (sin discriminar). NO inventes divisiones falsas.
- Si NO etiqueta y es claramente una sola comida puntual → asígnale la comida según la hora actual (antes 11h=desayuno, 11-16h=almuerzo, 16-21h=cena, resto=snack). Si dudas, usa meal="comida".
- REGLA DE ORO: procesa SIEMPRE el mensaje completo. Si es una lista de 10 cosas, las 10 quedan registradas en esta misma respuesta. JAMÁS tomes una parte y dejes el resto para "después".

═══ GLOSARIO DE ALIMENTOS REGIONALES (reconócelos aunque vengan mal transcritos por voz) ═══
- "ponqué/ponquecito/poncecito/quesito (si hablaban de postre)" = bizcocho/cupcake casero. ~250-350 kcal según receta.
- "fainá/faina/faena" = masa de garbanzos horneada. ~110 kcal/100g.
- "arepa" = ~150 kcal (media, maíz blanco).
- "patacón/tostón" = plátano verde frito. ~150 kcal/unidad.
- "tequeño" = dedo de queso frito. ~110 kcal/unidad.
- "palta/aguacate" = ~160 kcal/100g.
- "choclo" = maíz. "poroto" = frijol. "frutilla" = fresa. "durazno" = melocotón.
- "mate/yerba" = infusión, ~0 kcal sin azúcar.
Si una palabra dictada no calza con ningún alimento conocido, busca el alimento fonéticamente más cercano según el contexto antes de preguntar.

═══ VALORES NUTRICIONALES ═══
Usa SOLO valores reales (USDA, etiquetas comerciales). 1g P=4 kcal, 1g C=4 kcal, 1g G=9 kcal.
Sanity: huevo grande ~75 kcal, 100g pollo cocido ~165 kcal, 100g arroz cocido ~130 kcal, 100g avena cruda ~380 kcal, 1 manzana ~95 kcal, 1 plátano ~105 kcal, 1 arepa media maíz blanco ~150 kcal.

NOTA: Junto al mensaje del cliente recibes un bloque CONTEXTO DEL CLIENTE y un HISTORIAL RECIENTE. Úsalos siempre.

═══ INTENTS (elige UNO) ═══
- "log_meal": registrar comida(s) nueva(s). Ej: "desayuno: 2 huevos y café", "almorcé pollo con arroz". Si el mensaje cubre VARIAS comidas del día, usa el campo "meals" (array) con un objeto por comida. Si es UNA sola comida, usa "items" + "meal".
  PROHIBIDO log_meal cuando el cliente PREGUNTA (futuro/condicional) cuánto DEBERÍA comer: "¿cuántas cucharadas de yogur griego tengo que comer para llegar a la meta de proteína?", "¿cuánto pollo necesito para completar el día?", "¿qué me falta comer para cerrar mis macros?" → eso es command="proportion" (la app calcula la cantidad exacta con lo que le falta hoy). log_meal es SOLO comida YA comida.
  FECHA DEL REGISTRO ("log_date"): por defecto null = HOY. Si el cliente dice que comió en un día PASADO ("ayer", "antier", "hace N días", "el lunes", "el sábado pasado", "el 15", "12 de junio"), busca ese día en la TABLA DE FECHAS del contexto y COPIA la fecha exacta (YYYY-MM-DD) en "log_date" — PROHIBIDO calcular la fecha por tu cuenta, usa la tabla. Un día de la semana = la ocurrencia MÁS RECIENTE ya pasada de ese día. NUNCA uses una fecha futura. Si no hay ninguna referencia temporal a un día pasado, log_date=null. OJO: log_date es SOLO para comida NUEVA (aún no registrada). Si la comida YA quedó registrada hoy y el cliente solo pide cambiarle el día ("eso que te pasé era de ayer") → NO uses log_meal: usa command="move_entry" (ver comandos), o quedará duplicada.
  VARIOS DÍAS EN UN MISMO MENSAJE: si el cliente dicta comidas de MÁS DE UN día ("el viernes comí X y el sábado Y", "te voy a contar lo de ayer y lo de hoy"), usa el campo "meals" y pon en CADA objeto de "meals" su propio "log_date" (la fecha de ESE día según la tabla; null si esa comida es de hoy). PROHIBIDO amontonar comidas de días distintos bajo una misma fecha — cada comida va exactamente al día que el cliente dijo. Solo si TODO el mensaje es de UN único día pasado puedes usar el "log_date" raíz para todo el bloque.
  Ejemplos: "ayer cené pollo con arroz" → log_meal, meal=cena, log_date=(fecha de "ayer" en la tabla). "el lunes desayuné avena y el martes almorcé pasta" → log_meal, meals=[{meal:"desayuno", log_date:(lunes en la tabla), items:[avena]}, {meal:"almuerzo", log_date:(martes en la tabla), items:[pasta]}]. "el domingo desayuné huevos y almorcé asado" → log_meal, meals=[{meal:"desayuno", log_date:(domingo), items:[huevos]}, {meal:"almuerzo", log_date:(domingo), items:[asado]}].
- "append_to_last": SUMAR alimentos a la ÚLTIMA comida registrada hoy (no crear meal nuevo). DETECTAR estos signos: "me faltó", "olvidé decirte", "también comí", "agregale", "sumá", "ah me acordé", "no te dije que también", "ese tercero suma a lo que ya registraste". SI hay última comida, los items van EN ELLA.
  OJO — CORRECCIÓN ≠ append: si el cliente CORRIGE algo ya registrado hoy → command="edit_entry". PROHIBIDO append_to_last o log_meal en correcciones: duplicaría la comida. Una corrección puede ser CUALQUIER combinación de: cambiar cantidad ("eran 300g, no 150"), cambiar número de unidades ("eran 2 huevos, no 3"), SUSTITUIR un alimento ("no era pollo, era atún"), QUITAR un item ("la cena no llevaba pan") o AGREGAR items que faltaban dentro de la corrección ("no eran 3 huevos: eran 2 huevos Y una banana mediana"). Cómo llenarlo: (1) "edit_entry_index" = el número [#N] de esa comida en DETALLE COMIDAS DE HOY (si no dice cuál, la más reciente que coincida; llena también "meal" si lo menciona); (2) "items" = CÓMO QUEDÓ ESA COMIDA AL FINAL, completa: los items que el cliente NO mencionó se copian TAL CUAL del DETALLE (nombre, cantidad y macros), los corregidos van con sus macros recalculados, los quitados NO van, y los agregados van como items nuevos con macros estimados. La app reemplaza la comida entera con esta lista final. Ej: DETALLE dice [#2 desayuno] "3 huevos (240kcal P18) + café (5kcal)"; cliente: "me equivoqué, eran 2 huevos y una banana mediana" → items=[2 huevos (160kcal P12...), banana mediana (~105kcal...), café (5kcal, copiado igual)]. Si quiere BORRAR la comida completa → command="delete_entry". Si la corrección es de un día PASADO (no está en el DETALLE de hoy) → clarify explicando que las correcciones por chat son del día actual y su coach puede ajustar días anteriores.
- "save_favorite_only": guardar una comida como RECETA/FAVORITO SIN que cuente en el día. DETECTAR: "no lo registres", "eso último no lo registres", "es solo para guardar la receta", "solo guárdalo en favoritos/como receta", "no lo cuentes", "no lo sumes", "quítalo del día pero guárdalo". Dos casos: (1) el mensaje DESCRIBE alimentos ("guárdame esta receta sin registrarla: 6 empanadas...") → llena "items" (+"meal") igual que en log_meal pero con ESTE intent; (2) se refiere a algo YA registrado ("eso último no lo registres, era solo la receta") → deja "items" vacío y el frontend lo aplica a la última comida registrada. PROHIBIDO clasificar como log_meal cuando el cliente pide explícitamente NO registrar.
- "nutrition_query": pregunta informativa SIN registrar. Ej: "¿cuántas kcal tiene una manzana?", "¿es alta en proteína el atún?".
- "meal_suggestion": pregunta abierta sobre QUÉ COMER en una comida específica. DETECTAR: "qué puedo comer", "qué como", "ideas de cena", "qué me sugieres", "qué desayuno", "qué hago de almuerzo", "no sé qué cenar". Indica también el "meal" deseado (desayuno/almuerzo/snack/cena) si lo menciona. EL FRONTEND MANEJA la respuesta usando los ingredientes favoritos del cliente, así que tú solo clasifica.
- "summary_day": pide ver progreso/totales del día. Ej: "cómo voy", "cuánto llevo hoy", "resumen", "qué me falta".
- "summary_week": pide resumen semanal. Ej: "resumen semana", "cómo voy esta semana".
- "retro_advice": CONSULTA RETROSPECTIVA sobre cómo ajustar lo YA registrado hoy para acercarse a la meta. NO registres nada nuevo. DETECTAR: "me pasé qué hago", "qué proporciones debí usar", "cómo evitar pasarme", "qué pude ajustar", "qué cambiar de esa cena/almuerzo/desayuno", "cómo corregir mi día", "esta comida me hizo pasar qué ajusto", "qué proporciones me recomiendas", "qué ajustes hago para llegar a la meta", "ayúdame a corregir", "cómo equilibro lo de hoy". El cliente ya registró su día, ve que se pasó/quedó corto, y quiere APRENDER qué pudo haber comido diferente.
  IMPORTANTE: usa DETALLE COMIDAS DE HOY del contexto para identificar qué item específico está empujando los macros fuera de meta. Si menciona una comida específica ("de la cena"), enfócate en esa; si dice "todo el día", da sugerencias para varias comidas del día.
  Devuelve "retro_advice_response" con la estructura del schema. NUNCA agregues items al registro real del cliente.
- "adjust_favorites_to_goal": el cliente pide AJUSTAR sus MENÚS O DÍAS FAVORITOS guardados para que las cantidades cuadren con su meta diaria. DETECTAR: "ajusta mis menús favoritos", "ajusta esos 3 menús para llegar a la meta", "qué cambio en mis favoritos para cuadrar macros", "haz que mis menús sumen mi meta", "esos menús son lo que como todos los días, ajustalos", "organiza mis favoritos para llegar a mi meta", "qué proporciones nuevas pongo a mis menús guardados".
  CRÍTICO: las CANTIDADES Y MACROS DE CADA FAVORITO YA ESTÁN EN EL CONTEXTO (bloque MENÚS Y DÍAS FAVORITOS DEL CLIENTE). PROHIBIDO pedirle al cliente que te cuente las cantidades — ya las tienes. PROHIBIDO devolver una pregunta. Usa esos datos directamente.
  DEFINIR EL OBJETIVO (target) — paso obligatorio antes de ajustar:
    · Si el cliente referencia VARIOS menús o un DÍA favorito completo → el target = META DIARIA COMPLETA del contexto.
    · Si referencia UN SOLO menú de una comida (ej. solo "carne braseada", solo el desayuno) → es IMPOSIBLE que una comida sola sume la meta del día entero. El target = la PORCIÓN de la meta que corresponde a esa comida (desayuno≈25%, almuerzo≈35%, cena≈30%, snack≈10% de la meta diaria). DEBES explicárselo al cliente en "logic" (ver abajo).
  OBLIGATORIO — DEBE CUADRAR: ajusta las cantidades hasta que "estimated_totals_after" caiga DENTRO DE ±4% del target en kcal Y en proteína. Prioridad: primero clava proteína y kcal, luego acomoda carbos/grasas. Si tu primer cálculo se pasa o queda corto (como el caso real donde la propuesta quedó por ENCIMA de la meta), RECALCULA subiendo/bajando gramos antes de responder. NO entregues una propuesta que siga fuera de meta — ese es el motivo de ser de esta acción.
  REALISMO: sube/baja gramos de los alimentos que YA están en el menú, de forma proporcional — NO triplicar aceite, NO duplicar azúcar; preferir proteína magra para P, arroz/avena/tubérculos para C, y mantener las grasas controladas.
  ARGUMENTA SIEMPRE (campo "logic", 1-2 oraciones, concisas): di QUÉ target usaste y POR QUÉ, y la condición real para cumplir la meta. Ejemplos: "Ajusté tus 3 menús para que JUNTOS sumen tu meta diaria; cumplirla depende de que el día sea exactamente esto y nada más." / "Como esto es solo tu almuerzo, lo ajusté al ~35% de tu meta (no al día completo); el resto lo completas con desayuno y cena." / "Como aún no has registrado nada hoy, partí de tu meta completa; si ya comiste algo, dímelo y ajusto sobre lo que te queda."
  Devuelve "adjust_favorites_response" con la estructura del schema. NUNCA registres nada — es solo propuesta visual.
- "water": registra agua. "1 vaso"=250ml, "1 termo"=500ml, "1 botella"=500ml, "1 litro"=1000ml.
- "command": acción de UI. command ∈ {reset_day, change_goals, calendar, favorites, export, proportion, manage_favorites, plan_day, save_day_favorite, move_entry, delete_entry}. Mapping: "reiniciar día"→reset_day, "bórrame la cena / elimina eso último que registré / quita ese snack, estaba mal / eso no lo comí, bórralo"→delete_entry (+meal si dice cuál comida), "eran 300g no 150 / corrígele la cantidad / me equivoqué en el arroz de la cena"→edit_entry (ver regla en append_to_last), "cambiar meta"→change_goals, "calendario"→calendar, "favoritos/menús favoritos"→favorites, "exportar/descargar reporte"→export, "ayuda con proporciones/qué me sirve para cuadrar"→proportion (TAMBIÉN toda pregunta de cuánto comer de un alimento para alcanzar/completar/cerrar una meta o lo que resta del día: "¿cuántas cucharadas de yogur griego tengo que comer para llegar a la meta de proteínas que resta hoy?", "¿cuánto arroz me falta para completar carbos?", "¿con cuánto atún cierro mi proteína?" → proportion), "mis ingredientes son X, Y, Z / suelo comprar X, Y / mis favoritos son X"→manage_favorites (los items vienen en "items" o "preview"), "¿qué ingredientes tengo guardados? / muéstrame mis ingredientes / no me acuerdo qué ingredientes te di / ver mi lista de ingredientes"→manage_favorites SIN items (la app abre su lista para que la vea y edite), "¿qué menús favoritos tengo? / muéstrame mis menús guardados"→favorites, "armame el día/propón mi día/qué como hoy con lo que me gusta/distribuí lo que tengo"→plan_day, "guarda mi día como favorito / guardar el día como favorito / quiero guardar este día / agregar este día a favoritos / hoy fue un buen día guárdalo"→save_day_favorite.
  MOVER UNA COMIDA YA REGISTRADA A OTRO DÍA → move_entry (CRÍTICO): si el cliente pide cambiar la fecha de algo que YA quedó registrado hoy ("eso que te pasé regístralo para ayer, no para hoy", "esa cena era de ayer", "lo que registraste pásalo al miércoles", "me equivoqué, eso fue antier") → command="move_entry" + meal=(tipo de comida referida: cena/almuerzo/etc., o null si no lo dice) + log_date=(fecha DESTINO copiada de la TABLA DE FECHAS). Se reconoce porque en el contexto de conversación YA aparece esa comida registrada ("(registré cena: …)"). PROHIBIDO responder con log_meal en ese caso: re-registrarla crearía un DUPLICADO (la comida quedaría contada en los dos días). log_meal con log_date es SOLO para comida que aún NO está registrada.
- "clarify": SOLO si hay ambigüedad REAL. Llenar "clarify_interpretation" (tu mejor lectura ESCRITA PARA EL CLIENTE: 1 oración corta hablándole de "tú", ej: "quieres registrar pollo en tu cena") y "clarify_question" (pregunta corta y cálida, ej: "¿cuántos gramos aproximadamente?"). PROHIBIDO en ambos campos: razonamiento interno, tercera persona ("el cliente dice..."), o mencionar historial/señales/frontend/intents/reglas — el cliente lee estos textos TAL CUAL.
- "off_topic": saludos, charla, preguntas sobre el coach, "qué dieta hacer". Llena "message" con respuesta cálida y breve.
- "name": cliente dice su nombre. Llena "name_detected".

═══ SCHEMA ═══
{
  "intent": "log_meal | append_to_last | save_favorite_only | nutrition_query | meal_suggestion | summary_day | summary_week | retro_advice | adjust_favorites_to_goal | water | command | clarify | off_topic | name",
  "meal": "desayuno | almuerzo | cena | snack | comida | null",
  "log_date": "YYYY-MM-DD si el cliente registra un día PASADO, null = hoy",
  "items": [{"name": "...", "amount": "...", "kcal": N, "p": N, "c": N, "g": N, "fiber": N, "omega3": N, "sugar": N, "needs_quantity": false}],
  "meals": [{"meal": "desayuno|almuerzo|cena|snack|comida", "log_date": "YYYY-MM-DD si ESA comida es de un día pasado, null = hoy", "items": [{"name": "...", "amount": "...", "kcal": N, "p": N, "c": N, "g": N, "fiber": N, "omega3": N, "sugar": N}]}] | null,
  "append_to_entry_id": N | null,
  "command": "reset_day | change_goals | calendar | favorites | proportion | manage_favorites | plan_day | save_day_favorite | move_entry | delete_entry | edit_entry | null",
  "edit_entry_index": "N (número [#N] del DETALLE COMIDAS DE HOY, solo para edit_entry) | null",
  "name_detected": "..." | null,
  "water_ml": N | null,
  "preview": "string corto resumen items | null",
  "quantity_warning": "nota breve sobre supuestos hechos (ej: 'asumí 1 huevo grande ~50g') | null",
  "nutrition_response": {"food": "...", "amount": "...", "kcal": N, "p": N, "c": N, "g": N} | null,
  "clarify_interpretation": "string | null",
  "clarify_question": "string | null",
  "message": "string respuesta cálida y breve | null",
  "retro_advice_response": {
    "scope": "specific_meal | whole_day",
    "summary": "1-2 oraciones cálidas que explican qué hizo desviar las metas (ej: 'Te pasaste 180 kcal por las grasas — el aceite y el aguacate juntos sumaron mucho. La proteína te quedó corta.')",
    "adjustments": [
      {
        "meal": "desayuno | almuerzo | cena | snack | comida",
        "original_summary": "ej: '2 huevos, 1 aguacate entero, 30g aceite, 2 tostadas'",
        "suggested_items": [{"name": "...", "amount": "...", "kcal": N, "p": N, "c": N, "g": N}],
        "change_note": "ej: 'Bajar aguacate a ½ y aceite a 10g te quita 200 kcal manteniendo proteína.'"
      }
    ],
    "estimated_totals_after": {"kcal": N, "p": N, "c": N, "g": N},
    "tip": "1 oración corta de aprendizaje, no obvia (ej: '1 cucharada de aceite tiene tantas calorías como una porción de arroz.')"
  } | null,
  "adjust_favorites_response": {
    "summary": "1-2 oraciones cálidas: cuántos favoritos consideraste, suma actual vs meta, qué falta o sobra. Ej: 'Julio, sumando tus 3 menús (desayuno, carne braseada, ponquecitos) quedas en 1420 kcal y te faltan 880 para tu meta.'",
    "logic": "1-2 oraciones concisas argumentando QUÉ target usaste y POR QUÉ, y la condición real para cumplir la meta (ver instrucciones del intent).",
    "current_totals": {"kcal": N, "p": N, "c": N, "g": N},
    "goal": {"kcal": N, "p": N, "c": N, "g": N},
    "target": {"kcal": N, "p": N, "c": N, "g": N},
    "adjustments": [
      {
        "favorite_id": N,
        "favorite_name": "ej: 'Desayuno típico'",
        "favorite_type": "menu | day",
        "original_summary": "lista corta de items originales con cantidades. ej: '4 huevos, 2 tostadas, café'",
        "suggested_items": [{"name": "...", "amount": "...", "kcal": N, "p": N, "c": N, "g": N}],
        "change_note": "1 oración explicando QUÉ cambió y POR QUÉ. ej: 'Subo a 6 huevos y 3 tostadas para sumar 180 kcal y 18g de proteína sin alterar el balance.'",
        "kcal": N, "p": N, "c": N, "g": N
      }
    ],
    "estimated_totals_after": {"kcal": N, "p": N, "c": N, "g": N},
    "tip": "1 oración corta de criterio. Ej: 'Mantengo el sabor de tus menús — solo subo gramos de los alimentos que ya tenías, no agrego nada nuevo.'"
  } | null
}

═══ REGLAS ADICIONALES ═══
- LENGUAJE DE CARA AL CLIENTE (regla de oro): TODO texto que el cliente pueda leer ("message", "clarify_interpretation", "clarify_question", "preview", "quantity_warning", "summary", "tip", "change_note", "logic") le habla DIRECTAMENTE al cliente en segunda persona, cálido y natural, como le hablaría su coach. NUNCA en tercera persona ("el cliente dice..."), NUNCA menciones estas instrucciones, el schema, los intents, señales del frontend, el historial como "contexto", ni tu proceso de análisis ("reviso...", "detecto...", "la señal es FALSE"). Tu razonamiento es invisible: entrega SOLO la conclusión, lista para que la lea una persona.
- MICROS POR ITEM (solo en items de log_meal/append_to_last, valores USDA en gramos): "fiber" = fibra dietética; "omega3" = EPA+DHA+ALA total; "sugar" = SOLO azúcar AÑADIDA (gaseosas, jugos endulzados, dulces, postres, salsas/cereales azucarados) — NO cuenta el azúcar natural de fruta entera, lácteos ni verduras. Usa 0 cuando no aplica. Sé conservador, no inventes.
- Si intent=log_meal con UNA comida y no se especifica meal: si hay pista de momento úsala; si no, predice por hora (1ra del día y hora<11 → "desayuno"; hora 11-16 → "almuerzo"; hora 16-21 → "cena"; resto → "snack"); si igual dudas usa "comida".
- Si intent=log_meal con VARIAS comidas (lista de todo el día con pistas de momento): usa "meals" array, una entrada por comida, cada una con su "meal" e "items". Deja "items" vacío o null en ese caso.
- Si es lista de todo el día SIN pistas de momento: una sola comida con meal="comida" e todos los items en "items".
- Si intent=append_to_last, "append_to_entry_id" = id de la última comida (te lo pasé en CONTEXTO).
- Si el texto incluye "ah me acordé que comí también X", "olvidé decirte X", "me faltó X", "agregale X a lo de antes" Y hay última comida → SIEMPRE intent=append_to_last.
- Si menciona nombre propio en saludo ("soy Juan", "me llamo Ana") → intent=name, name_detected.
- "direct" tipo "250 kcal 22p 30c 5g" → intent=log_meal con 1 item.
- Si SOLO saluda ("hola", "buenas") sin comida → intent=off_topic, message="Hola${name ? ' ' + name.split(' ')[0] : ''}, cuéntame qué comiste y lo registro."
- Si pregunta qué comer / dieta → intent=off_topic, message="Yo calculo y registro. La recomendación es trabajo de Mauro. Para criterio personalizado escribile directo."
- Números enteros realistas. SIEMPRE llenar "preview" salvo en off_topic/clarify/name.
- needs_quantity SIEMPRE false (estima si no se especifica, deja nota en quantity_warning).`;

    // Dynamic context goes in the USER message (not the system prompt) so the system
    // prompt stays identical across calls and the cache hits.
    const userMessage = `${contextSnippet}\n\n═══ MENSAJE ACTUAL DEL CLIENTE ═══\n${text}`;

    // Progreso en vivo: mientras Claude va generando el JSON, extraemos los
    // nombres de alimentos que ya aparecieron y los mostramos en el indicador
    // ("Calculando: huevos, arepa…"). Es solo visual — el JSON se interpreta
    // completo al final, igual que siempre.
    let lastShown = '';
    const onDelta = (partial) => {
      const names = [];
      const rx = /"name"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = rx.exec(partial)) && names.length < 6) {
        if (!names.includes(m[1])) names.push(m[1]);
      }
      const label = names.length > 0 ? `Calculando: ${names.join(', ')}…` : '';
      if (label && label !== lastShown) {
        lastShown = label;
        setLoadingPreview(label);
      }
    };

    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callClaude(userMessage, sys, { onDelta });
        const clean = result.replace(/```json|```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : clean);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };

  // Auto-correct items instead of rejecting. Returns sanitized items, never rejects valid inputs.
  const sanitizeItems = (items) => {
    return items.map(raw => {
      // Capa determinística: si el alimento está en la tabla canónica
      // (src/foods.js) y su cantidad es determinable, los macros se
      // recalculan desde la tabla — el mismo número para todos los
      // clientes, todos los días. Si no, se respeta la estimación de la IA.
      const it = canonicalizeItem(raw);
      const p = Math.max(0, it.p || 0);
      const c = Math.max(0, it.c || 0);
      const g = Math.max(0, it.g || 0);
      const macroKcal = p * 4 + c * 4 + g * 9;
      // If declared kcal is wildly off from macros, trust macros
      let kcal = it.kcal || 0;
      if (kcal > 0 && macroKcal > 0 && (kcal < macroKcal * 0.6 || kcal > macroKcal * 1.6)) {
        kcal = Math.round(macroKcal);
      }
      // Round every macro to 1 decimal to avoid floating-point noise like 17.400000000000002
      const round1 = (n) => Math.round(n * 10) / 10;
      // Coerce to a finite non-negative number, then clamp to a sane ceiling.
      const safe = (n, max) => {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return 0;
        return Math.min(v, max);
      };
      return {
        ...it,
        kcal: Math.round(safe(kcal, 5000)),
        p: round1(safe(p, 400)),
        c: round1(safe(c, 700)),
        g: round1(safe(g, 300)),
        // Micros del LLM (fibra / omega-3 / azúcar añadida). Solo se incluyen
        // si vinieron en la respuesta: su PRESENCIA le dice a estimateMicros
        // que este item ya trae estimación buena y no necesita el fallback
        // por palabra clave.
        ...(it.fiber != null ? { fiber: round1(safe(it.fiber, 150)) } : {}),
        ...(it.omega3 != null ? { omega3: round1(safe(it.omega3, 50)) } : {}),
        ...(it.sugar != null ? { sugar: round1(safe(it.sugar, 500)) } : {}),
        needs_quantity: false,
      };
    });
  };

  const calculateProportions = async (text) => {
    if (!goals) { avisarMetaPendiente(); return; }
    const remaining = {
      kcal: Math.max(0, goals.kcal - totals.kcal),
      p: Math.max(0, goals.p - totals.p),
      c: Math.max(0, goals.c - totals.c),
      g: Math.max(0, goals.g - totals.g),
    };
    const sys = `Calculadora matemática de proporciones nutricionales. Devuelves SOLO JSON válido.

Macros faltantes: ${remaining.kcal} kcal, ${remaining.p}g P, ${remaining.c}g C, ${remaining.g}g G.

Dada una lista de alimentos, calcula cantidades exactas. Usa valores REALES (USDA). NO sugieras alimentos adicionales. NO recetas.

{
  "proportions": [{"name": "...", "amount": "Xg" o "X unidades", "kcal": N, "p": N, "c": N, "g": N}],
  "totals": {"kcal": N, "p": N, "c": N, "g": N},
  "note": "nota técnica breve, máximo 12 palabras"
}`;
    const result = await callClaude(text, sys);
    const clean = result.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  };

  // Agrega comidas a un DÍA PASADO (historial), no al día de hoy. Actualiza
  // tanto el detalle (historyDetail) como los totales (history) de esa fecha.
  const addEntriesToDate = (dateStr, newEntries) => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const prevDetail = Array.isArray(historyDetail[dateStr]) ? historyDetail[dateStr] : [];
    const all = [...prevDetail, ...newEntries];
    const t = all.reduce((a, e) => ({ kcal: a.kcal + (e.kcal || 0), p: a.p + (e.p || 0), c: a.c + (e.c || 0), g: a.g + (e.g || 0) }), { kcal: 0, p: 0, c: 0, g: 0 });
    setHistoryDetail(hd => ({ ...hd, [dateStr]: all }));
    setHistory(h => ({ ...h, [dateStr]: { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), g: r1(t.g), water: h[dateStr]?.water || 0 } }));
  };

  // ── Deshacer: ventana de 6s tras cada registro para revertirlo de un tap ──
  const [undoInfo, setUndoInfo] = useState(null); // { ids: number[] }
  const undoTimerRef = useRef(null);
  const armUndo = useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoInfo({ ids });
    undoTimerRef.current = setTimeout(() => setUndoInfo(null), 6000);
  }, []);
  const performUndo = useCallback(() => {
    haptic(10);
    setUndoInfo(current => {
      if (current) {
        const ids = new Set(current.ids);
        setEntries(es => es.filter(e => !ids.has(e.id)));
        setMessages(m => m.filter(msg => !(msg.entryId && ids.has(msg.entryId))));
      }
      return null;
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  // ── Registro instantáneo de repetidos ────────────────────────────────────
  // Si TODO el mensaje son alimentos que el cliente ya registró antes
  // (frequentItems, con macros cacheados y sin cantidades nuevas), se
  // registra al momento sin pasar por el LLM: respuesta en milisegundos y
  // cero costo de API. Cualquier duda → flujo normal con LLM.
  const tryInstantLog = (text) => {
    if (text.length > 90) return false;
    if (/\d/.test(text)) return false; // trae cantidades: que el LLM las calcule
    if (/\b(resumen|semanal?|semana|agua|reiniciar?|cambiar?|calendario|favoritos?|proporciones?|ayuda|meta|cuant\w*|cu[aá]nt\w*|c[oó]mo voy|qu[eé] (puedo|llevo|com[ií])|dime|hola|gracias|deshacer)\b/i.test(text)) return false;
    const stripArticle = (s) => s.replace(/^(un|una|unos|unas|el|la|los|las|mi|de)\s+/i, '').trim();
    const normKey = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    // Índice por nombre sin acentos → datos cacheados
    const index = {};
    for (const [k, v] of Object.entries(frequentItems)) index[normKey(k)] = v;
    const segments = text.split(/\s*(?:,|;|\by\b|\be\b)\s*/i).map(s => stripArticle(s.trim())).filter(Boolean);
    if (segments.length === 0) return false;
    const matched = [];
    for (const seg of segments) {
      const hit = index[normKey(seg)];
      // Solo items vistos 2+ veces y con macros reales cacheados
      if (!hit || (hit.count || 0) < 2 || !(hit.kcal > 0)) return false;
      matched.push({
        name: hit.displayName || seg,
        amount: hit.amount || '',
        kcal: hit.kcal || 0, p: hit.p || 0, c: hit.c || 0, g: hit.g || 0,
        needs_quantity: false,
      });
    }
    const r1 = (n) => Math.round(n * 10) / 10;
    const newEntry = {
      id: Date.now(),
      meal: predictMealType(),
      items: matched,
      kcal: Math.round(matched.reduce((s, i) => s + i.kcal, 0)),
      p: r1(matched.reduce((s, i) => s + i.p, 0)),
      c: r1(matched.reduce((s, i) => s + i.c, 0)),
      g: r1(matched.reduce((s, i) => s + i.g, 0)),
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      rawInput: text,
      hasMissingQuantity: false,
    };
    haptic(12);
    trackFrequency(matched);
    setEntries(e => [...e, newEntry]);
    setMessages(m => [...m, {
      role: 'assistant', content: 'logged', isLogged: true,
      entryId: newEntry.id, quantityWarning: null, ts: Date.now()
    }]);
    armUndo([newEntry.id]);
    return true;
  };

  const handleSend = async (textOverride) => {
    const userMsg = (textOverride || inputApiRef.current?.getText() || '').trim();
    if (!userMsg || loading) return;
    if (!textOverride) inputApiRef.current?.clear();
    haptic(8);
    setMessages(m => [...m, { role: 'user', content: userMsg, ts: Date.now() }]);

    // Camino rápido: alimento repetido conocido → registro inmediato sin LLM.
    if (tryInstantLog(userMsg)) {
      voiceInputRef.current = false;
      return;
    }

    setLoading(true);
    setLoadingPreview('Interpretando…');

    const fromVoice = voiceInputRef.current;
    voiceInputRef.current = false;
    const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

    // Deterministic append-intent detector. Run on the client BEFORE the LLM call.
    // Catches explicit append phrases; the absence of these words is a strong signal
    // that the client probably wants a NEW meal, not adding to the previous one.
    // No usar \b: en JS las vocales acentuadas (ó, é, í) son caracteres no-palabra,
    // así que \b después de "faltó/olvidé/comí" falla y rompía la detección.
    const APPEND_REGEX = /(me falt[oó]|olvid[eé]|olvid[oó]|tambi[eé]n com[ií] (antes|en (el|esa|ese)|el del?|del? (desayun|almuerz|cena|snack|merienda))|agr[eé]ga(le|me)?|s[uú]ma(le)? a|s[uú]male|no te dije que tambi[eé]n|ah,? (me )?acord[eé] (que|de)|le falta(ba|ban|ron)?|en (esa|ese|el) (desayun|almuerz|cena|snack|merienda)|adem[aá]s de eso com[ií])/i;
    const hasExplicitAppendIntent = APPEND_REGEX.test(userMsg);

    try {
      const parsed = await parseFoodEntry(userMsg, { voiceInput: fromVoice, lastEntry, hasExplicitAppendIntent });
      if (parsed.preview) setLoadingPreview(`Calculando: ${parsed.preview}`);

      if (parsed.name_detected) {
        setName(parsed.name_detected);
        await window.storage.set('name', JSON.stringify(parsed.name_detected));
      }

      const intent = parsed.intent || parsed.type; // backward-tolerant

      // NUTRITION QUERY — info only, no register
      if (intent === 'nutrition_query' && parsed.nutrition_response) {
        setMessages(m => [...m, { role: 'assistant', content: 'macro_query', isMacroQuery: true, data: parsed.nutrition_response, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // WATER
      // MEAL SUGGESTION — what should I eat (uses favoriteIngredients)
      if (intent === 'meal_suggestion') {
        await handleMealSuggestion(parsed.meal || null);
        setLoading(false); setLoadingPreview('');
        return;
      }

      if (intent === 'water' && parsed.water_ml) {
        setWater(w => w + parsed.water_ml);
        haptic(15);
        setMessages(m => [...m, { role: 'assistant', content: 'water', isWater: true, ml: parsed.water_ml, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // OFF-TOPIC / WARM REPLY
      if (intent === 'off_topic' && parsed.message) {
        // Misma defensa anti razonamiento filtrado que en clarify, pero más
        // suave: aquí solo se bloquea meta-jerga inequívoca (una respuesta
        // legítima sí puede decir "tu historial", así que ese no se filtra).
        const leaked = /\b(frontend|backend|intent|schema|json|el cliente dice|la se[ñn]al|estas instrucciones)\b/i.test(parsed.message);
        const safeMsg = leaked
          ? 'No te entendí del todo — ¿me lo repites de otra forma?'
          : parsed.message;
        setMessages(m => [...m, { role: 'assistant', content: safeMsg, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // NAME only
      if (intent === 'name') {
        const firstName = parsed.name_detected ? parsed.name_detected.split(' ')[0] : '';
        setMessages(m => [...m, { role: 'assistant', content: firstName ? `Perfecto, ${firstName}. Cuando comas, cuéntame y lo registro.` : 'Perfecto. Cuando comas, cuéntame y lo registro.', ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // SUMMARY DAY / WEEK
      if (intent === 'summary_day') {
        setMessages(m => [...m, { role: 'assistant', content: 'summary_detailed', isSummaryDetailed: true, entries: [...entries], totals: { ...totals }, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        maybeAppendGapSuggestion();
        return;
      }
      // RETRO ADVICE — el cliente pide consejo sobre cómo ajustar lo que YA registró. Solo aprendizaje.
      if (intent === 'retro_advice' && parsed.retro_advice_response) {
        setMessages(m => [...m, { role: 'assistant', content: 'retro_advice', isRetroAdvice: true, data: parsed.retro_advice_response, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }
      // ADJUST FAVORITES — el cliente pide reorganizar las cantidades de sus menús favoritos
      // para llegar a la meta diaria. Es solo propuesta visual, no toca ni los favoritos
      // guardados ni el registro real del día.
      if (intent === 'adjust_favorites_to_goal' && parsed.adjust_favorites_response) {
        setMessages(m => [...m, { role: 'assistant', content: 'adjust_favorites', isAdjustFavorites: true, data: parsed.adjust_favorites_response, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      if (intent === 'summary_week') {
        setActiveModal('weekly');
        setLoading(false); setLoadingPreview('');
        return;
      }

      // UI COMMAND
      if (intent === 'command') {
        if (parsed.command === 'reset_day') setActiveModal('reset');
        else if (parsed.command === 'change_goals') {
          // La meta la administra el coach desde el CRM; acá solo se explica.
          setMessages(m => [...m, { role: 'assistant', content: 'Tu meta nutricional la administra tu coach y se ajusta según tu plan. Si sientes que necesita un cambio, coméntaselo directamente y él la actualizará — te llegará el aviso aquí en el chat. 💪', ts: Date.now() }]);
        }
        else if (parsed.command === 'calendar') setActiveModal('calendar');
        else if (parsed.command === 'favorites') setActiveModal('favorites');
        else if (parsed.command === 'manage_favorites') {
          // flatMap + splitIngredients: si el modelo devuelve un item con la
          // lista pegada ("pollo, arroz y carne"), igual entra separado.
          const fromItems = (parsed.items || []).flatMap(i => splitIngredients(i.name));
          if (fromItems.length > 0) {
            const merged = Array.from(new Set([...favoriteIngredients, ...fromItems]));
            setFavoriteIngredients(merged);
            setMessages(m => [...m, { role: 'assistant', content: `Guardé estos ingredientes: ${fromItems.join(', ')}. Cuando quieras te armo el día con esto.`, ts: Date.now() }]);
          } else {
            setShowIngredientsModal(true);
          }
        }
        else if (parsed.command === 'edit_entry') {
          // Corregir CANTIDADES de una comida ya registrada, POR CHAT y en
          // el sitio ("eran 300g, no 150"). El modelo reconstruye la lista
          // completa de items corregida (tiene el DETALLE con macros en su
          // contexto) y aquí se REEMPLAZA la comida — nunca se duplica.
          const idxEd = Number(parsed.edit_entry_index);
          let targetEd = (Number.isFinite(idxEd) && idxEd >= 1 && idxEd <= entries.length) ? entries[idxEd - 1] : null;
          if (!targetEd) {
            const wantedEd = (parsed.meal || '').toLowerCase();
            const candEd = wantedEd ? entries.filter(en => (en.meal || '').toLowerCase() === wantedEd) : entries;
            targetEd = candEd[candEd.length - 1];
          }
          let newItems = Array.isArray(parsed.items) ? sanitizeItems(parsed.items) : [];
          // CINTURÓN DE SEGURIDAD: los items que el cliente NO tocó conservan
          // sus macros ORIGINALES por código, no por promesa del modelo. Sin
          // esto, el modelo re-estimaba TODA la comida al corregir una sola
          // cosa y los totales bailaban (pollo 180→137, el ghee desaparecía…).
          // Match por nombre+cantidad normalizados: si coinciden con un item
          // original, se copian sus números tal cual.
          if (targetEd && Array.isArray(targetEd.items)) {
            const normEq = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
            newItems = newItems.map(ni => {
              const orig = targetEd.items.find(oi => normEq(oi.name) === normEq(ni.name) && normEq(oi.amount) === normEq(ni.amount));
              return orig ? { ...ni, kcal: orig.kcal, p: orig.p, c: orig.c, g: orig.g,
                ...(orig.fiber != null ? { fiber: orig.fiber } : {}),
                ...(orig.omega3 != null ? { omega3: orig.omega3 } : {}),
                ...(orig.sugar != null ? { sugar: orig.sugar } : {}) } : ni;
            });
          }
          if (!targetEd || newItems.length === 0) {
            setMessages(m => [...m, { role: 'assistant', content: 'Dime cuál comida corrijo y con qué cantidad queda (ej: "la cena: eran 300g de arroz, no 150") y la ajusto al instante.', ts: Date.now() }]);
          } else {
            const rr = (n) => Math.round(n * 10) / 10;
            const nk = Math.round(newItems.reduce((s, i) => s + (i.kcal || 0), 0));
            const np = rr(newItems.reduce((s, i) => s + (i.p || 0), 0));
            const nc = rr(newItems.reduce((s, i) => s + (i.c || 0), 0));
            const ng = rr(newItems.reduce((s, i) => s + (i.g || 0), 0));
            const antes = Math.round(targetEd.kcal);
            setEntries(es => es.map(en => en.id === targetEd.id ? { ...en, items: newItems, kcal: nk, p: np, c: nc, g: ng } : en));
            setMessages(m => [...m, { role: 'assistant', content: `Corregido: tu ${targetEd.meal || 'comida'} quedó en ${nk} kcal · P${Math.round(np)} C${Math.round(nc)} G${Math.round(ng)} (antes ${antes} kcal). Totales del día ya ajustados.`, ts: Date.now() }]);
            haptic(15);
          }
        }
        else if (parsed.command === 'delete_entry') {
          // Borrar una comida de HOY por chat ("bórrame la cena", "elimina
          // eso último, estaba mal"). Antes solo existía el basurero de la
          // tarjeta o reiniciar el día entero — pedirlo por chat caía al
          // fallback genérico.
          const wantedDel = (parsed.meal || '').toLowerCase();
          const candDel = wantedDel ? entries.filter(en => (en.meal || '').toLowerCase() === wantedDel) : entries;
          const targetDel = candDel[candDel.length - 1]; // la más reciente de ese tipo
          if (!targetDel) {
            setMessages(m => [...m, { role: 'assistant', content: `No encuentro ${wantedDel ? `esa ${wantedDel}` : 'esa comida'} en tu día de hoy, así que no borré nada. Si es de un día anterior, dime cuál y lo vemos.`, ts: Date.now() }]);
          } else {
            setEntries(es => es.filter(en => en.id !== targetDel.id));
            setMessages(m => m.filter(msg => msg.entryId !== targetDel.id));
            setMessages(m => [...m, { role: 'assistant', content: `Listo, borré tu ${targetDel.meal || 'comida'} (${Math.round(targetDel.kcal)} kcal · P${Math.round(targetDel.p)} C${Math.round(targetDel.c)} G${Math.round(targetDel.g)}) del día de hoy. Los totales ya quedaron ajustados.`, ts: Date.now() }]);
            haptic(15);
          }
        }
        else if (parsed.command === 'move_entry') {
          // Mover una comida YA registrada hoy a un día pasado. Sin esto,
          // "eso que te pasé era de ayer" se re-registraba con log_date y la
          // comida quedaba DOBLE: contada en hoy y en ayer.
          const isPast = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today;
          const targetDate = isPast(parsed.log_date) ? parsed.log_date : null;
          const wanted = (parsed.meal || '').toLowerCase();
          const candidates = wanted ? entries.filter(en => (en.meal || '').toLowerCase() === wanted) : entries;
          const target = candidates[candidates.length - 1]; // la más reciente de ese tipo
          if (!targetDate) {
            setMessages(m => [...m, { role: 'assistant', content: '¿Para qué día muevo esa comida? Dime por ejemplo "para ayer" o la fecha exacta.', ts: Date.now() }]);
          } else if (!target) {
            setMessages(m => [...m, { role: 'assistant', content: `No encuentro ${wanted ? `esa ${wanted}` : 'esa comida'} registrada en tu día de hoy, así que no moví nada. Si quedó en otro día por error, dímelo y lo revisamos con tu coach.`, ts: Date.now() }]);
          } else {
            setEntries(es => es.filter(en => en.id !== target.id));
            setMessages(m => m.filter(msg => msg.entryId !== target.id));
            addEntriesToDate(targetDate, [{ ...target, time: '' }]);
            const dayLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
            setMessages(m => [...m, { role: 'assistant', content: `Hecho: moví tu ${target.meal || 'comida'} (${Math.round(target.kcal)} kcal · P${Math.round(target.p)} C${Math.round(target.c)} G${Math.round(target.g)}) de hoy a ${dayLabel}. Salió de los totales de hoy y quedó contada solo en ese día — nada doble.`, ts: Date.now() }]);
            haptic(15);
          }
        }
        else if (parsed.command === 'plan_day') {
          setShowPlannerModal(true);
          generatePlan();
        }
        else if (parsed.command === 'save_day_favorite') {
          saveDayAsFavorite();
        }
        else if (parsed.command === 'proportion') {
          if (parsed.items && parsed.items.length > 0) {
            const propResult = await calculateProportions(userMsg);
            setMessages(m => [...m, { role: 'assistant', content: 'proportion', isProportion: true, data: propResult, ts: Date.now() }]);
          } else {
            setMessages(m => [...m, {
              role: 'assistant',
              content: 'Indicame qué alimentos tienes disponibles. Calculo proporciones para cuadrar tus macros faltantes.\n\nEjemplo: "tengo pollo, arroz integral, brócoli y aceite de oliva"',
              ts: Date.now()
            }]);
          }
        }
        setLoading(false); setLoadingPreview('');
        return;
      }

      // CLARIFY — only when truly ambiguous
      if (intent === 'clarify' && (parsed.clarify_interpretation || parsed.clarify_question)) {
        // Defensa anti "lenguaje de bot": estos campos se muestran TAL CUAL
        // al cliente, y el modelo a veces vuelca ahí su razonamiento interno
        // ("El cliente dice solo 'Pollo'. Reviso historial... la señal del
        // frontend es FALSE"). Si un campo huele a razonamiento (meta-jerga,
        // tercera persona, o parrafada), NO se muestra: se cae a la pregunta
        // sola, o a un fallback cálido genérico.
        const looksInternal = (s) => !s
          || s.length > 160
          || /\b(frontend|backend|intent|schema|json|se[ñn]al|false|true|el cliente|la clienta|historial|contexto|instrucci|reviso|detect[oé]|clasific|append)\b/i.test(s);
        const interp = looksInternal(parsed.clarify_interpretation)
          ? ''
          : `Quiero asegurarme de entenderte: ${parsed.clarify_interpretation}. `;
        const q = looksInternal(parsed.clarify_question)
          ? 'No te entendí del todo — ¿me lo repites con un poco más de detalle? Por ejemplo, qué comiste y la cantidad aproximada.'
          : parsed.clarify_question;
        setMessages(m => [...m, { role: 'assistant', content: `${interp}${q}`, ts: Date.now() }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // APPEND TO LAST — add items to the previous entry
      if (intent === 'append_to_last' && parsed.items?.length > 0 && lastEntry) {
        const cleanItems = sanitizeItems(parsed.items);
        trackFrequency(cleanItems);
        haptic(12);
        const r1 = (n) => Math.round(n * 10) / 10;
        const addKcal = cleanItems.reduce((s, i) => s + (i.kcal || 0), 0);
        const addP = cleanItems.reduce((s, i) => s + (i.p || 0), 0);
        const addC = cleanItems.reduce((s, i) => s + (i.c || 0), 0);
        const addG = cleanItems.reduce((s, i) => s + (i.g || 0), 0);
        setEntries(es => es.map(e => {
          if (e.id !== lastEntry.id) return e;
          const newItems = [...e.items, ...cleanItems];
          return {
            ...e,
            items: newItems,
            kcal: Math.round((e.kcal || 0) + addKcal),
            p: r1((e.p || 0) + addP),
            c: r1((e.c || 0) + addC),
            g: r1((e.g || 0) + addG),
          };
        }));
        setMessages(m => [...m, {
          role: 'assistant', content: 'appended', isAppended: true,
          entryId: lastEntry.id, addedItems: cleanItems, quantityWarning: parsed.quantity_warning, ts: Date.now()
        }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      const r1 = (n) => Math.round(n * 10) / 10;

      // SOLO FAVORITO — guardar como receta SIN contar en el día. Dos casos:
      // (a) el mensaje describe la comida → se guarda directo como favorito;
      // (b) se refiere a lo último registrado ("eso no lo registres") → se
      //     SACA del contador del día y se guarda como favorito.
      // En ambos queda una tarjeta en el chat que muestra la acción y aclara
      // que NO suma al día.
      if (intent === 'save_favorite_only') {
        haptic(12);
        let favSource = null;
        let removedFromDay = false;
        if (parsed.items?.length > 0) {
          const cleanItems = sanitizeItems(parsed.items);
          trackFrequency(cleanItems);
          favSource = {
            meal: parsed.meal || 'comida', items: cleanItems,
            kcal: Math.round(cleanItems.reduce((s, i) => s + (i.kcal || 0), 0)),
            p: r1(cleanItems.reduce((s, i) => s + (i.p || 0), 0)),
            c: r1(cleanItems.reduce((s, i) => s + (i.c || 0), 0)),
            g: r1(cleanItems.reduce((s, i) => s + (i.g || 0), 0)),
          };
        } else if (lastEntry) {
          favSource = lastEntry;
          // Fuera del contador del día + fuera la tarjeta de "registrado"
          setEntries(es => es.filter(e => e.id !== lastEntry.id));
          setMessages(m => m.filter(msg => !(msg.entryId === lastEntry.id && (msg.isLogged || msg.isAppended))));
          removedFromDay = true;
        }
        if (!favSource) {
          setMessages(m => [...m, { role: 'assistant', content: 'No encontré qué guardar. Descríbeme la receta ("guárdame como receta: ...") o registra la comida primero y luego me dices que no la cuente.', ts: Date.now() }]);
          setLoading(false); setLoadingPreview('');
          return;
        }
        const autoName = favSource.items.map(i => i.name).join(', ').slice(0, 60);
        const fav = {
          id: Date.now(),
          name: autoName, autoName,
          items: favSource.items,
          kcal: favSource.kcal, p: favSource.p, c: favSource.c, g: favSource.g,
          meal: favSource.meal,
        };
        setFavorites(f => [...f, fav]);
        setMessages(m => [...m, {
          role: 'assistant', isFavoriteOnly: true,
          data: {
            name: fav.name, meal: fav.meal, items: fav.items,
            kcal: fav.kcal, p: fav.p, c: fav.c, g: fav.g, removedFromDay,
          },
          ts: Date.now(),
        }]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // BACK-DATED LOGGING — el cliente registra uno o VARIOS días pasados
      // ("ayer cené…", "el lunes desayuné… y el martes almorcé…"). Cada comida
      // va al historial de SU fecha: se lee meals[i].log_date (por comida) con
      // parsed.log_date como respaldo global. Antes existía UN solo log_date
      // para todo el mensaje: al dictar varios días, todo caía amontonado en
      // una sola fecha del historial.
      const normPastDate = (d) => {
        if (!d || typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
        return d < today ? d : null; // solo fechas pasadas; hoy/futuro = flujo normal
      };
      const globalLogDate = normPastDate(parsed.log_date);
      if (intent === 'log_meal') {
        const srcMeals = (Array.isArray(parsed.meals) && parsed.meals.length > 0)
          ? parsed.meals
          : (parsed.items?.length > 0 ? [{ meal: parsed.meal || 'comida', items: parsed.items, log_date: parsed.log_date }] : []);
        // El log_date raíz solo aplica como respaldo cuando NINGUNA comida
        // trae fecha propia. Si al menos una la trae, el LLM está fechando
        // por comida y log_date=null significa HOY — sin esta regla, en
        // "ayer almorcé X y hoy desayuné Y" el desayuno de hoy caía en ayer
        // cada vez que el modelo llenaba también la fecha raíz.
        const anyOwnDate = srcMeals.some(mo => mo && normPastDate(mo.log_date));
        const dated = srcMeals
          .filter(mo => mo && Array.isArray(mo.items) && mo.items.length > 0)
          .map(mo => ({ ...mo, _date: normPastDate(mo.log_date) || (anyOwnDate ? null : globalLogDate) }));
        if (dated.some(mo => mo._date)) {
          const baseId = Date.now();
          const mkEntry = (mo, idx, isToday) => {
            const cleanItems = sanitizeItems(mo.items);
            trackFrequency(cleanItems);
            return {
              id: baseId + idx, meal: mo.meal || 'comida', items: cleanItems,
              kcal: Math.round(cleanItems.reduce((s, i) => s + (i.kcal || 0), 0)),
              p: r1(cleanItems.reduce((s, i) => s + (i.p || 0), 0)),
              c: r1(cleanItems.reduce((s, i) => s + (i.c || 0), 0)),
              g: r1(cleanItems.reduce((s, i) => s + (i.g || 0), 0)),
              time: isToday ? new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '',
              rawInput: userMsg, hasMissingQuantity: false,
            };
          };
          const byDate = {};
          const todayEntries = [];
          dated.forEach((mo, idx) => {
            if (mo._date) (byDate[mo._date] = byDate[mo._date] || []).push(mkEntry(mo, idx, false));
            else todayEntries.push(mkEntry(mo, idx, true));
          });
          const dateKeys = Object.keys(byDate).sort();
          dateKeys.forEach(d => addEntriesToDate(d, byDate[d]));
          haptic(15);
          // Comidas de HOY que venían mezcladas en el mismo mensaje: van al
          // día actual por el flujo normal (tarjetas + deshacer).
          if (todayEntries.length > 0) {
            setEntries(e => [...e, ...todayEntries]);
            const todayMsgs = todayEntries.map(ne => ({
              role: 'assistant', content: 'logged', isLogged: true,
              entryId: ne.id, quantityWarning: null, ts: Date.now() + Math.random()
            }));
            if (parsed.quantity_warning) todayMsgs[0].quantityWarning = parsed.quantity_warning;
            setMessages(m => [...m, ...todayMsgs]);
            armUndo(todayEntries.map(ne => ne.id));
          }
          const dayLabel = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
          const totOf = (arr) => arr.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, g: a.g + e.g }), { kcal: 0, p: 0, c: 0, g: 0 });
          let confirmMsg;
          if (dateKeys.length === 1 && todayEntries.length === 0) {
            const tot = totOf(byDate[dateKeys[0]]);
            confirmMsg = `Listo, lo registré en ${dayLabel(dateKeys[0])}, no en hoy. Ese día sumó ${Math.round(tot.kcal)} kcal · P${r1(tot.p)} C${r1(tot.c)} G${r1(tot.g)}. Tu día de hoy queda intacto.`;
          } else {
            const lines = dateKeys.map(d => {
              const tot = totOf(byDate[d]);
              return `· ${dayLabel(d)}: ${byDate[d].length} ${byDate[d].length === 1 ? 'comida' : 'comidas'} — ${Math.round(tot.kcal)} kcal · P${r1(tot.p)} C${r1(tot.c)} G${r1(tot.g)}`;
            });
            const todayNote = todayEntries.length > 0 ? ' Lo de hoy quedó en tu día actual.' : ' Tu día de hoy queda intacto.';
            confirmMsg = `Listo, registré cada comida en su día:\n${lines.join('\n')}${todayNote}`;
          }
          // Las advertencias de estimación ("asumí 150 g") también aplican a
          // lo registrado en días pasados — el cliente debe poder corregir.
          if (parsed.quantity_warning && todayEntries.length === 0) {
            confirmMsg += ` Nota: ${parsed.quantity_warning}.`;
          }
          setMessages(m => [...m, { role: 'assistant', content: confirmMsg, ts: Date.now() }]);
          setLoading(false); setLoadingPreview('');
          return;
        }
      }

      // LOG MULTIPLE MEALS (whole day dictated with meal cues)
      if (intent === 'log_meal' && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
        haptic(15);
        const baseId = Date.now();
        const newEntries = parsed.meals
          .filter(mealObj => mealObj && Array.isArray(mealObj.items) && mealObj.items.length > 0)
          .map((mealObj, idx) => {
            const cleanItems = sanitizeItems(mealObj.items);
            trackFrequency(cleanItems);
            return {
              id: baseId + idx,
              meal: mealObj.meal || 'comida',
              items: cleanItems,
              kcal: Math.round(cleanItems.reduce((s, i) => s + (i.kcal || 0), 0)),
              p: r1(cleanItems.reduce((s, i) => s + (i.p || 0), 0)),
              c: r1(cleanItems.reduce((s, i) => s + (i.c || 0), 0)),
              g: r1(cleanItems.reduce((s, i) => s + (i.g || 0), 0)),
              time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
              rawInput: userMsg,
              hasMissingQuantity: false,
            };
          });
        if (newEntries.length > 0) {
          setEntries(e => [...e, ...newEntries]);
          const newMsgs = newEntries.map(ne => ({
            role: 'assistant', content: 'logged', isLogged: true,
            entryId: ne.id, quantityWarning: null, ts: Date.now() + Math.random()
          }));
          if (parsed.quantity_warning) newMsgs[0].quantityWarning = parsed.quantity_warning;
          setMessages(m => [...m, ...newMsgs]);
          armUndo(newEntries.map(ne => ne.id));
          setLoading(false); setLoadingPreview('');
          return;
        }
      }

      // LOG MEAL (single new entry)
      if (intent === 'log_meal' && parsed.items?.length > 0) {
        const cleanItems = sanitizeItems(parsed.items);
        trackFrequency(cleanItems);
        haptic(12);
        const newEntry = {
          id: Date.now(),
          meal: parsed.meal || predictMealType(),
          items: cleanItems,
          kcal: Math.round(cleanItems.reduce((s, i) => s + (i.kcal || 0), 0)),
          p: r1(cleanItems.reduce((s, i) => s + (i.p || 0), 0)),
          c: r1(cleanItems.reduce((s, i) => s + (i.c || 0), 0)),
          g: r1(cleanItems.reduce((s, i) => s + (i.g || 0), 0)),
          time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
          rawInput: userMsg,
          hasMissingQuantity: false,
        };
        setEntries(e => [...e, newEntry]);
        setMessages(m => [...m, {
          role: 'assistant', content: 'logged', isLogged: true,
          entryId: newEntry.id, quantityWarning: parsed.quantity_warning, ts: Date.now()
        }]);
        armUndo([newEntry.id]);
        setLoading(false); setLoadingPreview('');
        return;
      }

      // FALLBACK GUARDIAN: if the model didn't classify the message as something
      // actionable but the message looks like a meal description, force a retry
      // with a stricter prompt that REQUIRES log_meal output. This protects against
      // the model returning empty items or misclassifying clear meal descriptions.
      console.warn('[MealTracker] LLM returned no actionable intent for:', userMsg, 'parsed=', parsed);
      // OPCIÓN A — heurística laxa: cualquier mensaje >40 chars dispara el retry,
      // sin importar palabras específicas. Si el contenido no es comida, el retry
      // forzado simplemente devolverá items vacío y caeremos al fallback amable.
      // Costo: una llamada extra ocasional (centavos al mes). Beneficio: cubre
      // mensajes como "comí lo de siempre", recetas con palabras no listadas, etc.
      const looksLikeMeal = userMsg.length > 40 ||
        /huevo|tostada|pan|pollo|arroz|leche|café|cafe|cacao|creatina|whey|proteína|yogur|avena|banana|plátano|manzana|fruta|pasta|carne|pescado|atún|salmon|salmón|queso|jamón|jamon|ensalada|sopa|tortilla|arepa|patacón|patacon|frijol|frijoles|lenteja|garbanzo|verdura|fruta|cereal|comí|comi|desayun|almorz|almorc|cené|cene|cena|merien|snack|gramos|cucharada|porción|porcion|taza|vaso|unidad|rodaja|filete|onza|libra/i.test(userMsg);

      if (looksLikeMeal) {
        try {
          const forcedSys = `Eres un parser nutricional. Devuelves SOLO JSON válido, sin markdown.

OBLIGATORIO: el mensaje del cliente describe comida. DEBES devolver intent="log_meal" con la lista completa de alimentos. NO pidas más detalle. NO devuelvas clarify. NO devuelvas off_topic.

Estima cantidades con USDA estándar si no se especifican (1 huevo ≈ 50g, 1 tostada pan integral ≈ 25g, 1 taza arroz cocido ≈ 160g, 1 cucharada ≈ 14g, 1 porción ≈ porción típica).

SCHEMA:
{
  "intent": "log_meal",
  "meal": "desayuno | almuerzo | cena | snack | comida",
  "items": [{"name": "...", "amount": "...", "kcal": N, "p": N, "c": N, "g": N}],
  "quantity_warning": "string|null"
}

EJEMPLO INPUT: "desayuno con 4 huevos revueltos, 2 tostadas integrales con manteca, café negro, creatina con cacao"
EJEMPLO OUTPUT: {"intent":"log_meal","meal":"desayuno","items":[{"name":"Huevo revuelto","amount":"4 unidades (~200g)","kcal":280,"p":24,"c":2,"g":20},{"name":"Pan integral tostado","amount":"2 unidades (~50g)","kcal":130,"p":5,"c":24,"g":2},{"name":"Manteca","amount":"~10g","kcal":72,"p":0,"c":0,"g":8},{"name":"Café negro","amount":"240ml","kcal":2,"p":0,"c":0,"g":0},{"name":"Creatina","amount":"5g","kcal":0,"p":0,"c":0,"g":0},{"name":"Cacao en polvo","amount":"2 cdas (~10g)","kcal":23,"p":2,"c":6,"g":1}],"quantity_warning":"asumí cantidades estándar; ajusta si difiere"}`;
          const forcedResult = await callClaude(userMsg, forcedSys);
          const cleanF = forcedResult.replace(/```json|```/g, '').trim();
          const matchF = cleanF.match(/\{[\s\S]*\}/);
          const forced = JSON.parse(matchF ? matchF[0] : cleanF);
          if (forced.items && forced.items.length > 0) {
            const cleanItems = sanitizeItems(forced.items);
            trackFrequency(cleanItems);
            haptic(12);
            const r1 = (n) => Math.round(n * 10) / 10;
            const newEntry = {
              id: Date.now(),
              meal: forced.meal || predictMealType(),
              items: cleanItems,
              kcal: Math.round(cleanItems.reduce((s, i) => s + (i.kcal || 0), 0)),
              p: r1(cleanItems.reduce((s, i) => s + (i.p || 0), 0)),
              c: r1(cleanItems.reduce((s, i) => s + (i.c || 0), 0)),
              g: r1(cleanItems.reduce((s, i) => s + (i.g || 0), 0)),
              time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
              rawInput: userMsg,
              hasMissingQuantity: false,
            };
            setEntries(e => [...e, newEntry]);
            setMessages(m => [...m, {
              role: 'assistant', content: 'logged', isLogged: true,
              entryId: newEntry.id, quantityWarning: forced.quantity_warning, ts: Date.now()
            }]);
            setLoading(false); setLoadingPreview('');
            return;
          }
        } catch (retryErr) {
          console.warn('[MealTracker] forced retry failed:', retryErr);
        }
      }

      // SOFT FALLBACK (never "no entiendo")
      const firstName = name ? name.split(' ')[0] : '';
      const greeting = firstName ? `${firstName}, ` : '';
      setMessages(m => [...m, {
        role: 'assistant',
        content: `${greeting}cuéntame con un poco más de detalle qué comiste, así lo registro bien. Ej: "almuerzo: 150g pollo, taza de arroz, ensalada".`,
        ts: Date.now()
      }]);
    } catch (e) {
      const isOverload = String(e?.message || '').includes('overloaded') || String(e?.message || '').includes('http:5');
      const firstName = name ? name.split(' ')[0] : '';
      const greeting = firstName ? `${firstName}, ` : '';
      const msg = isOverload
        ? `${greeting}el servicio está saturado un momento. Prueba de nuevo en unos segundos.`
        : `${greeting}tuve un problema procesando eso. ¿Puedes volver a escribirlo o agregar un detalle más?`;
      setMessages(m => [...m, { role: 'assistant', content: msg, ts: Date.now() }]);
    }

    setLoading(false); setLoadingPreview('');
  };

  const startVoice = async () => {
    // Try Whisper-based recording first (MediaRecorder). Fallback to Web Speech if it fails.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const candidateMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
        const mimeType = candidateMimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
        // 32 kbps es de sobra para voz dictada (calidad podcast) y hace el
        // archivo mucho más liviano: el audio sube más rápido con datos
        // móviles y la transcripción arranca antes. Si el navegador no
        // soporta la opción, la ignora y graba con su bitrate normal.
        const recOpts = { audioBitsPerSecond: 32000 };
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, ...recOpts })
          : new MediaRecorder(stream, recOpts);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blobType = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
          audioChunksRef.current = [];
          if (audioBlob.size < 1000) return; // muy corto, ignorar
          await transcribeAudio(audioBlob, blobType);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
        haptic(15);
        return;
      } catch (err) {
        // Permisos denegados o error de mic -> caemos a Web Speech
        console.warn('MediaRecorder failed, falling back to Web Speech:', err);
      }
    }
    // Fallback: Web Speech API del navegador
    startVoiceFallback();
  };

  const startVoiceFallback = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('No pude acceder al micrófono. Verifica los permisos del navegador o escribe directamente.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => { setRecording(true); haptic(15); };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }
      const txt = (finalTranscript + interimTranscript).trim();
      inputApiRef.current?.setText(txt);
      if (txt) voiceInputRef.current = true;
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { setRecording(false); }
  };

  const stopVoice = () => {
    // MediaRecorder path
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
      mediaRecorderRef.current = null;
      setRecording(false);
      haptic(10);
      return;
    }
    // Web Speech fallback path
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    setRecording(false);
    haptic(10);
  };

  // Modelo de transcripción principal y respaldo. gpt-4o-mini-transcribe es
  // más rápido, cuesta la mitad y transcribe español igual o mejor que
  // whisper-1. Si OpenAI lo rechazara por cualquier motivo, se reintenta
  // automáticamente con whisper-1 (el comportamiento anterior).
  const TRANSCRIBE_MODELS = ['gpt-4o-mini-transcribe', 'whisper-1'];

  const transcribeAudio = async (audioBlob, mimeType) => {
    setTranscribing(true);
    try {
      const ext = mimeType.includes('mp4') ? 'mp4'
                : mimeType.includes('mpeg') ? 'mp3'
                : mimeType.includes('wav') ? 'wav'
                : 'webm';
      const buildForm = (model) => {
        const formData = new FormData();
        formData.append('file', audioBlob, `recording.${ext}`);
        formData.append('model', model);
        formData.append('language', 'es');
        formData.append('response_format', 'json');
        // Glosario de palabras frecuentes que el transcriptor tiende a oír mal en español latam.
        // Esto le da contexto y reduce errores como "quesito" en lugar de "ponquecito".
        formData.append('prompt', 'Transcripción de una persona dictando lo que comió. Vocabulario frecuente: desayuno, almuerzo, cena, snack, ponqué, ponquecito, arepa, patacón, fainá, tequeño, palta, aguacate, plátano, banana, palta, choclo, poroto, yogur griego, mantequilla de maní, café con leche, huevo, claras de huevo, avena, arroz, pollo, pechuga, atún, salmón, lentejas, quinoa, brócoli, espinaca, almendras, nueces, mantequilla, aceite de oliva.');
        return formData;
      };

      let res = null;
      let lastErrMsg = 'Transcribe failed';
      for (const model of TRANSCRIBE_MODELS) {
        res = await fetch('/api/transcribe', { method: 'POST', body: buildForm(model) });
        if (res.ok) break;
        const errData = await res.json().catch(() => ({}));
        lastErrMsg = errData.error || lastErrMsg;
      }
      if (!res || !res.ok) throw new Error(lastErrMsg);
      const data = await res.json();
      let txt = (data.text || '').trim();
      // Whisper alucina frases típicas de subtítulos cuando el audio está en
      // silencio o casi vacío. Las filtramos para que el cliente no vea texto raro.
      const HALLUCINATIONS = [
        /subt[ií]tulos?.*(amara\.org|comunidad)/i,
        /amara\.org/i,
        /subt[ií]tulos? realizados por/i,
        /subt[ií]tulos? por la comunidad/i,
        /www\.[^\s]+\.(org|com)/i,
        /gracias por (ver|watching)/i,
        /\bsubscribe\b/i,
        /transcripci[oó]n por/i,
      ];
      const isHallucination = txt.length > 0 && HALLUCINATIONS.some(rx => rx.test(txt));
      if (isHallucination) txt = '';
      if (txt) {
        inputApiRef.current?.appendText(txt);
        voiceInputRef.current = true;
      } else {
        // Silencio o sólo alucinación → aviso suave, sin texto fantasma
        setMessages(m => [...m, { role: 'assistant', content: 'No alcancé a escuchar nada. Toca el micrófono y cuéntame qué comiste.', ts: Date.now() }]);
      }
    } catch (err) {
      console.error('Transcribe error:', err);
      alert('No pude transcribir el audio. Intenta de nuevo o escribe directamente.');
    } finally {
      setTranscribing(false);
    }
  };

  const deleteEntry = useCallback((id) => {
    haptic(10);
    setEntries(e => e.filter(x => x.id !== id));
    setEditingEntry(null);
  }, []);

  // Registro desde el Recetario: agrega la entrada Y deja la burbuja de
  // confirmación en el chat, como todos los demás flujos de registro. Antes
  // la comida aparecía en los totales pero el chat quedaba sin rastro y
  // parecía que el botón no había funcionado.
  const registerRecipeEntry = useCallback((entry) => {
    setEntries(e => [...e, entry]);
    setMessages(m => [...m, { role: 'assistant', content: 'logged', isLogged: true, entryId: entry.id, ts: Date.now() }]);
    armUndo([entry.id]);
  }, [armUndo]);

  // Stable handlers passed to MessageBubble (so React.memo can skip re-renders on modal toggles)
  const handleEditEntry = useCallback((id) => { haptic(8); setEditingEntry(id); }, []);
  const handleAcceptFavSuggestion = useCallback(() => { haptic(10); setShowIngredientsModal(true); }, []);
  const handleDismissFavSuggestion = useCallback(() => { window.storage.set('favSuggestionDismissed', JSON.stringify(Date.now())).catch(() => {}); }, []);
  const handleOpenPerformance = useCallback(() => { haptic(8); setShowPerformanceModal(true); }, []);

  // When user taps the star, open a small naming modal first
  const addToFavorites = useCallback((entry) => {
    haptic(15);
    setPendingFavoriteEntry(entry);
  }, []);
  const confirmFavorite = (customName) => {
    if (!pendingFavoriteEntry) return;
    const entry = pendingFavoriteEntry;
    const autoName = entry.items.map(i => i.name).join(', ').slice(0, 60);
    const fav = {
      id: Date.now(),
      name: (customName && customName.trim()) || autoName,
      autoName,
      items: entry.items,
      kcal: entry.kcal, p: entry.p, c: entry.c, g: entry.g,
      meal: entry.meal
    };
    setFavorites(f => [...f, fav]);
    setPendingFavoriteEntry(null);
    haptic(15);
    setMessages(m => [...m, { role: 'assistant', content: `Guardado en favoritos como "${fav.name}". Lo puedes reusar desde Herramientas → Menús favoritos.`, ts: Date.now() }]);
  };

  // Guardar el DÍA completo como favorito (todas las comidas de hoy en un solo paquete).
  // Tres puntos de entrada: chat (intent command save_day_favorite), botón en Herramientas,
  // y opción dentro del modal de guardar comida favorita.
  const saveDayAsFavorite = useCallback((customName) => {
    if (entries.length === 0) {
      setMessages(m => [...m, { role: 'assistant', content: 'Aún no registras nada hoy. Registra al menos una comida y luego guardamos el día.', ts: Date.now() }]);
      return;
    }
    const totals = entries.reduce((acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      p: acc.p + (e.p || 0),
      c: acc.c + (e.c || 0),
      g: acc.g + (e.g || 0),
    }), { kcal: 0, p: 0, c: 0, g: 0 });
    const dateLabel = new Date().toLocaleDateString('es', { month: 'short', day: 'numeric' });
    const autoName = `Día ${dateLabel} · ${Math.round(totals.kcal)}kcal`;
    const fav = {
      id: Date.now(),
      name: (customName && customName.trim()) || autoName,
      autoName,
      type: 'day',
      days: entries.map(e => ({
        meal: e.meal || 'comida',
        items: e.items || [],
        kcal: e.kcal || 0, p: e.p || 0, c: e.c || 0, g: e.g || 0,
        time: e.time || ''
      })),
      kcal: totals.kcal, p: totals.p, c: totals.c, g: totals.g,
    };
    setFavorites(f => [...f, fav]);
    setPendingFavoriteEntry(null);
    haptic(15);
    setMessages(m => [...m, { role: 'assistant', content: `Día guardado como "${fav.name}" en favoritos. Lo puedes reusar desde Herramientas → Menús favoritos.`, ts: Date.now() }]);
  }, [entries]);

  // Signature to know if an entry is already in favorites (for the colored star)
  const favSignature = useCallback((e) => `${e.meal || ''}|${(e.items || []).map(i => (i.name || '').toLowerCase().trim()).sort().join(',')}`, []);
  const favoriteSignatures = useMemo(() => new Set(favorites.map(favSignature)), [favorites, favSignature]);

  // Memoized chat messages list: only re-renders when one of the actual data
  // inputs changes. Without this, every state change in the 6000-line parent
  // (opening a sheet, toggling animations, etc.) re-iterates the message
  // list, which on mobile causes the 1-2s lag perceived as "frozen UI".
  const renameFavorite = (id, newName) => {
    setFavorites(f => f.map(x => x.id === id ? { ...x, name: (newName && newName.trim()) || x.autoName || x.name } : x));
  };

  // Split an appended item set out of its parent entry into a brand new entry.
  // Used when the model put items in a previous meal but the client meant a new meal.
  const separateAppendedItems = useCallback((parentEntryId, itemsToSeparate) => {
    if (!Array.isArray(itemsToSeparate) || itemsToSeparate.length === 0) return;
    haptic(12);
    const r1 = (n) => Math.round(n * 10) / 10;
    const keys = new Set(itemsToSeparate.map(it => `${it.name}|${it.amount || ''}`));
    // Time-based meal prediction (no closure dependency on entries)
    const hour = new Date().getHours();
    const mealByHour = hour < 11 ? 'desayuno' : hour < 16 ? 'almuerzo' : hour < 21 ? 'cena' : 'snack';
    let newEntry = null;
    setEntries(es => {
      const updated = [];
      for (const e of es) {
        if (e.id !== parentEntryId) { updated.push(e); continue; }
        const remaining = e.items.filter(it => !keys.has(`${it.name}|${it.amount || ''}`));
        updated.push({
          ...e,
          items: remaining,
          kcal: Math.round(remaining.reduce((s, i) => s + (i.kcal || 0), 0)),
          p: r1(remaining.reduce((s, i) => s + (i.p || 0), 0)),
          c: r1(remaining.reduce((s, i) => s + (i.c || 0), 0)),
          g: r1(remaining.reduce((s, i) => s + (i.g || 0), 0)),
        });
      }
      newEntry = {
        id: Date.now(),
        meal: mealByHour,
        items: itemsToSeparate.map(i => ({ ...i, needs_quantity: false })),
        kcal: Math.round(itemsToSeparate.reduce((s, i) => s + (i.kcal || 0), 0)),
        p: r1(itemsToSeparate.reduce((s, i) => s + (i.p || 0), 0)),
        c: r1(itemsToSeparate.reduce((s, i) => s + (i.c || 0), 0)),
        g: r1(itemsToSeparate.reduce((s, i) => s + (i.g || 0), 0)),
        time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
        rawInput: 'separado de comida anterior',
        hasMissingQuantity: false,
      };
      return [...updated, newEntry];
    });
    if (newEntry) {
      setMessages(m => [...m, {
        role: 'assistant', content: 'logged', isLogged: true,
        entryId: newEntry.id, quantityWarning: null, ts: Date.now()
      }]);
    }
  }, []);

  const useFavorite = (fav) => {
    haptic(12);
    // DAY favorite: replica TODAS las comidas del día como entries separadas
    if (fav.type === 'day' && Array.isArray(fav.days) && fav.days.length > 0) {
      const now = Date.now();
      const newEntries = fav.days.map((d, i) => ({
        id: now + i,
        meal: d.meal || 'comida',
        items: d.items || [],
        kcal: d.kcal || 0, p: d.p || 0, c: d.c || 0, g: d.g || 0,
        time: d.time || new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
        rawInput: `${fav.name} · ${d.meal || 'comida'}`
      }));
      setEntries(e => [...e, ...newEntries]);
      newEntries.forEach(ne => {
        setMessages(m => [...m, { role: 'assistant', content: 'logged', isLogged: true, entryId: ne.id, ts: Date.now() }]);
      });
      setActiveModal(null);
      return;
    }
    // MEAL favorite (default): una sola comida
    const newEntry = {
      id: Date.now(),
      meal: predictMealType(),
      items: fav.items,
      kcal: fav.kcal, p: fav.p, c: fav.c, g: fav.g,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      rawInput: fav.name
    };
    setEntries(e => [...e, newEntry]);
    setMessages(m => [...m, { role: 'assistant', content: 'logged', isLogged: true, entryId: newEntry.id, ts: Date.now() }]);
    setActiveModal(null);
  };

  // Memoize the rendered chat messages list so unrelated state changes
  // (opening/closing sheets, modals, animations) don't trigger re-iteration
  // of N messages. On mobile this is the difference between snappy and
  // 1-2s frozen UI.
  const renderedMessages = useMemo(() => messages.map((m, i) => (
    <div key={i} className="mb-3">
      <MessageBubble message={m} goals={goals} totals={totals}
        entries={entries}
        historyDetail={historyDetail}
        onEdit={handleEditEntry}
        onDelete={deleteEntry}
        onFavorite={addToFavorites}
        onAcceptFavSuggestion={handleAcceptFavSuggestion}
        onDismissFavSuggestion={handleDismissFavSuggestion}
        onAcceptAutoFav={acceptAutoFavorite}
        onDismissAutoFav={dismissAutoFavorite}
        favoriteIngredients={favoriteIngredients}
        onOpenPerformance={handleOpenPerformance}
        onSeparateAppended={separateAppendedItems}
        favoriteSignatures={favoriteSignatures}
        favSignature={favSignature}
        onOpenLearning={openLearning}
      />
    </div>
  )), [messages, goals, totals, entries, historyDetail, favoriteIngredients, favoriteSignatures, favSignature, handleEditEntry, deleteEntry, addToFavorites, handleAcceptFavSuggestion, handleDismissFavSuggestion, acceptAutoFavorite, dismissAutoFavorite, handleOpenPerformance, separateAppendedItems, openLearning]);

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG, fontFamily: FONT_UI }}>
        <Loader2 className="animate-spin" style={{ color: ACCENT }} size={28} />
      </div>
    );
  }

  // Plan en pausa/finalizado (lo controla el coach desde el CRM). Los datos
  // del cliente NO se tocan: al reactivarlo, entra con todo su avance.
  if (accessBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: BG, fontFamily: FONT_UI }}>
        <FontStyles />
        <div className="max-w-sm w-full p-7 rounded-3xl text-center" style={{
          background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 32px rgba(0,0,0,0.06)'
        }}>
          <div className="display mb-2" style={{ fontFamily: FONT_DISPLAY, fontSize: 30, textTransform: 'uppercase', color: TEXT, lineHeight: 1 }}>
            {accessBlocked === 'finalizado' ? 'Plan finalizado' : 'Plan en pausa'}
          </div>
          <div className="h-[2px] w-12 mx-auto mt-1 mb-4 rounded-full" style={{ background: ACCENT }} />
          <div className="text-[14px] mb-6" style={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
            {name ? name.split(' ')[0] + ', tu' : 'Tu'} plan está {accessBlocked === 'finalizado' ? 'finalizado' : 'en pausa'} por ahora.
            Todo tu historial y tu avance quedan guardados tal cual — escríbele a Mauro para reactivarlo y sigues donde ibas.
          </div>
          <button onClick={async () => { const a = await checkAccess(name); if (a.ok) setAccessBlocked(null); }}
            className="w-full py-3 rounded-2xl text-[14px] font-semibold active:scale-[0.98] transition"
            style={{ background: TEXT, color: '#fff' }}>
            Ya me reactivaron — reintentar
          </button>
        </div>
      </div>
    );
  }

  if (view === 'welcome') {
    return <Welcome
      onContinue={() => setView('onboarding')}
      onTutorial={() => setShowTutorial(true)}
      tutorialOpen={showTutorial}
      onCloseTutorial={() => setShowTutorial(false)} />;
  }

  if (view === 'onboarding') {
    return <Onboarding onComplete={(g, n) => {
      // Si ya tenía goals, es un "Cambiar meta", NO un onboarding inicial:
      // preservamos el historial del chat y solo agregamos una nota de cambio.
      // Si no había goals previas, es primer arranque: arrancamos el chat con
      // el saludo normal.
      // Cambio de vista PRIMERO — sin awaits previos. Antes el botón "Empezar"
      // se sentía congelado porque esperaba a localStorage antes de cambiar de
      // pantalla. Disparamos el setView en el mismo tick y dejamos las
      // escrituras a disco como fire-and-forget.
      // g llega null: el cliente YA NO define su meta — la carga el coach
      // desde el CRM (llegará por el sondeo con su anuncio). Si este nombre
      // ya tenía cuenta, la adopción por nombre traerá su meta y todo lo
      // demás en el pull inicial.
      if (n) setName(n);
      setView('main');
      setMessages([{
        role: 'assistant',
        content: n
          ? `${n.split(' ')[0]}, bienvenido. Tu coach te asignará tu meta nutricional y te avisaré aquí cuando llegue. Mientras tanto ya puedes contarme qué comes y lo voy registrando.`
          : 'Bienvenido. Tu coach te asignará tu meta nutricional y te avisaré aquí cuando llegue. Mientras tanto ya puedes contarme qué comes y lo voy registrando.',
        ts: Date.now()
      }]);
      if (n) window.storage.set('name', JSON.stringify(n)).catch(() => {});
    }}
    // Si ya hay metas, es un "Cambiar meta": se puede salir sin guardar nada.
    onCancel={goals && (goals.kcal || goals.p || goals.c || goals.g) ? () => setView('main') : undefined}
    existingGoals={goals} existingName={name} />;
  }

  const predictedMeal = predictMealType();

  // Callbacks estables para el InputBar memoizado. handleSend/startVoice/
  // stopVoice se recrean en cada render (cierran sobre todo el estado); el
  // patrón ref les da una identidad fija sin closures viejas, para que
  // InputBar NUNCA se re-renderice por un cambio ajeno a sus props.
  latestHandlersRef.current = { handleSend, startVoice, stopVoice };

  return (
    <div className="min-h-screen relative" style={{ background: BG, color: TEXT, fontFamily: FONT_UI }}>
      {/* Manchas orgánicas de fondo — SOLO gradientes radiales, sin filter:blur.
          Los radial-gradient ya son suaves por sí mismos; el blur de 70-95px
          sobre divs gigantes era el mayor costo de GPU en móvil y una de las
          causas de los congelamientos al abrir/cerrar overlays. Mismo look. */}
      <div className="fixed inset-0 pointer-events-none" style={{
        zIndex: 0,
        background: [
          `radial-gradient(55% 42% at 8% 0%, rgba(247,243,232,0.9), transparent 70%)`,
          `radial-gradient(48% 40% at 96% 12%, ${ACCENT_PASTEL}4D, transparent 70%)`,
          `radial-gradient(45% 38% at 22% 58%, ${C_PROTEIN_PASTEL}33, transparent 72%)`,
          `radial-gradient(50% 42% at 96% 94%, ${C_FAT_PASTEL}30, transparent 72%)`,
          `radial-gradient(55% 45% at 40% 102%, rgba(250,246,236,0.85), transparent 65%)`,
        ].join(', ')
      }} />
      <FontStyles />

      <style>{`
        .num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
        button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseRing { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .sheet-up { animation: sheetUp 0.32s cubic-bezier(0.2, 0, 0, 1); }
        /* X de cierre: halo gris instantáneo al press, sin transición. El usuario VE
           que el botón respondió incluso si el cierre demora un instante en propagar. */
        .active-x:active { background: rgba(0,0,0,0.18) !important; }
        .active-x:active svg { color: #000000 !important; }
        /* FAB Herramientas: invierte a oliva al press para que se vea instantáneo */
        .fab-press:active { background: ${ACCENT_DARK} !important; }
        @keyframes wave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1.4); } }
        .msg-input:empty:before { content: attr(data-placeholder); color: ${TEXT_LIGHT}; pointer-events: none; }
        .msg-input { -webkit-user-modify: read-write-plaintext-only; }
        .fade-up { animation: fadeUp 0.45s cubic-bezier(0.2, 0, 0, 1); }
        .pulse-ring { animation: pulseRing 1.5s ease-in-out infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, ${TEXT_MUTED} 0%, ${ACCENT} 50%, ${TEXT_MUTED} 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          animation: shimmer 2s linear infinite;
        }
        input, textarea, select {
          font-size: 16px !important;
          -webkit-text-size-adjust: 100%;
          -webkit-appearance: none;
          appearance: none;
          touch-action: manipulation;
        }
        html, body {
          -webkit-text-size-adjust: 100%;
          touch-action: manipulation;
          overscroll-behavior: none;
        }
      `}</style>

      {/* Background blobs removed for cleaner look */}

      {/* Header — full-width app bar (FIXED + visualViewport tracking).
          safe-area-inset-top: en la app instalada en el iPhone (Agregar a
          inicio) el contenido corre por DEBAJO del notch/cámara; este padding
          empuja la fila de la marca fuera de esa zona y el grafito del header
          rellena el hueco (se ve nativo). El ResizeObserver de headerH mide
          el alto CON este padding, así que la tarjeta de anillos y el
          contenido se acomodan solos. En navegador normal env() = 0. */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 w-full overflow-hidden" style={{
        background: '#1F1F1F',
        color: '#FFF',
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        zIndex: 50,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform'
      }}>
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{
          background: `radial-gradient(circle at 90% 30%, ${ACCENT}40, transparent 55%)`
        }} />
        <div className="relative max-w-2xl mx-auto px-3 py-3 flex items-center gap-2">
          {/* Marca en bloque: nombre arriba y "Entrena con Método" debajo en
              peso normal (sin ®: a este tamaño el símbolo se veía sucio).
              min-w-0 + truncate: la marca CEDE espacio antes que cortar los
              botones — en el iPhone 15 Pro Max el Reto quedaba fuera. */}
          <div className="min-w-0 flex-shrink" style={{ minWidth: '100px' }}>
            <div className="display font-normal truncate" style={{
              color: '#FFF',
              fontSize: '16px',
              lineHeight: 1,
              letterSpacing: '0.03em',
              textTransform: 'uppercase'
            }}>
              Meal Tracker
            </div>
            {/* Chiquito de verdad (7.5px, tracking corto): así "ENTRENA CON
                MÉTODO" entra COMPLETO bajo el nombre, sin cortarse nunca. */}
            <div style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400, fontSize: '7.5px', letterSpacing: '0.03em', marginTop: '3px', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
              Entrena con Método
            </div>
          </div>
          {/* Botones del header en GRID de columnas iguales: se reparten el
              ancho disponible y se encogen juntos — nunca se corta ninguno,
              en ningún teléfono. Superficie oscura sutil, radio generoso y
              el lima del ícono de la app como único acento. */}
          <div className="ml-auto grid gap-1.5 flex-shrink-0" style={{
            gridTemplateColumns: `repeat(${learningUrl ? 4 : 3}, minmax(0, 1fr))`,
            maxWidth: learningUrl ? '288px' : '218px',
            width: '100%',
            flexShrink: 1,
          }}>
            {[
              { key: 'recetario', label: 'Recetario', icon: BookOpen, title: 'Recetario',
                onClick: () => { haptic(8); if (!goals) { avisarMetaPendiente(); return; } setShowRecetario(true); } },
              ...(learningUrl ? [{ key: 'aprendizaje', label: 'Aprendizaje', icon: GraduationCap, title: 'Centro de recursos — tu material de aprendizaje',
                onClick: openLearning }] : []),
              { key: 'misemana', label: 'Mi semana', icon: CalendarCheck, title: 'Mi Semana — tu adherencia y desempeño',
                onClick: () => { haptic(8); if (!goals) { avisarMetaPendiente(); return; } setShowPerformanceModal(true); } },
              { key: 'reto', label: 'Reto', icon: Mountain, title: 'Camino a la Cima — ranking del reto',
                onClick: () => { haptic(8); window.location.href = '/ranking'; } },
            ].map(b => (
              <button key={b.key} onClick={b.onClick} title={b.title}
                className="flex flex-col items-center justify-center gap-1 px-1 py-2 min-w-0 active:scale-95 transition"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '16px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                  color: '#FFF'
                }}>
                {/* Crema monocromo, como la M del logo — el lima vivo en los
                    íconos se veía "Android barato"; el premium es sobrio. */}
                <b.icon size={18} strokeWidth={2} style={{ color: '#F9F7F1' }} />
                <span className="text-[9px] font-medium leading-none truncate max-w-full" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: '0.01em' }}>{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showRecetario && goals && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: BG }}>
            <Loader2 className="animate-spin" style={{ color: ACCENT }} size={26} />
          </div>
        }>
          <Recetario
            goals={goals}
            consumed={totals}
            onClose={() => setShowRecetario(false)}
            onRegister={registerRecipeEntry}
          />
        </Suspense>
      )}

      {/* SCROLLER interno del chat (la página no scrollea). inset-0 + max-w
          centrado; el padding-top empuja el contenido bajo el header/tarjeta
          fijos. Los hijos con position:fixed (tarjeta de anillos) siguen
          anclados al viewport porque este contenedor no tiene transform. */}
      <div ref={chatScrollRef} className="fixed inset-0 max-w-2xl mx-auto px-5 pb-32 overflow-y-auto" style={{
        zIndex: 1,
        paddingTop: `${headerH + (cardCompact ? 56 : 158) + (paymentDue ? 62 : 0) + (pushPrompt ? 58 : 0)}px`,
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}>

        {/* Goals card — FIXED + visualViewport tracking. top = altura real
            del header + separación, para que NUNCA quede debajo de él. */}
        <div ref={goalsCardRef} className="fixed left-0 right-0" style={{
          top: `${headerH + 6}px`,
          paddingLeft: '20px', paddingRight: '20px',
          paddingTop: cardCompact ? '4px' : '8px',
          paddingBottom: cardCompact ? '6px' : '12px',
          background: `linear-gradient(180deg, ${BG} 0%, rgba(249,247,241,0.92) 80%, rgba(249,247,241,0.6) 100%)`,
          transition: 'padding 0.25s cubic-bezier(0.2, 0, 0, 1)',
          transform: 'translate3d(0, 0, 0)',
          zIndex: 30,
          willChange: 'transform'
        }}>
        <div className="max-w-2xl mx-auto">
        {/* La tarjeta ya NO abre Desempeño al tocar cualquier parte: los
            anillos/círculos explican su macro y "Ver desempeño" (su propia
            etiqueta) es lo ÚNICO que abre el panel — cada tap hace lo que
            dice. */}
        <div className="rounded-3xl relative" style={{
          padding: cardCompact ? '8px 12px' : '16px',
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 8px 28px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          overflow: 'hidden',
          transition: 'padding 0.25s cubic-bezier(0.2, 0, 0, 1)'
        }}>
          {/* Subtle organic blob inside the card — gradiente puro, sin blur */}
          <div className="absolute pointer-events-none" style={{
            top: '-30%', right: '-20%', width: '60%', height: '120%',
            background: `radial-gradient(circle, ${ACCENT_PASTEL}30, transparent 65%)`
          }} />
          <div className="relative">
          {/* La meta nutricional la administra el COACH desde el CRM: el
              cliente ya no tiene botón de "Cambiar meta". Cuando el coach la
              actualiza, llega el anuncio al chat automáticamente. */}
          {!cardCompact && (
            <div className="text-center mb-3">
              <div className="text-[11px] tracking-[0.05em] uppercase font-semibold" style={{ color: TEXT_LIGHT }}>
                Hoy · <span className="capitalize" style={{ color: TEXT_MUTED }}>{formatDate(today)}</span>
                {streak >= 2 && (
                  <>
                    <span style={{ color: TEXT_LIGHT, margin: '0 6px' }}>·</span>
                    <span style={{ color: ACCENT_DARK, fontWeight: 600 }}>{streak} días seguidos</span>
                    <span style={{ color: ACCENT, marginLeft: 4 }}>●</span>
                  </>
                )}
              </div>
            </div>
          )}

          {!goals ? (
            // Cliente nuevo SIN meta: la define el coach desde el CRM. La app
            // funciona igual (registra comida y lleva totales); los anillos
            // aparecen solos cuando la meta llegue con su anuncio.
            <div className="text-center py-2">
              <div className="text-[13px] font-semibold" style={{ color: TEXT }}>🎯 Tu coach está preparando tu meta nutricional</div>
              <div className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>
                Te avisaré aquí cuando llegue. Mientras tanto cuéntame qué comes y voy llevando tus totales{totals.kcal > 0 ? ` — hoy: ${Math.round(totals.kcal)} kcal · P${Math.round(totals.p)} C${Math.round(totals.c)} G${Math.round(totals.g)}` : ''}.
              </div>
            </div>
          ) : cardCompact ? (
            <>
              <div className="flex items-center justify-between gap-2">
                {[
                  { k: 'kcal', el: <CompactMacro val={totals.kcal} goal={goals.kcal} color={ACCENT} label="kcal" /> },
                  { k: 'p', el: <CompactMacro val={totals.p} goal={goals.p} color={C_PROTEIN} label="P" unit="g" /> },
                  { k: 'c', el: <CompactMacro val={totals.c} goal={goals.c} color={C_CARBS} label="C" unit="g" /> },
                  { k: 'g', el: <CompactMacro val={totals.g} goal={goals.g} color={C_FAT} label="G" unit="g" /> },
                ].map(({ k, el }) => (
                  <div key={k} onClick={() => { haptic(6); setMacroTip(t => t === k ? null : k); }}>{el}</div>
                ))}
              </div>
              {macroTip && MACRO_INFO[macroTip] && (
                <div className="text-[10.5px] text-center mt-1.5 px-1 fade-up" style={{ color: TEXT_MUTED, lineHeight: 1.35 }}>
                  <strong style={{ color: macroTip === 'kcal' ? ACCENT_DARK : macroTip === 'p' ? C_PROTEIN : macroTip === 'c' ? '#9C7C3C' : C_FAT }}>{MACRO_INFO[macroTip].t}</strong> {MACRO_INFO[macroTip].d}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Tocar un ANILLO explica ese macro (línea bajo los anillos);
                  el botón "Mi semana" de abajo es lo único que abre el panel. */}
              <div className="grid grid-cols-4 gap-1">
                {[
                  { k: 'kcal', ring: <GlassRing val={totals.kcal} goal={goals.kcal} color={ACCENT} label="Calorías" unit="" /> },
                  { k: 'p', ring: <GlassRing val={totals.p} goal={goals.p} color={C_PROTEIN} label="Proteína" unit="g" /> },
                  { k: 'c', ring: <GlassRing val={totals.c} goal={goals.c} color={C_CARBS} label="Carbos" unit="g" /> },
                  { k: 'g', ring: <GlassRing val={totals.g} goal={goals.g} color={C_FAT} label="Grasas" unit="g" /> },
                ].map(({ k, ring }) => (
                  <div key={k} onClick={(e) => { e.stopPropagation(); haptic(6); setMacroTip(t => t === k ? null : k); }}>
                    {ring}
                  </div>
                ))}
              </div>
              {macroTip && MACRO_INFO[macroTip] && (
                <div className="text-[11px] text-center mt-2 px-2 fade-up" style={{ color: TEXT_MUTED, lineHeight: 1.4 }}>
                  <strong style={{ color: macroTip === 'kcal' ? ACCENT_DARK : macroTip === 'p' ? C_PROTEIN : macroTip === 'c' ? '#9C7C3C' : C_FAT }}>{MACRO_INFO[macroTip].t}</strong> {MACRO_INFO[macroTip].d}
                </div>
              )}
              {/* El acceso a "Mi Semana" vive SOLO en el header — tenerlo
                  también aquí era redundante. El espacio se lo llevan los
                  anillos, que ahora son más grandes. */}
            </>
          )}
          </div>
        </div>
        {/* Recordatorio de pago — vive en la zona FIJA bajo la tarjeta de
            anillos para que SIEMPRE se vea. (Antes estaba arriba de todo el
            historial del chat y el auto-scroll al último mensaje lo dejaba
            fuera de pantalla: se renderizaba pero nadie lo veía.) Fuera de
            la conversación, y desaparece solo al marcar el pago en el CRM. */}
        {paymentDue && (
          <div className="fade-up" style={{
            marginTop: '6px',
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px',
            borderRadius: '14px',
            background: 'linear-gradient(180deg, #FDF6E3 0%, #FBEFCF 100%)',
            border: '1px solid #EBD9A6',
            boxShadow: '0 4px 14px rgba(180,140,20,0.14)',
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>💳</span>
            <div style={{ fontSize: '12px', color: '#6B5A22', lineHeight: 1.35, minWidth: 0 }}>
              <strong style={{ color: '#8A6D16' }}>Recordatorio de pago:</strong> tu fecha de corte fue el {paymentDue.dia_corte} de {new Date().toLocaleDateString('es', { month: 'long' })}. Recuerda efectuar el pago mensual del programa{paymentDue.monto ? (
                <> (<strong style={{ color: '#8A6D16' }}>{
                  (() => { try {
                    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: paymentDue.moneda || 'COP', maximumFractionDigits: 0 }).format(paymentDue.monto);
                  } catch (e) { return `${paymentDue.monto} ${paymentDue.moneda || ''}`.trim(); } })()
                }</strong>)</>
              ) : null}.
            </div>
          </div>
        )}
        {/* Invitación a activar recordatorios push — misma zona fija del
            banner de pago; si ambos aplican se apilan (el cliente en deuda
            también necesita poder activar sus recordatorios). El permiso se
            pide SOLO al tocar "Activar" (regla de iOS: gesto del usuario). */}
        {pushPrompt && (
          <div className="fade-up" style={{
            marginTop: '6px',
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 4px 14px rgba(60,70,50,0.12)',
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>🔔</span>
            <div className="flex-1 min-w-0" style={{ fontSize: '12px', color: TEXT_MUTED, lineHeight: 1.3 }}>
              <strong style={{ color: TEXT }}>Recordatorios del día</strong> — te avisamos para que ningún registro se te pase.
            </div>
            <button onClick={activarPush} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold active:scale-95 transition"
              style={{ background: '#1F1F1F', color: '#FFF' }}>
              Activar
            </button>
            <button onClick={posponerPush} className="flex-shrink-0 px-2 py-1.5 text-[11px] font-medium active:scale-95 transition"
              style={{ color: TEXT_LIGHT }}>
              Luego
            </button>
          </div>
        )}
        </div>
        </div>

        {/* Action FAB — onPointerDown para abrir al primer touchstart (sin esperar el click sintético
            de iOS Safari, que en este árbol grande agrega ~300ms perceptibles). Subido a bottom:120px
            para no rozar la barra de entrada. */}
        <button
          ref={actionsFabRef}
          onPointerDown={(e) => { e.preventDefault(); openActionsSheet(); }}
          onClick={(e) => e.preventDefault()}
          className="fixed z-40 rounded-full active:scale-90 fab-press items-center justify-center gap-1.5"
          style={{
            display: actionsExpanded ? 'none' : 'flex',
            // Separado de la barra de texto: pegado (120px) los taps durante
            // el scroll caían en la barra y el botón "no respondía". El
            // safe-area suma el alto del home-indicator en la app instalada.
            bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
            right: '20px',
            height: '46px',
            padding: '0 16px 0 14px',
            background: '#1F1F1F',
            color: '#fff',
            boxShadow: '0 6px 20px rgba(0,0,0,0.22), 0 2px 4px rgba(0,0,0,0.10)',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent'
          }}
          title="Herramientas y acciones">
          {/* LayoutGrid (cuadrícula de opciones) en crema: la estrellita
              parecía botón de IA y la tuerca sonaba a configuración. */}
          <LayoutGrid size={16} strokeWidth={2} style={{ color: '#F9F7F1' }} />
          <span className="text-[13px] font-semibold tracking-wide">Herramientas</span>
        </button>

        {/* Bottom sheet — actions (always mounted to keep close instant on mobile) */}
        {(() => {
          const anyModalOpen = showWellbeingModal || showIngredientsModal || showPlannerModal || showPerformanceModal || showCapabilitiesModal || activeModal || editingEntry !== null || pendingFavoriteEntry;
          const visible = actionsExpanded && !anyModalOpen;
          return (
          <div
            ref={actionsSheetRef}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{
              background: 'rgba(0,0,0,0.45)',
              display: visible ? 'flex' : 'none',
              contain: 'strict'
            }}
            onClick={() => { haptic(6); closeActionsSheet(); }}>
            <div
              className={`w-full max-w-md rounded-t-3xl px-4 pt-2 ${visible ? 'sheet-up' : ''}`}
              style={{
                background: BG,
                boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
                paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
                maxHeight: '78vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}>
              {/* Grabber */}
              <div className="flex justify-center mb-2">
                <div className="h-1 w-10 rounded-full" style={{ background: BORDER }} />
              </div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <div className="text-[10px] tracking-[0.05em] uppercase font-semibold" style={{ color: ACCENT }}>Acciones</div>
                  <div className="text-[15px] font-bold" style={{ color: TEXT, letterSpacing: '-0.01em' }}>¿Qué quieres hacer?</div>
                </div>
                {/* Cierre: X usando onPointerDown (touchstart inmediato) + feedback visual
                    visible al press (scale-90 + halo gris). El cierre real está optimizado
                    con DOM-mutation directo en closeActionsSheet. */}
                <button
                  onPointerDown={(e) => { e.preventDefault(); swallowGhostClick(); closeActionsSheet(); }}
                  onClick={(e) => e.preventDefault()}
                  aria-label="Cerrar"
                  className="p-2 rounded-full active:scale-90 active-x"
                  style={{
                    background: SURFACE_2,
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent'
                  }}>
                  <X size={16} style={{ color: TEXT_MUTED }} />
                </button>
              </div>
              {/* Iconos de LÍNEA (lucide, como el onboarding del centro de
                  recursos) en insignias circulares, cada uno con su tono de
                  la paleta de la app — se acabaron los emojis repetidos en
                  el mismo pastel. Menos chips: "Aprendizaje" vive en el
                  header y "¿Qué puedo hacer?" en el chat. */}
              <div className="space-y-2.5">
                <div>
                  <div className="text-[10px] tracking-[0.04em] uppercase font-bold mb-1.5 px-1" style={{ color: TEXT_MUTED }}>Día a día</div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionChipMini icon={<ChefHat size={15} strokeWidth={2.2} />} label="Arma mi día" pastel={ACCENT_PASTEL} color={ACCENT_DARK}
                      onClick={() => { haptic(8); setShowPlannerModal(true); generatePlan(); }} />
                    <ActionChipMini icon={<Repeat size={15} strokeWidth={2.2} />} label="Repetir comida de ayer" pastel={C_FAT_PASTEL} color={C_FAT}
                      onClick={() => { haptic(8); repeatYesterday(); setActionsExpanded(false); }} />
                    <ActionChipMini icon={<Star size={15} strokeWidth={2.2} />} label="Menús favoritos" pastel={C_CARBS_PASTEL} color="#9C7C3C"
                      onClick={() => { haptic(8); setActiveModal('favorites'); }} />
                    <ActionChipMini icon={<ShoppingBasket size={15} strokeWidth={2.2} />} label="Mis ingredientes" pastel={C_PROTEIN_PASTEL} color={C_PROTEIN}
                      onClick={() => { haptic(8); setShowIngredientsModal(true); }} />
                    <ActionChipMini icon={<Pin size={15} strokeWidth={2.2} />} label="Guardar día como favorito" pastel="#D6E8F1" color="#3F81A6"
                      onClick={() => { haptic(8); closeActionsSheet(); requestAnimationFrame(() => requestAnimationFrame(() => saveDayAsFavorite())); }} />
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.04em] uppercase font-bold mb-1.5 px-1" style={{ color: TEXT_MUTED }}>Tu progreso</div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionChipMini icon={<BarChart3 size={15} strokeWidth={2.2} />} label="Mi Semana" pastel={ACCENT_PASTEL} color={ACCENT_DARK}
                      onClick={() => { haptic(8); setShowPerformanceModal(true); }} />
                    <ActionChipMini icon={<FileText size={15} strokeWidth={2.2} />} label="Resumen del día" pastel={C_FAT_PASTEL} color={C_FAT}
                      onClick={() => { haptic(8); closeActionsSheet(); handleSend('ver resumen diario'); }} />
                    <ActionChipMini icon={<Calendar size={15} strokeWidth={2.2} />} label="Calendario" pastel="#D6E8F1" color="#3F81A6"
                      onClick={() => { haptic(8); setActiveModal('calendar'); }} />
                    <ActionChipMini icon={<Scale size={15} strokeWidth={2.2} />} label="Ayuda con proporciones" pastel={C_PROTEIN_PASTEL} color={C_PROTEIN}
                      onClick={() => { haptic(8); closeActionsSheet(); inputApiRef.current?.setText('Ayúdame con proporciones, tengo: '); }} />
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.04em] uppercase font-bold mb-1.5 px-1" style={{ color: TEXT_MUTED }}>Ajustes</div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionChipMini icon={<RotateCcw size={15} strokeWidth={2.2} />} label="Reiniciar día" pastel="#E5E2D5" color={TEXT_MUTED}
                      onClick={() => { haptic(8); setActiveModal('reset'); }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Chat — sin wrapper, flota sobre el fondo general crema con blobs */}
        <div ref={scrollRef} className="space-y-3 mb-6 relative" style={{ paddingBottom: keyboardOpen ? '120px' : '20px', contain: 'layout paint', willChange: 'transform' }}>
          {/* Editorial hand-drawn food silhouettes — thin organic lines */}
          <div className="absolute inset-0 pointer-events-none select-none" style={{
            backgroundImage: FOOD_SILHOUETTES_BG_URL,
            backgroundRepeat: 'repeat',
            backgroundSize: '280px 280px'
          }} />
          <div className="relative">
            {renderedMessages}
            {loading && (
              <div className="flex items-center gap-2 text-sm px-4 py-3">
                <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} />
                <span className="shimmer-text font-medium">{loadingPreview || 'Procesando…'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input bar */}
      {/* Jump-to-latest floating arrow — appears when scrolled away from bottom */}
      {showJumpToLatest && (
        <button
          onClick={() => { haptic(6); const sc = chatScrollRef.current; if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); }}
          className="fixed z-40 rounded-full transition active:scale-95 flex items-center justify-center"
          style={{
            bottom: keyboardOpen ? '156px' : 'calc(200px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '40px',
            height: '40px',
            background: 'rgba(255,255,255,0.95)',
            color: TEXT,
            boxShadow: '0 6px 18px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) inset'
          }}
          title="Ir al último mensaje">
          <ChevronDown size={18} strokeWidth={2.2} style={{ color: TEXT_MUTED }} />
        </button>
      )}

      <InputBar
        barRef={inputBarRef}
        apiRef={inputApiRef}
        hidden={actionsExpanded}
        recording={recording}
        transcribing={transcribing}
        loading={loading}
        predictedMeal={predictedMeal}
        onSend={stableSend}
        onStartVoice={stableStartVoice}
        onStopVoice={stableStopVoice}
        onFocusInput={stableFocusInput}
      />

      {/* Deshacer — visible 6s después de registrar. Un tap revierte la(s)
          entrada(s) recién creadas y sus burbujas del chat. */}
      {undoInfo && (
        <div className="fixed left-1/2 z-50 fade-up" style={{ transform: 'translateX(-50%)', bottom: keyboardOpen ? '160px' : '178px' }}>
          <button
            onClick={performUndo}
            className="flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full active:scale-95"
            style={{ background: '#1F1F1F', color: '#fff', boxShadow: SHADOW_RAISED }}>
            <RotateCcw size={14} strokeWidth={2.2} />
            <span className="text-[13px] font-semibold">Deshacer registro</span>
          </button>
        </div>
      )}

      {activeModal === 'reset' && (
        <ConfirmModal
          title="Reiniciar el día"
          body="Se borra el registro de hoy. La acción es definitiva."
          confirmLabel="Sí, reiniciar"
          onConfirm={() => {
            haptic([15, 30, 15]);
            setEntries([]); setWater(0); setPerfectDayShown(false);
            setActiveModal(null);
            setMessages(m => [...m, { role: 'assistant', content: 'Limpio. Empezamos de nuevo.', ts: Date.now() }]);
          }}
          onCancel={() => setActiveModal(null)} />
      )}

      {activeModal === 'weekly' && (
        <WeeklyModal history={history} goals={goals} onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'calendar' && (
        <CalendarModal
          history={history} historyDetail={historyDetail} goals={goals}
          today={today} todayEntries={entries} todayWater={water}
          onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'favorites' && (
        <FavoritesModal
          favorites={favorites}
          onUse={useFavorite}
          onRename={renameFavorite}
          onDelete={(id) => {
            haptic(10);
            setFavorites(f => f.filter(x => x.id !== id));
            // Lápida: registra el borrado explícito para que el favorito no
            // "resucite" desde el server ni desde otro dispositivo.
            setFavoritesDeleted(t => t.includes(id) ? t : [...t, id].slice(-300));
          }}
          onClose={() => setActiveModal(null)} />
      )}

      {pendingFavoriteEntry && (
        <FavoriteNameModal
          entry={pendingFavoriteEntry}
          todayEntriesCount={entries.length}
          onConfirm={(name) => confirmFavorite(name)}
          onCancel={() => setPendingFavoriteEntry(null)}
          onSaveWholeDay={(name) => saveDayAsFavorite(name)} />
      )}

      {activeModal === 'perfect' && (
        <PerfectDayModal
          name={name} totals={totals} goals={goals}
          onClose={() => setActiveModal(null)} />
      )}

      {editingEntry !== null && (
        <EditEntryModal
          entry={entries.find(e => e.id === editingEntry)}
          onSave={(updated) => {
            haptic(12);
            setEntries(es => es.map(e => e.id === editingEntry ? updated : e));
            setEditingEntry(null);
          }}
          onDelete={() => deleteEntry(editingEntry)}
          onClose={() => setEditingEntry(null)} />
      )}

      {showWellbeingModal && (
        <WellbeingModal
          name={name}
          existing={wellbeing[today]}
          onSave={saveWellbeing}
          onClose={() => setShowWellbeingModal(false)} />
      )}

      {showIngredientsModal && (
        <IngredientsModal
          ingredients={favoriteIngredients}
          onSave={(list) => { setFavoriteIngredients(list); setShowIngredientsModal(false); }}
          onClose={() => setShowIngredientsModal(false)} />
      )}

      {showPlannerModal && (
        <PlannerModal
          loading={plannerLoading}
          proposal={plannerProposal}
          ingredients={favoriteIngredients}
          onRegenerate={generatePlan}
          onRegister={registerPlan}
          onSaveFavorite={savePlanAsFavorite}
          onEditIngredients={() => { setShowPlannerModal(false); setShowIngredientsModal(true); }}
          onClose={() => { setShowPlannerModal(false); setPlannerProposal(null); }} />
      )}

      {showPerformanceModal && goals && (
        <PerformanceModal
          history={history}
          historyDetail={historyDetail}
          entries={entries}
          goals={goals}
          today={today}
          name={name}
          wellbeing={wellbeing}
          training={trainingWeek}
          goalsHistory={goalsHistory}
          onClose={() => setShowPerformanceModal(false)} />
      )}

      {showCapabilitiesModal && (
        <CapabilitiesModal onClose={() => setShowCapabilitiesModal(false)} />
      )}

      {/* Cloud sync consent — solo una vez, cuando el cliente entró por primera vez al main */}
      {view === 'main' && cloudConsent === null && (
        <CloudConsentModal onAccept={acceptCloudConsent} onDecline={declineCloudConsent} />
      )}
    </div>
  );
}

function CloudConsentModal({ onAccept, onDecline }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-md p-6 rounded-3xl" style={{ background: SURFACE, border: `1px solid ${BORDER}`, fontFamily: FONT_UI }}>
        <div className="text-[11px] tracking-[0.05em] uppercase font-semibold mb-2" style={{ color: ACCENT }}>Tu progreso a salvo</div>
        <div className="text-[18px] font-bold mb-3" style={{ color: TEXT, letterSpacing: '-0.01em' }}>
          Guardá tu progreso en la nube
        </div>
        <div className="text-[13px] mb-3 leading-relaxed" style={{ color: TEXT_MUTED }}>
          A partir de hoy, tus favoritos, ingredientes y registros se guardan también en la nube. Así no los pierdes si cambias de teléfono o se borra la caché del navegador.
        </div>
        <div className="text-[13px] mb-3 leading-relaxed" style={{ color: TEXT_MUTED }}>
          Vas a poder consultar tus tableros de desempeño desde cualquier dispositivo. Y tu coach podrá ver tu progreso en vivo para acompañarte mejor.
        </div>
        <div className="text-[11px] mb-5 leading-relaxed" style={{ color: TEXT_LIGHT }}>
          Tus datos se guardan en servidores seguros y se usan únicamente para mostrarte tu progreso y para que tu coach te acompañe. No compartimos tu información con terceros. Al tocar Aceptar autorizas su tratamiento con esos fines. Puedes seguir usando la app sin aceptar, pero tus datos solo quedarán en este teléfono.
        </div>
        <div className="flex gap-2">
          <button onClick={onDecline} className="flex-1 py-3 rounded-full text-sm font-medium" style={{ background: SURFACE_2, color: TEXT }}>
            Ahora no
          </button>
          <button onClick={onAccept} className="flex-1 py-3 rounded-full text-sm font-semibold" style={{ background: ACCENT, color: '#fff' }}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

function composeDayOpening(name, yesterday, goals, opts = {}) {
  const { gapDays = 1, hour = new Date().getHours() } = opts;
  const firstName = name ? name.split(' ')[0] : '';
  const hi = firstName ? `Hola ${firstName}.` : 'Hola.';

  // Recovery: 2+ días sin usar la app. Sin culpa, sin arrastrar déficit.
  if (gapDays >= 2) {
    const dStr = gapDays >= 7 ? 'una semana' : `${gapDays} días`;
    return `${hi} Pasaron ${dStr} desde tu último registro. Retomamos hoy desde cero, sin arrastrar nada de antes. Cuando quieras, cuéntame qué comiste.`;
  }

  if (!yesterday || !goals) {
    return `${hi} Empecemos. Cuéntame qué comiste o pregúntame las calorías de cualquier alimento. También puedo organizar tu día con los ingredientes que te gustan.`;
  }

  const timePhrase = hour < 11 ? 'Arrancamos el día.' : hour < 16 ? 'Seguimos con el día.' : 'Cerramos bien el día.';

  // Cliente aún SIN meta (la define el coach): saludo sin comparar contra
  // metas que no existen.
  if (!goals || !goals.kcal) {
    return `${hi} ${timePhrase} Tu coach aún está preparando tu meta nutricional — te avisaré aquí cuando llegue. Mientras tanto cuéntame qué comes y lo registro.`;
  }

  const tolerance = 0.05;
  const inRange = (val, goal) => val >= goal * (1 - tolerance) && val <= goal * (1 + tolerance);
  const pDiff = goals.p - yesterday.p;
  const cDiff = goals.c - yesterday.c;
  const gDiff = goals.g - yesterday.g;

  let dayNote;
  if (yesterday.kcal === 0) {
    dayNote = 'Ayer no quedó registro; hoy lo retomamos.';
  } else if (inRange(yesterday.kcal, goals.kcal) && inRange(yesterday.p, goals.p) &&
      inRange(yesterday.c, goals.c) && inRange(yesterday.g, goals.g)) {
    dayNote = 'Ayer cerraste alineado con tus cuatro metas.';
  } else {
    const offBy = [
      { name: 'proteína', diff: pDiff, abs: Math.abs(pDiff), unit: 'g' },
      { name: 'carbohidratos', diff: cDiff, abs: Math.abs(cDiff), unit: 'g' },
      { name: 'grasas', diff: gDiff, abs: Math.abs(gDiff), unit: 'g' },
    ].sort((a, b) => b.abs - a.abs)[0];
    if (offBy.abs < 10) {
      dayNote = 'Ayer cerraste muy cerca de tus metas.';
    } else if (offBy.diff > 0) {
      dayNote = `Ayer la ${offBy.name} quedó ${offBy.abs}${offBy.unit} por debajo; hoy la priorizamos desde el desayuno.`;
    } else {
      dayNote = `Ayer la ${offBy.name} quedó ${offBy.abs}${offBy.unit} por encima; hoy la moderamos.`;
    }
  }
  return `${hi} ${timePhrase} ${dayNote}`;
}

// ─── Barra de entrada AISLADA ────────────────────────────────────────────
// El texto que el cliente escribe vive AQUÍ, no en el componente padre.
// Antes, cada tecla disparaba setInput en el padre y re-renderizaba las
// 6.000 líneas de MealTracker — ese era el lag al teclear. Ahora teclear
// solo re-renderiza este componente chico. El padre lee/escribe el texto
// vía `apiRef` (getText/setText/appendText/clear).
const InputBar = memo(function InputBar({
  barRef, apiRef, hidden, recording, transcribing, loading, predictedMeal,
  onSend, onStartVoice, onStopVoice, onFocusInput,
}) {
  const [text, setText] = useState('');
  const divRef = useRef(null);

  const writeDom = useCallback((value) => {
    const el = divRef.current;
    if (!el) return;
    if (!value) {
      // Clear fully (browsers leave a <br> that would break the :empty placeholder)
      if (el.innerHTML !== '') el.innerHTML = '';
    } else if ((el.textContent || '') !== value) {
      el.textContent = value;
      // Move caret to the end if the element is focused
      if (document.activeElement === el) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, []);

  useEffect(() => {
    apiRef.current = {
      getText: () => divRef.current?.textContent || '',
      setText: (value) => { writeDom(value); setText(value || ''); },
      appendText: (value) => {
        const prev = (divRef.current?.textContent || '').trim();
        const next = prev ? `${prev} ${value}` : value;
        writeDom(next); setText(next);
      },
      clear: () => { writeDom(''); setText(''); },
    };
    return () => { apiRef.current = null; };
  }, [apiRef, writeDom]);

  const send = () => {
    const value = (divRef.current?.textContent || '').trim();
    if (!value) return;
    writeDom(''); setText('');
    onSend(value);
  };

  return (
    <div ref={barRef} className="fixed bottom-0 left-0 right-0 px-4 pt-6 z-40" style={{
      background: `linear-gradient(180deg, transparent, ${BG}E6 30%, ${BG} 100%)`,
      paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      display: hidden ? 'none' : 'block'
    }}>
      <div className="max-w-2xl mx-auto">
        {/* Voice waveform when recording */}
        {recording && (
          <div className="flex items-center justify-center gap-1 mb-2 h-6">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} style={{
                width: '3px',
                height: '100%',
                background: C_PROTEIN,
                borderRadius: '2px',
                animation: `wave 0.9s ease-in-out ${i * 0.08}s infinite`,
                transformOrigin: 'center'
              }} />
            ))}
          </div>
        )}
        {text.trim() && !text.toLowerCase().match(/desayuno|almuerzo|cena|snack|reiniciar|cambiar|resumen|semanal|calendario|favoritos|proporciones|agua|cuántas|cuanto|cuánto/) && (
          <div className="text-[10px] text-center mb-2 px-3 py-1 rounded-full inline-block" style={{
            background: ACCENT_PASTEL + '60', color: ACCENT_DARK, fontWeight: 500
          }}>
            → se registrará como {predictedMeal}
          </div>
        )}
        <div className="flex items-center gap-2 p-2 rounded-2xl" style={{
          background: SURFACE,
          border: `1px solid ${recording ? C_PROTEIN : BORDER}`,
          boxShadow: recording ? `0 0 0 3px ${C_PROTEIN}25, 0 8px 32px rgba(0,0,0,0.08)` : '0 8px 32px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
          transition: 'border 0.2s, box-shadow 0.2s'
        }}>
          {/* contenteditable instead of <input>. Atributos defensivos para minimizar
              la barra de AutoFill de iOS (key/credit/location) que en iOS 17+ aparece
              ocasionalmente en contenteditable. */}
          {/* NO uso role="textbox" ni aria-multiline — esos atributos hacen que iOS
              Safari trate al elemento como "campo de formulario" y muestre la barra
              de asistente (chevrons arriba/abajo + ícono teclado) flotando sobre
              el input. Sin esos atributos, iOS lo trata como contenido editable
              "neutro" y la barra desaparece en muchos casos. En modo PWA
              (agregado a inicio) directamente no aparece nunca. */}
          <div
            ref={divRef}
            contentEditable={!recording && !transcribing}
            suppressContentEditableWarning={true}
            data-placeholder={recording ? 'Escuchando…' : transcribing ? 'Transcribiendo…' : 'Dicta o escribe lo que comiste…'}
            onInput={(e) => setText(e.currentTarget.textContent || '')}
            onFocus={onFocusInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
                send();
              }
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck="false"
            inputMode="text"
            enterKeyHint="send"
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            className="msg-input flex-1 bg-transparent px-3 py-3 outline-none"
            style={{ color: TEXT, fontSize: '16px', minHeight: '24px', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          />
          {/* Voice is the PRIMARY action (grafito, prominent). Send only appears when there's text. */}
          <button
            type="button"
            onClick={recording ? onStopVoice : onStartVoice}
            disabled={transcribing}
            className="rounded-xl transition active:scale-[0.95] disabled:opacity-60 shrink-0 flex items-center justify-center"
            style={{
              width: '46px', height: '46px',
              background: recording ? C_PROTEIN : '#1F1F1F',
              color: '#fff',
              boxShadow: recording ? `0 0 0 3px ${C_PROTEIN}30` : '0 2px 8px rgba(0,0,0,0.18)',
              transition: 'background 0.2s, box-shadow 0.2s'
            }}
            title={recording ? 'Detener dictado' : transcribing ? 'Transcribiendo…' : 'Dictar por voz'}>
            {transcribing
              ? <Loader2 size={20} strokeWidth={2} className="animate-spin" />
              : <Mic size={20} strokeWidth={2} className={recording ? 'pulse-ring' : ''} style={{ color: '#F9F7F1' }} />}
          </button>
          {text.trim() && !recording && (
            <button
              type="button"
              onClick={send}
              disabled={loading}
              className="rounded-xl transition disabled:opacity-30 active:scale-[0.95] shrink-0 flex items-center justify-center fade-up"
              style={{ width: '46px', height: '46px', background: '#1F1F1F', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}
              title="Enviar">
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function FontStyles() {
  // Las fuentes (Inter + Bebas Neue) ahora se importan self-hosted en
  // src/main.jsx vía @fontsource — sin @import a Google Fonts que bloqueaba
  // el primer pintado.
  return (
    <style>{`
      body, * { font-family: ${FONT_UI}; -webkit-font-smoothing: antialiased; }
      .display { font-family: ${FONT_DISPLAY}; letter-spacing: 0.01em; }
    `}</style>
  );
}

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateShort(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

// True Apple-style glass ring — the chart is the focal element
function CompactMacro({ val, goal, color, label, unit = '' }) {
  const pct = goal > 0 ? Math.min(1, val / goal) : 0;
  const size = 28;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  const center = size / 2;
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <svg width={size} height={size} className="flex-shrink-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeOpacity="0.18" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </g>
      </svg>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold leading-tight" style={{ color: TEXT_LIGHT }}>{label}</div>
        <div className="text-[12px] font-bold num leading-tight" style={{ color: TEXT, letterSpacing: '-0.01em' }}>
          {Math.round(val)}{unit}
        </div>
      </div>
    </div>
  );
}

function GlassRing({ val, goal, color, label, unit = 'g' }) {
  // SVG con viewBox + texto DENTRO del SVG: el anillo escala con el ancho de su
  // celda (grid-cols-4), así nunca se apiña ni se corta en teléfonos angostos.
  const size = 88;
  const stroke = 5.5;
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = goal > 0 ? Math.min(1, val / goal) : 0;
  const dash = circ * pct;
  return (
    <div className="flex flex-col items-center min-w-0 w-full">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: 'auto', maxWidth: size, display: 'block' }}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeOpacity="0.14" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
        </g>
        <text x={center} y={center - 1} textAnchor="middle" dominantBaseline="middle" className="num" style={{ fontWeight: 700, fontSize: 20, fill: TEXT, letterSpacing: '-0.02em' }}>{Math.round(val)}</text>
        <text x={center} y={center + 13} textAnchor="middle" dominantBaseline="middle" className="num" style={{ fontWeight: 500, fontSize: 10.5, fill: TEXT_LIGHT }}>/{goal}{unit}</text>
      </svg>
      <div className="text-[10px] uppercase tracking-wider mt-2 font-semibold text-center truncate w-full" style={{ color: TEXT_MUTED, letterSpacing: '0.03em' }}>
        {label}
      </div>
    </div>
  );

}

function ActionChipMini({ icon, label, color, pastel, onClick }) {
  // Chip compacto + tap instantáneo: usa onPointerDown para disparar al
  // primer touchstart sin esperar el click sintético de iOS. Llevamos un
  // ref del punto de inicio para descartar el tap si el dedo se movió
  // (evita falsos positivos cuando la hoja se scrollea).
  const startRef = useRef(null);
  return (
    <button
      onPointerDown={(e) => {
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      }}
      onPointerUp={(e) => {
        const s = startRef.current;
        startRef.current = null;
        if (!s) return;
        const dx = Math.abs(e.clientX - s.x);
        const dy = Math.abs(e.clientY - s.y);
        if (dx > 8 || dy > 8) return; // fue scroll, no tap
        e.preventDefault();
        onClick?.();
      }}
      onClick={(e) => e.preventDefault()}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl active:scale-[0.97]"
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(60,70,50,0.07)',
        boxShadow: '0 2px 10px rgba(60,70,50,0.07), 0 1px 2px rgba(60,70,50,0.04)',
        transition: 'transform 0.08s ease-out',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent'
      }}>
      {/* Insignia en "squircle" (cuadrado redondeado) con icono de línea:
          blanco pleno + borde hairline + sombra suave y tipografía medium —
          la receta de tarjeta premium; el pastel queda SOLO dentro de la
          insignia, no gritando en todo el chip. */}
      <div className="flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 32, height: 32, background: pastel || ACCENT_PASTEL, color: color || ACCENT_DARK, fontSize: typeof icon === 'string' ? 16 : undefined, lineHeight: 1 }}>
        {icon}
      </div>
      <div className="text-[12px] font-medium leading-tight text-left" style={{ color: TEXT, letterSpacing: '-0.01em' }}>{label}</div>
    </button>
  );
}

function DaySeparator({ date }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px" style={{ background: BORDER }} />
      <div className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold uppercase tracking-wider capitalize" style={{
        background: ACCENT_PASTEL + '60', color: ACCENT_DARK, letterSpacing: '0.05em'
      }}>
        {formatDate(date)}
      </div>
      <div className="flex-1 h-px" style={{ background: BORDER }} />
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ message, goals, totals, entries, historyDetail, onEdit, onDelete, onFavorite, onAcceptFavSuggestion, onDismissFavSuggestion, onAcceptAutoFav, onDismissAutoFav, favoriteIngredients = [], onOpenPerformance, onSeparateAppended, favoriteSignatures, favSignature, onOpenLearning }) {
  if (message.isAutoFavoriteSuggestion && message.suggestedKey) {
    const alreadyAdded = favoriteIngredients.includes(message.suggestedKey);
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: ACCENT_PASTEL + '40',
          border: `1px solid ${ACCENT_PASTEL}`,
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Star size={14} style={{ color: ACCENT_DARK }} />
            <span className="text-[10px] uppercase tracking-[0.04em] font-bold" style={{ color: ACCENT_DARK }}>Sugerencia</span>
          </div>
          {alreadyAdded ? (
            <div className="text-[13px]" style={{ color: TEXT, lineHeight: 1.5 }}>
              Agregué <strong>{message.suggestedName}</strong> a tus ingredientes favoritos.
            </div>
          ) : (
            <>
              <div className="text-[13px] mb-3" style={{ color: TEXT, lineHeight: 1.5 }}>
                Noto que registras <strong>{message.suggestedName}</strong> con frecuencia. ¿Lo agrego a tu lista de ingredientes favoritos para usarlo en "Arma mi día"?
              </div>
              <div className="flex gap-2">
                <button onClick={() => onAcceptAutoFav(message.suggestedKey)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-semibold active:scale-95"
                  style={{ background: '#1F1F1F', color: '#fff' }}>
                  Sí, agregar
                </button>
                <button onClick={() => onDismissAutoFav(message.suggestedKey)}
                  className="flex-1 py-2 rounded-xl text-[12px] font-semibold active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.92)', color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                  No, gracias
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (message.isFavSuggestion) {
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: ACCENT_PASTEL + '40',
          border: `1px solid ${ACCENT_PASTEL}`,
        }}>
          <div className="flex items-center gap-2 mb-2">
            <ChefHat size={14} style={{ color: ACCENT_DARK }} />
            <span className="text-[10px] uppercase tracking-[0.04em] font-bold" style={{ color: ACCENT_DARK }}>Sugerencia</span>
          </div>
          <div className="text-[13px] mb-3" style={{ color: TEXT, lineHeight: 1.5 }}>{message.content}</div>
          <div className="flex gap-2">
            <button onClick={onAcceptFavSuggestion}
              className="flex-1 py-2 rounded-xl text-[12px] font-semibold transition active:scale-95"
              style={{ background: '#1F1F1F', color: '#fff' }}>
              Sí, configurar
            </button>
            <button onClick={onDismissFavSuggestion}
              className="flex-1 py-2 rounded-xl text-[12px] font-semibold transition active:scale-95"
              style={{ background: 'rgba(255,255,255,0.92)', color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
              Más tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (message.isDaySeparator) return <DaySeparator date={message.date} />;

  if (message.isInfo) {
    return (
      <div className="flex justify-center fade-up">
        <div className="px-4 py-2 rounded-full text-[12px] font-medium flex items-center gap-2" style={{
          background: ACCENT_PASTEL + '50', color: ACCENT_DARK, letterSpacing: '0.01em',
        }}>
          <CheckCircle2 size={12} strokeWidth={2.2} />
          {message.content}
        </div>
      </div>
    );
  }

  // Anuncio oficial (aviso del coach, actualización de la app, recordatorio
  // de Aprendizaje). Color propio — azul humo — para que destaque del chat
  // blanco sin confundirse con las confirmaciones oliva.
  if (message.isAnnouncement) {
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[92%] px-4 py-3.5 rounded-2xl rounded-bl-md text-[14px]" style={{
          background: `linear-gradient(135deg, ${C_FAT_PASTEL}66, ${C_FAT_PASTEL}33), rgba(255,255,255,0.92)`,
          border: `1px solid ${C_FAT_PASTEL}`,
          borderLeft: `3px solid ${C_FAT}`,
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.10), 0 4px 16px rgba(107,122,143,0.14)',
          lineHeight: 1.45,
        }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Megaphone size={13} strokeWidth={2.2} style={{ color: C_FAT }} />
            <span className="text-[10px] uppercase tracking-[0.06em] font-bold" style={{ color: C_FAT }}>
              {message.tag || 'Aviso'}
            </span>
          </div>
          <div style={{ color: TEXT, fontWeight: 500 }}>{message.content}</div>
          {message.showLearnButton && typeof onOpenLearning === 'function' && (
            <button onClick={onOpenLearning}
              className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition"
              style={{ background: C_FAT, color: '#fff' }}>
              <GraduationCap size={13} /> Abrir Aprendizaje
            </button>
          )}
        </div>
      </div>
    );
  }

  // Guardado SOLO como favorito (no cuenta en el día): tarjeta que deja
  // constancia visible de la acción sin sumar al contador.
  if (message.isFavoriteOnly && message.data) {
    const d = message.data;
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[92%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: 'rgba(255,255,255,0.92)',
          border: `1px solid ${C_CARBS_PASTEL}`,
          borderLeft: `3px solid ${C_CARBS}`,
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.06)',
        }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Star size={13} strokeWidth={2.2} style={{ color: C_CARBS, fill: C_CARBS }} />
            <span className="text-[10px] uppercase tracking-[0.06em] font-bold" style={{ color: C_CARBS }}>
              Guardado en favoritos · no cuenta en tu día
            </span>
          </div>
          <div className="text-[14px] font-semibold mb-1" style={{ color: TEXT }}>{d.name}</div>
          <div className="text-[12px] mb-2" style={{ color: TEXT_MUTED }}>
            {(d.items || []).map(it => `${it.name}${it.amount ? ' · ' + it.amount : ''}`).join(' · ')}
          </div>
          <div className="flex gap-3 text-xs num mb-2">
            <span style={{ color: ACCENT, fontWeight: 600 }}>{Math.round(d.kcal || 0)} kcal</span>
            <span style={{ color: C_PROTEIN }}>P {Math.round(d.p || 0)}g</span>
            <span style={{ color: C_CARBS }}>C {Math.round(d.c || 0)}g</span>
            <span style={{ color: C_FAT }}>G {Math.round(d.g || 0)}g</span>
          </div>
          <div className="text-[11px]" style={{ color: TEXT_LIGHT, lineHeight: 1.5 }}>
            {d.removedFromDay ? 'La saqué de tu contador del día — tus totales ya no la incluyen. ' : ''}
            Quedó como receta en Herramientas → Menús favoritos (ahí puedes renombrarla).
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end fade-up">
        <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-br-md text-[15px]" style={{
          background: ACCENT_PASTEL, color: TEXT, fontWeight: 500, lineHeight: 1.4,
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  // El card "isWelcomeHints" con la lista de hints + botón "¿Qué puedo hacer aquí?"
  // se eliminó por pedido del usuario: ya no aporta y duplica lo que está en
  // Herramientas. Los mensajes marcados como isWelcomeHints caen al render normal
  // de assistant abajo y se ven como un saludo simple.

  if (message.isWater) {
    return (
      <div className="flex justify-start fade-up">
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md text-sm flex items-center gap-2" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <Droplet size={14} style={{ color: C_WATER }} />
          <span style={{ color: TEXT }}>+{message.ml} ml registrados</span>
        </div>
      </div>
    );
  }

  if (message.isMacroQuery && message.data) {
    const d = message.data;
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[85%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Info size={12} style={{ color: ACCENT }} />
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT }}>Consulta nutricional</span>
          </div>
          <div className="text-base font-semibold mb-1" style={{ color: TEXT }}>{d.food}</div>
          <div className="text-xs num mb-2" style={{ color: TEXT_LIGHT }}>{d.amount}</div>
          <div className="flex gap-3 text-xs num">
            <span style={{ color: ACCENT, fontWeight: 600 }}>{fmt0(d.kcal)} kcal</span>
            <span style={{ color: C_PROTEIN }}>P {fmt1(d.p)}g</span>
            <span style={{ color: C_CARBS }}>C {fmt1(d.c)}g</span>
            <span style={{ color: C_FAT }}>G {fmt1(d.g)}g</span>
          </div>
          <div className="mt-2 text-[10px] italic" style={{ color: TEXT_LIGHT }}>
            Consulta informativa — no se registra.
          </div>
        </div>
      </div>
    );
  }

  if (message.isRetroAdvice && message.data) {
    const d = message.data;
    const adjustments = Array.isArray(d.adjustments) ? d.adjustments : [];
    const after = d.estimated_totals_after || {};
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[92%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} style={{ color: ACCENT }} />
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT }}>Análisis y ajuste sugerido</span>
          </div>
          {d.summary && (
            <div className="text-[13px] mb-3 leading-relaxed" style={{ color: TEXT }}>{d.summary}</div>
          )}
          <div className="space-y-3">
            {adjustments.map((a, idx) => {
              const items = Array.isArray(a.suggested_items) ? a.suggested_items : [];
              const totalK = items.reduce((s, it) => s + (it.kcal || 0), 0);
              const totalP = items.reduce((s, it) => s + (it.p || 0), 0);
              const totalC = items.reduce((s, it) => s + (it.c || 0), 0);
              const totalG = items.reduce((s, it) => s + (it.g || 0), 0);
              const entryShaped = {
                id: Date.now() + idx,
                meal: a.meal || 'comida',
                items: items.map(it => ({
                  name: it.name, amount: it.amount,
                  kcal: it.kcal || 0, p: it.p || 0, c: it.c || 0, g: it.g || 0
                })),
                kcal: totalK, p: totalP, c: totalC, g: totalG,
                time: ''
              };
              return (
                <div key={idx} className="p-3 rounded-xl" style={{ background: SURFACE_2, border: `1px solid ${BORDER_SOFT}` }}>
                  <div className="text-[11px] uppercase tracking-[0.03em] font-semibold mb-1" style={{ color: TEXT_MUTED }}>{a.meal || 'comida'}</div>
                  {a.original_summary && (
                    <div className="text-[11px] mb-1.5" style={{ color: TEXT_LIGHT }}>Original: {a.original_summary}</div>
                  )}
                  <div className="text-[12px] font-semibold mb-1" style={{ color: TEXT }}>Sugerido:</div>
                  <ul className="text-[12px] mb-2 space-y-0.5" style={{ color: TEXT }}>
                    {items.map((it, j) => (
                      <li key={j}>• {it.name}{it.amount ? ` — ${it.amount}` : ''}</li>
                    ))}
                  </ul>
                  <div className="flex gap-3 text-[11px] num mb-2">
                    <span style={{ color: ACCENT, fontWeight: 600 }}>{fmt0(totalK)} kcal</span>
                    <span style={{ color: C_PROTEIN }}>P {fmt1(totalP)}</span>
                    <span style={{ color: C_CARBS }}>C {fmt1(totalC)}</span>
                    <span style={{ color: C_FAT }}>G {fmt1(totalG)}</span>
                  </div>
                  {a.change_note && (
                    <div className="text-[11px] italic mb-2" style={{ color: TEXT_MUTED }}>{a.change_note}</div>
                  )}
                  {items.length > 0 && onFavorite && (
                    <button onClick={() => onFavorite(entryShaped)}
                      className="text-[11px] font-semibold py-1.5 px-3 rounded-full"
                      style={{ background: ACCENT, color: '#fff' }}>
                      Guardar como favorito
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(after.kcal || after.p || after.c || after.g) && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: BORDER_SOFT }}>
              <div className="text-[10px] uppercase tracking-[0.04em] font-semibold mb-1" style={{ color: TEXT_MUTED }}>Quedarías hoy en</div>
              <div className="flex gap-3 text-[11px] num">
                <span style={{ color: ACCENT, fontWeight: 600 }}>{fmt0(after.kcal)} kcal</span>
                <span style={{ color: C_PROTEIN }}>P {fmt1(after.p)}</span>
                <span style={{ color: C_CARBS }}>C {fmt1(after.c)}</span>
                <span style={{ color: C_FAT }}>G {fmt1(after.g)}</span>
              </div>
            </div>
          )}
          {d.tip && (
            <div className="mt-3 text-[11px] italic leading-relaxed" style={{ color: TEXT_MUTED }}>💡 {d.tip}</div>
          )}
          <div className="mt-3 text-[10px] italic" style={{ color: TEXT_LIGHT }}>
            Solo aprendizaje — no se modifica tu registro de hoy.
          </div>
        </div>
      </div>
    );
  }

  // Ajuste sugerido para favoritos. Visualmente parecido al de retro_advice pero
  // enfocado en los menús/días guardados — el cliente puede guardar la versión
  // ajustada como un favorito nuevo (no pisa el original).
  if (message.isAdjustFavorites && message.data) {
    const d = message.data;
    const adjustments = Array.isArray(d.adjustments) ? d.adjustments : [];
    const after = d.estimated_totals_after || {};
    const current = d.current_totals || {};
    const goal = d.goal || {};
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[92%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Star size={12} style={{ color: C_CARBS }} />
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: C_CARBS }}>Ajuste de tus favoritos</span>
          </div>
          {d.summary && (
            <div className="text-[13px] mb-2 leading-relaxed" style={{ color: TEXT }}>{d.summary}</div>
          )}
          {d.logic && (
            <div className="text-[12px] mb-3 p-2.5 rounded-lg leading-relaxed" style={{ background: ACCENT_LIGHT, color: ACCENT_DARK }}>
              <span className="font-semibold">Cómo lo ajusté: </span>{d.logic}
            </div>
          )}
          {(current.kcal || goal.kcal) && (
            <div className="mb-3 p-2.5 rounded-lg" style={{ background: SURFACE_2, border: `1px solid ${BORDER_SOFT}` }}>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_LIGHT }}>Suma actual</div>
                  <div className="num" style={{ color: TEXT }}>{fmt0(current.kcal)} kcal · P{fmt1(current.p)} C{fmt1(current.c)} G{fmt1(current.g)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_LIGHT }}>Meta</div>
                  <div className="num" style={{ color: TEXT }}>{fmt0(goal.kcal)} kcal · P{fmt1(goal.p)} C{fmt1(goal.c)} G{fmt1(goal.g)}</div>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {adjustments.map((a, idx) => {
              const items = Array.isArray(a.suggested_items) ? a.suggested_items : [];
              const totalK = a.kcal || items.reduce((s, it) => s + (it.kcal || 0), 0);
              const totalP = a.p || items.reduce((s, it) => s + (it.p || 0), 0);
              const totalC = a.c || items.reduce((s, it) => s + (it.c || 0), 0);
              const totalG = a.g || items.reduce((s, it) => s + (it.g || 0), 0);
              const entryShaped = {
                id: Date.now() + idx,
                meal: a.favorite_type === 'day' ? 'comida' : (a.favorite_name || 'comida'),
                items: items.map(it => ({
                  name: it.name, amount: it.amount,
                  kcal: it.kcal || 0, p: it.p || 0, c: it.c || 0, g: it.g || 0
                })),
                kcal: totalK, p: totalP, c: totalC, g: totalG,
                time: ''
              };
              return (
                <div key={idx} className="p-3 rounded-xl" style={{ background: SURFACE_2, border: `1px solid ${BORDER_SOFT}` }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star size={11} style={{ color: C_CARBS }} />
                    <span className="text-[12px] font-semibold" style={{ color: TEXT }}>{a.favorite_name || 'Favorito'}</span>
                  </div>
                  {a.original_summary && (
                    <div className="text-[11px] mb-1.5" style={{ color: TEXT_LIGHT }}>Original: {a.original_summary}</div>
                  )}
                  <div className="text-[12px] font-semibold mb-1" style={{ color: TEXT }}>Versión ajustada:</div>
                  <ul className="text-[12px] mb-2 space-y-0.5" style={{ color: TEXT }}>
                    {items.map((it, j) => (
                      <li key={j}>• {it.name}{it.amount ? ` — ${it.amount}` : ''}</li>
                    ))}
                  </ul>
                  <div className="flex gap-3 text-[11px] num mb-2">
                    <span style={{ color: ACCENT, fontWeight: 600 }}>{fmt0(totalK)} kcal</span>
                    <span style={{ color: C_PROTEIN }}>P {fmt1(totalP)}</span>
                    <span style={{ color: C_CARBS }}>C {fmt1(totalC)}</span>
                    <span style={{ color: C_FAT }}>G {fmt1(totalG)}</span>
                  </div>
                  {a.change_note && (
                    <div className="text-[11px] italic mb-2" style={{ color: TEXT_MUTED }}>{a.change_note}</div>
                  )}
                  {items.length > 0 && onFavorite && (
                    <button onClick={() => onFavorite(entryShaped)}
                      className="text-[11px] font-semibold py-1.5 px-3 rounded-full"
                      style={{ background: C_CARBS, color: '#fff' }}>
                      Guardar versión ajustada
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(after.kcal || after.p || after.c || after.g) && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: BORDER_SOFT }}>
              <div className="text-[10px] uppercase tracking-[0.04em] font-semibold mb-1" style={{ color: TEXT_MUTED }}>Suma ajustada</div>
              <div className="flex gap-3 text-[11px] num">
                <span style={{ color: ACCENT, fontWeight: 600 }}>{fmt0(after.kcal)} kcal</span>
                <span style={{ color: C_PROTEIN }}>P {fmt1(after.p)}</span>
                <span style={{ color: C_CARBS }}>C {fmt1(after.c)}</span>
                <span style={{ color: C_FAT }}>G {fmt1(after.g)}</span>
              </div>
              {(() => {
                const tgt = d.target && d.target.kcal ? d.target : goal;
                if (!tgt || !tgt.kcal) return null;
                const dk = Math.round((after.kcal || 0) - tgt.kcal);
                const onTarget = Math.abs(dk) <= tgt.kcal * 0.04;
                return (
                  <div className="text-[11px] mt-1.5 font-medium" style={{ color: onTarget ? SUCCESS : WARN }}>
                    {onTarget ? '✓ Cuadra con el objetivo' : `${dk > 0 ? '+' : ''}${dk} kcal vs objetivo (${fmt0(tgt.kcal)})`}
                  </div>
                );
              })()}
            </div>
          )}
          {d.tip && (
            <div className="mt-3 text-[11px] italic leading-relaxed" style={{ color: TEXT_MUTED }}>💡 {d.tip}</div>
          )}
          <div className="mt-3 text-[10px] italic" style={{ color: TEXT_LIGHT }}>
            Propuesta visual — tus favoritos originales siguen guardados intactos.
          </div>
        </div>
      </div>
    );
  }

  if (message.isLogged && message.entryId) {
    let e = entries.find(x => x.id === message.entryId);
    let isHistorical = false;
    if (!e && historyDetail) {
      for (const dayEntries of Object.values(historyDetail)) {
        const found = (dayEntries || []).find(x => x.id === message.entryId);
        if (found) { e = found; isHistorical = true; break; }
      }
    }
    if (!e) {
      // Hide orphan messages silently (no more "Comida eliminada" ghost)
      return null;
    }
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm w-full" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
                <CheckCircle2 size={11} style={{ color: ACCENT_DARK }} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>{e.meal}</span>
              <span className="text-[10px]" style={{ color: TEXT_LIGHT }}>{e.time}</span>
            </div>
            <div className="flex gap-1">
              {(() => { const isFav = favoriteSignatures && favSignature && favoriteSignatures.has(favSignature(e)); return (
              <button onClick={() => onFavorite(e)} className="p-1 rounded-full hover:bg-black/5 transition" title={isFav ? 'Ya está en favoritos' : 'Guardar en favoritos'}>
                <Star size={12} style={{ color: isFav ? C_CARBS : TEXT_LIGHT, fill: isFav ? C_CARBS : 'none' }} />
              </button>
              ); })()}
              {!isHistorical && (
                <>
                  <button onClick={() => onEdit(e.id)} className="p-1 rounded-full hover:bg-black/5 transition">
                    <Pencil size={12} style={{ color: TEXT_LIGHT }} />
                  </button>
                  <button onClick={() => onDelete(e.id)} className="p-1 rounded-full hover:bg-black/5 transition">
                    <Trash2 size={12} style={{ color: TEXT_LIGHT }} />
                  </button>
                </>
              )}
            </div>
          </div>

          {message.quantityWarning && (
            <div className="mb-3 p-2.5 rounded-xl flex items-start gap-2 text-[11px]" style={{
              background: '#FBF1E5', color: WARN
            }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <span>{message.quantityWarning}</span>
                <button onClick={() => onEdit(e.id)} className="ml-1 underline font-medium">Ajustar cantidad</button>
              </div>
            </div>
          )}

          <div className="space-y-1 mb-3">
            {e.items.map((it, i) => (
              <div key={i} className="text-xs flex justify-between gap-3">
                <span style={{ color: TEXT }}>
                  {it.name}{it.amount ? ` · ${it.amount}` : ''}
                  {it.needs_quantity && <span className="ml-1 text-[10px]" style={{ color: WARN }}>· estimado</span>}
                </span>
                <span className="num" style={{ color: TEXT_LIGHT }}>{it.kcal} kcal</span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t" style={{ borderColor: BORDER_SOFT }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: TEXT_MUTED }}>Total comida</span>
              <span className="num font-medium" style={{ color: ACCENT_DARK }}>{Math.round(e.kcal ?? 0)} kcal</span>
            </div>
            <div className="flex gap-3 text-[10px] mt-1 num">
              <span style={{ color: C_PROTEIN }}>P {Math.round((e.p ?? 0) * 10) / 10}g</span>
              <span style={{ color: C_CARBS }}>C {Math.round((e.c ?? 0) * 10) / 10}g</span>
              <span style={{ color: C_FAT }}>G {Math.round((e.g ?? 0) * 10) / 10}g</span>
            </div>
          </div>
          {!isHistorical && (
            <div className="mt-3 pt-3 border-t text-[10px] num" style={{ borderColor: BORDER_SOFT, color: TEXT_LIGHT }}>
              {(() => {
                const left = Math.round(goals.kcal - totals.kcal);
                if (left > 0) return `Llevas ${Math.round(totals.kcal)} kcal · te quedan ${left} disponibles`;
                if (left === 0) return `Llevas ${Math.round(totals.kcal)} kcal · meta del día alcanzada`;
                return `Llevas ${Math.round(totals.kcal)} kcal · ${Math.abs(left)} sobre la meta`;
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.isMealSuggestion && message.data) {
    const { options = [], missingFavorites, mealType, remaining } = message.data;
    const mealLabel = mealType ? mealType.charAt(0).toUpperCase() + mealType.slice(1) : 'Comida';
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[92%] p-4 rounded-2xl rounded-bl-md text-sm w-full" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
              <ChefHat size={11} style={{ color: ACCENT_DARK }} strokeWidth={2.2} />
            </div>
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>{mealLabel} · opciones</span>
          </div>

          {missingFavorites ? (
            <div className="p-3 rounded-xl text-[12.5px]" style={{ background: ACCENT_PASTEL + '30', color: TEXT, lineHeight: 1.55 }}>
              Para sugerirte opciones con lo que comes habitualmente, necesito que primero configures tus alimentos favoritos en <strong>Mis ingredientes</strong> (desde Herramientas).
              <div className="mt-2 text-[11.5px]" style={{ color: TEXT_MUTED }}>
                Cuanto más completa esté tu lista de ingredientes saludables, mejores opciones puedo darte. Para criterio personalizado, también puedes consultar con tu coach.
              </div>
            </div>
          ) : options.length === 0 ? (
            <div className="p-3 rounded-xl text-[12.5px]" style={{ background: ACCENT_PASTEL + '30', color: TEXT, lineHeight: 1.55 }}>
              Con la lista actual de ingredientes no puedo armar opciones para esa comida. Agrega más alimentos en <strong>Mis ingredientes</strong> y te doy mejores propuestas.
            </div>
          ) : (
            <>
              <div className="text-[11.5px] mb-3" style={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
                Basándome en los ingredientes que sueles tener, podrías combinar:
              </div>
              <div className="space-y-2.5">
                {options.map((opt, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: ACCENT_PASTEL + '25', border: `1px solid ${ACCENT_PASTEL}80` }}>
                    <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: ACCENT_DARK }}>Opción {i + 1}</div>
                    <div className="space-y-0.5">
                      {opt.items.map((it, j) => (
                        <div key={j} className="text-[12.5px] flex justify-between gap-3">
                          <span style={{ color: TEXT }}>{it.name}{it.amount ? ` · ${it.amount}` : ''}</span>
                          <span className="num" style={{ color: TEXT_LIGHT }}>{Math.round(it.kcal || 0)} kcal</span>
                        </div>
                      ))}
                    </div>
                    {opt.subtotal && (
                      <div className="text-[10px] pt-1.5 mt-1.5 border-t flex gap-3 num" style={{ borderColor: BORDER_SOFT, color: TEXT_MUTED }}>
                        <span>≈ {Math.round(opt.subtotal.kcal || 0)} kcal</span>
                        <span style={{ color: C_PROTEIN }}>P {Math.round((opt.subtotal.p || 0) * 10) / 10}g</span>
                        <span style={{ color: C_CARBS }}>C {Math.round((opt.subtotal.c || 0) * 10) / 10}g</span>
                        <span style={{ color: C_FAT }}>G {Math.round((opt.subtotal.g || 0) * 10) / 10}g</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-3 pt-3 border-t text-[10px] italic" style={{ borderColor: BORDER_SOFT, color: TEXT_LIGHT, lineHeight: 1.5 }}>
            Esto es solo cálculo organizativo basado en los ingredientes que registraste como habituales. No constituye consejo nutricional. Para criterio personalizado, consulta con tu coach.
          </div>
        </div>
      </div>
    );
  }

  if (message.isGapSuggestions && message.data) {
    const { gaps = [], options = [], missingFavorites } = message.data;
    const significantGaps = gaps.filter(g => g.remaining > 0 && (g.goal > 0 && g.remaining / g.goal >= 0.10));
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[92%] p-4 rounded-2xl rounded-bl-md text-sm w-full" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
              <PieChart size={11} style={{ color: ACCENT_DARK }} strokeWidth={2.2} />
            </div>
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>Lo que falta hoy</span>
          </div>

          <div className="space-y-1 mb-3">
            {significantGaps.map((g, i) => (
              <div key={i} className="text-[12px] flex justify-between gap-3">
                <span style={{ color: TEXT }}>Faltan <strong>{Math.round(g.remaining * 10) / 10}{g.unit}</strong> de {g.label}</span>
                <span className="num" style={{ color: TEXT_LIGHT }}>meta {g.goal}{g.unit}</span>
              </div>
            ))}
          </div>

          {missingFavorites ? (
            <div className="p-3 rounded-xl text-[12px]" style={{ background: ACCENT_PASTEL + '30', color: TEXT, lineHeight: 1.55 }}>
              Para ayudarte con equivalencias de lo que comes habitualmente, agrega tus alimentos favoritos en <strong>Mis ingredientes</strong> (desde Herramientas). Necesito al menos 3 para calcular opciones reales.
            </div>
          ) : options.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-2 mt-1" style={{ color: TEXT_LIGHT }}>
                De tus ingredientes, equivalencias para cubrirlo
              </div>
              <div className="space-y-2.5">
                {options.map((opt, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: ACCENT_PASTEL + '25', border: `1px solid ${ACCENT_PASTEL}80` }}>
                    <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: ACCENT_DARK }}>Opción {i + 1}</div>
                    <div className="space-y-0.5">
                      {opt.items.map((it, j) => (
                        <div key={j} className="text-[12px] flex justify-between gap-3">
                          <span style={{ color: TEXT }}>{it.name}{it.amount ? ` · ${it.amount}` : ''}</span>
                          <span className="num" style={{ color: TEXT_LIGHT }}>{Math.round(it.kcal || 0)} kcal</span>
                        </div>
                      ))}
                    </div>
                    {opt.subtotal && (
                      <div className="text-[10px] pt-1.5 mt-1.5 border-t flex gap-3 num" style={{ borderColor: BORDER_SOFT, color: TEXT_MUTED }}>
                        <span>≈ {Math.round(opt.subtotal.kcal || 0)} kcal</span>
                        <span style={{ color: C_PROTEIN }}>P {Math.round((opt.subtotal.p || 0) * 10) / 10}g</span>
                        <span style={{ color: C_CARBS }}>C {Math.round((opt.subtotal.c || 0) * 10) / 10}g</span>
                        <span style={{ color: C_FAT }}>G {Math.round((opt.subtotal.g || 0) * 10) / 10}g</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-3 pt-3 border-t text-[10px] italic" style={{ borderColor: BORDER_SOFT, color: TEXT_LIGHT, lineHeight: 1.5 }}>
            Esto es solo cálculo organizativo. No constituye consejo nutricional ni reemplaza la valoración de un profesional.
          </div>
        </div>
      </div>
    );
  }

  if (message.isAppended && message.entryId) {
    const e = entries.find(x => x.id === message.entryId);
    if (!e) return null;
    const added = message.addedItems || [];
    const addedKeys = new Set(added.map(it => `${it.name}|${it.amount || ''}`));
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm w-full" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
                <CheckCircle2 size={11} style={{ color: ACCENT_DARK }} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>{e.meal} actualizado</span>
              <span className="text-[10px]" style={{ color: TEXT_LIGHT }}>{e.time}</span>
            </div>
            <div className="flex gap-1">
              {(() => { const isFav = favoriteSignatures && favSignature && favoriteSignatures.has(favSignature(e)); return (
              <button onClick={() => onFavorite(e)} className="p-1 rounded-full hover:bg-black/5 transition" title={isFav ? 'Ya está en favoritos' : 'Guardar en favoritos'}>
                <Star size={12} style={{ color: isFav ? C_CARBS : TEXT_LIGHT, fill: isFav ? C_CARBS : 'none' }} />
              </button>
              ); })()}
              <button onClick={() => onEdit(e.id)} className="p-1 rounded-full hover:bg-black/5 transition">
                <Pencil size={12} style={{ color: TEXT_LIGHT }} />
              </button>
              <button onClick={() => onDelete(e.id)} className="p-1 rounded-full hover:bg-black/5 transition">
                <Trash2 size={12} style={{ color: TEXT_LIGHT }} />
              </button>
            </div>
          </div>

          {/* Confirmation banner: makes "this was added to existing meal" obvious */}
          {onSeparateAppended && (
            <div className="mb-3 p-2.5 rounded-xl flex items-start gap-2 text-[11px]" style={{ background: ACCENT_PASTEL + '40', border: `1px solid ${ACCENT_PASTEL}` }}>
              <Info size={12} style={{ color: ACCENT_DARK, flexShrink: 0, marginTop: 1 }} />
              <div style={{ color: ACCENT_DARK, lineHeight: 1.4 }}>
                Sumé esto a tu <strong>{e.meal} de las {e.time}</strong>. Si era una comida nueva, sepárala con el botón de abajo.
              </div>
            </div>
          )}

          {message.quantityWarning && (
            <div className="mb-3 p-2.5 rounded-xl flex items-start gap-2 text-[11px]" style={{ background: '#FBF1E5', color: WARN }}>
              <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{message.quantityWarning}</span>
            </div>
          )}

          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: ACCENT_DARK }}>
            Sumé estos {added.length === 1 ? 'ítem' : 'ítems'}
          </div>
          <div className="space-y-1 mb-3 p-2.5 rounded-xl" style={{ background: ACCENT_PASTEL + '30' }}>
            {added.map((it, i) => (
              <div key={i} className="text-xs flex justify-between gap-3">
                <span style={{ color: TEXT }}>+ {it.name}{it.amount ? ` · ${it.amount}` : ''}</span>
                <span className="num" style={{ color: TEXT_LIGHT }}>{Math.round(it.kcal ?? 0)} kcal</span>
              </div>
            ))}
          </div>

          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: TEXT_LIGHT }}>
            Comida completa
          </div>
          <div className="space-y-1 mb-3">
            {e.items.map((it, i) => {
              const isAdded = addedKeys.has(`${it.name}|${it.amount || ''}`);
              return (
                <div key={i} className="text-xs flex justify-between gap-3">
                  <span style={{ color: isAdded ? ACCENT_DARK : TEXT, fontWeight: isAdded ? 600 : 400 }}>
                    {it.name}{it.amount ? ` · ${it.amount}` : ''}
                  </span>
                  <span className="num" style={{ color: TEXT_LIGHT }}>{Math.round(it.kcal ?? 0)} kcal</span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t" style={{ borderColor: BORDER_SOFT }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: TEXT_MUTED }}>Nuevo total comida</span>
              <span className="num font-medium" style={{ color: ACCENT_DARK }}>{Math.round(e.kcal ?? 0)} kcal</span>
            </div>
            <div className="flex gap-3 text-[10px] mt-1 num">
              <span style={{ color: C_PROTEIN }}>P {Math.round((e.p ?? 0) * 10) / 10}g</span>
              <span style={{ color: C_CARBS }}>C {Math.round((e.c ?? 0) * 10) / 10}g</span>
              <span style={{ color: C_FAT }}>G {Math.round((e.g ?? 0) * 10) / 10}g</span>
            </div>
          </div>

          {onSeparateAppended && (
            <button
              onClick={() => onSeparateAppended(e.id, added)}
              className="mt-3 w-full py-2 rounded-xl text-[11px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.92)', color: TEXT_MUTED, border: `1px dashed ${BORDER}` }}
              title="Si esto era una comida nueva y no un agregado, sepárala">
              <span style={{ fontSize: '12px' }}>↗</span>
              Separar como comida nueva
            </button>
          )}
        </div>
      </div>
    );
  }

  if (message.isProportion && message.data) {
    const d = message.data;
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
              <Sparkles size={11} style={{ color: ACCENT }} />
            </div>
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>Proporciones</span>
          </div>
          <div className="space-y-2 mb-3">
            {d.proportions?.map((p, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs">
                <div>
                  <div style={{ color: TEXT }}>{p.name}</div>
                  <div className="text-[10px] num" style={{ color: TEXT_LIGHT }}>{p.amount}</div>
                </div>
                <div className="text-right num text-[10px]" style={{ color: TEXT_MUTED }}>
                  <div>{fmt0(p.kcal)} kcal</div>
                  <div>P{fmt1(p.p)} C{fmt1(p.c)} G{fmt1(p.g)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t flex justify-between text-xs" style={{ borderColor: BORDER_SOFT }}>
            <span style={{ color: TEXT_MUTED }}>Total</span>
            <span className="num font-medium" style={{ color: ACCENT_DARK }}>{d.totals?.kcal} kcal</span>
          </div>
          {d.note && <div className="mt-2 text-[11px] italic" style={{ color: ACCENT_DARK }}>{d.note}</div>}
        </div>
      </div>
    );
  }

  if (message.isSummaryDetailed) {
    const dayEntries = message.entries || [];
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm w-full" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
              <LineChart size={11} style={{ color: ACCENT_DARK }} />
            </div>
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>Detalle del día</span>
          </div>
          {dayEntries.length === 0 ? (
            <div className="text-xs italic py-2" style={{ color: TEXT_LIGHT }}>Sin comidas registradas hoy.</div>
          ) : (
            <div className="space-y-3">
              {dayEntries.map((e, i) => (
                <div key={i} className="pb-3" style={{ borderBottom: i < dayEntries.length - 1 ? `1px solid ${BORDER_SOFT}` : 'none' }}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>{e.meal}</span>
                    <span className="text-[10px] num" style={{ color: TEXT_LIGHT }}>{e.time}</span>
                  </div>
                  <div className="space-y-0.5 mb-1.5">
                    {e.items.map((it, j) => (
                      <div key={j} className="flex justify-between gap-2 text-xs">
                        <span style={{ color: TEXT }}>
                          {it.name}{it.amount ? ` · ${it.amount}` : ''}
                          {it.needs_quantity && <span className="ml-1 text-[10px]" style={{ color: WARN }}>· estimado</span>}
                        </span>
                        <span className="num" style={{ color: TEXT_LIGHT, flexShrink: 0 }}>{it.kcal} kcal</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 text-[10px] num">
                    <span style={{ color: ACCENT_DARK, fontWeight: 600 }}>{Math.round(e.kcal ?? 0)} kcal</span>
                    <span style={{ color: C_PROTEIN }}>P {Math.round((e.p ?? 0) * 10) / 10}g</span>
                    <span style={{ color: C_CARBS }}>C {Math.round((e.c ?? 0) * 10) / 10}g</span>
                    <span style={{ color: C_FAT }}>G {Math.round((e.g ?? 0) * 10) / 10}g</span>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: TEXT_LIGHT }}>Total acumulado</div>
                <div className="space-y-1.5 text-xs">
                  <Row label="Calorías" val={`${fmt0(message.totals.kcal)} / ${fmt0(goals.kcal)}`} diff={goals.kcal - message.totals.kcal} unit="kcal" color={ACCENT} />
                  <Row label="Proteína" val={`${fmt1(message.totals.p)} / ${fmt1(goals.p)}`} diff={goals.p - message.totals.p} unit="g" color={C_PROTEIN} />
                  <Row label="Carbos" val={`${fmt1(message.totals.c)} / ${fmt1(goals.c)}`} diff={goals.c - message.totals.c} unit="g" color={C_CARBS} />
                  <Row label="Grasas" val={`${fmt1(message.totals.g)} / ${fmt1(goals.g)}`} diff={goals.g - message.totals.g} unit="g" color={C_FAT} />
                </div>
              </div>
              {onOpenPerformance && (
                <button onClick={onOpenPerformance}
                  className="mt-3 w-full py-2.5 rounded-xl text-[12px] font-semibold active:scale-[0.98]"
                  style={{ background: ACCENT_PASTEL + '60', color: ACCENT_DARK, border: `1px solid ${ACCENT_PASTEL}` }}>
                  Ver desempeño de la semana →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.isSummary) {
    return (
      <div className="flex justify-start fade-up">
        <div className="max-w-[90%] p-4 rounded-2xl rounded-bl-md text-sm" style={{
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
        }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1 rounded-full" style={{ background: ACCENT_PASTEL + '60' }}>
              <LineChart size={11} style={{ color: ACCENT_DARK }} />
            </div>
            <span className="text-[11px] uppercase tracking-[0.04em] font-semibold" style={{ color: ACCENT_DARK }}>Resumen del día</span>
          </div>
          <div className="space-y-2 text-xs">
            <Row label="Calorías" val={`${fmt0(totals.kcal)} / ${fmt0(goals.kcal)}`} diff={goals.kcal - totals.kcal} unit="kcal" color={ACCENT} />
            <Row label="Proteína" val={`${fmt1(totals.p)} / ${fmt1(goals.p)}`} diff={goals.p - totals.p} unit="g" color={C_PROTEIN} />
            <Row label="Carbos" val={`${fmt1(totals.c)} / ${fmt1(goals.c)}`} diff={goals.c - totals.c} unit="g" color={C_CARBS} />
            <Row label="Grasas" val={`${fmt1(totals.g)} / ${fmt1(goals.g)}`} diff={goals.g - totals.g} unit="g" color={C_FAT} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start fade-up">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-md text-[15px] whitespace-pre-wrap" style={{
        background: 'rgba(255,255,255,0.92)',
        color: TEXT, lineHeight: 1.5,
        boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset'
      }}>
        {message.content}
      </div>
    </div>
  );
});

function Row({ label, val, diff, unit, color }) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span style={{ color: TEXT_MUTED }}>{label}</span>
      </div>
      <div className="flex gap-2 items-baseline">
        <span className="num" style={{ color: TEXT }}>{val} {unit}</span>
        <span className="text-[10px] num" style={{ color: diff >= 0 ? TEXT_LIGHT : WARN }}>
          {diff >= 0 ? `−${fmt1(diff)}` : `+${fmt1(Math.abs(diff))}`}
        </span>
      </div>
    </div>
  );
}

// Contexto que ModalShell expone para que ModalHeader (y otros hijos) puedan
// disparar el cierre INSTANTÁNEO sin esperar al re-render del padre.
const ModalCloseContext = React.createContext(null);

function ModalShell({ children, onClose, maxWidth = 'max-w-md' }) {
  // Cierre instantáneo en mobile: mutamos el DOM directamente (display:none)
  // SIN setState — igual que closeActionsSheet. Eso evita re-renderizar el
  // árbol del modal (con su PerformanceModal de varios miles de DOM nodes).
  // El setState del padre que desmonta el modal se programa al siguiente
  // rAF, cuando ya no hay nada visible.
  const outerRef = React.useRef(null);

  // COLCHÓN ANTI-TECLADO (iOS): con el teclado abierto, iOS dibuja su pastilla
  // de AutoFill (contacto/llave/tarjeta) flotando al ras del teclado y TAPABA
  // los botones inferiores de los modales — el cliente no podía tocar
  // "guarda el día completo" al nombrar un favorito. Seguimos el visual
  // viewport (igual que la barra de escribir) y levantamos la hoja del modal
  // para que quede completa sobre el teclado, con ~56px extra para que los
  // íconos del sistema floten sobre espacio vacío y no sobre los botones.
  const [kbLift, setKbLift] = React.useState(0);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const hiddenBottom = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
      const kbOpen = (window.innerHeight - vv.height) > 100;
      setKbLift(kbOpen ? hiddenBottom + 56 : 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  const handleClose = React.useCallback(() => {
    if (outerRef.current) {
      outerRef.current.style.display = 'none';
      // Force layout flush para que el paint salga antes del setState del padre
      void outerRef.current.offsetWidth;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof onClose === 'function') onClose();
      });
    });
  }, [onClose]);

  return (
    <ModalCloseContext.Provider value={handleClose}>
      <div ref={outerRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{
        background: 'rgba(0,0,0,0.45)',
        // Sin teclado: las hojas inferiores respetan el home-indicator en la
        // app instalada (env=0 en navegador normal). Con teclado manda kbLift.
        paddingBottom: kbLift ? `${kbLift}px` : 'calc(16px + env(safe-area-inset-bottom, 0px))',
      }} onClick={handleClose}>
        <div className={`w-full ${maxWidth} overflow-y-auto p-6 rounded-3xl fade-up`} style={{
          background: SURFACE, border: `1px solid ${BORDER}`, fontFamily: FONT_UI,
          maxHeight: kbLift ? `calc(100vh - ${kbLift + 24}px)` : '85vh',
        }} onClick={e => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </ModalCloseContext.Provider>
  );
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <ModalShell onClose={onCancel} maxWidth="max-w-sm">
      <div className="text-lg font-bold mb-2" style={{ color: TEXT }}>{title}</div>
      <div className="text-sm mb-6" style={{ color: TEXT_MUTED }}>{body}</div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-full text-sm font-medium transition" style={{ background: SURFACE_2, color: TEXT }}>
          Cancelar
        </button>
        <button onClick={onConfirm} className="flex-1 py-3 rounded-full text-sm font-medium transition" style={{ background: ACCENT, color: '#fff' }}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalHeader({ accent, label, title, onClose }) {
  // Usa el cierre optimizado del context de ModalShell (display:none directo
  // antes de que el padre re-renderice el árbol grande). Cae al onClose si el
  // modal no está envuelto en ModalShell.
  // onPointerDown corre al primer touchstart sin esperar el click sintético
  // de iOS Safari (~50-300ms). preventDefault en click bloquea el doble disparo.
  const contextClose = React.useContext(ModalCloseContext);
  const handleClose = contextClose || onClose;
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <div className="text-[11px] tracking-[0.05em] uppercase font-semibold" style={{ color: accent }}>{label}</div>
        <div className="text-xl font-bold tracking-tight mt-0.5" style={{ color: TEXT, letterSpacing: '-0.01em' }}>{title}</div>
      </div>
      <button
        onPointerDown={(e) => { e.preventDefault(); swallowGhostClick(); handleClose(); }}
        onClick={(e) => e.preventDefault()}
        aria-label="Cerrar"
        className="-m-2 p-3 rounded-full active:scale-90 active-x"
        style={{
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent'
        }}>
        <X size={18} style={{ color: TEXT_MUTED }} />
      </button>
    </div>
  );
}

function WeeklyModal({ history, goals, onClose }) {
  const days = Object.entries(history).sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  const maxKcal = Math.max(goals.kcal, ...days.map(([, t]) => t.kcal || 0), 1);
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader accent={ACCENT} label="Resumen" title="Últimos 7 días" onClose={onClose} />
      {days.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: TEXT_MUTED }}>
          Sin datos históricos.<br />
          <span className="text-xs" style={{ color: TEXT_LIGHT }}>Los días se archivan al cambiar la fecha.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(([date, t]) => {
            const pct = (t.kcal / maxKcal) * 100;
            return (
              <div key={date}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="capitalize font-medium" style={{ color: TEXT }}>{formatDateShort(date)}</span>
                  <span className="num" style={{ color: TEXT_MUTED }}>{t.kcal} kcal</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: BORDER_SOFT }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ACCENT }} />
                </div>
                <div className="flex gap-3 mt-1 text-[10px] num">
                  <span style={{ color: C_PROTEIN }}>P {t.p}g</span>
                  <span style={{ color: C_CARBS }}>C {t.c}g</span>
                  <span style={{ color: C_FAT }}>G {t.g}g</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}

function CalendarModal({ history, historyDetail, goals, today, todayEntries, todayWater, onClose }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(today);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  const allHistory = { ...history };
  if (todayEntries.length > 0) {
    const totals = todayEntries.reduce((acc, e) => ({
      kcal: acc.kcal + e.kcal, p: acc.p + e.p, c: acc.c + e.c, g: acc.g + e.g
    }), { kcal: 0, p: 0, c: 0, g: 0 });
    allHistory[today] = { ...totals, water: todayWater };
  }
  const allHistoryDetail = { ...historyDetail };
  if (todayEntries.length > 0) allHistoryDetail[today] = todayEntries;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, data: allHistory[dateStr] });
  }

  const selectedData = allHistory[selectedDate];
  const selectedEntries = allHistoryDetail[selectedDate] || [];

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader accent={ACCENT} label="Calendario" title={monthName.charAt(0).toUpperCase() + monthName.slice(1)} onClose={onClose} />

      <div className="flex justify-between mb-3">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-2 rounded-full hover:bg-black/5">
          <ChevronLeft size={16} style={{ color: TEXT_MUTED }} />
        </button>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-2 rounded-full hover:bg-black/5">
          <ChevronRight size={16} style={{ color: TEXT_MUTED }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-3">
        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold uppercase" style={{ color: TEXT_LIGHT }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isSelected = cell.dateStr === selectedDate;
          const isToday = cell.dateStr === today;
          const hasData = !!cell.data;
          const goalPct = hasData ? cell.data.kcal / goals.kcal : 0;
          const inGoal = hasData && goalPct >= 0.90 && goalPct <= 1.10;
          const isFuture = cell.dateStr > today;
          const dotColor = !hasData
            ? (isFuture ? 'transparent' : '#D0CFC6')   // gris para días pasados sin registro
            : inGoal ? SUCCESS : ACCENT;
          return (
            <button key={i} onClick={() => setSelectedDate(cell.dateStr)}
              className="aspect-square rounded-xl flex flex-col items-center justify-center text-xs transition relative"
              style={{
                background: isSelected ? ACCENT : (hasData ? ACCENT_PASTEL + '40' : 'transparent'),
                color: isSelected ? '#fff' : (isFuture ? TEXT_LIGHT : TEXT),
                border: isToday && !isSelected ? `1.5px solid ${ACCENT}` : 'none',
                fontWeight: isToday || isSelected ? 600 : 400
              }}>
              <span>{cell.day}</span>
              {!isSelected && dotColor !== 'transparent' && (
                <div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{
                  background: dotColor,
                  opacity: !hasData ? 0.5 : 1
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-4 text-[10px]" style={{ color: TEXT_MUTED }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: SUCCESS }} />
          <span>En meta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
          <span>Con registro</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#D0CFC6', opacity: 0.5 }} />
          <span>Sin registro</span>
        </div>
      </div>

      <div className="pt-4 border-t" style={{ borderColor: BORDER_SOFT }}>
        <div className="text-xs font-semibold mb-3 capitalize" style={{ color: TEXT }}>
          {formatDate(selectedDate)}
        </div>
        {selectedData ? (
          <>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Stat label="kcal" val={selectedData.kcal} goal={goals.kcal} color={ACCENT} />
              <Stat label="P" val={selectedData.p} goal={goals.p} color={C_PROTEIN} unit="g" />
              <Stat label="C" val={selectedData.c} goal={goals.c} color={C_CARBS} unit="g" />
              <Stat label="G" val={selectedData.g} goal={goals.g} color={C_FAT} unit="g" />
            </div>
            {selectedEntries.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: TEXT_LIGHT }}>
                  Comidas del día
                </div>
                {selectedEntries.map((e, i) => (
                  <div key={i} className="text-xs p-3 rounded-xl" style={{ background: SURFACE_2 }}>
                    <div className="flex justify-between mb-1.5">
                      <span className="uppercase text-[10px] font-semibold tracking-wider" style={{ color: ACCENT_DARK }}>{e.meal}</span>
                      <span className="num text-[10px]" style={{ color: TEXT_LIGHT }}>{e.time}</span>
                    </div>
                    <div className="space-y-0.5">
                      {e.items.map((it, j) => (
                        <div key={j} className="flex justify-between text-[11px]">
                          <span style={{ color: TEXT }}>{it.name}{it.amount ? ` · ${it.amount}` : ''}</span>
                          <span className="num" style={{ color: TEXT_LIGHT }}>{it.kcal} kcal</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] num mt-1.5 pt-1.5 border-t flex gap-3" style={{ borderColor: BORDER_SOFT }}>
                      <span style={{ color: ACCENT_DARK, fontWeight: 600 }}>{Math.round(e.kcal ?? 0)} kcal</span>
                      <span style={{ color: C_PROTEIN }}>P{Math.round((e.p ?? 0) * 10) / 10}</span>
                      <span style={{ color: C_CARBS }}>C{Math.round((e.c ?? 0) * 10) / 10}</span>
                      <span style={{ color: C_FAT }}>G{Math.round((e.g ?? 0) * 10) / 10}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-center py-4" style={{ color: TEXT_LIGHT, lineHeight: 1.5 }}>
            Este día quedó sin registro.<br />Pasa. Lo importante es lo que viene.
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function Stat({ label, val, goal, color, unit = '' }) {
  const fmt = unit ? fmt1 : fmt0;
  return (
    <div className="text-center p-2 rounded-xl" style={{ background: SURFACE_2 }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>{label}</div>
      <div className="text-sm font-medium num mt-0.5" style={{ color }}>{fmt(val)}{unit}</div>
      <div className="text-[10px] num" style={{ color: TEXT_LIGHT }}>de {fmt0(goal)}{unit}</div>
    </div>
  );
}

function FavoritesModal({ favorites, onUse, onDelete, onRename, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader accent={C_CARBS} label="Favoritos" title="Menús favoritos" onClose={onClose} />
      {favorites.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: TEXT_MUTED }}>
          Aún sin menús guardados.<br />
          <span className="text-xs" style={{ color: TEXT_LIGHT }}>
            Toca la estrella en cualquier comida para guardarla.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {favorites.map((f) => (
            <div key={f.id} className="p-3 rounded-2xl flex items-center gap-3" style={{
              background: SURFACE_2, border: `1px solid ${BORDER_SOFT}`
            }}>
              <div className="flex-1 min-w-0">
                {editingId === f.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { onRename(f.id, editValue); setEditingId(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onRename(f.id, editValue); setEditingId(null); }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    placeholder={f.autoName || f.name}
                    className="w-full bg-white text-sm font-medium px-2 py-1 rounded border outline-none"
                    style={{ color: TEXT, borderColor: BORDER }}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-medium truncate" style={{ color: TEXT }}>{f.name}</div>
                    {f.type === 'day' && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: ACCENT_PASTEL, color: ACCENT_DARK }}>
                        día · {Array.isArray(f.days) ? f.days.length : 0} comidas
                      </span>
                    )}
                  </div>
                )}
                <div className="text-[10px] num" style={{ color: TEXT_LIGHT }}>
                  {Math.round(f.kcal || 0)} kcal · P{Math.round(f.p || 0)} C{Math.round(f.c || 0)} G{Math.round(f.g || 0)}
                </div>
              </div>
              {editingId !== f.id && (
                <button
                  onClick={() => { setEditValue(f.name); setEditingId(f.id); }}
                  className="p-1.5 rounded-full hover:bg-black/5 transition"
                  title="Renombrar">
                  <Pencil size={12} style={{ color: TEXT_LIGHT }} />
                </button>
              )}
              <button onClick={() => onUse(f)} className="px-3 py-1.5 rounded-full text-xs font-medium transition hover:scale-105"
                style={{ background: ACCENT, color: '#fff' }}>
                Usar
              </button>
              <button onClick={() => onDelete(f.id)} className="p-1.5 rounded-full hover:bg-black/5 transition">
                <Trash2 size={12} style={{ color: TEXT_LIGHT }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function FavoriteNameModal({ entry, todayEntriesCount = 0, onConfirm, onCancel, onSaveWholeDay }) {
  const autoName = (entry?.items || []).map(i => i.name).join(', ').slice(0, 60);
  const [value, setValue] = useState('');
  const canOfferDay = typeof onSaveWholeDay === 'function' && todayEntriesCount >= 2;
  return (
    <ModalShell onClose={onCancel} maxWidth="max-w-sm">
      <ModalHeader accent={C_CARBS} label="Guardar favorito" title="Ponle un nombre" onClose={onCancel} />
      <div className="text-[12px] mb-3" style={{ color: TEXT_MUTED, lineHeight: 1.55 }}>
        Opcional. Si lo dejas vacío, lo guardo con los nombres de los alimentos.
      </div>
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onConfirm(value); }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={autoName}
        className="w-full bg-white text-sm font-medium px-3 py-2.5 rounded-xl border outline-none mb-4"
        style={{ color: TEXT, borderColor: BORDER }}
      />
      <div className="text-[10px] mb-4" style={{ color: TEXT_LIGHT }}>
        Sin nombre quedaría: <em>{autoName}</em>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition active:scale-[0.98]"
          style={{ background: SURFACE_2, color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
          Cancelar
        </button>
        <button onClick={() => onConfirm(value)}
          className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition active:scale-[0.98]"
          style={{ background: '#1F1F1F', color: '#fff' }}>
          Guardar esta comida
        </button>
      </div>
      {canOfferDay && (
        <div className="pt-3 border-t" style={{ borderColor: BORDER_SOFT }}>
          <div className="text-[11px] mb-2" style={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
            ¿Prefieres guardar todo el día completo en vez de solo esta comida?
          </div>
          <button onClick={() => onSaveWholeDay(value)}
            className="w-full py-2.5 rounded-xl text-[12px] font-semibold transition active:scale-[0.98]"
            style={{ background: C_CARBS_PASTEL, color: C_CARBS, border: `1px solid ${C_CARBS}` }}>
            Mejor guarda el día completo
          </button>
        </div>
      )}
    </ModalShell>
  );
}


// Fallback de micros por palabra clave (densidad USDA aproximada por gramo).
// Solo se usa para registros VIEJOS que no traen fiber/omega3/sugar estimados
// por el LLM en cada item — los registros nuevos llegan con esos campos y son
// mucho más precisos. Se muestran solo Fibra, Omega-3 y Azúcar añadida:
// calcio/hierro/vitD se quitaron a propósito (son territorio de laboratorio,
// las metas dependen de sexo/edad, y con estimación parcial solo generaban
// alarmas falsas de "bajo" permanente).
const MICRO_DB = {
  // fiber g, omega3 g, azúcar AÑADIDA g por 1g de alimento
  'arroz':       { fiber: 0.004, omega3: 0,      sugar: 0 },
  'pollo':       { fiber: 0,     omega3: 0.0001, sugar: 0 },
  'pechuga':     { fiber: 0,     omega3: 0.0001, sugar: 0 },
  'pescado':     { fiber: 0,     omega3: 0.012,  sugar: 0 },
  'salmon':      { fiber: 0,     omega3: 0.022,  sugar: 0 },
  'atun':        { fiber: 0,     omega3: 0.013,  sugar: 0 },
  'sardina':     { fiber: 0,     omega3: 0.015,  sugar: 0 },
  'huevo':       { fiber: 0,     omega3: 0.001,  sugar: 0 },
  'avena':       { fiber: 0.1,   omega3: 0.0014, sugar: 0 },
  'banana':      { fiber: 0.026, omega3: 0,      sugar: 0 },
  'platano':     { fiber: 0.026, omega3: 0,      sugar: 0 },
  'manzana':     { fiber: 0.024, omega3: 0,      sugar: 0 },
  'palta':       { fiber: 0.067, omega3: 0.0011, sugar: 0 },
  'aguacate':    { fiber: 0.067, omega3: 0.0011, sugar: 0 },
  'arepa':       { fiber: 0.03,  omega3: 0,      sugar: 0 },
  'pan':         { fiber: 0.07,  omega3: 0,      sugar: 0 },
  'yogur':       { fiber: 0,     omega3: 0,      sugar: 0 },
  'leche':       { fiber: 0,     omega3: 0,      sugar: 0 },
  'queso':       { fiber: 0,     omega3: 0.001,  sugar: 0 },
  'almendra':    { fiber: 0.13,  omega3: 0.0001, sugar: 0 },
  'mantequilla mani': { fiber: 0.06, omega3: 0.0001, sugar: 0 },
  'espinaca':    { fiber: 0.022, omega3: 0.0014, sugar: 0 },
  'brocoli':     { fiber: 0.026, omega3: 0.001,  sugar: 0 },
  'lenteja':     { fiber: 0.079, omega3: 0.001,  sugar: 0 },
  'frijol':      { fiber: 0.06,  omega3: 0.001,  sugar: 0 },
  'tomate':      { fiber: 0.012, omega3: 0,      sugar: 0 },
  'aceite oliva':{ fiber: 0,     omega3: 0.008,  sugar: 0 },
  'nuez':        { fiber: 0.067, omega3: 0.09,   sugar: 0 },
  'nueces':      { fiber: 0.067, omega3: 0.09,   sugar: 0 },
  'chia':        { fiber: 0.34,  omega3: 0.178,  sugar: 0 },
  'linaza':      { fiber: 0.27,  omega3: 0.228,  sugar: 0 },
  // Fuentes de azúcar añadida (para que el fallback también la detecte)
  'gaseosa':     { fiber: 0,     omega3: 0,      sugar: 0.106 },
  'refresco':    { fiber: 0,     omega3: 0,      sugar: 0.106 },
  'coca':        { fiber: 0,     omega3: 0,      sugar: 0.106 },
  'jugo':        { fiber: 0.002, omega3: 0,      sugar: 0.09 },
  'chocolate':   { fiber: 0.07,  omega3: 0,      sugar: 0.47 },
  'galleta':     { fiber: 0.02,  omega3: 0,      sugar: 0.30 },
  'helado':      { fiber: 0,     omega3: 0,      sugar: 0.21 },
  'postre':      { fiber: 0.01,  omega3: 0,      sugar: 0.30 },
  'torta':       { fiber: 0.01,  omega3: 0,      sugar: 0.35 },
  'pastel':      { fiber: 0.01,  omega3: 0,      sugar: 0.35 },
  'dulce':       { fiber: 0,     omega3: 0,      sugar: 0.55 },
  'miel':        { fiber: 0,     omega3: 0,      sugar: 0.82 },
  'panela':      { fiber: 0,     omega3: 0,      sugar: 0.95 },
  'azucar':      { fiber: 0,     omega3: 0,      sugar: 1.0 },
  'mermelada':   { fiber: 0.01,  omega3: 0,      sugar: 0.49 },
  'arequipe':    { fiber: 0,     omega3: 0,      sugar: 0.50 },
};
// Fibra y omega-3 son METAS (más es mejor); azúcar añadida es TECHO de
// referencia (~AHA hombres 36g; OMS <10% kcal). Menos es mejor.
const DAILY_MICRO_GOALS = { fiber: 28, omega3: 1.6, sugar: 36 };

function matchMicroKey(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const key of Object.keys(MICRO_DB)) {
    if (n.includes(key)) return key;
  }
  return null;
}

function estimateMicros(items) {
  const result = { fiber: 0, omega3: 0, sugar: 0 };
  for (const it of items) {
    // Vía preferida: el LLM ya estimó los micros de este item al registrarlo
    // (los campos solo existen cuando vinieron en su respuesta).
    if (it.fiber != null || it.omega3 != null || it.sugar != null) {
      result.fiber += Number(it.fiber) > 0 ? Number(it.fiber) : 0;
      result.omega3 += Number(it.omega3) > 0 ? Number(it.omega3) : 0;
      result.sugar += Number(it.sugar) > 0 ? Number(it.sugar) : 0;
      continue;
    }
    // Fallback para registros viejos: tabla por palabra clave
    const key = matchMicroKey(it.name);
    if (!key) continue;
    // Try to extract grams from amount string ("100g", "50 g", "1 unidad (~50g)")
    let grams = 0;
    const amt = (it.amount || '').toLowerCase();
    const gMatch = amt.match(/(\d+(?:\.\d+)?)\s*g/);
    if (gMatch) grams = parseFloat(gMatch[1]);
    else if (it.kcal && it.kcal > 0) {
      // Rough fallback: assume 1.5 kcal per gram (mixed foods average)
      grams = it.kcal / 1.5;
    }
    if (grams <= 0) continue;
    const db = MICRO_DB[key];
    result.fiber += db.fiber * grams;
    result.omega3 += db.omega3 * grams;
    result.sugar += db.sugar * grams;
  }
  return result;
}

// ─── MI SEMANA: adherencia de la semana pasada (lunes a domingo) ─────────
// Combina el entreno (seguimiento del coach en el CRM, vía /api/adherence)
// con la alimentación calculada localmente (history + goals). Dos reglas de
// psicología del cliente, deliberadas:
//   1. NUNCA convertir "sin registro" en 0% — no anotar no es fallar, y
//      confundirlos es lo que hace que la gente deje de abrir la app.
//   2. La alineación con la meta solo se muestra con 3+ días registrados;
//      con menos, el empujón correcto es "registra más", no un % engañoso.

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Fechas (YYYY-MM-DD locales) del lunes al domingo de la semana PASADA.
function prevWeekDates(todayKey) {
  const [y, m, d] = todayKey.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  const dow = (t.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(t);
  monday.setDate(t.getDate() - dow - 7);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return getLocalDate(dd);
  });
}

// Meta VIGENTE en una fecha dada (misma lógica que el server): cada día del
// histórico se evalúa contra la meta que regía ESE día. Sin historial se usa
// la meta actual; fechas anteriores a la primera entrada usan la primera.
function goalsVigentes(goalsHistory, currentGoals, date) {
  if (!Array.isArray(goalsHistory) || goalsHistory.length === 0) return currentGoals || null;
  let g = null;
  for (const h of goalsHistory) {
    if (h.since <= date) g = h; else break;
  }
  return g || goalsHistory[0] || currentGoals || null;
}

// Cercanía del día a la meta, 0–100 — MISMA fórmula que el coach usa en
// /api/coach-data.js (dayGoalScore): el cliente y el coach ven el mismo número.
function dayGoalScoreCliente(totals, goals) {
  if (!goals || !totals) return null;
  let sum = 0, n = 0;
  for (const key of ['kcal', 'p', 'c', 'g']) {
    const goal = Number(goals[key]);
    if (!goal || goal <= 0) continue;
    const val = Number(totals[key]) || 0;
    sum += Math.max(0, 1 - Math.abs(val - goal) / goal);
    n++;
  }
  return n === 0 ? null : Math.round((sum / n) * 100);
}

// Niveles con nombre en vez de nota de examen. El último tramo es neutro a
// propósito: gris, sin "mal/bajo" y sin rojo — una semana floja no se castiga,
// se reinicia.
const NIVELES_SEMANA = [
  { min: 90, label: 'Imparable', emoji: '🔥', color: '#10b981' },
  { min: 70, label: 'En ritmo', emoji: '💪', color: '#3b82f6' },
  { min: 50, label: 'Construyendo', emoji: '🌱', color: '#f59e0b' },
  { min: 0, label: 'Semana de reinicio', emoji: '🌤', color: '#64748b' },
];
const nivelSemana = (pct) => (pct == null ? null : NIVELES_SEMANA.find(n => pct >= n.min));

// Resumen de la semana pasada. `training` es la respuesta de /api/adherence
// ({cerrado, planeados, asistidos, dias} | {cerrado:false, plan} | null).
// `goalsHistory` (opcional) hace que cada día se compare con SU meta vigente.
function computeWeekReview(history, goals, training, todayKey, goalsHistory) {
  const dates = prevWeekDates(todayKey);
  const logged = dates.filter(d => history[d] && history[d].kcal > 0);
  const registro = logged.length;
  const scores = logged.map(d => dayGoalScoreCliente(history[d], goalsVigentes(goalsHistory, goals, d))).filter(s => s != null);
  const alineacion = registro >= 3 && scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const entrenoPct = training && training.cerrado && training.planeados > 0
    ? Math.min(100, Math.round((training.asistidos / training.planeados) * 100))
    : null;

  // Nivel global = promedio de los pilares que SÍ tienen datos. Sin ningún
  // dato no hay nivel (la UI dice "sin registro", jamás un 0%).
  const parts = [];
  if (entrenoPct != null) parts.push(entrenoPct);
  if (registro > 0) parts.push(Math.round((registro / 7) * 100));
  if (alineacion != null) parts.push(alineacion);
  const overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

  return {
    dates, registro, alineacion, entrenoPct,
    entreno: training || null,
    overall,
    nivel: nivelSemana(overall),
  };
}

// El mensaje del coach: UNO solo, en positivo, y siempre apuntando a la
// acción de ESTA semana. Nunca sermonea la semana que ya pasó.
function mensajeSemana(r) {
  const e = r.entreno;
  const tieneEntreno = e && e.cerrado && e.planeados > 0;
  if (r.registro === 0 && !tieneEntreno) {
    return 'La semana pasada quedó sin registro — pasa, y no borra nada de lo construido. Esta semana el objetivo es simple: anota tu primer día y ya estás de vuelta.';
  }
  const pedazos = [];
  if (tieneEntreno) {
    if (e.asistidos >= e.planeados) pedazos.push(`cumpliste tus ${e.planeados} entrenos`);
    else if (e.asistidos > 0) pedazos.push(`${e.asistidos} de ${e.planeados} entrenos`);
  }
  if (r.registro > 0) pedazos.push(`${r.registro} ${r.registro === 1 ? 'día' : 'días'} de registro`);
  const resumen = pedazos.join(' y ');
  const ov = r.overall ?? 0;
  if (ov >= 90) return `Semana redonda: ${resumen}. Esto ya no es motivación, es hábito — y los hábitos son los que transforman. 🔥`;
  if (ov >= 70) return `${resumen.charAt(0).toUpperCase() + resumen.slice(1)}. Así se construye: no con semanas perfectas, con semanas constantes. 💪`;
  if (ov >= 50) return `${resumen.charAt(0).toUpperCase() + resumen.slice(1)}. La base está — esta semana súmale un día más y la curva cambia. 🌱`;
  if (tieneEntreno && e.asistidos === 0) return 'La semana pasada no salieron los entrenos — a todos nos pasa. Esta semana la meta es una sola: el primer entreno. Del resto nos encargamos después.';
  return `${resumen ? resumen.charAt(0).toUpperCase() + resumen.slice(1) + '. ' : ''}Semana de reinicio: cero drama y un solo foco — arrancar. Tu primer registro o tu primer entreno de esta semana lo cambia todo.`;
}

function PerformanceModal({ history, historyDetail, entries, goals, today, name, wellbeing, training, goalsHistory, onClose }) {
  const [tab, setTab] = useState('panorama'); // panorama | alimentacion
  // Dentro de Alimentación: ventana de tiempo. "Tendencia" se quitó — a 12
  // semanas casi nadie la entendía y el mes ya cuenta esa historia.
  const [alimTab, setAlimTab] = useState('semana'); // semana | mes

  // Estilo "reporte del coach": este panel usa la MISMA paleta del dashboard
  // del coach / CRM (slate + esmeralda + serie azul/ámbar/violeta de las
  // gráficas, ver coachTheme.js) para que el cliente vea el mismo lenguaje
  // visual de los reportes de su coach. Se SOMBREAN los tokens del tema
  // oliva/crema del cliente solo dentro de este modal — el resto de la app
  // no cambia.
  const SURFACE_2 = '#f1f5f9', TEXT = '#0f172a', TEXT_MUTED = '#64748b',
        TEXT_LIGHT = '#94a3b8', SUCCESS = '#10b981', WARN = '#f59e0b',
        ACCENT = '#10b981', ACCENT_DARK = '#065f46',
        C_PROTEIN = '#3b82f6', C_CARBS = '#f59e0b', C_FAT = '#8b5cf6';

  // Combined history including today
  const combinedHistory = { ...history };
  const combinedDetail = { ...historyDetail };
  if (entries.length > 0) {
    const t = entries.reduce((acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      p: acc.p + (e.p || 0),
      c: acc.c + (e.c || 0),
      g: acc.g + (e.g || 0),
    }), { kcal: 0, p: 0, c: 0, g: 0 });
    combinedHistory[today] = t;
    combinedDetail[today] = entries;
  }

  const daysBack = (n) => {
    const arr = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const key = getLocalDate(d);
      arr.push({ date: key, jsDate: new Date(d), data: combinedHistory[key] || null });
    }
    return arr;
  };

  const week = daysBack(7);
  const month = daysBack(30);

  // Trend: group last 12 weeks by week
  const trendDays = daysBack(84);
  const weeks = [];
  for (let i = 0; i < 12; i++) {
    const chunk = trendDays.slice(i * 7, i * 7 + 7);
    const recorded = chunk.filter(d => d.data && d.data.kcal > 0);
    const avg = (key) => recorded.length > 0
      ? recorded.reduce((s, d) => s + (d.data[key] || 0), 0) / recorded.length
      : 0;
    weeks.push({
      label: `S${i + 1}`,
      startDate: chunk[0]?.date,
      kcal: Math.round(avg('kcal')),
      p: Math.round(avg('p')),
      c: Math.round(avg('c')),
      g: Math.round(avg('g')),
      registered: recorded.length,
    });
  }

  const stats = (days, key) => {
    const recorded = days.filter(d => d.data && d.data.kcal > 0);
    if (recorded.length === 0) return { avg: 0, pct: 0, inGoal: 0 };
    const avg = recorded.reduce((s, d) => s + (d.data[key] || 0), 0) / recorded.length;
    // Trazabilidad: el "% de la meta" y los días "en meta" se evalúan contra
    // la meta VIGENTE en cada fecha (goals_history) — cambiar la meta hoy no
    // reescribe el cumplimiento de días pasados.
    const goalOf = (date) => (goalsVigentes(goalsHistory, goals, date) || goals)[key] || 1;
    const inGoal = recorded.filter(d => {
      const v = d.data[key] || 0;
      const goal = goalOf(d.date);
      return v >= goal * 0.9 && v <= goal * 1.1;
    }).length;
    const pct = Math.round((recorded.reduce((s, d) => s + ((d.data[key] || 0) / goalOf(d.date)), 0) / recorded.length) * 100);
    return { avg: Math.round(avg), pct, inGoal };
  };

  // Wellbeing averages (week)
  const weekWb = week
    .map(d => wellbeing[d.date])
    .filter(Boolean);
  const wbAvg = weekWb.length > 0 ? {
    energy: (weekWb.reduce((s, w) => s + (w.energy || 0), 0) / weekWb.length).toFixed(1),
    hunger: (weekWb.reduce((s, w) => s + (w.hunger || 0), 0) / weekWb.length).toFixed(1),
    mood: (weekWb.reduce((s, w) => s + (w.mood || 0), 0) / weekWb.length).toFixed(1),
    count: weekWb.length,
  } : null;

  // ─── BEHAVIOR METRICS (process-focused, not goal-binary) ───
  // 1. Adherencia: días registrados últimos 7 vs 7 anteriores
  const prev7 = daysBack(14).slice(0, 7);
  const recordedLast7 = week.filter(d => d.data && d.data.kcal > 0).length;
  const recordedPrev7 = prev7.filter(d => d.data && d.data.kcal > 0).length;
  const adherenceDelta = recordedLast7 - recordedPrev7;

  // 2. Hora promedio del primer registro (cuándo arranca el día)
  const firstEntryHours = week.map(d => {
    const det = combinedDetail[d.date];
    if (!det || det.length === 0) return null;
    const sorted = [...det].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    const [h, m] = (sorted[0].time || '12:00').split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
  }).filter(x => x !== null);
  const avgFirstHour = firstEntryHours.length > 0
    ? firstEntryHours.reduce((s, h) => s + h, 0) / firstEntryHours.length
    : null;
  const fmtHour = (h) => {
    if (h === null) return '—';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${hh}:${String(mm).padStart(2, '0')}`;
  };

  // 3. Tendencia de proteína (últimos 7 vs 7 anteriores)
  const protLast7 = recordedLast7 > 0
    ? Math.round(week.filter(d => d.data && d.data.kcal > 0).reduce((s, d) => s + (d.data.p || 0), 0) / recordedLast7)
    : 0;
  const protPrev7 = recordedPrev7 > 0
    ? Math.round(prev7.filter(d => d.data && d.data.kcal > 0).reduce((s, d) => s + (d.data.p || 0), 0) / recordedPrev7)
    : 0;
  const protDelta = protLast7 - protPrev7;

  // 4. Detalle promedio: items registrados por día (mide cuán completo es el registro)
  const itemsPerDay = week.map(d => {
    const det = combinedDetail[d.date];
    if (!det || det.length === 0) return null;
    return det.reduce((s, e) => s + ((e.items && e.items.length) || 0), 0);
  }).filter(x => x !== null);
  const avgItemsPerDay = itemsPerDay.length > 0
    ? Math.round(itemsPerDay.reduce((s, n) => s + n, 0) / itemsPerDay.length)
    : 0;

  // Micros (last 7 days, average per day with data)
  const microSum = { fiber: 0, omega3: 0, sugar: 0 };
  let microDays = 0;
  for (const d of week) {
    const det = combinedDetail[d.date];
    if (!det || det.length === 0) continue;
    const allItems = det.flatMap(e => e.items || []);
    const m = estimateMicros(allItems);
    microSum.fiber += m.fiber;
    microSum.omega3 += m.omega3;
    microSum.sugar += m.sugar;
    microDays++;
  }
  const microAvg = microDays > 0 ? {
    fiber: microSum.fiber / microDays,
    omega3: microSum.omega3 / microDays,
    sugar: microSum.sugar / microDays,
  } : null;

  const dayShort = (date) => {
    const [y, m, dd] = date.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    return d.toLocaleDateString('es', { weekday: 'short' }).slice(0, 1).toUpperCase();
  };
  const monthDay = (date) => {
    const [y, m, dd] = date.split('-').map(Number);
    return dd;
  };

  const Chart = ({ days, color, goal, label, unit, showLabels = false, type = 'day' }) => {
    if (!goal || goal <= 0) return null;
    // Scale top = max(140% of goal, max recorded value with some padding)
    const maxRecorded = Math.max(0, ...days.map(d => (d.data ? (d.data[label] || 0) : 0)));
    const maxScale = Math.max(goal * 1.4, maxRecorded * 1.1, goal * 1.1);
    const goalPct = (goal / maxScale) * 100; // % from bottom where the goal line sits
    const showBarValues = type === 'day'; // weekly view has room for values
    return (
      <div>
        <div className="relative w-full" style={{ height: '110px', background: SURFACE_2 + '60', borderRadius: '8px', padding: '8px 6px' }}>
          {/* Goal line — horizontal dashed at goal level */}
          <div className="absolute left-0 right-0 flex items-center" style={{ bottom: `${goalPct}%`, height: '1px', zIndex: 1 }}>
            <div className="flex-1 border-t-[1.5px] border-dashed" style={{ borderColor: SUCCESS, opacity: 0.6 }} />
            <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SUCCESS, background: SURFACE_2 + 'F0' }}>meta {goal}{unit}</span>
          </div>
          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-[3px] px-2 pb-2 pt-2" style={{ zIndex: 2 }}>
            {days.map((d, i) => {
              const val = d.data ? (d.data[label] || 0) : 0;
              const pct = goal > 0 ? val / goal : 0;
              const heightPct = val > 0 ? Math.min((val / maxScale) * 100, 100) : 0;
              const inGoal = val > 0 && pct >= 0.9 && pct <= 1.1;
              const over = val > goal * 1.1;
              const fillColor = val === 0 ? '#cbd5e1' : (inGoal ? SUCCESS : over ? WARN : color);
              const isToday = d.date === today;
              return (
                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center" style={{ minWidth: 0 }}>
                  {showBarValues && val > 0 && (
                    <div className="text-[10px] font-bold mb-0.5 num" style={{ color: fillColor }}>
                      {Math.round(val)}
                    </div>
                  )}
                  <div
                    className="w-full"
                    style={{
                      height: val > 0 ? `${heightPct}%` : '2px',
                      background: fillColor,
                      opacity: val === 0 ? 0.45 : 1,
                      borderRadius: '3px 3px 1px 1px',
                      minHeight: val > 0 ? '4px' : '2px',
                      transition: 'height 0.4s cubic-bezier(0.2, 0, 0, 1)',
                      outline: isToday ? `1.5px solid ${TEXT}` : 'none',
                      outlineOffset: '1px',
                    }}
                    title={`${d.date}: ${Math.round(val)}${unit} (${Math.round(pct * 100)}% de la meta)`}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {showLabels && (
          <div className="flex gap-[3px] w-full mt-1.5 px-2">
            {days.map((d, i) => {
              const showLbl = type === 'day' || i === 0 || i === days.length - 1 || (type === 'month' && i % 7 === 0);
              const isToday = d.date === today;
              return (
                <div key={i} className="flex-1 text-center" style={{ fontSize: '9px', color: isToday ? TEXT : TEXT_LIGHT, minWidth: 0, fontWeight: isToday ? 700 : 500 }}>
                  {showLbl ? (type === 'day' ? dayShort(d.date) : monthDay(d.date)) : ''}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const StatBlock = ({ label, color, goal, unit, data, statKey }) => {
    const s = stats(data, statKey);
    const recorded = data.filter(d => d.data && d.data.kcal > 0).length;
    return (
      <div className="mb-4" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 12px 10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex justify-between items-end mb-2">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: TEXT_LIGHT }}>
              Promedio diario · meta {goal}{unit}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[18px] font-bold num leading-tight" style={{ color: TEXT }}>
              {s.avg}<span className="text-[11px] num" style={{ color: TEXT_MUTED }}>{unit}</span>
            </div>
            <div className="text-[10px] num" style={{ color: s.pct >= 90 && s.pct <= 110 ? SUCCESS : TEXT_LIGHT }}>
              {s.pct}% de meta
            </div>
          </div>
        </div>
        <Chart days={data} color={color} goal={goal} label={statKey} unit={unit} showLabels={true} type={data.length > 14 ? 'month' : 'day'} />
        {recorded > 0 && (
          <div className="text-[10px] mt-1.5" style={{ color: TEXT_LIGHT }}>
            {recorded === 1 && s.inGoal === 0
              ? '1 día registrado · fuera del rango ±10% de la meta'
              : recorded === 1 && s.inGoal === 1
              ? '1 día registrado · en meta ±10%'
              : `${s.inGoal} de ${recorded} días en meta ±10%`}
          </div>
        )}
        {recorded === 0 && (
          <div className="text-[10px] mt-1.5 italic" style={{ color: TEXT_LIGHT }}>
            Aún sin registros en este periodo.
          </div>
        )}
      </div>
    );
  };

  // Barras semanales — mismo lenguaje visual que las gráficas de Semana/Mes
  // (antes era la única gráfica de línea del panel).
  const TrendBlock = ({ label, color, goal, unit, statKey }) => {
    const recorded = weeks.filter(w => w.registered > 0);
    if (recorded.length === 0) return null;
    const avg = Math.round(recorded.reduce((s, w) => s + w[statKey], 0) / recorded.length);
    const pct = Math.round((avg / goal) * 100);
    const maxRecorded = Math.max(0, ...weeks.map(w => w[statKey] || 0));
    const maxScale = Math.max(goal * 1.4, maxRecorded * 1.1, goal * 1.1);
    const goalPct = (goal / maxScale) * 100;
    return (
      <div className="mb-4" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 12px 10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex justify-between items-baseline mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
            <span className="text-[10px] num" style={{ color: TEXT_LIGHT }}>meta {goal}{unit}</span>
          </div>
          <div className="text-right">
            <span className="text-[14px] font-bold num" style={{ color: TEXT }}>{avg}{unit}</span>
            <span className="text-[10px] num ml-1" style={{ color: TEXT_LIGHT }}>· {pct}% promedio</span>
          </div>
        </div>
        <div className="relative w-full" style={{ height: '90px', background: SURFACE_2 + '60', borderRadius: '8px', padding: '8px 6px' }}>
          {/* Goal line — horizontal dashed at goal level */}
          <div className="absolute left-0 right-0 flex items-center" style={{ bottom: `${goalPct}%`, height: '1px', zIndex: 1 }}>
            <div className="flex-1 border-t-[1.5px] border-dashed" style={{ borderColor: SUCCESS, opacity: 0.6 }} />
            <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SUCCESS, background: SURFACE_2 + 'F0' }}>meta {goal}{unit}</span>
          </div>
          {/* Bars — one per week */}
          <div className="absolute inset-0 flex items-end gap-[3px] px-2 pb-2 pt-2" style={{ zIndex: 2 }}>
            {weeks.map((w, i) => {
              const val = w.registered > 0 ? (w[statKey] || 0) : 0;
              const ratio = goal > 0 ? val / goal : 0;
              const heightPct = val > 0 ? Math.min((val / maxScale) * 100, 100) : 0;
              const inGoal = val > 0 && ratio >= 0.9 && ratio <= 1.1;
              const over = val > goal * 1.1;
              const fillColor = val === 0 ? '#cbd5e1' : (inGoal ? SUCCESS : over ? WARN : color);
              return (
                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center" style={{ minWidth: 0 }}>
                  <div
                    className="w-full"
                    style={{
                      height: val > 0 ? `${heightPct}%` : '2px',
                      background: fillColor,
                      opacity: val === 0 ? 0.45 : 1,
                      borderRadius: '3px 3px 1px 1px',
                      minHeight: val > 0 ? '4px' : '2px',
                      transition: 'height 0.4s cubic-bezier(0.2, 0, 0, 1)',
                    }}
                    title={`Semana desde ${w.startDate}: ${Math.round(val)}${unit} promedio (${Math.round(ratio * 100)}% de la meta)`}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between text-[10px] mt-1" style={{ color: TEXT_LIGHT }}>
          <span>hace 12 sem</span>
          <span>esta semana</span>
        </div>
      </div>
    );
  };

  // Tono sin alarmas: esto es información educativa, no un diagnóstico. Un
  // valor por debajo de la referencia NO es "deficiencia" — casi siempre solo
  // significa que esa semana se registraron pocas fuentes. Por eso: nada de
  // "⚠ bajo"; cuando falta, se sugiere QUÉ comida sumar. La única señal en
  // WARN es pasarse del techo de azúcar añadida (dirección inversa: menos es
  // mejor), y aun ahí el texto es neutro.
  const MicroRow = ({ label, value, goal, unit, hint, suggestion, direction = 'more' }) => {
    const pct = goal > 0 ? value / goal : 0;
    const barPct = Math.max(0, Math.min(1, pct));
    const covered = direction === 'more' ? pct >= 0.9 : pct <= 1;
    const status = direction === 'more'
      ? (covered ? '✓ bien cubierto' : 'puedes sumar fuentes')
      : (covered ? '✓ dentro de la referencia' : 'por encima de la referencia');
    const statusColor = covered ? SUCCESS : (direction === 'less' ? WARN : TEXT_MUTED);
    const barColor = covered ? SUCCESS : (direction === 'less' ? WARN : ACCENT);
    return (
      <div className="py-2" style={{ borderBottom: `1px solid ${BORDER_SOFT}` }}>
        <div className="flex justify-between items-baseline mb-1.5">
          <div>
            <div className="text-[12px] font-medium" style={{ color: TEXT }}>{label}</div>
            {hint && <div className="text-[10px]" style={{ color: TEXT_LIGHT }}>{hint}</div>}
          </div>
          <div className="text-right">
            <div className="text-[12px] num" style={{ color: TEXT }}>
              <strong>{value < 10 ? value.toFixed(1) : Math.round(value)}{unit}</strong>
              <span style={{ color: TEXT_LIGHT, fontWeight: 400 }}>/día · {direction === 'less' ? 'máx' : 'meta'} {goal}{unit}</span>
            </div>
            <div className="text-[10px]" style={{ color: statusColor }}>{status}</div>
          </div>
        </div>
        {/* Barra de progreso hacia la referencia diaria */}
        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: BORDER_SOFT }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barPct * 100}%`, background: barColor }}
          />
        </div>
        {direction === 'more' && !covered && suggestion && (
          <div className="text-[10px] mt-1.5" style={{ color: TEXT_LIGHT }}>
            Puedes sumar: {suggestion}
          </div>
        )}
      </div>
    );
  };

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-xl">
      <ModalHeader accent={ACCENT_DARK} label="Mi Semana" title={name ? `Cómo te ha ido, ${name.split(' ')[0]}` : 'Cómo te ha ido'} onClose={onClose} />

      {/* Tabs — "Resumen" es la portada: la adherencia de la semana CERRADA
          (entreno + alimentación en la misma ventana de tiempo). Las gráficas
          de siempre viven detrás, en las otras pestañas. */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: SURFACE_2 }}>
        {[
          { key: 'panorama', label: 'Panorama' },
          { key: 'alimentacion', label: 'Alimentación' },
        ].map(t => (
          <button key={t.key} onClick={() => { haptic(6); setTab(t.key); }}
            className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition active:scale-[0.98]"
            style={{
              // Chip activo pizarra, como los tabs del CRM/dashboard del coach
              background: tab === t.key ? '#0f172a' : 'transparent',
              color: tab === t.key ? '#fff' : TEXT_MUTED,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'panorama' && (() => {
        const r = computeWeekReview(combinedHistory, goals, training, today, goalsHistory);
        const e = r.entreno;
        const entrenoCerrado = !!(e && e.cerrado && e.planeados > 0);
        const cardShadow = { background: SURFACE, boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset' };

        // Rango legible "14–20 de julio" (o "28 jul – 3 de agosto" si cruza mes)
        const fdate = (k, opts) => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('es', opts); };
        const rango = r.dates[0].slice(0, 7) === r.dates[6].slice(0, 7)
          ? `${Number(r.dates[0].slice(8))}–${fdate(r.dates[6], { day: 'numeric', month: 'long' })}`
          : `${fdate(r.dates[0], { day: 'numeric', month: 'short' })} – ${fdate(r.dates[6], { day: 'numeric', month: 'long' })}`;

        // Semana EN CURSO (en vivo): la alimentación sí es tiempo real — se
        // aprovecha aquí. El entreno en vivo aún no existe (llegará con la
        // integración de la app de entrenamiento); mientras tanto se dice
        // explícitamente cuándo se suma, para que el desfase no confunda.
        const [cy, cm, cd] = today.split('-').map(Number);
        const hoyDate = new Date(cy, cm - 1, cd);
        const dowHoy = (hoyDate.getDay() + 6) % 7; // 0 = lunes
        const semanaCurso = Array.from({ length: dowHoy + 1 }, (_, i) => {
          const dd = new Date(hoyDate); dd.setDate(hoyDate.getDate() - dowHoy + i); return getLocalDate(dd);
        });
        const registroCurso = semanaCurso.filter(d => combinedHistory[d] && combinedHistory[d].kcal > 0).length;
        // Alineación a meta de la semana EN CURSO — misma regla que la
        // pasada: solo con 3+ días registrados (con menos, el % engaña).
        const scoresCurso = semanaCurso
          .filter(d => combinedHistory[d] && combinedHistory[d].kcal > 0)
          .map(d => dayGoalScoreCliente(combinedHistory[d], goals))
          .filter(s => s != null);
        const alineacionCurso = registroCurso >= 3 && scoresCurso.length > 0
          ? Math.round(scoresCurso.reduce((a, b) => a + b, 0) / scoresCurso.length)
          : null;

        // Mini indicador "Meta nutricional" — vive DENTRO de cada columna de
        // alimentación para que registro y alineación se lean juntos.
        const MetaMini = ({ pct }) => pct != null ? (
          <div className="mt-2.5 px-1 text-left">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[9px]" style={{ color: TEXT_MUTED }}>Meta nutricional</span>
              <strong className="text-[10.5px] num" style={{ color: TEXT }}>{pct}%</strong>
            </div>
            <div className="relative h-1 rounded-full overflow-hidden" style={{ background: SURFACE_2 }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? SUCCESS : C_CARBS }} />
            </div>
          </div>
        ) : (
          <div className="text-[8.5px] mt-2.5" style={{ color: TEXT_LIGHT }}>Meta: visible con 3+ días de registro</div>
        );

        const Ring = ({ pct, color, center, sub, size = 86 }) => {
          const rr = (size - 12) / 2;
          const circ = 2 * Math.PI * rr;
          const p = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
          return (
            <div className="relative mx-auto" style={{ width: size, height: size }}>
              <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={rr} fill="none" stroke={SURFACE_2} strokeWidth="9" />
                <circle cx={size / 2} cy={size / 2} r={rr} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${circ * p} ${circ}`} style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2,0,0,1)' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[17px] font-bold num leading-none" style={{ color: TEXT }}>{center}</div>
                {sub && <div className="text-[9px] mt-0.5" style={{ color: TEXT_LIGHT }}>{sub}</div>}
              </div>
            </div>
          );
        };

        // Fila L-M-X-J-V-S-D: círculo lleno = día cumplido. La visual más
        // intuitiva para "3 de 4" — y dispara el instinto de completar la fila.
        const Dots = ({ on, color, align = 'center' }) => (
          <div className={`flex ${align === 'left' ? 'justify-start' : 'justify-center'} gap-1 mt-2.5`}>
            {DIAS_SEMANA.map((l, i) => (
              <div key={l} className="flex items-center justify-center rounded-full text-[8px] font-bold"
                style={{
                  width: 17, height: 17,
                  background: on[i] ? color : SURFACE_2,
                  color: on[i] ? '#fff' : TEXT_LIGHT,
                }}>{l}</div>
            ))}
          </div>
        );

        return (
          <div>
            {/* Nivel de la semana — nombre antes que número: el % existe pero
                chiquito. Nada de rojos ni "bajo": el peor caso es neutro. */}
            <div className="p-4 rounded-2xl mb-2.5 text-center" style={cardShadow}>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>
                Semana pasada · {rango}
              </div>
              {r.nivel ? (
                <>
                  <div className="text-[30px] leading-none mt-2.5">{r.nivel.emoji}</div>
                  <div className="text-[21px] font-bold mt-1.5" style={{ color: r.nivel.color }}>{r.nivel.label}</div>
                  <div className="text-[11px] num mt-1" style={{ color: TEXT_LIGHT }}>{r.overall}% de adherencia</div>
                </>
              ) : (
                <>
                  <div className="text-[15px] font-semibold mt-2.5" style={{ color: TEXT }}>Semana sin registro</div>
                  <div className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>No pasa nada — la de ahora es la que cuenta.</div>
                </>
              )}
            </div>

            {/* Entrenamiento — MISMO protagonismo que alimentación siempre:
                cuando el seguimiento aún no está cargado, el anillo muestra
                el plan en tono neutro y el estado es "en revisión" — nunca
                un hueco ni un "el coach va atrasado". */}
            <div className="p-3.5 rounded-xl mb-2.5" style={cardShadow}>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  {entrenoCerrado ? (
                    <Ring pct={r.entrenoPct} color={e.asistidos > 0 ? SUCCESS : TEXT_LIGHT}
                      center={`${e.asistidos}/${e.planeados}`} sub="entrenos" size={92} />
                  ) : (
                    <Ring pct={0} color={TEXT_LIGHT}
                      center={e && e.plan ? `${e.plan}d` : '—'} sub={e && e.plan ? 'tu plan' : 'por definir'} size={92} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>Entrenamiento · semana pasada</div>
                  {entrenoCerrado ? (
                    <>
                      <div className="text-[13.5px] font-semibold mt-1 num" style={{ color: TEXT }}>{r.entrenoPct}% de tu plan cumplido</div>
                      {Array.isArray(e.dias) && e.dias.length > 0 && (
                        <Dots on={DIAS_SEMANA.map(l => e.dias.includes(l))} color={SUCCESS} align="left" />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-[13.5px] font-semibold mt-1" style={{ color: TEXT }}>En revisión con tu coach</div>
                      <div className="text-[10px] mt-1" style={{ color: TEXT_LIGHT, lineHeight: 1.45 }}>
                        Tus entrenos entran aquí con el seguimiento semanal. La semana en curso también va por ese camino.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Alimentación — dos ventanas con IGUAL relevancia: la semana
                pasada (cerrada, comparable con entreno) y la semana en curso
                (en vivo, porque el registro de comida sí es tiempo real). */}
            <div className="p-3.5 rounded-xl mb-2.5" style={cardShadow}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: TEXT_LIGHT }}>Alimentación · días con registro</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-[10px] font-semibold mb-2" style={{ color: TEXT_MUTED }}>Semana pasada</div>
                  {r.registro > 0 ? (
                    <>
                      <Ring pct={Math.round((r.registro / 7) * 100)} color={C_PROTEIN}
                        center={`${r.registro}/7`} sub="días" size={80} />
                      <Dots on={r.dates.map(d => !!(combinedHistory[d] && combinedHistory[d].kcal > 0))} color={C_PROTEIN} />
                      <MetaMini pct={r.alineacion} />
                    </>
                  ) : (
                    <>
                      <Ring pct={0} color={TEXT_LIGHT} center="—" sub="sin registro" size={80} />
                      <div className="text-[9.5px] mt-2" style={{ color: TEXT_LIGHT }}>Cada día anotado suma aquí</div>
                    </>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-semibold mb-2 flex items-center justify-center gap-1.5" style={{ color: TEXT_MUTED }}>
                    Esta semana
                    <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: SUCCESS, boxShadow: `0 0 0 2.5px ${SUCCESS}30` }} />
                  </div>
                  <Ring pct={Math.round((registroCurso / semanaCurso.length) * 100)} color={SUCCESS}
                    center={`${registroCurso}/${semanaCurso.length}`} sub="hasta hoy" size={80} />
                  <MetaMini pct={alineacionCurso} />
                </div>
              </div>
              <div className="text-[9px] mt-2.5 text-center" style={{ color: TEXT_LIGHT }}>
                Meta nutricional = qué tan cerca de tu meta quedaron los días que registraste. Esta semana va en vivo.
              </div>
            </div>

            {/* El mensaje del coach: uno solo, en positivo, mirando a ESTA semana */}
            <div className="p-3.5 rounded-xl mb-2.5 flex items-start gap-2.5" style={cardShadow}>
              <div className="text-[16px] leading-none mt-0.5">💬</div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: ACCENT_DARK }}>De tu coach</div>
                <div className="text-[12px]" style={{ color: TEXT, lineHeight: 1.55 }}>{mensajeSemana(r)}</div>
              </div>
            </div>

          </div>
        );
      })()}

      {tab === 'alimentacion' && (
        <div>
          {/* Sub-pestañas de ventana de tiempo, chiquitas y discretas */}
          <div className="flex gap-1.5 mb-4">
            {[{ key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }].map(t => (
              <button key={t.key} onClick={() => { haptic(6); setAlimTab(t.key); }}
                className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition active:scale-[0.97]"
                style={{
                  background: alimTab === t.key ? '#0f172a' : SURFACE_2,
                  color: alimTab === t.key ? '#fff' : TEXT_MUTED,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {alimTab === 'semana' && (
          <div>
          <StatBlock label="Calorías" color={ACCENT} goal={goals.kcal} unit="" data={week} statKey="kcal" />
          <StatBlock label="Proteína" color={C_PROTEIN} goal={goals.p} unit="g" data={week} statKey="p" />
          <StatBlock label="Carbohidratos" color={C_CARBS} goal={goals.c} unit="g" data={week} statKey="c" />
          <StatBlock label="Grasas" color={C_FAT} goal={goals.g} unit="g" data={week} statKey="g" />

          {/* Behavior metrics — process-focused, celebrate the habit, not just the goal */}
          {recordedLast7 > 0 && (
            <div className="mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: ACCENT_DARK }}>Tu comportamiento esta semana</div>
              {/* Tarjetas al estilo de marca: blanco + sombra de tarjeta de la
                  app (antes: beige plano con borde, se veía de otra app). Los
                  números grandes van TODOS en grafito — el color semántico
                  queda solo en los deltas pequeños; antes el terracota del
                  macro proteína se leía como alerta roja. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl" style={{ background: SURFACE, boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset' }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>Adherencia</div>
                  <div className="text-[18px] font-bold num mt-0.5" style={{ color: TEXT }}>{recordedLast7}<span className="text-[11px]" style={{ color: TEXT_LIGHT }}>/7 días</span></div>
                  <div className="text-[10px] mt-0.5 num" style={{ color: adherenceDelta > 0 ? SUCCESS : adherenceDelta < 0 ? WARN : TEXT_LIGHT }}>
                    {adherenceDelta > 0 ? `+${adherenceDelta} vs semana anterior` : adherenceDelta < 0 ? `${adherenceDelta} vs semana anterior` : 'igual que la semana anterior'}
                  </div>
                </div>

                <div className="p-3 rounded-xl" style={{ background: SURFACE, boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset' }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>Inicio del día</div>
                  <div className="text-[18px] font-bold num mt-0.5" style={{ color: TEXT }}>{fmtHour(avgFirstHour)}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: TEXT_LIGHT }}>hora del primer registro en promedio</div>
                </div>

                <div className="p-3 rounded-xl" style={{ background: SURFACE, boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset' }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>Proteína · tendencia</div>
                  <div className="text-[18px] font-bold num mt-0.5" style={{ color: TEXT }}>{protLast7}<span className="text-[11px]" style={{ color: TEXT_LIGHT }}>g/día</span></div>
                  <div className="text-[10px] mt-0.5 num" style={{ color: protDelta > 0 ? SUCCESS : protDelta < 0 ? WARN : TEXT_LIGHT }}>
                    {protDelta > 0 ? `+${protDelta}g vs semana anterior` : protDelta < 0 ? `${protDelta}g vs semana anterior` : 'igual que la semana anterior'}
                  </div>
                </div>

                <div className="p-3 rounded-xl" style={{ background: SURFACE, boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset' }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>Detalle del registro</div>
                  <div className="text-[18px] font-bold num mt-0.5" style={{ color: TEXT }}>{avgItemsPerDay}<span className="text-[11px]" style={{ color: TEXT_LIGHT }}> items/día</span></div>
                  <div className="text-[10px] mt-0.5" style={{ color: TEXT_LIGHT }}>promedio de alimentos registrados por día</div>
                </div>
              </div>
            </div>
          )}

          {/* Wellbeing */}
          {wbAvg && (
            <div className="mb-5 p-3 rounded-xl" style={{ background: SURFACE, boxShadow: '0 1px 0.5px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.7) inset' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: ACCENT_DARK }}>Bienestar promedio</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px]" style={{ color: TEXT_LIGHT }}>Energía</div>
                  <div className="text-[16px] font-bold num" style={{ color: TEXT }}>{wbAvg.energy}<span className="text-[10px]" style={{ color: TEXT_LIGHT }}>/5</span></div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: TEXT_LIGHT }}>Hambre</div>
                  <div className="text-[16px] font-bold num" style={{ color: TEXT }}>{wbAvg.hunger}<span className="text-[10px]" style={{ color: TEXT_LIGHT }}>/5</span></div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: TEXT_LIGHT }}>Ánimo</div>
                  <div className="text-[16px] font-bold num" style={{ color: TEXT }}>{wbAvg.mood}<span className="text-[10px]" style={{ color: TEXT_LIGHT }}>/5</span></div>
                </div>
              </div>
              <div className="text-[10px] mt-2" style={{ color: TEXT_LIGHT }}>{wbAvg.count} de 7 check-ins</div>
            </div>
          )}

          {/* Micronutrients */}
          {microAvg && (
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: ACCENT_DARK }}>Calidad de tu semana (promedio diario)</div>
              <div>
                <MicroRow label="Fibra" value={microAvg.fiber} goal={DAILY_MICRO_GOALS.fiber} unit="g" hint="digestión, saciedad"
                  suggestion="avena, legumbres, verduras, fruta entera" />
                <MicroRow label="Omega-3" value={microAvg.omega3} goal={DAILY_MICRO_GOALS.omega3} unit="g" hint="cardiovascular, antiinflamatorio"
                  suggestion="pescado graso 2×/semana, nueces, chía" />
                <MicroRow label="Azúcar añadida" value={microAvg.sugar} goal={DAILY_MICRO_GOALS.sugar} unit="g" hint="gaseosas, dulces, postres"
                  direction="less" />
              </div>
              <div className="text-[10px] mt-3 italic" style={{ color: TEXT_LIGHT, lineHeight: 1.5 }}>
                Estimación aproximada a partir de lo que registras (base USDA) — no captura todo lo que comes, así que un valor por debajo de la referencia no significa deficiencia. Información educativa; para una evaluación real, consulta con un profesional de la salud.
              </div>
            </div>
          )}
          </div>
          )}

          {alimTab === 'mes' && (
          <div>
            <StatBlock label="Calorías" color={ACCENT} goal={goals.kcal} unit="" data={month} statKey="kcal" />
            <StatBlock label="Proteína" color={C_PROTEIN} goal={goals.p} unit="g" data={month} statKey="p" />
            <StatBlock label="Carbohidratos" color={C_CARBS} goal={goals.c} unit="g" data={month} statKey="c" />
            <StatBlock label="Grasas" color={C_FAT} goal={goals.g} unit="g" data={month} statKey="g" />
          </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 text-[10px]" style={{ color: TEXT_MUTED, borderTop: `1px solid ${BORDER_SOFT}` }}>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm" style={{ background: SUCCESS }} />
          <span>En meta ±10%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm" style={{ background: ACCENT }} />
          <span>Con registro</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm" style={{ background: '#cbd5e1', opacity: 0.6 }} />
          <span>Sin registro</span>
        </div>
      </div>
    </ModalShell>
  );
}

function CapabilitiesModal({ onClose }) {
  const Section = ({ icon, title, items, accent }) => (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg" style={{ background: (accent || ACCENT) + '20', color: accent || ACCENT_DARK }}>
          {icon}
        </div>
        <div className="text-[13px] font-bold uppercase tracking-[0.03em]" style={{ color: TEXT }}>{title}</div>
      </div>
      <ul className="space-y-1.5 text-[13px]" style={{ color: TEXT_MUTED, lineHeight: 1.55 }}>
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 pl-1">
            <span style={{ color: accent || ACCENT, marginTop: 1 }}>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader accent={ACCENT_DARK} label="Guía" title="¿Qué puedo hacer aquí?" onClose={onClose} />
      <div className="text-[13px] mb-5" style={{ color: TEXT_MUTED, lineHeight: 1.6 }}>
        Esto no es un coach. Es una herramienta para que registres tu día sin fricción y para que tu coach tenga información real para trabajar contigo.
      </div>

      <Section
        icon={<Utensils size={14} strokeWidth={1.8} />}
        title="Registrar comidas"
        accent={ACCENT_DARK}
        items={[
          'Lo más rápido: toca el micrófono y cuéntame qué comiste, hablando normal. La app transcribe y calcula.',
          'O escribe en lenguaje natural: "2 huevos, avena con plátano y café".',
          'Puedes registrar comida por comida, o contarme TODO tu día de una vez. Si dices "en el desayuno... al almuerzo... en la cena...", lo organizo por comidas. Si solo me das la lista, la registro como tu día.',
          'Si olvidaste un alimento, dime: "se me olvidó, también comí un huevo" y lo sumo a la última comida.',
          'Recuerdo lo que hablamos antes, así que puedes referirte a algo que ya mencionaste.',
          'Si no especificas gramos, estimo con valores estándar (USDA) y te aviso.',
        ]} />

      <Section
        icon={<Info size={14} strokeWidth={1.8} />}
        title="Consultar sin registrar"
        accent={ACCENT}
        items={[
          'Pregunta calorías y macros de cualquier alimento: "¿cuántas calorías tiene una manzana?".',
          'Funciona también con marcas comerciales y porciones: "¿macros de 100g de pollo?".',
          'Si solo es consulta, no lo registro como comida del día.',
        ]} />

      <Section
        icon={<ChefHat size={14} strokeWidth={1.8} />}
        title="Armar tu día con tus ingredientes"
        accent={ACCENT_DARK}
        items={[
          'Guarda en "Mis ingredientes" lo que sueles comprar y comer.',
          'Pide: "armame el día con lo que me gusta" y propongo una distribución en desayuno, almuerzo, snack y cena que llega a tu meta.',
          'No es recetario: solo distribución y macros de alimentos cocidos.',
          'Decides si lo registras, lo guardas como favorito o regeneras otra variante.',
        ]} />

      <Section
        icon={<PieChart size={14} strokeWidth={1.8} />}
        title="Cuadrar macros faltantes"
        accent={C_PROTEIN}
        items={[
          'Si te faltan macros y tienes algunos ingredientes, dime cuáles tienes.',
          'Te devuelvo gramos exactos para cuadrar. Solo matemática, no recetas.',
          'Ejemplo: "tengo pollo, arroz y aceite, qué proporciones uso".',
        ]} />

      <Section
        icon={<Star size={14} strokeWidth={1.8} />}
        title="Favoritos y atajos"
        accent={C_CARBS}
        items={[
          'Toca la estrella en cualquier comida para guardarla como menú favorito y reutilizarla.',
          'Usa "Repetir comida de ayer" desde acciones para clonar el último registro del día anterior.',
          'Arriba del input ves tus alimentos más frecuentes para tocarlos y registrar rápido.',
        ]} />

      <Section
        icon={<FileText size={14} strokeWidth={1.8} />}
        title="Tu coach te ve en vivo"
        accent={ACCENT_DARK}
        items={[
          'Mauro tiene un panel donde ve tu data en tiempo real: macros del día, adherencia semanal y check-ins.',
          'No necesitas mandar nada — basta con que registres. Mientras más completo, mejor criterio puede aportarte.',
          'Si haces el check-in del día (energía, hambre, ánimo), tu coach también lo ve para entender el contexto.',
        ]} />

      <Section
        icon={<X size={14} strokeWidth={2} />}
        title="Lo que NO hago"
        accent={WARN}
        items={[
          'No te doy recetas. Pero si me dices qué ingredientes o alimentos te gustan o tienes disponibles, sí te ayudo a definir cómo distribuirlos para llegar a tu meta.',
          'Si quieres recetas, tienes la galería de recetas en el módulo Meals de la app Trainerize.',
          'No reemplazo el criterio de un profesional de la salud.',
          'Si me preguntas "¿qué dieta hago?" o similar, te remito al coach.',
        ]} />

      <button onClick={onClose}
        className="w-full mt-2 py-3.5 rounded-2xl text-[15px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
        style={{ background: '#1F1F1F', color: '#fff' }}>
        Entendido, vamos
      </button>
    </ModalShell>
  );
}

function IngredientsModal({ ingredients, onSave, onClose }) {
  const [list, setList] = useState(ingredients);
  const [input, setInput] = useState('');

  const addIng = () => {
    // Los clientes suelen escribir la lista completa en el campo ("pollo,
    // arroz y carne") y darle Añadir: se separa por comas, punto y coma,
    // saltos de línea o " y ", y cada alimento entra como chip propio.
    const parts = splitIngredients(input);
    if (!parts.length) return;
    setList(prev => {
      const merged = [...prev];
      for (const p of parts) if (!merged.includes(p)) merged.push(p);
      return merged;
    });
    setInput('');
    haptic(6);
  };
  const removeIng = (ing) => { setList(list.filter(x => x !== ing)); haptic(6); };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader accent={ACCENT_DARK} label="Favoritos" title="Mis ingredientes" onClose={onClose} />
      <div className="text-[12px] mb-4" style={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
        Tu lista de alimentos que sueles comprar y comer. La uso cuando me pides "arma mi día" para distribuir kcal y macros sin recetario.
      </div>

      <div className="flex gap-2 mb-4">
        <input value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addIng())}
          placeholder="Ej: pollo, arroz, palta…"
          className="flex-1 bg-transparent border rounded-xl px-3 py-2.5 outline-none text-[14px]"
          style={{ borderColor: BORDER, color: TEXT }} />
        <button onClick={addIng}
          className="px-4 py-2.5 rounded-xl text-[13px] font-semibold transition active:scale-95"
          style={{ background: '#1F1F1F', color: '#fff' }}>
          Añadir
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5 min-h-[40px]">
        {list.length === 0 && (
          <div className="text-[12px] italic" style={{ color: TEXT_LIGHT }}>Aún no agregaste ingredientes.</div>
        )}
        {list.map(ing => (
          <button key={ing} onClick={() => removeIng(ing)}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium transition active:scale-95 flex items-center gap-1.5"
            style={{ background: SURFACE_2, color: TEXT, border: `1px solid ${BORDER}` }}
            title="Quitar de la lista">
            {ing}
            <X size={11} style={{ color: TEXT_LIGHT }} />
          </button>
        ))}
      </div>

      <button onClick={() => onSave(list)}
        className="w-full py-3.5 rounded-2xl text-[15px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
        style={{ background: '#1F1F1F', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
        <CheckCircle2 size={15} /> Guardar lista
      </button>
    </ModalShell>
  );
}

function PlannerModal({ loading, proposal, ingredients, onRegenerate, onRegister, onSaveFavorite, onEditIngredients, onClose }) {
  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader accent={ACCENT_DARK} label="Planificador" title="Arma mi día" onClose={onClose} />

      {ingredients.length === 0 && (
        <div className="mb-5 p-4 rounded-2xl text-[13px]" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: TEXT }}>
          Antes necesito tu lista de ingredientes. Agrega los alimentos que te gustan y compras.
          <button onClick={onEditIngredients} className="block mt-3 px-4 py-2 rounded-xl text-[13px] font-semibold"
            style={{ background: '#1F1F1F', color: '#fff' }}>
            Configurar ingredientes
          </button>
        </div>
      )}

      {loading && (
        <div className="py-12 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>Armando tu distribución…</div>
        </div>
      )}

      {proposal && proposal.error && (
        <div className="p-4 rounded-2xl text-[13px] mb-4" style={{ background: '#FBF1E5', color: WARN }}>
          {proposal.error}
        </div>
      )}

      {proposal && proposal.meals && (
        <div>
          <div className="text-[13px] mb-4 leading-relaxed" style={{ color: TEXT }}>
            {proposal.intro}
          </div>

          {proposal.meals.map((m, i) => (
            <div key={i} className="mb-4 p-3 rounded-2xl" style={{ background: SURFACE_2, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[11px] uppercase tracking-[0.04em] font-bold" style={{ color: ACCENT_DARK }}>{m.meal}</div>
                {m.from_favorite && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: C_CARBS_PASTEL, color: C_CARBS }}>
                    <Star size={9} strokeWidth={2.2} />
                    De tus favoritos
                  </div>
                )}
              </div>
              <div className="space-y-1 mb-2">
                {m.items.map((it, j) => (
                  <div key={j} className="text-[12px] flex justify-between gap-3">
                    <span style={{ color: TEXT }}>{it.name}{it.amount ? ` · ${it.amount}` : ''}</span>
                    <span className="num" style={{ color: TEXT_LIGHT }}>{it.kcal} kcal</span>
                  </div>
                ))}
              </div>
              {m.subtotal && (
                <div className="text-[10px] pt-2 border-t flex gap-3 num" style={{ borderColor: BORDER_SOFT, color: TEXT_MUTED }}>
                  <span>{m.subtotal.kcal} kcal</span>
                  <span style={{ color: C_PROTEIN }}>P {m.subtotal.p}g</span>
                  <span style={{ color: C_CARBS }}>C {m.subtotal.c}g</span>
                  <span style={{ color: C_FAT }}>G {m.subtotal.g}g</span>
                </div>
              )}
            </div>
          ))}

          {proposal.total && (
            <div className="p-3 rounded-2xl mb-4" style={{ background: ACCENT_PASTEL + '40', border: `1px solid ${ACCENT_PASTEL}` }}>
              <div className="text-[11px] uppercase tracking-[0.04em] font-bold mb-1" style={{ color: ACCENT_DARK }}>Total del día</div>
              <div className="text-[14px] font-bold num" style={{ color: TEXT }}>
                {proposal.total.kcal} kcal · P {proposal.total.p}g · C {proposal.total.c}g · G {proposal.total.g}g
              </div>
            </div>
          )}

          {proposal.warning && (
            <div className="p-3 rounded-2xl mb-4 text-[12px]" style={{ background: '#FBF1E5', color: WARN }}>
              {proposal.warning}
            </div>
          )}

          <div className="space-y-2">
            <button onClick={onRegister}
              className="w-full py-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ background: '#1F1F1F', color: '#fff' }}>
              <CheckCircle2 size={14} /> Registrar como comidas del día
            </button>
            <button onClick={onSaveFavorite}
              className="w-full py-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ background: SURFACE_2, color: TEXT, border: `1px solid ${BORDER}` }}>
              <Star size={14} /> Guardar como favorito
            </button>
            <button onClick={onRegenerate}
              className="w-full py-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ background: SURFACE_2, color: TEXT, border: `1px solid ${BORDER}` }}>
              <RotateCcw size={14} /> Regenerar otra variante
            </button>
          </div>
        </div>
      )}

      {!loading && !proposal && ingredients.length > 0 && (
        <div className="py-8 flex flex-col items-center gap-3">
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>Genera la propuesta cuando quieras.</div>
          <button onClick={onRegenerate}
            className="px-5 py-2.5 rounded-xl text-[14px] font-semibold transition active:scale-95"
            style={{ background: '#1F1F1F', color: '#fff' }}>
            Generar propuesta
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function WellbeingModal({ name, existing, onSave, onClose }) {
  const [energy, setEnergy] = useState(existing?.energy || 3);
  const [hunger, setHunger] = useState(existing?.hunger || 3);
  const [mood, setMood] = useState(existing?.mood || 3);
  const firstName = name ? name.split(' ')[0] : '';

  const Row = ({ label, hint, value, setValue, color }) => (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-1.5">
        <div className="text-[13px] font-semibold" style={{ color: TEXT }}>{label}</div>
        <div className="text-[11px]" style={{ color: TEXT_LIGHT }}>{hint}</div>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => { haptic(8); setValue(n); }}
            className="flex-1 py-3 rounded-xl text-[14px] font-semibold transition active:scale-95"
            style={{
              background: value === n ? color : SURFACE_2,
              color: value === n ? '#fff' : TEXT_MUTED,
              border: `1px solid ${value === n ? color : BORDER_SOFT}`
            }}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader accent={ACCENT_DARK} label="Check-in" title={firstName ? `¿Cómo te fue, ${firstName}?` : '¿Cómo te fue hoy?'} onClose={onClose} />
      <div className="text-[12px] mb-5" style={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
        3 toques rápidos. Ayuda a Mauro a entender cómo te sentiste, más allá de los macros.
      </div>

      <Row label="Energía" hint="1 bajón · 5 con todo" value={energy} setValue={setEnergy} color={ACCENT} />
      <Row label="Hambre" hint="1 saciado · 5 con mucha hambre" value={hunger} setValue={setHunger} color={C_PROTEIN} />
      <Row label="Ánimo" hint="1 mal · 5 muy bien" value={mood} setValue={setMood} color={C_FAT} />

      <button onClick={() => onSave(energy, hunger, mood)}
        className="w-full py-3.5 rounded-2xl text-[15px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
        style={{ background: '#1F1F1F', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
        <CheckCircle2 size={15} /> Guardar check-in
      </button>
    </ModalShell>
  );
}

function PerfectDayModal({ name, totals, goals, onClose }) {
  const firstName = name ? name.split(' ')[0] : '';
  const [showContent, setShowContent] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-up" style={{
      background: 'rgba(0,0,0,0.5)'
    }} onClick={onClose}>
      <div className="w-full max-w-sm p-8 rounded-3xl text-center" style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        fontFamily: FONT_UI,
        boxShadow: `0 0 60px ${ACCENT}30, 0 24px 60px rgba(0,0,0,0.18)`
      }} onClick={e => e.stopPropagation()}>
        <div className="inline-flex p-4 rounded-full mb-5 pulse-ring" style={{ background: ACCENT_PASTEL + '60' }}>
          <Trophy size={30} style={{ color: ACCENT_DARK }} />
        </div>
        <div className="text-[10px] tracking-[0.05em] uppercase font-semibold mb-2" style={{ color: ACCENT }}>
          Día con precisión
        </div>
        <div className="text-2xl font-bold mb-3 tracking-tight" style={{ color: TEXT, letterSpacing: '-0.01em' }}>
          {firstName ? `Bien hecho, ${firstName}` : 'Bien hecho'}
        </div>
        {showContent && (
          <div className="fade-up">
            <div className="text-sm mb-6 leading-relaxed" style={{ color: TEXT_MUTED }}>
              Cerraste las cuatro metas dentro del 5%.<br />
              <span style={{ color: ACCENT_DARK, fontStyle: 'italic' }}>Eso es método.</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[
                { l: 'kcal', v: totals.kcal, c: ACCENT },
                { l: 'P', v: `${totals.p}g`, c: C_PROTEIN },
                { l: 'C', v: `${totals.c}g`, c: C_CARBS },
                { l: 'G', v: `${totals.g}g`, c: C_FAT },
              ].map((s, i) => (
                <div key={i} className="p-2 rounded-xl" style={{ background: SURFACE_2 }}>
                  <div className="text-[10px] uppercase font-semibold" style={{ color: TEXT_LIGHT }}>{s.l}</div>
                  <div className="text-sm font-semibold num" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-full text-sm font-medium transition"
              style={{ background: ACCENT, color: '#fff' }}>
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditEntryModal({ entry, onSave, onDelete, onClose }) {
  const [items, setItems] = useState(entry.items.map(i => ({ ...i })));
  const [meal, setMeal] = useState(entry.meal);
  const [recalculating, setRecalculating] = useState(null);

  const recalculateFromAmount = async (idx, newAmount) => {
    if (!newAmount.trim()) return;
    setRecalculating(idx);
    try {
      const item = items[idx];
      const sys = `Eres un parser nutricional. Devuelves SOLO JSON válido, sin markdown.

Para "${item.name}" con cantidad "${newAmount}", calcula valores REALES (USDA).
Validación: 1g P=4 kcal, 1g C=4 kcal, 1g G=9 kcal. Suma macros entre 85-115% del kcal.

{"kcal": N, "p": N, "c": N, "g": N}`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          max_tokens: 200,
          system: sys,
          messages: [{ role: "user", content: `${item.name}: ${newAmount}` }],
        })
      });
      const data = await response.json();
      const text = data.content.map(c => c.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);

      const newItems = [...items];
      newItems[idx] = { ...newItems[idx], amount: newAmount, kcal: result.kcal, p: result.p, c: result.c, g: result.g, needs_quantity: false };
      setItems(newItems);
      haptic(10);
    } catch (e) {
      const newItems = [...items];
      newItems[idx] = { ...newItems[idx], amount: newAmount };
      setItems(newItems);
    }
    setRecalculating(null);
  };

  const updateName = (idx, val) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], name: val };
    setItems(newItems);
  };

  const updateAmount = (idx, val) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], amount: val };
    setItems(newItems);
  };

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const save = () => {
    if (items.length === 0) { onDelete(); return; }
    const sum = (k) => items.reduce((s, i) => s + (i[k] || 0), 0);
    // Las entradas registradas desde el Recetario traen macros solo a nivel
    // de entrada (los items vienen en 0). Si ningún item tiene macros,
    // conservamos los totales originales en vez de recalcular a 0 — antes
    // guardar la edición de una receta borraba todas sus calorías y macros.
    const itemsHaveMacros = items.some(i => (i.kcal || 0) > 0 || (i.p || 0) > 0 || (i.c || 0) > 0 || (i.g || 0) > 0);
    const updated = {
      ...entry, meal, items,
      hasMissingQuantity: items.some(i => i.needs_quantity),
      ...(itemsHaveMacros
        ? { kcal: sum('kcal'), p: sum('p'), c: sum('c'), g: sum('g') }
        : { kcal: entry.kcal || 0, p: entry.p || 0, c: entry.c || 0, g: entry.g || 0 }),
    };
    onSave(updated);
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader accent={ACCENT} label="Editar" title="Ajustar comida" onClose={onClose} />

      <div className="mb-4 p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: ACCENT_LIGHT, color: ACCENT_DARK }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          {entry.hasMissingQuantity
            ? <><strong>Ajusta la cantidad de cada alimento.</strong> Las calorías y macros se recalculan automáticamente.</>
            : <>Cambia la cantidad si necesitas. Los valores se recalculan automáticamente.</>}
        </span>
      </div>

      <div className="mb-4">
        <div className="text-xs font-medium mb-2" style={{ color: TEXT_MUTED }}>Tipo de comida</div>
        <div className="flex gap-1">
          {['desayuno', 'almuerzo', 'cena', 'snack'].map(m => (
            <button key={m} onClick={() => setMeal(m)}
              className="flex-1 py-2 rounded-full text-[10px] font-medium uppercase tracking-wider transition"
              style={meal === m ? { background: ACCENT, color: '#fff' } : { background: SURFACE_2, color: TEXT_MUTED }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {items.map((it, idx) => (
          <div key={idx} className="p-3 rounded-2xl" style={{
            background: SURFACE_2,
            border: it.needs_quantity ? `1.5px solid ${WARN}40` : `1px solid ${BORDER_SOFT}`
          }}>
            <div className="flex justify-between items-start mb-2 gap-2">
              <input value={it.name} onChange={e => updateName(idx, e.target.value)}
                className="bg-transparent text-sm font-medium outline-none flex-1" style={{ color: TEXT, fontSize: '16px' }} />
              <button onClick={() => removeItem(idx)} className="p-1 rounded-full hover:bg-black/5">
                <Trash2 size={12} style={{ color: TEXT_LIGHT }} />
              </button>
            </div>

            <div className="mb-3">
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: it.needs_quantity ? WARN : TEXT_MUTED }}>
                {it.needs_quantity ? '⚠ Cantidad — escríbela aquí' : 'Cantidad'}
              </label>
              <div className="flex gap-2 items-center">
                <input
                  value={it.amount || ''}
                  onChange={e => updateAmount(idx, e.target.value)}
                  onBlur={e => {
                    if (e.target.value !== entry.items[idx]?.amount && e.target.value.trim()) {
                      recalculateFromAmount(idx, e.target.value);
                    }
                  }}
                  placeholder="Ej: 150g, 2 unidades, 1 taza"
                  className="bg-white rounded-lg px-3 py-2 text-sm outline-none flex-1"
                  style={{ color: TEXT, border: `1.5px solid ${it.needs_quantity ? WARN : BORDER_SOFT}`, fontSize: '16px' }}
                />
                {recalculating === idx && <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} />}
              </div>
              <div className="text-[10px] mt-1" style={{ color: TEXT_LIGHT }}>
                Al cambiar la cantidad, las calorías y macros se ajustan automáticamente.
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2 border-t" style={{ borderColor: BORDER_SOFT }}>
              <ReadOnlyStat label="kcal" val={it.kcal} color={ACCENT} />
              <ReadOnlyStat label="P" val={`${it.p}g`} color={C_PROTEIN} />
              <ReadOnlyStat label="C" val={`${it.c}g`} color={C_CARBS} />
              <ReadOnlyStat label="G" val={`${it.g}g`} color={C_FAT} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={onDelete} className="px-4 py-3 rounded-full text-sm font-medium transition flex items-center gap-2"
          style={{ background: SURFACE_2, color: WARN }}>
          <Trash2 size={13} /> Eliminar
        </button>
        <button onClick={save} disabled={recalculating !== null}
          className="flex-1 py-3 rounded-full text-sm font-medium transition disabled:opacity-50"
          style={{ background: ACCENT, color: '#fff' }}>
          {recalculating !== null ? 'Recalculando…' : 'Guardar cambios'}
        </button>
      </div>
    </ModalShell>
  );
}

function ReadOnlyStat({ label, val, color }) {
  return (
    <div className="text-center p-2 rounded-lg" style={{ background: '#fff' }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: TEXT_LIGHT }}>{label}</div>
      <div className="text-xs font-semibold num mt-0.5" style={{ color }}>{val}</div>
    </div>
  );
}

function Welcome({ onContinue, onTutorial, tutorialOpen, onCloseTutorial }) {
  return (
    <div className="min-h-screen p-5 flex flex-col relative overflow-hidden" style={{ background: BG, color: TEXT, fontFamily: FONT_UI, paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
      <FontStyles />
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ringFill {
          0% { stroke-dashoffset: 1880; }
          50% { stroke-dashoffset: 380; }
          100% { stroke-dashoffset: 1880; }
        }
        .ring-fill { animation: ringFill 8s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .fade-up-1 { animation: fadeUp 0.6s ease-out 0.0s both; }
        .fade-up-2 { animation: fadeUp 0.6s ease-out 0.15s both; }
        .fade-up-3 { animation: fadeUp 0.6s ease-out 0.3s both; }
        .fade-up-4 { animation: fadeUp 0.6s ease-out 0.45s both; }
      `}</style>

      {/* Fondo aurora — gradientes radiales puros, sin filter:blur ni animación
          infinita (era carga continua de GPU en la pantalla de bienvenida). */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{
        zIndex: 0,
        background: [
          'radial-gradient(60% 50% at 18% 2%, rgba(255,255,255,0.9), transparent 65%)',
          'radial-gradient(55% 52% at 96% 30%, rgba(180,190,200,0.4), transparent 68%)',
          'radial-gradient(52% 48% at 40% 100%, rgba(245,243,238,0.85), transparent 62%)',
          'radial-gradient(42% 36% at 45% 58%, rgba(120,130,140,0.12), transparent 70%)',
        ].join(', ')
      }}>

        {/* Editorial avocado image — sits to the right, doesn't cover text */}
        <img src="/avocado.png" alt=""
          onError={(e) => { e.target.style.display = 'none'; }}
          style={{
            position: 'absolute',
            top: '8%',
            right: '-6%',
            width: '62%',
            maxWidth: '440px',
            height: 'auto',
            objectFit: 'contain',
            opacity: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.10))'
        }} />
      </div>

      {/* Content above background */}
      <div className="relative" style={{ zIndex: 1 }}>
        {/* Top: subtle progress indicator */}
        <div className="max-w-md w-full mx-auto pt-2 fade-up-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[11px] tracking-[0.05em] uppercase font-semibold" style={{ color: TEXT_MUTED }}>Paso 1 de 3</div>
            <div className="flex-1 flex gap-1">
              <div className="flex-1 h-1 rounded-full" style={{ background: TEXT }} />
              <div className="flex-1 h-1 rounded-full" style={{ background: BORDER }} />
              <div className="flex-1 h-1 rounded-full" style={{ background: BORDER }} />
            </div>
          </div>
        </div>
      </div>

      {/* Center: hero with logo + frase */}
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto py-12 relative" style={{ zIndex: 1 }}>

        <div className="fade-up-2">
          <div className="display" style={{
            fontSize: '64px',
            lineHeight: 0.88,
            letterSpacing: '0.005em',
            textTransform: 'uppercase',
            color: TEXT
          }}>
            Meal<br />Tracker
          </div>
          {/* Línea Maestra — gesto visual único */}
          <div className="h-[2px] w-14 mt-5 rounded-full" style={{ background: ACCENT }} />
          <div className="text-[19px] font-bold mt-4" style={{ color: ACCENT_DARK, letterSpacing: '0.005em' }}>
            Entrena con Método
          </div>
        </div>

        <div className="mt-12 fade-up-3">
          <div className="text-[24px] font-bold leading-tight" style={{ color: TEXT, letterSpacing: '-0.015em' }}>
            Registra natural.<br />
            <span style={{ color: TEXT_MUTED }}>Recibe criterio.</span>
          </div>
          <div className="text-[14px] mt-4" style={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
            <span style={{ color: TEXT, fontWeight: 600 }}>Mauro Morón</span> · ISSA Certified Fitness and Nutrition Coach
          </div>
        </div>
      </div>

      {/* Bottom: actions — lifted up so they don't get cut off on smaller phones */}
      <div className="max-w-md w-full mx-auto pb-28 fade-up-4 relative" style={{ zIndex: 1 }}>

        {/* How it works — prominent secondary action ABOVE Empezar */}
        <button onClick={onTutorial}
          className="w-full py-3.5 mb-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: 'rgba(255,255,255,0.92)',
            border: `1px solid ${BORDER}`,
            color: TEXT,
            boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 8px rgba(0,0,0,0.04)'
          }}>
          <Info size={15} strokeWidth={2} />
          ¿Cómo funciona? <span style={{ color: TEXT_LIGHT, fontWeight: 500 }}>· 2 min</span>
        </button>

        <button onClick={onContinue}
          className="w-full py-4 rounded-2xl text-base font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: '#1F1F1F',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.1) inset',
            letterSpacing: '0.01em'
          }}>
          Empezar <ArrowUp size={16} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
        </button>
      </div>

      {tutorialOpen && <TutorialModal onClose={onCloseTutorial} />}
    </div>
  );
}

function TutorialModal({ onClose }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: <Utensils size={28} strokeWidth={1.5} />, title: 'Registra natural', body: 'Escribe lo que comiste como si lo dijeras en voz alta. La app calcula calorías y macros con valores reales (USDA, comerciales).', example: '"Desayuno: 2 huevos revueltos, avena con plátano y café con leche"' },
    { icon: <Star size={28} strokeWidth={1.5} />, title: 'Menús favoritos', body: 'Las comidas que repites se guardan con un tap en la estrella. Reuso instantáneo, cero fricción.', example: 'Desde "Menús favoritos", toca Usar y queda registrado.' },
    { icon: <Info size={28} strokeWidth={1.5} />, title: 'Pregunta antes de comer', body: 'Consulta los macros de cualquier alimento sin registrarlo. Útil para decidir antes de servirte.', example: '"¿Calorías de una manzana?" o "¿Macros de 100g de pollo?"' },
    { icon: <PieChart size={28} strokeWidth={1.5} />, title: 'Cuadra tus macros', body: 'Si te faltan macros y tienes ingredientes, dime cuáles. La app calcula gramos exactos. Solo matemática, no recetas, no recomendación.', example: '"Tengo pollo, arroz integral, brócoli y aceite de oliva"' },
    { icon: <ChefHat size={28} strokeWidth={1.5} />, title: 'Arma tu día con lo que te gusta', body: 'Guarda los ingredientes que sueles comprar y comer. Pide "arma mi día" y te propongo una distribución en desayuno, almuerzo, snack y cena que llega a tu meta. No es recetario: son tus ingredientes cocidos con kcal y macros. Decides si lo registras, lo guardas como favorito o regeneras otra variante.', example: 'Tus ingredientes → "armame el día" → propuesta editable' },
    { icon: <Pencil size={28} strokeWidth={1.5} />, title: 'Edita o elimina', body: 'Toca el lápiz para ajustar cantidades. Los valores se recalculan automáticamente. Toca la papelera para eliminar.', example: 'En cualquier comida: favorito · editar · eliminar' },
    { icon: <FileText size={28} strokeWidth={1.5} />, title: 'Tu coach te ve en vivo', body: 'Mientras registras, Mauro ve tu data en tiempo real desde su panel: macros del día, adherencia semanal, check-ins. No tienes que enviar nada.', example: 'Tú registras · él ve · ajusta criterio en sesión.' },
    { icon: <CheckCircle2 size={28} strokeWidth={1.5} />, title: 'Importante', body: 'Esta herramienta calcula y registra. No recomienda qué comer ni sustituye el criterio de un coach nutricional.', example: 'La app mide. El coach decide.' },
    { icon: <Download size={28} strokeWidth={1.5} />, title: 'Guarda esta app', body: 'Agrega esta página a tus favoritos del navegador. Si la minimizas en lugar de cerrarla, mantienes la conversación abierta.', example: 'iPhone: Compartir → Añadir a inicio · Android: ⋮ → Añadir a pantalla' }
  ];

  const s = steps[step];
  return (
    <ModalShell onClose={onClose}>
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[11px] tracking-[0.05em] uppercase font-semibold" style={{ color: TEXT_MUTED }}>
            {step + 1} de {steps.length}
          </div>
          <div className="flex-1 flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full transition-all duration-500" style={{
                background: i <= step ? TEXT : BORDER
              }} />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-4 inline-flex p-3 rounded-2xl" style={{ background: ACCENT_PASTEL + '60', color: ACCENT_DARK }}>
          {s.icon}
        </div>
        <div className="text-[22px] font-bold mb-1 tracking-tight" style={{ color: TEXT, letterSpacing: '-0.015em' }}>{s.title}</div>
        <div className="h-[2px] w-10 mt-2 mb-4 rounded-full" style={{ background: ACCENT }} />
        <div className="text-[15px] leading-relaxed mb-4" style={{ color: TEXT_MUTED }}>{s.body}</div>
        <div className="p-4 rounded-2xl text-[13px] italic" style={{ background: SURFACE_2, color: TEXT, border: `1px solid ${BORDER}` }}>
          {s.example}
        </div>
      </div>

      <div className="flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98]"
            style={{ background: SURFACE_2, color: TEXT, border: `1px solid ${BORDER}` }}>
            Anterior
          </button>
        )}
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} className="flex-1 py-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ background: '#1F1F1F', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
            Siguiente <ArrowUp size={14} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
          </button>
        ) : (
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-[14px] font-semibold transition active:scale-[0.98]"
            style={{ background: '#1F1F1F', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
            Entendido
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function ExampleCard({ num, emoji, title, example, className, onClick }) {
  return (
    <button onClick={onClick} className={`w-full p-4 rounded-2xl flex items-start gap-3 text-left transition hover:scale-[1.01] active:scale-[0.99] ${className}`} style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
    }}>
      <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{
        background: SURFACE_2
      }}>
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        {num && <div className="text-[10px] tracking-[0.05em] font-semibold uppercase mb-1" style={{ color: ACCENT }}>{num}</div>}
        <div className="text-[15px] font-bold" style={{ color: TEXT, letterSpacing: '-0.01em' }}>{title}</div>
        <div className="text-[13px] mt-1" style={{ color: TEXT_MUTED, lineHeight: 1.4 }}>{example}</div>
      </div>
      <ChevronRight size={16} style={{ color: TEXT_LIGHT, flexShrink: 0, marginTop: 12 }} />
    </button>
  );
}

function Onboarding({ onComplete, onCancel, existingGoals, existingName }) {
  const [step, setStep] = useState(existingName ? 1 : 0);
  const [name, setName] = useState(existingName || '');
  const [nameError, setNameError] = useState('');
  const [kcal, setKcal] = useState(existingGoals?.kcal || 2200);
  const [pPct, setPPct] = useState(existingGoals ? Math.round((existingGoals.p * 4 / existingGoals.kcal) * 100) : 30);
  const [cPct, setCPct] = useState(existingGoals ? Math.round((existingGoals.c * 4 / existingGoals.kcal) * 100) : 40);
  const [gPct, setGPct] = useState(existingGoals ? Math.round((existingGoals.g * 9 / existingGoals.kcal) * 100) : 30);

  const [checkingName, setCheckingName] = useState(false);

  const validateNameFormat = (n) => {
    const trimmed = n.trim();
    if (trimmed.length < 3) return 'Escribe nombre completo';
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return 'Necesito nombre y apellido';
    if (!/^[a-záéíóúñü\s]+$/i.test(trimmed)) return 'Solo letras (sin números ni símbolos)';
    return '';
  };

  const continueFromName = async () => {
    if (checkingName) return;
    const err = validateNameFormat(name);
    if (err) { setNameError(err); return; }
    setCheckingName(true);
    const access = await checkAccess(name.trim());
    setCheckingName(false);
    if (!access.ok) {
      setNameError(access.status === 'pausa'
        ? 'Tu plan está en pausa. Escríbele a Mauro para reactivarlo.'
        : access.status === 'finalizado'
          ? 'Tu plan finalizó. Escríbele a Mauro si quieres retomarlo.'
          : 'Este nombre no está autorizado. Contacta a Mauro para acceso.');
      return;
    }
    const formatted = name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    setName(formatted);
    // La META ya NO la pone el cliente: la define el coach desde el CRM y le
    // llega con anuncio. El onboarding termina aquí, con solo el nombre —
    // goals=null hasta que el coach la cargue (la app lo muestra con calma).
    onComplete(null, formatted);
  };

  // Cada macro se ajusta de forma INDEPENDIENTE (sin auto-rebalance). El cliente
  // mueve las bolitas y abajo se valida que la suma cierre en 100%.
  const updatePct = (which, newVal) => {
    newVal = Math.max(0, Math.min(100, newVal));
    if (which === 'p') setPPct(newVal);
    else if (which === 'c') setCPct(newVal);
    else setGPct(newVal);
  };

  const macroSum = pPct + cPct + gPct;
  const macroSumOk = macroSum === 100;
  const pGrams = Math.round((kcal * pPct / 100) / 4);
  const cGrams = Math.round((kcal * cPct / 100) / 4);
  const gGrams = Math.round((kcal * gPct / 100) / 9);

  const submit = () => {
    onComplete({ kcal: parseInt(kcal), p: pGrams, c: cGrams, g: gGrams }, name.trim() || null);
  };

  return (
    <div className="min-h-screen p-5 flex items-center justify-center" style={{ background: BG, color: TEXT, fontFamily: FONT_UI }}>
      <FontStyles />
      <style>{`
        .num { font-variant-numeric: tabular-nums; }
        input[type="range"] { -webkit-appearance: none; appearance: none; height: 4px; background: ${BORDER}; border-radius: 2px; outline: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: white; border: 2px solid currentColor; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
        button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      `}</style>
      <div className="max-w-md w-full">

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[11px] tracking-[0.05em] uppercase font-semibold" style={{ color: TEXT_MUTED }}>Paso {step === 0 ? '2' : '3'} de 3</div>
            <div className="flex-1 flex gap-1">
              <div className="flex-1 h-1 rounded-full" style={{ background: TEXT }} />
              <div className="flex-1 h-1 rounded-full" style={{ background: TEXT }} />
              <div className="flex-1 h-1 rounded-full" style={{ background: step === 0 ? BORDER : TEXT }} />
            </div>
          </div>
        </div>

        <div className="p-6 rounded-3xl relative overflow-hidden" style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 32px rgba(0,0,0,0.06)'
        }}>
          {/* Salir sin guardar — solo cuando es un "Cambiar meta" (ya hay metas);
              en el onboarding inicial no hay a dónde volver. */}
          {onCancel && (
            <button onClick={onCancel}
              className="absolute top-4 right-4 z-10 p-2 rounded-full active:scale-90 transition"
              style={{ background: SURFACE_2, color: TEXT_MUTED }}
              title="Salir sin cambiar la meta"
              aria-label="Salir sin cambiar la meta">
              <X size={16} strokeWidth={2.4} />
            </button>
          )}
          <div className="relative">
          {step === 0 && (
            <div>
              <div className="display mb-3" style={{
                fontSize: '32px',
                lineHeight: 0.95,
                letterSpacing: '0.01em',
                textTransform: 'uppercase',
                color: TEXT
              }}>
                Hola
              </div>
              <div className="h-[2px] w-12 mt-1 mb-4 rounded-full" style={{ background: ACCENT }} />
              <div className="text-[15px] mb-5 leading-relaxed" style={{ color: TEXT_MUTED }}>
                Soy tu Meal Tracker. Antes de arrancar, dime tu <strong style={{ color: TEXT }}>nombre y apellido</strong>.
              </div>
              <input value={name}
                onChange={e => { setName(e.target.value); setNameError(''); }}
                placeholder="Ej: Juan Pérez"
                className="w-full bg-transparent border-b py-2 outline-none mb-2 text-base"
                style={{ borderColor: nameError ? WARN : BORDER, color: TEXT, fontSize: '16px' }} autoFocus
                onKeyDown={e => e.key === 'Enter' && continueFromName()} />
              {nameError && <div className="text-[11px] mb-3" style={{ color: '#FF9B6B' }}>{nameError}</div>}
              <button onClick={continueFromName} disabled={checkingName}
                className="w-full py-3.5 mt-4 rounded-2xl text-base font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
                style={{
                  background: '#1F1F1F',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.1) inset',
                  letterSpacing: '0.01em'
                }}>
                {checkingName
                  ? <><Loader2 size={16} className="animate-spin" /> Verificando…</>
                  : <>Continuar <ArrowUp size={16} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} /></>}
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="display mb-3" style={{
                fontSize: '32px',
                lineHeight: 0.95,
                letterSpacing: '0.01em',
                textTransform: 'uppercase',
                color: TEXT
              }}>
                Tus Metas
              </div>
              <div className="h-[2px] w-12 mt-1 mb-5 rounded-full" style={{ background: ACCENT }} />

              <div className="mb-7">
                <div className="text-[12px] mb-2 font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Calorías diarias</div>
                <div className="flex items-baseline gap-2">
                  <input type="number" value={kcal} onChange={e => setKcal(e.target.value)}
                    className="display outline-none w-32 num bg-transparent" style={{ color: TEXT, letterSpacing: '0.02em', fontSize: '40px' }} />
                  <span className="text-[15px]" style={{ color: TEXT_LIGHT }}>kcal</span>
                </div>
                <div className="h-px mt-2" style={{ background: BORDER }} />
              </div>

              <div className="mb-2">
                <div className="text-[12px] mb-1 font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Distribución de macros</div>
                <div className="text-[12px] mb-5" style={{ color: TEXT_LIGHT }}>Ajusta cada macro a tu gusto. Los tres deben sumar 100%.</div>
              </div>

              <div className="h-3 rounded-full overflow-hidden flex mb-6" style={{ background: BORDER_SOFT }}>
                <div style={{ width: `${pPct}%`, background: C_PROTEIN, transition: 'width 0.25s cubic-bezier(0.2, 0, 0, 1)' }} />
                <div style={{ width: `${cPct}%`, background: C_CARBS, transition: 'width 0.25s cubic-bezier(0.2, 0, 0, 1)' }} />
                <div style={{ width: `${gPct}%`, background: C_FAT, transition: 'width 0.25s cubic-bezier(0.2, 0, 0, 1)' }} />
              </div>

              <SliderRow label="Proteína" color={C_PROTEIN} pct={pPct} grams={pGrams} onChange={v => updatePct('p', v)} />
              <SliderRow label="Carbohidratos" color={C_CARBS} pct={cPct} grams={cGrams} onChange={v => updatePct('c', v)} />
              <SliderRow label="Grasas" color={C_FAT} pct={gPct} grams={gGrams} onChange={v => updatePct('g', v)} />

              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mt-1 mb-1" style={{ background: macroSumOk ? ACCENT_LIGHT : '#FBEEE8', border: `1px solid ${macroSumOk ? ACCENT_PASTEL : '#F0D6C8'}` }}>
                <span className="text-[12px] font-semibold" style={{ color: macroSumOk ? ACCENT_DARK : WARN }}>
                  {macroSumOk ? '✓ Suma 100% — listo' : 'Suma debe ser 100%'}
                </span>
                <span className="text-[15px] font-bold num" style={{ color: macroSumOk ? ACCENT_DARK : WARN }}>{macroSum}%</span>
              </div>
              {!macroSumOk && (
                <div className="text-[11px] mb-2" style={{ color: TEXT_MUTED }}>
                  {macroSum > 100 ? `Baja ${macroSum - 100}% en algún macro para poder continuar.` : `Sube ${100 - macroSum}% en algún macro para poder continuar.`}
                </div>
              )}

              <button
                onPointerDown={(e) => {
                  if (!kcal || kcal < 500 || !macroSumOk) return;
                  e.preventDefault();
                  submit();
                }}
                onClick={(e) => e.preventDefault()}
                disabled={!kcal || kcal < 500 || !macroSumOk}
                className="w-full py-3.5 mt-5 rounded-2xl text-base font-semibold transition disabled:opacity-30 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: '#1F1F1F',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.1) inset',
                  letterSpacing: '0.01em',
                  touchAction: 'manipulation'
                }}>
                {onCancel ? 'Guardar nueva meta' : 'Empezar'} <ArrowUp size={16} strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }} />
              </button>
              {onCancel && (
                <button onClick={onCancel}
                  className="w-full py-3 mt-2 rounded-2xl text-[14px] font-medium transition active:scale-[0.98]"
                  style={{ background: 'transparent', color: TEXT_MUTED }}>
                  Salir sin cambios
                </button>
              )}
            </div>
          )}
          </div>
        </div>

        <div className="text-center mt-6 text-[10px]" style={{ color: TEXT_LIGHT }}>
          Tus datos se guardan localmente. Cada semana se envía un resumen a tu coach.
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, color, pct, grams, onChange, darkMode }) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-xs font-medium" style={{ color: darkMode ? '#FFF' : TEXT }}>{label}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold num" style={{ color: darkMode ? '#FFF' : TEXT }}>{pct}%</span>
          <span className="text-[10px] num" style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : TEXT_LIGHT }}>{grams}g</span>
        </div>
      </div>
      <input type="range" min="5" max="80" value={pct} onChange={e => onChange(parseInt(e.target.value))}
        className="w-full" style={{ color }} />
    </div>
  );
}
