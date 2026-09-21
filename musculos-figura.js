// =====================================================
// FIGURA MUSCULAR · silueta frontal y dorsal
// =====================================================
// Pinta qué músculos trabaja un ejercicio: los PRIMARIOS fuerte, los
// SECUNDARIOS suave, el resto en gris. Dos siluetas, frente y espalda.
//
// El esquema decía desde el principio que los músculos "se pintan en el
// dibujo del cuerpo que ve el cliente" — pero el dibujo no existía. Esto es
// ese dibujo.
//
// POR QUÉ UN SVG A MANO Y NO UNA IMAGEN
// -------------------------------------
// Con una imagen habría que mantener 30 PNG con sus máscaras y recolorearlos
// en cada render. Aquí cada músculo es un <path> con su `data-musculo`, así
// que pintar es cambiar un atributo: cero peticiones, escala sin pixelarse y
// funciona igual en el CRM y en la app del cliente.
//
// Los slugs son EXACTAMENTE los de la tabla `musculos`. Si añades uno allá,
// añade aquí su forma; si no, simplemente no se pinta (no rompe nada).
//
// USO
//   figuraMusculos({ primarios: ['pectoral_mayor'], secundarios: ['triceps'] })
//     → string con el <svg>. Opciones: { alto, leyenda, cara }
// =====================================================

const FIG_COLOR = {
  primario:   '#8A9558',   // oliva de marca
  secundario: '#D4DAB8',   // el mismo, lavado
  base:       '#E8E6DF',   // músculo sin trabajar
  piel:       '#F7F4ED',   // fondo de la silueta
  linea:      '#C9C6BC',   // contorno
  tinta:      '#5A5A5A',
};

