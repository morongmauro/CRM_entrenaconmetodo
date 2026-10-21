-- ═══════════════════════════════════════════════════════════════════════
-- COLUMNAS DE LA FICHA DEL CLIENTE QUE EL CRM YA USA
-- ═══════════════════════════════════════════════════════════════════════
-- Segura de repetir: solo AÑADE columnas que falten. No toca ninguna fila.
--
-- «trato» (cómo le dices al cliente en los diálogos de WhatsApp) se guardaba
-- desde la ficha pero ninguna migración la creaba. Sin ella, al guardar la
-- ficha el CRM reintentaba sin TODAS las columnas nuevas, y el correo y el
-- teléfono que acababas de escribir no quedaban guardados.
alter table clientes add column if not exists email text;
alter table clientes add column if not exists telefono text;
alter table clientes add column if not exists suplementos text;
alter table clientes add column if not exists actividades_complementarias text;
alter table clientes add column if not exists grasa_pct_kcal numeric;
alter table clientes add column if not exists nombres_alternos text[] default '{}';
alter table clientes add column if not exists trato text;
