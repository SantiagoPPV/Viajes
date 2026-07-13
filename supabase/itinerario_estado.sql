-- ============================================================================
--  Tabla de estado del planificador de viajes (itinerario China / luna de miel)
--  La app guarda TODO su estado (bases, días, catálogos, costos, presupuesto,
--  checklists…) como un único blob JSON bajo una clave, y sincroniza en la nube.
--
--  Cómo aplicar:
--    • Con el MCP de Supabase:  apply_migration(name="itinerario_estado", query=<este archivo>)
--    • O manualmente:           Supabase → SQL Editor → pega y ejecuta este archivo
-- ============================================================================

create table if not exists public.itinerario_estado (
  clave       text primary key,
  valor       text not null,
  actualizado timestamptz not null default now()
);

comment on table public.itinerario_estado is
  'Estado del planificador de viajes (index.html). Un renglón por clave; valor = JSON serializado.';

-- Seguridad a nivel de fila (RLS) activada.
alter table public.itinerario_estado enable row level security;

-- Planificador compartido sin login: acceso público (anon) SOLO a esta tabla.
-- Cualquiera con la URL del sitio puede leer/escribir el itinerario. Es intencional
-- para que tú y tu pareja lo editen sin cuenta. Si más adelante quieres restringirlo,
-- reemplaza estas políticas por unas basadas en un PIN/clave o en auth de Supabase.

drop policy if exists "itinerario lectura publica"      on public.itinerario_estado;
drop policy if exists "itinerario insercion publica"    on public.itinerario_estado;
drop policy if exists "itinerario actualizacion publica" on public.itinerario_estado;

create policy "itinerario lectura publica"
  on public.itinerario_estado for select
  to anon, authenticated
  using (true);

create policy "itinerario insercion publica"
  on public.itinerario_estado for insert
  to anon, authenticated
  with check (true);

create policy "itinerario actualizacion publica"
  on public.itinerario_estado for update
  to anon, authenticated
  using (true)
  with check (true);
