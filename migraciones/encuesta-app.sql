-- ═══════════════════════════════════════════════════════════════════════
-- ENCUESTA DE LA APP (una sola vez por cliente, desde su segunda semana)
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo CREA una tabla nueva: no toca ninguna tabla existente y
-- no borra nada.
--
-- Qué guarda: lo que respondió cada cliente en su app: qué tan útil, qué
-- tan fácil, qué tan agradable se ve (1 a 5) y si la recomendaría (0 a 10,
-- el NPS). La escribe la app (api/training, accion 'encuesta_responder') y
-- el CRM la muestra en Inicio. Una sola respuesta por cliente y encuesta.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists encuesta_app (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users,
  cliente_id  text not null,
  encuesta    text not null default 'app-1',
  fecha       date not null default current_date,
  semana      int,            -- en qué semana del cliente la respondió
  util        int check (util between 1 and 5),
  facil       int check (facil between 1 and 5),
  agradable   int check (agradable between 1 and 5),
  recomienda  int check (recomienda between 0 and 10),
  creado_at   timestamptz not null default now(),
  unique (cliente_id, encuesta)
);
alter table encuesta_app enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'encuesta_app' and policyname = 'own encuesta_app') then
    create policy "own encuesta_app" on encuesta_app for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para comprobar: debe salir 0 (la tabla existe y está vacía al principio).
select count(*) from encuesta_app;
