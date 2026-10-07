-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRASEÑA DE LA APP (cuenta del cliente)
-- ═══════════════════════════════════════════════════════════════════════════
-- La llave del cliente en la app sigue siendo su NOMBRE. Esto solo agrega una
-- contraseña encima, atada al correo que ya tiene aquí en el CRM. No crea
-- usuarios nuevos ni toca ningún dato.
--
--   app_clave_hash  el hash de la contraseña (scrypt con sal). La contraseña
--                   NUNCA se guarda; ni el coach la puede ver.
--   app_clave_at    cuándo la creó.
--
-- Si un cliente olvida su contraseña, se la «reinicias» así y la vuelve a
-- crear al abrir la app (su sesión vieja deja de valer):
--   update clientes set app_clave_hash = null where nombre = 'Nombre Apellido';
--
-- Se puede correr varias veces sin problema.
-- ═══════════════════════════════════════════════════════════════════════════

alter table clientes add column if not exists app_clave_hash text;
alter table clientes add column if not exists app_clave_at timestamptz;

-- Para revisar: quién ya creó su contraseña.
select nombre, email, app_clave_at from clientes where app_clave_hash is not null order by app_clave_at desc;