// ── Las formas ──────────────────────────────────────────────────────────
// Silueta estilizada de 100×220 por cara. No es una lámina de anatomía: es
// lo justo para que alguien reconozca DÓNDE está el músculo de un vistazo.
// Cada entrada es una lista de paths (los pares izquierda/derecha van como
// dos formas del mismo slug).
// La silueta va por piezas —cabeza, cuello, tronco, dos brazos, dos piernas
// y dos pies— porque dibujarla de una sola daba un muñeco hinchado: los
// brazos se fundían con el tronco y no se distinguía dónde acababa cada cosa.
//
// Las curvas no están escritas a mano. Brazos, piernas y la mayoría de los
// músculos salen de `carga/gen-figura.py`, que recorre una línea central con
// un radio por punto; por eso el brazo se estrecha hacia la muñeca y el muslo
// hacia la rodilla sin que nadie cuadre decimales. El lado derecho es el
// izquierdo reflejado sobre x=50, así que nunca se desalinean entre sí.
const FIG_CUERPO = [
  'M50,3.5c4.7,0 8.3,4.4 8.3,10.2c0,6.1 -3.6,11 -8.3,11c-4.7,0 -8.3,-4.9 -8.3,-11c0,-5.8 3.6,-10.2 8.3,-10.2z',
  'M54.6,23C54.7,24 55.1,28 55.2,29L44.8,29C44.9,28 45.3,24 45.4,23Z',
  'M50,27.5C43.5,27.5 38,29.5 33.5,32.5C29,35.5 26.8,39.5 26.5,44.5C26.2,49.5 27.5,54 29.5,57.5C32,62 33.8,66.5 34.6,71.5C35.2,75.5 35,79.5 34.2,84C33.4,88.5 33,93 33.4,97.5C33.7,101 34.4,104 35.4,106.5L64.6,106.5C65.6,104 66.3,101 66.6,97.5C67,93 66.6,88.5 65.8,84C65,79.5 64.8,75.5 65.4,71.5C66.2,66.5 68,62 70.5,57.5C72.5,54 73.8,49.5 73.5,44.5C73.2,39.5 71,35.5 66.5,32.5C62,29.5 56.5,27.5 50,27.5Z',
  'M33.9,48.4C33.6,50 32.6,54.4 31.8,58.2C31,61.9 30.1,66.8 29.1,70.9C28.2,74.9 26.9,78.7 26.2,82.6C25.4,86.6 25.2,90.5 24.5,94.6C23.7,98.8 22.5,103.8 21.8,107.5C21,111.1 20.3,113.5 20,116.4C19.6,119.2 19.8,123.1 19.8,124.4A3.6,3.6 0 0 0 12.6,123.6C12.9,122.2 14,118.5 14.4,115.6C14.8,112.8 14.8,110.2 15,106.5C15.3,102.8 15.5,97.6 15.9,93.4C16.4,89.2 17.4,85.4 17.8,81.4C18.3,77.3 18.1,73.4 18.5,69.1C18.9,64.9 19.5,59.7 20.2,55.8C21,51.9 22.6,47.3 23.1,45.6Z',
  'M66.1,48.4C66.4,50 67.4,54.4 68.2,58.2C69,61.9 69.9,66.8 70.9,70.9C71.8,74.9 73.1,78.7 73.8,82.6C74.6,86.6 74.8,90.5 75.5,94.6C76.3,98.8 77.5,103.8 78.2,107.5C79,111.1 79.7,113.5 80,116.4C80.4,119.2 80.2,123.1 80.2,124.4A3.6,3.6 0 0 1 87.4,123.6C87.1,122.2 86,118.5 85.6,115.6C85.2,112.8 85.2,110.2 85,106.5C84.7,102.8 84.5,97.6 84.1,93.4C83.6,89.2 82.6,85.4 82.2,81.4C81.7,77.3 81.9,73.4 81.5,69.1C81.1,64.9 80.5,59.7 79.8,55.8C79,51.9 77.4,47.3 76.9,45.6Z',
  'M50.9,104.9C50.5,107.2 49.6,113.8 49,118.7C48.3,123.6 47.6,129.2 46.8,134.4C46,139.7 44.7,145.5 44.2,150.3C43.7,155 44.4,158.2 44,163.2C43.6,168.2 42.4,174.6 41.8,180.1C41.2,185.6 40.5,193.4 40.3,196.1L34.5,195.9C34.4,193.3 34.1,185.4 33.8,179.9C33.5,174.4 32.8,167.8 32.8,162.8C32.8,157.8 33.8,154.6 33.8,149.7C33.8,144.9 32.9,139 32.8,133.6C32.7,128.2 32.8,122.4 33,117.3C33.3,112.2 34,105.5 34.1,103.1Z',
  'M49.1,104.9C49.5,107.2 50.4,113.8 51,118.7C51.7,123.6 52.4,129.2 53.2,134.4C54,139.7 55.3,145.5 55.8,150.3C56.3,155 55.6,158.2 56,163.2C56.4,168.2 57.6,174.6 58.2,180.1C58.8,185.6 59.5,193.4 59.7,196.1L65.5,195.9C65.6,193.3 65.9,185.4 66.2,179.9C66.5,174.4 67.2,167.8 67.2,162.8C67.2,157.8 66.2,154.6 66.2,149.7C66.2,144.9 67.1,139 67.2,133.6C67.3,128.2 67.2,122.4 67,117.3C66.7,112.2 66,105.5 65.9,103.1Z',
  'M34.5,196C33.5,201 33,205 33.2,208C33.4,210.5 35,211.5 38.5,211.5C42,211.5 43.5,210.5 43.4,208C43.3,204.5 42,200.5 40.3,196Z',
  'M65.5,196C66.5,201 67,205 66.8,208C66.6,210.5 65,211.5 61.5,211.5C58,211.5 56.5,210.5 56.6,208C56.7,204.5 58,200.5 59.7,196Z',
];

