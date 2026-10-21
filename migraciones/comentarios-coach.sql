-- ═══════════════════════════════════════════════════════════════════════
-- COMENTARIO DEL COACH · por ejercicio, para el cliente
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo CREA una tabla nueva: no toca ninguna tabla existente y
-- no borra nada (quitar un comentario solo le pone la fecha `quitado_en`).
--
-- Qué guarda: lo que le escribes al cliente sobre un ejercicio. Va pegado al
-- cliente y al ejercicio (no a la rutina): así el «Siempre presente» lo sigue
-- viendo en el ciclo nuevo sin copiar nada.
--   · tipo 'puntual'  → «Para la próxima vez»: le sale un circulito azul en el
--                       ejercicio hasta que lo lee (`leido_en`).
--   · tipo 'siempre'  → «Siempre presente»: queda fijo en la tarjeta del
--                       ejercicio, sin alertas, hasta que lo quites.
-- Lo que el cliente contesta llega como siempre a `notas_entreno` (Bandeja).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists comentarios_coach (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users,
  cliente_id          text not null,
  ejercicio_id        text not null,
  rutina_id           text,
  rutina_ejercicio_id text,
  tipo                text not null check (tipo in ('puntual', 'siempre')),
  texto               text not null,
  creado_en           timestamptz not null default now(),
  leido_en            timestamptz,
  quitado_en          timestamptz
);
create index if not exists comentarios_coach_cliente_idx on comentarios_coach (cliente_id, ejercicio_id, creado_en);
alter table comentarios_coach enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'comentarios_coach' and policyname = 'own comentarios_coach') then
    create policy "own comentarios_coach" on comentarios_coach for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para comprobar: debe salir 0 (la tabla existe y está vacía al principio).
select count(*) from comentarios_coach;
