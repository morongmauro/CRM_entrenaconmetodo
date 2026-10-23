-- ═══════════════════════════════════════════════════════════════════════
-- «DAR MÁS DÍAS» · prórroga del bloqueo por pago pendiente
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo AGREGA una columna vacía a `clientes`: no cambia ningún
-- dato, no borra nada y no toca permisos.
--
-- Qué guarda: hasta qué fecha (incluida) la app del cliente NO se bloquea
-- aunque tenga el pago pendiente. El aviso de pago le sigue saliendo.
-- Vacía = sin prórroga (la regla de siempre: bloqueo desde el día 9).
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes' and column_name = 'prorroga_hasta'
  ) then
    alter table public.clientes add column prorroga_hasta date;
  end if;
end $$;

-- Para comprobar: debe salir una fila con «prorroga_hasta | date».
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'clientes' and column_name = 'prorroga_hasta';
