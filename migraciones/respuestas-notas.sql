-- RESPONDER UNA NOTA DE SESIÓN («Al terminar … te dijo»)
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una tabla nueva.
--
--   respuestas_coach → lo que le respondes desde la Bandeja con «A su app».
--   En su app sale arriba en el inicio («Te respondió») hasta que toca
--   «Entendido» (visto_en).

create table if not exists respuestas_coach (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  nota_clave  text not null,
  contexto    text,
  nota        text,
  texto       text not null check (length(trim(texto)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  visto_en    timestamptz
);
create index if not exists idx_respuestas_coach_cliente on respuestas_coach (cliente_id, created_at desc);

alter table respuestas_coach enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'respuestas_coach' and policyname = 'own respuestas_coach') then
    create policy "own respuestas_coach" on respuestas_coach for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'respuestas_coach' as que, case when to_regclass('public.respuestas_coach') is not null then 'sí' else 'no' end as existe;