const FIG_FRENTE = {
  deltoide_anterior: ['M37.7,37C37.4,38 36.6,40.9 36.1,42.8C35.6,44.7 35.1,47.7 34.8,48.7A4.4,4.4 0 0 0 26.2,47.3C26.3,46.1 26.2,42.4 26.9,40.2C27.6,38 29.7,35 30.3,34A4,4 0 0 0 37.7,37Z', 'M62.3,37C62.6,38 63.4,40.9 63.9,42.8C64.4,44.7 64.9,47.7 65.2,48.7A4.4,4.4 0 0 1 73.8,47.3C73.7,46.1 73.8,42.4 73.1,40.2C72.4,38 70.3,35 69.7,34A4,4 0 0 1 62.3,37Z'],
  deltoide_lateral:  ['M34.1,38C33.9,39.1 33.3,42.6 32.9,44.8C32.5,47 32,50.2 31.8,51.3A3.6,3.6 0 0 0 24.6,50.7C24.6,49.4 24.1,45.6 24.7,43.2C25.2,40.7 27.4,37.2 27.9,36A3.2,3.2 0 0 0 34.1,38Z', 'M65.9,38C66.1,39.1 66.7,42.6 67.1,44.8C67.5,47 68,50.2 68.2,51.3A3.6,3.6 0 0 1 75.4,50.7C75.4,49.4 75.9,45.6 75.3,43.2C74.8,40.7 72.6,37.2 72.1,36A3.2,3.2 0 0 1 65.9,38Z'],
  trapecio_superior: ['M50,28.2C44.6,28.2 39.8,29.6 35.6,32.4C33.8,33.6 33,35.2 33.4,37.2C39.2,34.6 44.8,33.3 50,33.3C55.2,33.3 60.8,34.6 66.6,37.2C67,35.2 66.2,33.6 64.4,32.4C60.2,29.6 55.4,28.2 50,28.2Z'],
  pectoral_superior: ['M49,36.5C44,36.2 39.5,37 36,38.8C34.5,39.6 33.8,40.8 34,42.2L49,43.6Z', 'M51,36.5C56,36.2 60.5,37 64,38.8C65.5,39.6 66.2,40.8 66,42.2L51,43.6Z'],
  pectoral_mayor:    ['M49,44.6L34.2,43.2C34.6,47.5 36,51.5 38.4,54.4C41.2,57.8 45,59.4 49,59.2Z', 'M51,44.6L65.8,43.2C65.4,47.5 64,51.5 61.6,54.4C58.8,57.8 55,59.4 51,59.2Z'],
  biceps:            ['M30.7,55.8C30.5,57.1 29.9,61 29.3,63.8C28.7,66.6 27.5,71.1 27.2,72.6A3.6,3.6 0 0 0 20,71.4C20.1,69.9 20.3,65.1 20.7,62.2C21.1,59.4 22.2,55.5 22.5,54.2A4.2,4.2 0 0 0 30.7,55.8Z', 'M69.3,55.8C69.5,57.1 70.1,61 70.7,63.8C71.3,66.6 72.5,71.1 72.8,72.6A3.6,3.6 0 0 1 80,71.4C79.9,69.9 79.7,65.1 79.3,62.2C78.9,59.4 77.8,55.5 77.5,54.2A4.2,4.2 0 0 1 69.3,55.8Z'],
  braquial:          ['M25.8,73.4C25.6,74.5 24.9,79.2 24.8,80.4A2.6,2.6 0 0 0 19.6,79.6C19.8,78.5 20.5,73.8 20.6,72.6A2.6,2.6 0 0 0 25.8,73.4Z', 'M74.2,73.4C74.4,74.5 75.1,79.2 75.2,80.4A2.6,2.6 0 0 1 80.4,79.6C80.2,78.5 79.5,73.8 79.4,72.6A2.6,2.6 0 0 1 74.2,73.4Z'],
  antebrazo:         ['M25.5,86.6C25.2,88.5 24.4,93.8 23.7,97.6C22.9,101.4 21.6,107.4 21.2,109.4A3,3 0 0 0 15.2,108.6C15.3,106.6 15.5,100.3 15.9,96.4C16.3,92.6 17.4,87.2 17.7,85.4A4,4 0 0 0 25.5,86.6Z', 'M74.5,86.6C74.8,88.5 75.6,93.8 76.3,97.6C77.1,101.4 78.4,107.4 78.8,109.4A3,3 0 0 1 84.8,108.6C84.7,106.6 84.5,100.3 84.1,96.4C83.7,92.6 82.6,87.2 82.3,85.4A4,4 0 0 1 74.5,86.6Z'],
  recto_abdominal:   ['M44.2,60.5C43.6,70 43.6,79.5 44.4,89C44.6,91.5 45.8,92.8 48,93.2L52,93.2C54.2,92.8 55.4,91.5 55.6,89C56.4,79.5 56.4,70 55.8,60.5Z'],
  oblicuos:          ['M43.2,61C39.8,61.2 37.2,62.5 35.6,64.8C34.6,69.5 34.4,74.5 35,79.5C35.4,83.5 37,86.5 39.8,88.5C41.4,89.6 42.6,89 42.8,87C42.2,78.4 42.3,69.7 43.2,61Z', 'M56.8,61C60.2,61.2 62.8,62.5 64.4,64.8C65.4,69.5 65.6,74.5 65,79.5C64.6,83.5 63,86.5 60.2,88.5C58.6,89.6 57.4,89 57.2,87C57.8,78.4 57.7,69.7 56.8,61Z'],
  transverso:        ['M50,85.6C55.2,85.6 59.4,87.6 59.4,90C59.4,92.4 55.2,94.4 50,94.4C44.8,94.4 40.6,92.4 40.6,90C40.6,87.6 44.8,85.6 50,85.6Z'],
  psoas:             ['M46.2,95C48.1,95.3 49.3,97.7 48.9,100.5C48.5,103.2 46.7,105.2 44.8,105C42.9,104.7 41.7,102.3 42.1,99.5C42.5,96.8 44.3,94.8 46.2,95Z', 'M53.8,95C51.9,95.3 50.7,97.7 51.1,100.5C51.5,103.2 53.3,105.2 55.2,105C57.1,104.7 58.3,102.3 57.9,99.5C57.5,96.8 55.7,94.8 53.8,95Z'],
  cuadriceps:        ['M49.4,110.7C49.1,113 48.3,120 47.6,124.6C46.9,129.2 45.9,134.4 45.2,138.4C44.5,142.3 43.5,146.6 43.2,148.3A4.2,4.2 0 0 0 34.8,147.7C34.7,146.1 34.2,141.7 34,137.6C33.8,133.6 33.5,128.1 33.6,123.4C33.7,118.7 34.5,111.6 34.6,109.3A7.4,7.4 0 0 0 49.4,110.7Z', 'M50.6,110.7C50.9,113 51.7,120 52.4,124.6C53.1,129.2 54.1,134.4 54.8,138.4C55.5,142.3 56.5,146.6 56.8,148.3A4.2,4.2 0 0 1 65.2,147.7C65.3,146.1 65.8,141.7 66,137.6C66.2,133.6 66.5,128.1 66.4,123.4C66.3,118.7 65.5,111.6 65.4,109.3A7.4,7.4 0 0 1 50.6,110.7Z'],
  aductores:         ['M49.9,110.2C49.7,112.6 49.3,119.9 48.9,124.2C48.4,128.6 47.5,134.2 47.2,136.2A2.6,2.6 0 0 0 42,135.8C42,133.8 41.9,128.1 42.1,123.8C42.3,119.4 42.9,112.1 43.1,109.8A3.4,3.4 0 0 0 49.9,110.2Z', 'M50.1,110.2C50.3,112.6 50.7,119.9 51.1,124.2C51.6,128.6 52.5,134.2 52.8,136.2A2.6,2.6 0 0 1 58,135.8C58,133.8 58.1,128.1 57.9,123.8C57.7,119.4 57.1,112.1 56.9,109.8A3.4,3.4 0 0 1 50.1,110.2Z'],
  abductores:        ['M38.9,106.3C38.7,108 38.2,113.3 37.8,116.2C37.4,119.2 36.8,122.8 36.6,124.1A2.4,2.4 0 0 0 31.8,123.9C31.7,122.5 31.4,118.8 31.4,115.8C31.5,112.7 32,107.4 32.1,105.7A3.4,3.4 0 0 0 38.9,106.3Z', 'M61.1,106.3C61.3,108 61.8,113.3 62.2,116.2C62.6,119.2 63.2,122.8 63.4,124.1A2.4,2.4 0 0 1 68.2,123.9C68.3,122.5 68.6,118.8 68.6,115.8C68.5,112.7 68,107.4 67.9,105.7A3.4,3.4 0 0 1 61.1,106.3Z'],
  tibial_anterior:   ['M40.6,158.1C40.5,160.5 40.1,167.5 39.8,172.1C39.5,176.8 38.8,183.7 38.6,186.1A2.2,2.2 0 0 0 34.2,185.9C34.1,183.6 33.8,176.6 33.8,171.9C33.8,167.2 34.1,160.2 34.2,157.9A3.2,3.2 0 0 0 40.6,158.1Z', 'M59.4,158.1C59.5,160.5 59.9,167.5 60.2,172.1C60.5,176.8 61.2,183.7 61.4,186.1A2.2,2.2 0 0 1 65.8,185.9C65.9,183.6 66.2,176.6 66.2,171.9C66.2,167.2 65.9,160.2 65.8,157.9A3.2,3.2 0 0 1 59.4,158.1Z'],
  gemelos:           [],
  cuerpo_completo:   [],
};

