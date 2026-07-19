# Configuración de cuentas y seguridad (Supabase Auth)

Guía paso a paso para activar el inicio de sesión con usuarios, roles y datos
por persona. **Todo se hace desde el panel de Supabase** (no necesitas instalar
nada). Hazlo una sola vez. Mientras no lo termines, tu sitio actual sigue igual.

> Proyecto: `waxyoduhhydsgysaruto` · panel: https://supabase.com/dashboard/project/waxyoduhhydsgysaruto

---

## Paso 1 — Activar el inicio de sesión por correo

1. En el panel: **Authentication → Sign In / Providers** (o *Providers*).
2. Asegúrate de que **Email** esté **habilitado**.
3. **Apaga "Confirm email"** (Confirmar correo). Es importante: usamos correos
   internos tipo `usuario@viajes.local` que no reciben correos de confirmación.
4. En **Authentication → Sign Ups** (o *Settings*): **apaga "Allow new users to
   sign up"** (registro público). Los usuarios los creas tú desde la app, no se
   registran solos.
5. Guarda.

## Paso 2 — Crear las tablas y permisos

1. **SQL Editor → New query**.
2. Pega **todo** el contenido de [`supabase/cuentas_schema.sql`](../supabase/cuentas_schema.sql) y dale **Run**.
   Esto crea `perfiles`, `salud_datos`, `viajes`, `viaje_acceso` y las reglas de
   seguridad (RLS).

## Paso 3 — Crear tu primer administrador (tú)

1. **Authentication → Users → Add user → Create new user**.
   - **Email**: `santiago@viajes.local`  *(elige tu usuario; conserva `@viajes.local`)*
   - **Password**: la que quieras (mínimo 6 caracteres)
   - **Auto Confirm User**: **ON** ✅
   - Create user.
2. Vuelve al **SQL Editor** y corre esto (ajusta el correo/usuario/nombre si cambiaste el usuario):

   ```sql
   insert into public.perfiles (id, usuario, nombre, rol, paginas)
   select id, 'santiago', 'Santiago', 'admin', array['viajes','salud']
   from auth.users where email = 'santiago@viajes.local'
   on conflict (id) do update
     set rol = 'admin', paginas = array['viajes','salud'];
   ```

   Con esto tu cuenta queda como **administrador** con acceso a todo.

## Paso 4 — Desplegar la función de gestión de usuarios

Esta función es la que permite crear/editar usuarios y contraseñas de forma
segura desde la página "Usuarios".

1. En el panel: **Edge Functions → Create a function** (o *Deploy a new function*).
2. Nombre exacto: **`admin-usuarios`**.
3. Borra el código de ejemplo y pega **todo** el contenido de
   [`supabase/functions/admin-usuarios/index.ts`](../supabase/functions/admin-usuarios/index.ts).
4. **Deploy**.
   - No necesitas configurar secretos: `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
     `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles dentro de la función.
   - Si el panel te pide un ajuste de "verify JWT", puedes dejarlo activado: la
     app manda tu sesión al llamarla.

> **¿No ves la opción de crear funciones en el panel?** Algunos proyectos solo
> permiten desplegar Edge Functions con la CLI de Supabase. Si es tu caso,
> avísame y te doy el plan B (la app funciona igual salvo la creación de usuarios,
> que haríamos con la CLI o, temporalmente, creando cada usuario desde
> *Authentication → Add user* + un renglón en `perfiles`).

## Paso 5 — Avísame

Cuando termines los pasos 1–4, dímelo. Yo:
- Conecto las páginas de Viajes y Salud al login (cada quien con sus datos).
- Publico todo a `main` para que quede en vivo.
- Probamos juntos que entras y que puedes crear usuarios.

---

## Cómo funcionará (resumen)

- **Entrar**: cada persona inicia sesión con **usuario + contraseña** en `login.html`.
- **Roles**:
  - **admin** (tú): entra a todo y a la página **Usuarios**; crea cuentas, asigna
    a qué secciones entra cada quien y con quién se comparten los viajes.
  - **usuario**: entra solo a las secciones que le asignes; **no** ve Usuarios.
- **Datos por persona**: cada usuario tiene **su** Salud y **sus** viajes, privados.
- **Viajes**: cada quien crea los suyos (varios) desde una plantilla; por defecto
  solo los ve su creador, y tú como admin decides con quién más se comparten.

## Notas de seguridad

- La llave `anon` que está en el código es **pública por diseño** (va en el
  navegador). Ahora, con RLS activo, esa llave **ya no da acceso libre a los
  datos**: solo se puede leer/escribir con una sesión válida y según el rol.
- **Nunca** publiques la llave `service_role` ni la contraseña de la base de datos.
  La `service_role` vive únicamente dentro de la Edge Function (en el servidor).
