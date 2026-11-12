-- CÁPSULAS EN TOQUES · la cápsula que le pides leer a cada cliente
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una tabla nueva.
--
--   capsulas_pedidas → cada cápsula que le envías con su pregunta:
--     · enviada_en    → cuándo se la enviaste («Enviar con pregunta»)
--     · recordada_en  → la última vez que se la recordaste («Recordar»)
--     · respondio_en  → cuándo te respondió la pregunta («Me respondió»)
--     · respuesta     → lo que te dijo (opcional)
--   Si la abrió o no, no se guarda aquí: se lee sola del centro de recursos.

create table if not exists capsulas_pedidas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id      uuid not null references clientes(id) on delete cascade,
  capsula_id      text not null,
  capsula_titulo  text,
  pregunta        text,
  enviada_en      timestamptz not null default now(),
  recordada_en    timestamptz,
  respondio_en    timestamptz,
  respuesta       text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_capsulas_pedidas on capsulas_pedidas (cliente_id, enviada_en desc);

alter table capsulas_pedidas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'capsulas_pedidas' and policyname = 'own capsulas_pedidas') then
    create policy "own capsulas_pedidas" on capsulas_pedidas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'capsulas_pedidas' as que, case when to_regclass('public.capsulas_pedidas') is not null then 'sí' else 'no' end as existe;
