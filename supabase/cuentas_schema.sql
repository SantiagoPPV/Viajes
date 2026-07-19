-- ============================================================================
--  Cuentas, roles y datos por usuario  (Viajes + Salud)
--  Ejecuta TODO este archivo una vez:  Supabase → SQL Editor → pega → Run.
--
--  Crea:
--    • perfiles      → un renglón por usuario: rol (admin/usuario) + páginas permitidas
--    • salud_datos   → los datos de Salud de CADA usuario (privados)
--    • viajes        → varios viajes por usuario (cada uno un blob JSON)
--    • viaje_acceso  → con quién se comparte cada viaje (además del dueño)
--    • es_admin() / puede_ver_viaje()  → ayudantes para las políticas
--    • Políticas RLS que hacen cumplir todo lo anterior a nivel de base de datos.
--
--  Las tablas viejas itinerario_estado y salud_estado se quedan como están
--  (no se borran); la app las dejará de usar al migrar a este modelo.
-- ============================================================================

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- perfiles: identidad de aplicación de cada usuario de Supabase Auth
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  usuario  text unique not null,
  nombre   text,
  rol      text not null default 'usuario' check (rol in ('admin','usuario')),
  paginas  text[] not null default '{}',          -- p. ej. {'viajes','salud'}
  creado   timestamptz not null default now()
);
comment on table public.perfiles is
  'Perfil de app por usuario: rol y secciones permitidas. id = auth.users.id.';

alter table public.perfiles enable row level security;

-- ¿El usuario actual es admin?  SECURITY DEFINER evita recursión de RLS
-- (la política de perfiles no puede consultar perfiles sin este truco).
create or replace function public.es_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists(
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- Cada quien lee su propio perfil; el admin lee todos.
drop policy if exists "perfiles lectura" on public.perfiles;
create policy "perfiles lectura" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

-- Solo el admin crea/edita/borra perfiles (los usuarios normales no se auto-editan).
drop policy if exists "perfiles admin escribe" on public.perfiles;
create policy "perfiles admin escribe" on public.perfiles
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- salud_datos: los datos de Salud de cada usuario (un blob JSON por persona)
-- ---------------------------------------------------------------------------
create table if not exists public.salud_datos (
  usuario_id  uuid primary key references auth.users(id) on delete cascade,
  datos       jsonb not null default '{}',
  actualizado timestamptz not null default now()
);
comment on table public.salud_datos is
  'Estado de la app de Salud por usuario. Un renglón por persona; datos = JSON.';

alter table public.salud_datos enable row level security;

-- Cada quien ve/edita SOLO sus datos de salud; el admin puede ver todos.
drop policy if exists "salud propia" on public.salud_datos;
create policy "salud propia" on public.salud_datos
  for all to authenticated
  using (usuario_id = auth.uid() or public.es_admin())
  with check (usuario_id = auth.uid() or public.es_admin());

-- ---------------------------------------------------------------------------
-- viajes: varios por usuario (cada renglón = un viaje completo)
-- ---------------------------------------------------------------------------
create table if not exists public.viajes (
  id          uuid primary key default gen_random_uuid(),
  propietario uuid not null references auth.users(id) on delete cascade,
  titulo      text not null default 'Viaje sin título',
  datos       jsonb not null default '{}',
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.viajes is
  'Viajes por usuario. Cada renglón es un itinerario completo (datos = JSON).';
create index if not exists viajes_propietario_idx on public.viajes(propietario);

alter table public.viajes enable row level security;

-- ---------------------------------------------------------------------------
-- viaje_acceso: con quién se comparte un viaje (además del dueño y del admin)
-- ---------------------------------------------------------------------------
create table if not exists public.viaje_acceso (
  viaje_id   uuid not null references public.viajes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  primary key (viaje_id, usuario_id)
);
comment on table public.viaje_acceso is
  'Concesiones de lectura de un viaje a otros usuarios. El dueño y el admin ya ven todo.';

alter table public.viaje_acceso enable row level security;

-- ¿Puede el usuario actual VER este viaje? (dueño, con acceso concedido, o admin)
create or replace function public.puede_ver_viaje(v uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.es_admin()
      or exists(select 1 from public.viajes x       where x.id = v        and x.propietario = auth.uid())
      or exists(select 1 from public.viaje_acceso a where a.viaje_id = v   and a.usuario_id = auth.uid());
$$;

-- Ver un viaje: si eres dueño, te lo compartieron, o eres admin.
drop policy if exists "viajes lectura" on public.viajes;
create policy "viajes lectura" on public.viajes
  for select to authenticated
  using (public.puede_ver_viaje(id));

-- Crear un viaje: debes ser el propietario del renglón que insertas.
drop policy if exists "viajes crear" on public.viajes;
create policy "viajes crear" on public.viajes
  for insert to authenticated
  with check (propietario = auth.uid() or public.es_admin());

-- Editar/borrar un viaje: solo el dueño o el admin.
drop policy if exists "viajes editar" on public.viajes;
create policy "viajes editar" on public.viajes
  for update to authenticated
  using (propietario = auth.uid() or public.es_admin())
  with check (propietario = auth.uid() or public.es_admin());

drop policy if exists "viajes borrar" on public.viajes;
create policy "viajes borrar" on public.viajes
  for delete to authenticated
  using (propietario = auth.uid() or public.es_admin());

-- viaje_acceso: lo administra el dueño del viaje o el admin; cada quien ve sus concesiones.
drop policy if exists "acceso lectura" on public.viaje_acceso;
create policy "acceso lectura" on public.viaje_acceso
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_admin()
    or exists(select 1 from public.viajes v where v.id = viaje_id and v.propietario = auth.uid())
  );

drop policy if exists "acceso escribe" on public.viaje_acceso;
create policy "acceso escribe" on public.viaje_acceso
  for all to authenticated
  using (
    public.es_admin()
    or exists(select 1 from public.viajes v where v.id = viaje_id and v.propietario = auth.uid())
  )
  with check (
    public.es_admin()
    or exists(select 1 from public.viajes v where v.id = viaje_id and v.propietario = auth.uid())
  );

-- ============================================================================
--  Listo. Después de correr esto:
--   1) Crea tu primer usuario en  Authentication → Users → Add user
--      (email: tu_usuario@viajes.local, password, "Auto Confirm User" ON).
--   2) Conviértelo en admin con acceso a todo (reemplaza el correo si usaste otro):
--
--        insert into public.perfiles (id, usuario, nombre, rol, paginas)
--        select id, 'santiago', 'Santiago', 'admin', array['viajes','salud']
--        from auth.users where email = 'santiago@viajes.local'
--        on conflict (id) do update
--          set rol = 'admin', paginas = array['viajes','salud'];
--
--   3) A partir de ahí, crea al resto de usuarios desde la página "Usuarios".
-- ============================================================================