const FIG_ESPALDA = {
  trapecio_superior:  ['M50,29.5C45,29.5 40.5,30.8 36.5,33.4C34.8,34.5 34.2,36 35,37.6C39.8,36 44.8,35.2 50,35.2C55.2,35.2 60.2,36 65,37.6C65.8,36 65.2,34.5 63.5,33.4C59.5,30.8 55,29.5 50,29.5Z'],
  trapecio_medio:     ['M50,36.4C44.4,36.4 39.2,37.3 34.4,39.2C34.2,44 34.8,48.4 36.2,52.4C41,50.8 45.6,50 50,50C54.4,50 59,50.8 63.8,52.4C65.2,48.4 65.8,44 65.6,39.2C60.8,37.3 55.6,36.4 50,36.4Z'],
  trapecio_inferior:  ['M50,51.4C47,51.4 44.2,51.8 41.6,52.6C43.4,58.4 46.2,63.6 50,68.2C53.8,63.6 56.6,58.4 58.4,52.6C55.8,51.8 53,51.4 50,51.4Z'],
  romboides:          ['M49,38.6C45,38.8 41.2,39.6 37.6,41C37.6,45 38.2,48.6 39.4,51.8C42.4,51 45.6,50.5 49,50.3Z', 'M51,38.6C55,38.8 58.8,39.6 62.4,41C62.4,45 61.8,48.6 60.6,51.8C57.6,51 54.4,50.5 51,50.3Z'],
  redondo_mayor:      ['M33.1,46.1C35.5,45 37.9,45.5 38.7,47.1C39.4,48.7 38.2,50.8 35.9,51.9C33.5,53 31.1,52.5 30.3,50.9C29.6,49.3 30.8,47.2 33.1,46.1Z', 'M66.9,46.1C64.5,45 62.1,45.5 61.3,47.1C60.6,48.7 61.8,50.8 64.1,51.9C66.5,53 68.9,52.5 69.7,50.9C70.4,49.3 69.2,47.2 66.9,46.1Z'],
  dorsal_ancho:       ['M33.8,52C33.2,58 33.4,64 34.4,70C35.2,75 37,79.2 40,82.6C42.6,85.5 44.4,84.8 44.6,80.8C45,72 45.4,63.4 46,55C42.2,52.8 38.2,52 33.8,52Z', 'M66.2,52C66.8,58 66.6,64 65.6,70C64.8,75 63,79.2 60,82.6C57.4,85.5 55.6,84.8 55.4,80.8C55,72 54.6,63.4 54,55C57.8,52.8 61.8,52 66.2,52Z'],
  erectores:          ['M49.4,50.1C49.4,52.1 49.2,57.7 49.2,62.1C49.2,66.4 49.2,71.7 49.2,76C49.2,80.3 49.2,86 49.2,88A2.6,2.6 0 0 0 44,88C43.9,86 43.6,80.4 43.6,76C43.6,71.6 43.8,66.3 44,61.9C44.2,57.6 44.5,51.9 44.6,49.9A2.4,2.4 0 0 0 49.4,50.1Z', 'M50.6,50.1C50.6,52.1 50.8,57.7 50.8,62.1C50.8,66.4 50.8,71.7 50.8,76C50.8,80.3 50.8,86 50.8,88A2.6,2.6 0 0 1 56,88C56.1,86 56.4,80.4 56.4,76C56.4,71.6 56.2,66.3 56,61.9C55.8,57.6 55.5,51.9 55.4,49.9A2.4,2.4 0 0 1 50.6,50.1Z'],
  deltoide_posterior: ['M37.7,36.9C37.5,38 36.6,41.5 36.1,43.6C35.6,45.8 35,48.9 34.8,50A4.2,4.2 0 0 0 26.4,49C26.5,47.7 26.1,43.9 26.7,41.4C27.4,38.9 29.7,35.3 30.3,34.1A4,4 0 0 0 37.7,36.9Z', 'M62.3,36.9C62.5,38 63.4,41.5 63.9,43.6C64.4,45.8 65,48.9 65.2,50A4.2,4.2 0 0 1 73.6,49C73.5,47.7 73.9,43.9 73.3,41.4C72.6,38.9 70.3,35.3 69.7,34.1A4,4 0 0 1 62.3,36.9Z'],
  triceps:            ['M30.9,54.7C30.7,56.4 30.2,61.4 29.5,64.7C28.9,68 27.6,73 27.2,74.6A3.8,3.8 0 0 0 19.6,73.4C19.8,71.7 20,66.6 20.5,63.3C20.9,59.9 22,55 22.3,53.3A4.4,4.4 0 0 0 30.9,54.7Z', 'M69.1,54.7C69.3,56.4 69.8,61.4 70.5,64.7C71.1,68 72.4,73 72.8,74.6A3.8,3.8 0 0 1 80.4,73.4C80.2,71.7 80,66.6 79.5,63.3C79.1,59.9 78,55 77.7,53.3A4.4,4.4 0 0 1 69.1,54.7Z'],
  antebrazo:          ['M25.5,86.6C25.2,88.5 24.4,93.8 23.7,97.6C22.9,101.4 21.6,107.4 21.2,109.4A3,3 0 0 0 15.2,108.6C15.3,106.6 15.5,100.3 15.9,96.4C16.3,92.6 17.4,87.2 17.7,85.4A4,4 0 0 0 25.5,86.6Z', 'M74.5,86.6C74.8,88.5 75.6,93.8 76.3,97.6C77.1,101.4 78.4,107.4 78.8,109.4A3,3 0 0 1 84.8,108.6C84.7,106.6 84.5,100.3 84.1,96.4C83.7,92.6 82.6,87.2 82.3,85.4A4,4 0 0 1 74.5,86.6Z'],
  gluteo_mayor:       ['M49,89.6C44.2,89.2 39.8,90.4 36,93.2C34.6,96.6 34.2,100.2 34.8,103.8C35.2,105.8 36.2,106.8 38,106.8L49,106.8Z', 'M51,89.6C55.8,89.2 60.2,90.4 64,93.2C65.4,96.6 65.8,100.2 65.2,103.8C64.8,105.8 63.8,106.8 62,106.8L51,106.8Z'],
  gluteo_medio:       ['M34.9,89.8C37.3,89 39.6,89.9 40.2,91.6C40.8,93.4 39.4,95.5 37.1,96.2C34.7,97 32.4,96.1 31.8,94.4C31.2,92.6 32.6,90.5 34.9,89.8Z', 'M65.1,89.8C62.7,89 60.4,89.9 59.8,91.6C59.2,93.4 60.6,95.5 62.9,96.2C65.3,97 67.6,96.1 68.2,94.4C68.8,92.6 67.4,90.5 65.1,89.8Z'],
  isquiotibiales:     ['M49.6,112.6C49.3,115 48.6,122.3 48,126.6C47.3,130.9 46.5,134.8 45.8,138.4C45.1,142 44,146.6 43.6,148.3A4.4,4.4 0 0 0 34.8,147.7C34.6,146 34,141.3 33.8,137.6C33.6,133.8 33.5,129.8 33.6,125.4C33.7,121 34.3,113.7 34.4,111.4A7.6,7.6 0 0 0 49.6,112.6Z', 'M50.4,112.6C50.7,115 51.4,122.3 52,126.6C52.7,130.9 53.5,134.8 54.2,138.4C54.9,142 56,146.6 56.4,148.3A4.4,4.4 0 0 1 65.2,147.7C65.4,146 66,141.3 66.2,137.6C66.4,133.8 66.5,129.8 66.4,125.4C66.3,121 65.7,113.7 65.6,111.4A7.6,7.6 0 0 1 50.4,112.6Z'],
  gemelos:            ['M43.6,158.2C43.4,160.2 43.2,166.2 42.7,170.2C42.2,174.1 40.9,180.1 40.6,182.1A3,3 0 0 0 34.6,181.9C34.4,179.9 33.3,173.9 33.1,169.8C32.9,165.8 33.2,159.8 33.2,157.8A5.2,5.2 0 0 0 43.6,158.2Z', 'M56.4,158.2C56.6,160.2 56.8,166.2 57.3,170.2C57.8,174.1 59.1,180.1 59.4,182.1A3,3 0 0 1 65.4,181.9C65.6,179.9 66.7,173.9 66.9,169.8C67.1,165.8 66.8,159.8 66.8,157.8A5.2,5.2 0 0 1 56.4,158.2Z'],
  deltoide_lateral:   ['M34.1,38C33.9,39.1 33.3,42.6 32.9,44.8C32.5,47 32,50.2 31.8,51.3A3.6,3.6 0 0 0 24.6,50.7C24.6,49.4 24.1,45.6 24.7,43.2C25.2,40.7 27.4,37.2 27.9,36A3.2,3.2 0 0 0 34.1,38Z', 'M65.9,38C66.1,39.1 66.7,42.6 67.1,44.8C67.5,47 68,50.2 68.2,51.3A3.6,3.6 0 0 1 75.4,50.7C75.4,49.4 75.9,45.6 75.3,43.2C74.8,40.7 72.6,37.2 72.1,36A3.2,3.2 0 0 1 65.9,38Z'],
  abductores:         ['M38.8,104.2C38.7,105.9 38.3,111.2 38,114.2C37.7,117.2 37,120.8 36.8,122.1A2.4,2.4 0 0 0 32,121.9C31.9,120.5 31.6,116.8 31.6,113.8C31.6,110.8 31.9,105.5 32,103.8A3.4,3.4 0 0 0 38.8,104.2Z', 'M61.2,104.2C61.3,105.9 61.7,111.2 62,114.2C62.3,117.2 63,120.8 63.2,122.1A2.4,2.4 0 0 1 68,121.9C68.1,120.5 68.4,116.8 68.4,113.8C68.4,110.8 68.1,105.5 68,103.8A3.4,3.4 0 0 1 61.2,104.2Z'],
  manguito_rotador:   ['M36.3,38.5C38.6,37.6 40.9,38.2 41.6,39.9C42.2,41.5 41,43.6 38.7,44.5C36.4,45.4 34.1,44.8 33.4,43.1C32.8,41.5 34,39.4 36.3,38.5Z', 'M63.7,38.5C61.4,37.6 59.1,38.2 58.4,39.9C57.8,41.5 59,43.6 61.3,44.5C63.6,45.4 65.9,44.8 66.6,43.1C67.2,41.5 66,39.4 63.7,38.5Z'],
  cuerpo_completo:    [],
};

