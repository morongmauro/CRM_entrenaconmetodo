-- ═══════════════════════════════════════════════════════════════════════
-- FICHAS REPETIDAS: CUÁL REEMPLAZÓ A CUÁL
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo AGREGA una columna a ejercicios: no borra nada.
--
-- Para qué: en la Galería, «Pasarles esta» (fichas archivadas que tus
-- clientes aún tienen) deja anotado en la ficha vieja cuál quedó en su lugar.
-- Con eso la app junta en la ficha nueva la última vez, el récord, el
-- historial, tus comentarios y los videos pedidos de la vieja.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  select data_type into t from information_schema.columns where table_name = 'ejercicios' and column_name = 'id';
  execute format('alter table ejercicios add column if not exists duplicado_de %s', case when t = 'uuid' then 'uuid' else 'text' end);
end $$;

-- Que la API vea la columna nueva de inmediato.
notify pgrst, 'reload schema';

-- Para comprobar: debe salir «sí».
select case when exists (select 1 from information_schema.columns where table_name = 'ejercicios' and column_name = 'duplicado_de') then 'sí' else 'no' end as existe_duplicado_de;
