-- ============================================================================
--  Tabla de datos de Retos (retos.html) — metas diarias tipo "75 Hard"
--  Igual que salud_datos: un renglón por usuario con TODO su estado en JSON.
--
--  Cómo aplicar:  Supabase → SQL Editor → pega y ejecuta este archivo.
--  (Requiere haber corrido antes cuentas_schema.sql, que define es_admin().)
-- ============================================================================

create table if not exists public.retos_datos (
  usuario_id  uuid primary key references auth.users(id) on delete cascade,
  datos       jsonb not null default '{}',
  actualizado timestamptz not null default now()
);
comment on table public.retos_datos is
  'Estado de la app de Retos por usuario (retos.html). Un renglón por persona; datos = JSON.';

alter table public.retos_datos enable row level security;

-- Cada quien ve/edita SOLO sus retos; el admin puede ver todos.
drop policy if exists "retos propios" on public.retos_datos;
create policy "retos propios" on public.retos_datos
  for all to authenticated
  using (usuario_id = auth.uid() or public.es_admin())
  with check (usuario_id = auth.uid() or public.es_admin());
