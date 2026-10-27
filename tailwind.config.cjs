// Tailwind del CRM, compilado a /tailwind.css (antes salía del CDN de
// Tailwind en el navegador, que arma los estilos en cada carga y era lo más
// lento del CRM). Si usas una clase de Tailwind NUEVA, recompila:
//
//     npx tailwindcss@3.4.17 -c tailwind.config.cjs -i estilos-tailwind.css -o tailwind.css --minify
//
// (pruebas/tailwind-al-dia.mjs avisa si se te olvidó).
module.exports = {
  content: ['./*.{html,js}', './api/**/*.js'],
  // Las que se arman al vuelo (helpers.avatar: w-${size} h-${size}).
  safelist: [{ pattern: /^(w|h)-(8|9|10|11|12|14|16)$/ }],
  theme: { extend: { fontFamily: { sans: ['Figtree', 'system-ui', 'sans-serif'] } } },
};
