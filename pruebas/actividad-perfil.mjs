// Renderiza compRegistradaHTML() con datos de ejemplo. Es una plantilla de
// 120 líneas: un `${}` mal cerrado no lo ve node --check, solo el navegador.
import { readFileSync } from 'fs';
import vm from 'vm';

const src = readFileSync('/home/user/CRM_entrenaconmetodo/composicion.js', 'utf8');
const i = src.indexOf('function compRegistradaHTML(');
const j = src.indexOf('\n}', src.indexOf('</div>`;', src.indexOf('Ver los ${actos.length} registros'))) + 2;

const ctx = vm.createContext({
  console,
  escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),
  fmt: {
    semanaISO: (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
      const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return `${t.getUTCFullYear()}-W${String(Math.ceil((((t - ys)/86400000)+1)/7)).padStart(2,'0')}`; },
    fechaCorta: (s) => s.slice(8) + '/' + s.slice(5,7),
  },
  _compCatalogo: [
    { slug:'natacion', nombre:'Natación', categoria:'deporte', icono:'🏊' },
    { slug:'cinta', nombre:'Caminadora', categoria:'cardio', icono:'🏃' },
    { slug:'running', nombre:'Running en calle', categoria:'cardio', icono:'👟' },
  ],
  _comp: {},
});
vm.runInContext(src.slice(i, j) + '\nglobalThis.f = compRegistradaHTML;', ctx);
const f = ctx.f;

let fallos = 0;
const ok = (n, c, extra='') => { if (!c) fallos++; console.log(`${c?'✔':'✘'} ${n}${c?'':' '+extra}`); };

// sin tabla
const sinTabla = f(null);
ok('sin la migración lo dice y nombra el archivo',
   sinTabla.includes('migracion-actividades.sql'));
ok('sin la migración no inventa números', !/\d+ min/.test(sinTabla));

// sin registros
const vacio = f([]);
ok('sin registros explica quién lo registra', vacio.includes('desde su app'));

// con registros
const actos = [];
for (let s = 0; s < 6; s++) {
  for (let k = 0; k < (s % 3) + 1; k++) {
    const d = new Date(2026, 8, 20 - s * 7 - k);
    actos.push({
      id: `a${s}${k}`,
      fecha: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      tipo: ['natacion','cinta','running'][k % 3],
      duracion_min: 30 + k * 10, distancia_km: k ? 4.2 : null,
      intensidad: 'moderada', origen: k === 2 ? 'coach' : 'cliente',
    });
  }
}
const html = f(actos);
ok('pinta los tres totales', /Veces/.test(html) && /Minutos/.test(html) && /Kilómetros/.test(html));
ok('cuenta bien las veces', html.includes(`>${actos.length}</div>`), `(${actos.length})`);
ok('lista los tipos', html.includes('Natación') && html.includes('Caminadora'));
ok('marca lo que metió el coach', html.includes('tag-gray">tú'));
ok('sin llaves sin cerrar', !html.includes('${') && !html.includes('[object'));
ok('sin undefined visible', !/>undefined|undefined</.test(html), html.match(/.{30}undefined.{30}/)?.[0] || '');
ok('sin NaN', !html.includes('NaN'));

// un registro sin minutos ni km no debe ensuciar
const flojo = f([{ id:'x', fecha:'2026-09-18', tipo:'yoga', duracion_min:null, distancia_km:null, intensidad:null, origen:'cliente' }]);
ok('un registro pelado no imprime NaN ni undefined',
   !flojo.includes('NaN') && !/>undefined|undefined</.test(flojo));
ok('un tipo que no está en el catálogo cae a su slug', flojo.includes('yoga'));

console.log(fallos ? `\n${fallos} FALLOS` : '\nel bloque de actividad se pinta bien');
process.exit(fallos ? 1 : 0);
