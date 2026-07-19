-- ============================================================================
--  Tabla de estado de la app de salud y nutrición (salud.html)
--  Igual que itinerario_estado: la app guarda TODO su estado (perfil, objetivos,
--  catálogo de alimentos, diario, suplementación) como un blob JSON bajo una
--  clave, y sincroniza en la nube entre dispositivos.
--
--  Cómo aplicar:
--    • Con el MCP de Supabase:  apply_migration(name="salud_estado", query=<este archivo>)
--    • O manualmente:           Supabase → SQL Editor → pega y ejecuta este archivo
-- ============================================================================

create table if not exists public.salud_estado (
  clave       text primary key,
  valor       text not null,
  actualizado timestamptz not null default now()
);

comment on table public.salud_estado is
  'Estado de la app de salud/nutrición (salud.html). Un renglón por clave; valor = JSON serializado.';

-- Seguridad a nivel de fila (RLS) activada.
alter table public.salud_estado enable row level security;

-- Mismo modelo que el planificador: acceso público (anon) SOLO a esta tabla,
-- para usarla sin login desde cualquier dispositivo. Si más adelante quieres
-- restringirla, reemplaza estas políticas por unas con PIN/clave o auth.

drop policy if exists "salud lectura publica"       on public.salud_estado;
drop policy if exists "salud insercion publica"     on public.salud_estado;
drop policy if exists "salud actualizacion publica" on public.salud_estado;

create policy "salud lectura publica"
  on public.salud_estado for select
  to anon, authenticated
  using (true);

create policy "salud insercion publica"
  on public.salud_estado for insert
  to anon, authenticated
  with check (true);

create policy "salud actualizacion publica"
  on public.salud_estado for update
  to anon, authenticated
  using (true)
  with check (true);