// Contador para que cada figura de la página tenga su propio clipPath. Dos
// figuras con el mismo id harían que la segunda recortara con la primera.
let _figSeq = 0;

function figCara(formas, primarios, secundarios, titulo, mapa, etiqueta = true) {
  const prim = new Set(primarios), sec = new Set(secundarios);
  const todoElCuerpo = prim.has('cuerpo_completo') || sec.has('cuerpo_completo');
  const colorSilueta = todoElCuerpo
    ? (prim.has('cuerpo_completo') ? FIG_COLOR.primario : FIG_COLOR.secundario)
    : FIG_COLOR.piel;
  const clip = `fig-clip-${++_figSeq}`;

  // Solo se dibuja lo que el ejercicio trabaja. Pintar además los 30 músculos
  // en gris llenaba el cuerpo de placas pálidas y costaba ver de un vistazo
  // cuál era el principal, que es justo lo único que hay que ver.
  const piezas = Object.entries(formas).flatMap(([slug, paths]) => {
    if (!paths.length) return [];
    const esPrim = prim.has(slug), esSec = sec.has(slug);
    if (!esPrim && !esSec) return [];
    const fill = esPrim ? FIG_COLOR.primario : FIG_COLOR.secundario;
    const nombre = (mapa && mapa[slug]) || slug;
    return paths.map(d =>
      `<path d="${d}" fill="${fill}" data-musculo="${slug}"><title>${nombre}</title></path>`);
  });

  const silueta = FIG_CUERPO.map(d => `<path d="${d}"`);

  return `
    <figure class="fig-musculo">
      <svg viewBox="0 0 100 220" role="img" aria-label="${titulo}" preserveAspectRatio="xMidYMid meet">
        <defs><clipPath id="${clip}">
          ${FIG_CUERPO.map(d => `<path d="${d}"/>`).join('')}
        </clipPath></defs>
        ${silueta.map(d => `${d} fill="${colorSilueta}"/>`).join('')}
        <g clip-path="url(#${clip})">${piezas.join('')}</g>
        ${silueta.map(d => `${d} fill="none" stroke="${FIG_COLOR.linea}" stroke-width="0.9" stroke-linejoin="round"/>`).join('')}
      </svg>
      ${etiqueta ? `<figcaption>${titulo}</figcaption>` : ''}
    </figure>`;
}

