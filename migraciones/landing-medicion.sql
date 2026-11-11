-- ═══════════════════════════════════════════════════════════════════════
-- MEDICIÓN DE LA PÁGINA DE VENTA (landing)
-- ═══════════════════════════════════════════════════════════════════════
-- Dónde: Supabase del CRM → SQL Editor → pegar todo → Run. Se puede correr
-- dos veces. Solo CREA una tabla nueva: no toca ninguna tabla existente y
-- no borra nada.
--
-- Qué guarda: lo que pasa en la página de venta, de forma anónima (sin
-- nombres, correos ni teléfonos): cada visita, hasta qué sección baja cada
-- persona, quién toca «Escríbeme» y qué preguntas abre. La escribe la
-- página de venta y el CRM la muestra en «Mi negocio».
--
-- Permisos: la página (visitante sin sesión) SOLO puede agregar filas; no
-- puede leer, cambiar ni borrar nada. Leer solo puede quien entra al CRM.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists landing_eventos (
  id          uuid primary key default gen_random_uuid(),
  creado_at   timestamptz not null default now(),
  -- El día en hora de Colombia (para contar por día sin corrimientos).
  fecha       date not null default ((now() at time zone 'America/Bogota')::date),
  visitante   text not null check (char_length(visitante) between 8 and 40),   -- código al azar del navegador
  sesion      text check (char_length(sesion) <= 40),                          -- una por cada vez que abre la página
  tipo        text not null check (tipo in ('visita', 'seccion', 'clic', 'pregunta')),
  detalle     text check (char_length(detalle) <= 120),                        -- qué sección, o qué pregunta
  origen      text check (char_length(origen) <= 60),                          -- instagram, directo, google…
  dispositivo text check (dispositivo in ('celular', 'computador'))
);
create index if not exists landing_eventos_fecha on landing_eventos (fecha);

alter table landing_eventos enable row level security;
grant insert on landing_eventos to anon, authenticated;
grant select on landing_eventos to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'landing_eventos' and policyname = 'landing: la pagina registra') then
    create policy "landing: la pagina registra" on landing_eventos for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'landing_eventos' and policyname = 'landing: el crm lee') then
    create policy "landing: el crm lee" on landing_eventos for select to authenticated using (true);
  end if;
end $$;

-- Para comprobar: debe salir 0 (la tabla existe y está vacía al principio).
select count(*) from landing_eventos;
