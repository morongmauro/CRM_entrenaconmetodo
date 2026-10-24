-- =====================================================
-- Historial de seguimiento: lo que le dijiste a cada cliente
-- =====================================================
-- Cada vez que copias un mensaje para WhatsApp (la ficha «Esta semana»,
-- Diálogos, el seguimiento de la semana o el pedido de videos), el CRM
-- guarda aquí qué le dijiste y cuándo. Con eso la ficha muestra «Último
-- seguimiento: hace N días» y el Inicio, a quién le toca.
--
-- Solo CREA lo que falta. No borra ni cambia nada de lo que ya tienes.
-- Se puede correr las veces que quieras.

create table if not exists seguimiento_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  fecha date not null default current_date,
  origen text,          -- esta-semana | dialogos | seguimiento | videos
  titulo text,          -- «Semana a medias», «Pedir un video»…
  texto text not null,
  created_at timestamptz default now()
);

create index if not exists seguimiento_mensajes_cliente_idx on seguimiento_mensajes (cliente_id, created_at desc);
create index if not exists seguimiento_mensajes_coach_idx on seguimiento_mensajes (user_id, created_at desc);

alter table seguimiento_mensajes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'seguimiento_mensajes' and policyname = 'own seguimiento_mensajes') then
    create policy "own seguimiento_mensajes" on seguimiento_mensajes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Comprobación: debe decir «sí».
select 'seguimiento_mensajes' as tabla,
  case when exists (select 1 from information_schema.tables where table_name = 'seguimiento_mensajes') then 'sí' else 'NO' end as creada;