// ── La función pública ──────────────────────────────────────────────────
// primarios / secundarios: arrays de slugs.
// mapa: { slug: 'Nombre bonito' } para los tooltips (opcional).
// cara: 'ambas' (por defecto) | 'frente' | 'espalda'.
// leyenda: true para la fila de "fuerte = principal / suave = secundario".
// etiquetas: el "FRENTE"/"ESPALDA" bajo cada silueta. Con dos caras hace
//   falta para saber cuál es cuál; en una miniatura de 2rem es solo ruido.
function figuraMusculos({ primarios = [], secundarios = [], mapa = null,
                          cara = 'ambas', leyenda = true, alto = 150,
                          etiquetas = null } = {}) {
  const p = (primarios || []).filter(Boolean);
  const s = (secundarios || []).filter(Boolean).filter(x => !p.includes(x));
  if (!p.length && !s.length) return '';

  // Con una sola cara no hay nada que distinguir, así que el pie sobra salvo
  // que se pida explícitamente.
  const conPie = etiquetas == null ? (cara === 'ambas') : !!etiquetas;

  const caras = [];
  if (cara !== 'espalda') caras.push(figCara(FIG_FRENTE, p, s, 'Frente', mapa, conPie));
  if (cara !== 'frente')  caras.push(figCara(FIG_ESPALDA, p, s, 'Espalda', mapa, conPie));

  const nombres = (xs) => xs.map(x => (mapa && mapa[x]) || x).join(', ');

  return `
    <div class="fig-musculos" style="--fig-alto:${alto}px">
      <div class="fig-cuerpos">${caras.join('')}</div>
      ${leyenda ? `
        <div class="fig-leyenda">
          ${p.length ? `<div><span class="fig-punto" style="background:${FIG_COLOR.primario}"></span><b>Principal:</b> ${nombres(p)}</div>` : ''}
          ${s.length ? `<div><span class="fig-punto" style="background:${FIG_COLOR.secundario}"></span><b>También trabaja:</b> ${nombres(s)}</div>` : ''}
        </div>` : ''}
    </div>`;
}

