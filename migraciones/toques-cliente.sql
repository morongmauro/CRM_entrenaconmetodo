-- TOQUES CON EL CLIENTE (CRM → Toques)
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una tabla nueva.
--
--   toques_cliente → lo que el CRM no puede ver solo:
--     · 'me_escribio'   → tocaste «Me escribió» (te escribió por WhatsApp)
--     · 'le_escribi_wa' → abriste su WhatsApp desde el CRM
--   (Lo demás —seguimiento, videos, notas de la app, respuestas— ya queda
--   registrado en sus propias tablas.)

create table if not exists toques_cliente (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  fecha       date not null default current_date,
  tipo        text not null check (tipo in ('me_escribio', 'le_escribi_wa')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_toques_cliente on toques_cliente (cliente_id, fecha desc);

alter table toques_cliente enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'toques_cliente' and policyname = 'own toques_cliente') then
    create policy "own toques_cliente" on toques_cliente for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'toques_cliente' as que, case when to_regclass('public.toques_cliente') is not null then 'sí' else 'no' end as existe;
