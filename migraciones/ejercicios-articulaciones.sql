-- FICHA DEL EJERCICIO · «Articulaciones» y «Qué entrenas»
-- Supabase del CRM → SQL Editor → pegar → Run. Se puede correr más de una vez.
-- No borra ni cambia nada de lo que ya existe: solo agrega dos columnas vacías.
--
--   ejercicios.articulaciones → las articulaciones que se mueven o se trabajan
--     (cadera, tobillo, rodilla, columna torácica, columna lumbar, hombro,
--     escápula, codo, muñeca, cuello). Sobre todo en movilidad, agilidad y
--     estiramientos.
--   ejercicios.cualidades → qué entrena, cuando no es «un músculo»: cambio de
--     dirección, frenar, acelerar, reacción, coordinación, equilibrio, rango
--     de movimiento, control. Sobre todo en agilidad y movilidad.

alter table ejercicios add column if not exists articulaciones text[] not null default '{}';
alter table ejercicios add column if not exists cualidades text[] not null default '{}';

notify pgrst, 'reload schema';

-- Comprobación: las dos deben decir «sí».
select c as que,
  case when exists (select 1 from information_schema.columns where table_name = 'ejercicios' and column_name = c) then 'sí' else 'no' end as existe
from unnest(array['articulaciones', 'cualidades']) as c;
