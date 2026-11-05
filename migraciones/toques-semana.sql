-- TOQUES · «No hace falta esta semana»
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una tabla nueva.
--
--   toques_semana → los clientes a los que esta semana NO les hace falta el
--   seguimiento (ya los tocaste y no están fríos). En Toques salen como «No
--   hace falta» en vez de «Falta» y no cuentan en «sin seguimiento». La
--   semana siguiente vuelven solos.

create table if not exists toques_semana (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  lunes       date not null,
  motivo      text not null default 'no_hace_falta',
  created_at  timestamptz not null default now(),
  unique (cliente_id, lunes)
);

alter table toques_semana enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'toques_semana' and policyname = 'own toques_semana') then
    create policy "own toques_semana" on toques_semana for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'toques_semana' as que, case when to_regclass('public.toques_semana') is not null then 'sí' else 'no' end as existe;