// Estilos: se inyectan una sola vez, así el módulo es autocontenido y se
// puede copiar a la app del cliente sin arrastrar una hoja de estilos.
(function figCss() {
  if (typeof document === 'undefined' || document.getElementById('fig-musculos-css')) return;
  const st = document.createElement('style');
  st.id = 'fig-musculos-css';
  st.textContent = `
  .fig-musculos{display:flex;flex-direction:column;gap:.5rem}
  .fig-cuerpos{display:flex;gap:.75rem;justify-content:center}
  .fig-musculo{margin:0;display:flex;flex-direction:column;align-items:center;gap:.15rem}
  .fig-musculo svg{height:var(--fig-alto,150px);width:auto;display:block}
  .fig-musculo figcaption{font-size:.6rem;letter-spacing:.04em;text-transform:uppercase;color:${FIG_COLOR.tinta};opacity:.7}
  .fig-leyenda{font-size:.7rem;line-height:1.5;color:${FIG_COLOR.tinta}}
  .fig-leyenda b{color:#181818;font-weight:600}
  .fig-punto{display:inline-block;width:.55rem;height:.55rem;border-radius:2px;margin-right:.35rem;vertical-align:baseline}
  .fig-musculo path[data-musculo]{transition:fill .2s}
  `;
  document.head.appendChild(st);
})();

if (typeof window !== 'undefined') window.figuraMusculos = figuraMusculos;
if (typeof module !== 'undefined') module.exports = { figuraMusculos, FIG_FRENTE, FIG_ESPALDA, FIG_CUERPO };
