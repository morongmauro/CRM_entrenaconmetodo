-- Bloque OPCIONAL: una rutina-bloque (como el handstand) que el cliente hace
-- si le da el tiempo. Sale en su «Hoy» como los complementarios, pero no
-- cuenta como pendiente ni en el cumplimiento.
-- No borra ni cambia nada de lo que ya existe: solo agrega la columna.
alter table public.rutinas add column if not exists opcional boolean not null default false;
