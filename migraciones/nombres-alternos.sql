-- ═══════════════════════════════════════════════════════════════════════
-- RENOMBRAR UN CLIENTE SIN ROMPERLE LA APP
-- ═══════════════════════════════════════════════════════════════════════
--
-- El problema: `clientes.nombre` no es una etiqueta, es una LLAVE. Con ella
--   · el cliente entra al Meal Tracker y al Centro de Recursos
--     (api/authorize.js compara el nombre tecleado contra esta columna),
--   · el Meal Tracker recupera su cuenta en un teléfono nuevo
--     (api/sync.js?identity_for),
--   · el CRM cruza sus lecturas del Centro (`reading_state.client_name`).
--
-- Así que corregir una errata en el nombre tenía tres efectos, todos malos:
--   1. lo dejaba FUERA de su propia app (nombre no encontrado → no autorizado),
--   2. en un teléfono nuevo le abría una cuenta VACÍA — "se me borró todo",
--   3. su avance de lectura del Centro aparecía en cero.
--
-- (Los datos nunca se borraban: viven contra un uuid. Pero dejaban de
-- encontrarse, que para el cliente es exactamente lo mismo.)
--
-- La solución: al renombrar, el nombre viejo se guarda aquí y TODO el
-- ecosistema sigue aceptándolo. El CRM lo hace solo; tú no tienes que
-- acordarte de nada.
--
-- Se puede correr dos veces.
-- ═══════════════════════════════════════════════════════════════════════

alter table clientes
  add column if not exists nombres_alternos text[] default '{}';

comment on column clientes.nombres_alternos is
  'Nombres que este cliente tuvo antes. Lo llena el CRM solo al renombrar. authorize.js y sync.js los aceptan igual que el actual, para que corregir un nombre no lo deje fuera de su app.';

-- Búsqueda por cualquiera de los nombres anteriores sin escanear la tabla.
create index if not exists clientes_alternos_idx on clientes using gin (nombres_alternos);

-- ── Si ya renombraste a alguien ANTES de esto ───────────────────────────
-- El nombre viejo se perdió, así que hay que devolverlo a mano. Ejemplo con
-- el caso de Andrés: si en el CRM ya quedó como "Andrés Yepes" pero su
-- cuenta del Meal Tracker y sus lecturas del Centro están a nombre de
-- "Andres Yepez", esto lo reconecta:
--
--   update clientes
--      set nombres_alternos = array(select distinct unnest(nombres_alternos || array['Andres Yepez']))
--    where nombre ilike '%yepes%';
--
-- Para saber si hace falta: en el Centro de aprendizaje del CRM, el aviso
-- de arriba lista los nombres que quedaron sueltos, con su ortografía exacta.
