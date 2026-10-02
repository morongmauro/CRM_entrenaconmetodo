// La ventana «🎬 Video» de la galería: tres propuestas para elegir, pegar tu
// link (con su segundo de inicio) y revisar la galería uno a uno.
//   NODE_PATH=/ruta/node_modules node pruebas/videos-rapido.mjs
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { console.error('Falta playwright (npm i -D playwright, o NODE_PATH=…)'); process.exit(2); }

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
await p.goto('file://' + import.meta.dirname + '/arnes/videos.html');

let mal = 0, n = 0;
const ok = (nombre, c, extra = '') => { n++; if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

// 1. Los links que se pegan
const ids = await p.evaluate(() => [
  entYoutubeId('https://youtu.be/XPPfnSEATJA?t=12'), entYoutubeId('https://www.youtube.com/shorts/iK22GwXJji0'),
  entYoutubeId('https://www.youtube.com/watch?v=U3Atcn3wFjY&t=1m5s'), entYoutubeId('https://example.com/video'),
  entYoutubeInicio('https://youtu.be/XPPfnSEATJA?t=12'), entYoutubeInicio('https://www.youtube.com/watch?v=U3Atcn3wFjY&t=1m5s'),
  entYoutubeInicio('https://www.youtube.com/embed/U3Atcn3wFjY?start=40'), entYoutubeInicio('https://youtu.be/XPPfnSEATJA'),
]);
ok('reconoce youtu.be, shorts y watch; rechaza otro sitio', JSON.stringify(ids.slice(0, 4)) === JSON.stringify(['XPPfnSEATJA', 'iK22GwXJji0', 'U3Atcn3wFjY', null]), JSON.stringify(ids));
ok('lee el segundo de inicio (?t=12, t=1m5s, start=40)', JSON.stringify(ids.slice(4)) === JSON.stringify([12, 65, 40, null]), JSON.stringify(ids));

// 2. La ventana de un ejercicio con video
await p.evaluate(() => entVideoRapido('e1'));
ok('muestra el video actual', await p.locator('text=Ahora').count() === 1);
const props = await p.locator('[data-propuesta]').evaluateAll(els => els.map(e => e.dataset.propuesta));
ok('trae 3 propuestas y no repite el video que ya tiene', JSON.stringify(props) === JSON.stringify(['iK22GwXJji0', 'XPPfnSEATJA', 'xT31s-Y0l_0']), JSON.stringify(props));
ok('dice si tiene voz y la duración', await p.locator('text=Sin voz').count() === 2 && await p.locator('text=Con voz').count() === 1 && await p.locator('text=0:19').count() === 2);
await p.locator('[data-propuesta="XPPfnSEATJA"] button[title="Ver aquí"]').click();
ok('la propuesta se ve ahí mismo (reproductor)', await p.locator('[data-propuesta="XPPfnSEATJA"] iframe[src*="youtube-nocookie.com/embed/XPPfnSEATJA"]').count() === 1);
await p.locator('[data-propuesta="XPPfnSEATJA"]').getByText('Usar este').click();
await p.waitForTimeout(100);
let e1 = await p.evaluate(() => DB.ejercicios[0]);
ok('«Usar este» guarda el video en el ejercicio', e1.video_fuente === 'youtube' && e1.video_ref === 'XPPfnSEATJA' && e1.video_url === 'https://www.youtube.com/watch?v=XPPfnSEATJA' && e1.video_inicio_seg === null, JSON.stringify(e1));
await p.getByText('↩ Volver al que tenía antes').click();
await p.waitForTimeout(100);
e1 = await p.evaluate(() => DB.ejercicios[0]);
ok('se puede deshacer', e1.video_ref === 'U3Atcn3wFjY', e1.video_ref);

// 3. Pegar un link con su segundo
await p.fill('#vr-url', 'https://www.youtube.com/watch?v=abcdefghijk&t=1m5s');
ok('al pegar, dice que lo reconoce y llena el segundo', (await p.textContent('#vr-estado')).includes('abcdefghijk') && await p.inputValue('#vr-inicio') === '65');
await p.getByText('Guardar link').click();
await p.waitForTimeout(100);
e1 = await p.evaluate(() => DB.ejercicios[0]);
ok('«Guardar link» guarda video y segundo de inicio', e1.video_ref === 'abcdefghijk' && e1.video_inicio_seg === 65 && e1.video_url.endsWith('&t=65s'), JSON.stringify(e1));
await p.fill('#vr-url', 'https://vimeo.com/123');
await p.getByText('Guardar link').click();
ok('un link que no es de YouTube no se guarda', (await p.evaluate(() => DB.ejercicios[0].video_ref)) === 'abcdefghijk' && (await p.textContent('#vr-estado')).includes('No reconozco'));

// 4. Revisar uno a uno
await p.evaluate(() => { _ent.filtros.video = ''; return entRevisarVideos(); });
ok('revisar uno a uno recorre la lista filtrada', (await p.locator('text=1 de 3').count()) === 1);
const primero = await p.getAttribute('[data-video-rapido]', 'data-video-rapido');
await p.getByText('Siguiente →').click();
const segundo = await p.getAttribute('[data-video-rapido]', 'data-video-rapido');
ok('Siguiente pasa al otro ejercicio', primero !== segundo && (await p.locator('text=2 de 3').count()) === 1, `${primero} → ${segundo}`);
// El de Push Up no tiene video: se elige su propuesta y pasa solo al siguiente
await p.evaluate(() => { const i = _vid.cola.indexOf('e2'); _vid.pos = i; entPintarVideoRapido(); });
ok('sin video lo dice', (await p.locator('text=no tiene video').count()) === 1);
const posAntes = await p.evaluate(() => _vid.pos);
await p.getByText('Usar este').first().click();
await p.waitForTimeout(100);
ok('al elegir en la revisión, se pasa solo al siguiente', (await p.evaluate(() => DB.ejercicios[1].video_ref)) === 'IODxDxX7oi4' && (await p.evaluate(() => _vid.pos)) === Math.min(posAntes + 1, 2));

// 5. Sin la tabla de propuestas: se puede pegar el link igual
await p.evaluate(() => { DB.sinTablaPropuestas = true; return entCargarPropuestas(true).then(() => entVideoRapido('e3')); });
ok('sin el SQL corrido, avisa y deja pegar el link', (await p.locator('text=propuestas-videos.sql').count()) === 1 && (await p.locator('#vr-url').count()) === 1);
ok('un video subido se avisa que se reemplaza', (await p.locator('text=Tiene un video').count()) === 1);

// 6. La tarjeta de la galería trae el botón
await p.evaluate(() => { document.getElementById('ent-body').innerHTML = entTarjetaEjercicio(DB.ejercicios[0]); });
ok('cada tarjeta de la galería trae «🎬 Video»', (await p.locator('#ent-body button', { hasText: '🎬 Video' }).count()) === 1);

// 7. «Los que usan mis clientes»: solo los de rutinas activas de clientes activos,
//    primero el que usan más clientes, y la revisión uno a uno los respeta.
await p.evaluate(() => { _ent.filtros.video = ''; _ent.filtros.uso = 'clientes'; return entDb.ejerciciosEnUso(true); });
const enUso = await p.evaluate(() => entFiltrar(DB.ejercicios).map(e => [e.id, _ent.enUso.get(e.id)]));
ok('en uso: solo los de rutinas activas de clientes activos, el más usado primero', JSON.stringify(enUso) === JSON.stringify([['e3', 2], ['e2', 1]]), JSON.stringify(enUso));
await p.evaluate(() => { document.getElementById('ent-body').innerHTML = entTarjetaEjercicio(DB.ejercicios[2]); });
ok('la tarjeta dice cuántos clientes lo usan', (await p.locator('#ent-body', { hasText: '👥 2 clientes' }).count()) === 1);
// e2 ya tiene video (se eligió arriba) y e3 tiene uno subido: con «Sin video»
// no queda ninguno; al quitarle el video a e2, aparece.
await p.evaluate(() => { _ent.filtros.video = 'sin'; });
const sinAntes = await p.evaluate(() => entFiltrar(DB.ejercicios).map(e => e.id));
await p.evaluate(() => { DB.ejercicios[1].video_fuente = 'ninguno'; });
const sinDespues = await p.evaluate(() => entFiltrar(DB.ejercicios).map(e => e.id));
ok('combinado con «Sin video»: los que faltan y usan tus clientes', JSON.stringify(sinAntes) === '[]' && JSON.stringify(sinDespues) === '["e2"]', JSON.stringify([sinAntes, sinDespues]));
await p.evaluate(() => { DB.ejercicios[1].video_fuente = 'youtube'; });
await p.evaluate(() => { _ent.filtros.video = ''; return entRevisarVideos(); });
ok('revisar uno a uno recorre solo los que usan tus clientes', (await p.locator('text=1 de 2').count()) === 1
  && (await p.getAttribute('[data-video-rapido]', 'data-video-rapido')) === 'e3');
await p.evaluate(() => { _ent.filtros.uso = ''; });
ok('sin el filtro, vuelve toda la galería', (await p.evaluate(() => entFiltrar(DB.ejercicios).length)) === 3);

ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
await b.close();
console.log(mal ? `\n${mal} fallo(s)` : `\n${n}/${n} bien`);
process.exit(mal ? 1 : 0);
