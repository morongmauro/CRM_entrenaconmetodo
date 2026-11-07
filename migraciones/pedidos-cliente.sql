-- PENDIENTES POR PEDIR · lo que le pides a cada cliente (Toques → «Pendientes por pedir»)
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega una tabla nueva.
--
--   pedidos_cliente → cada vez que le pides algo (video, fotos, peso, medidas):
--     · pedido_en     → cuándo se lo pediste («Pedir» o «Ya lo pedí»)
--     · entregado_en  → cuándo lo entregó, si lo marcas tú («Ya lo entregó»).
--                       Lo que llega por la app se marca solo y no necesita fila.

create table if not exists pedidos_cliente (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id     uuid not null references clientes(id) on delete cascade,
  tipo           text not null check (tipo in ('video', 'fotos', 'peso', 'medidas')),
  detalle        text,
  pedido_en      timestamptz not null default now(),
  entregado_en   timestamptz,
  entregado_por  text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_pedidos_cliente on pedidos_cliente (cliente_id, tipo, pedido_en desc);

alter table pedidos_cliente enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pedidos_cliente' and policyname = 'own pedidos_cliente') then
    create policy "own pedidos_cliente" on pedidos_cliente for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí».
select 'pedidos_cliente' as que, case when to_regclass('public.pedidos_cliente') is not null then 'sí' else 'no' end as existe;
