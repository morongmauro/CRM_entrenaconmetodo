// /api/yt-buscar.js
// «El más cercano en YouTube»: cuando un ejercicio no está en los canales de
// siempre (PROET, Central Athlete ATX, Functional Bodybuilding), busca en
// YouTube y devuelve los primeros resultados: [{ id, titulo, canal, seg }].
// Lee la página pública de resultados (sin llave de la API de YouTube).
//   GET /api/yt-buscar?q=Dumbbell+Front+Raise
import { checkOrigin, rateLimit } from './_guard.js';

function aSeg(t) {
  const p = String(t || '').split(':').map(Number);
  if (!p.length || p.some(isNaN)) return null;
  return p.reduce((a, b) => a * 60 + b, 0);
}
function recorrer(o, out) {
  if (!o || typeof o !== 'object' || out.length >= 8) return;
  if (Array.isArray(o)) { o.forEach(x => recorrer(x, out)); return; }
  const v = o.videoRenderer;
  if (v && v.videoId) {
    const titulo = (v.title && (v.title.simpleText || (v.title.runs || []).map(r => r.text).join(''))) || '';
    const canal = (v.ownerText && (v.ownerText.runs || []).map(r => r.text).join('')) || '';
    const seg = aSeg(v.lengthText && v.lengthText.simpleText);
    out.push({ id: v.videoId, titulo, canal, seg });
    return;
  }
  Object.values(o).forEach(x => recorrer(x, out));
}

export default async function handler(req, res) {
  if (!checkOrigin(req)) return res.status(403).json({ error: 'origen' });
  if (!rateLimit(req, 'yt-buscar', { limit: 60, windowMs: 60000 })) return res.status(429).json({ error: 'espera' });
  const q = String((req.query && req.query.q) || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: 'q' });
  try {
    const r = await fetch('https://www.youtube.com/results?hl=en&search_query=' + encodeURIComponent(q + ' exercise'), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const html = await r.text();
    const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!m) return res.status(200).json({ videos: [] });
    const out = []; recorrer(JSON.parse(m[1]), out);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ videos: out.filter(v => !v.seg || v.seg <= 900).slice(0, 4) });
  } catch (e) {
    return res.status(200).json({ videos: [], error: 'youtube' });
  }
}
