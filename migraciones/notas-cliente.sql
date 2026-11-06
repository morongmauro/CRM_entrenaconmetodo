-- ANOTAR · lo que te dice cada cliente (CRM → «Anotar»)
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una tabla nueva.
--
--   notas_cliente → cada cosa que anotas de un cliente, con su tipo:
--     · 'viaje'        → viaje o ausencia con fechas (además crea la ausencia)
--     · 'salud'        → dolor, lesión, enfermedad: queda abierto hasta que lo cierres
--     · 'pendiente'    → algo que quedaste en hacer (además crea la tarea)
--     · 'fijo'         → lo que siempre hay que saber (alergias, horario, gimnasio)
--     · 'conversacion' → solo queda en su historial
--   Todas cuentan como toque en «Toques».

create table if not exists notas_cliente (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  fecha        date not null default current_date,
  texto        text not null,
  tipo         text not null default 'conversacion',
  estado       text not null default 'abierto',
  revisar_en   date,
  desde        date,
  hasta        date,
  tarea_id     uuid,
  ausencia_id  uuid,
  cerrado_en   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notas_cliente on notas_cliente (cliente_id, fecha desc);

alter table notas_cliente enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'notas_cliente' and policyname = 'own notas_cliente') then
    create policy "own notas_cliente" on notas_cliente for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'notas_cliente' as que, case when to_regclass('public.notas_cliente') is not null then 'sí' else 'no' end as existe;
