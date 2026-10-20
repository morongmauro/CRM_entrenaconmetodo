-- ═══════════════════════════════════════════════════════════════════════
-- REGISTRO DE CAMBIOS DE EJERCICIO (trazabilidad)
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo CREA una tabla nueva: no toca ninguna tabla existente y
-- no borra nada.
--
-- Qué guarda: cada vez que en una rutina un ejercicio se cambia por otro
-- (con el agente, con «Alternativas», con «Cambiar solo los ejercicios» o a
-- mano), cuál había, cuál quedó, en qué rutina y posición, cuándo y cómo.
-- Mientras no se corra, el CRM los guarda en este navegador y los sube solo
-- en cuanto la tabla exista.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists cambios_ejercicio (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users,
  cliente_id          text,
  rutina_id           text,
  rutina_nombre       text,
  rutina_ejercicio_id text,
  posicion            int,
  ejercicio_antes     text,
  nombre_antes        text,
  ejercicio_despues   text,
  nombre_despues      text,
  origen              text,          -- agente · agente-variante · alternativas · solo-ejercicios · manual
  creado_at           timestamptz not null default now()
);
create index if not exists cambios_ejercicio_rutina_idx on cambios_ejercicio (rutina_id, creado_at desc);
alter table cambios_ejercicio enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cambios_ejercicio' and policyname = 'own cambios_ejercicio') then
    create policy "own cambios_ejercicio" on cambios_ejercicio for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para comprobar: debe salir 0 (la tabla existe y está vacía al principio).
select count(*) from cambios_ejercicio;
