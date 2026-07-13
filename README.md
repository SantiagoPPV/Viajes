# Viajes · Itinerario China 2027 (luna de miel)

Planificador de viaje interactivo, hora por hora: motor de horarios que encadena
actividades, mapa de clústeres, presupuesto (estimado vs. real), checklists de
reservas y **sincronización en la nube** para editarlo entre dos personas.

Es una sola página estática (`index.html`) que se hospeda en **Netlify** y guarda
su estado en **Supabase**.

## Arquitectura

```
┌────────────┐   fetch (REST/PostgREST)   ┌──────────────────────────┐
│ index.html │ ─────────────────────────► │ Supabase                 │
│ (Netlify)  │ ◄───────────────────────── │ tabla itinerario_estado  │
└────────────┘   polling cada 4 s         └──────────────────────────┘
```

- **Sin backend propio ni build.** El navegador habla directo con Supabase usando la
  llave pública (`anon`). Todo el estado se guarda como un blob JSON en un renglón.
- **Sincronización:** cada cambio se guarda (con _debounce_) y un _poll_ cada 4 s trae
  los cambios de la otra persona. La barra de estado abajo muestra "En vivo".
- **Respaldo local:** si Supabase no está configurado o no responde, la app sigue
  funcionando con `localStorage` (un solo dispositivo).

## Puesta en marcha

### 1. Crear la tabla en Supabase

En tu proyecto de Supabase, ejecuta el script [`supabase/itinerario_estado.sql`](supabase/itinerario_estado.sql)
(SQL Editor → pegar → Run). Crea la tabla `itinerario_estado` con RLS y políticas de
acceso público a esa única tabla (planificador compartido sin login).

### 2. Conectar la app a tu proyecto

Copia dos datos de **Project Settings › API**:
- **Project URL** → `https://xxxxx.supabase.co`
- **Project API keys › anon / public** → la llave larga

y pégalos en `index.html`, reemplazando los marcadores:

```js
const SUPABASE_URL="__SUPABASE_URL__";          // ← tu Project URL
const SUPABASE_ANON_KEY="__SUPABASE_ANON_KEY__"; // ← tu llave anon/public
```

> La llave `anon` es pública por diseño (va en el navegador); es seguro tenerla en el
> repositorio. **No** uses aquí la llave `service_role`.

### 3. Desplegar en Netlify

El sitio no necesita build; sirve la raíz del repo (`publish = "."`, ver `netlify.toml`).

- **Si tu sitio de Netlify ya está conectado a este repo (`SantiagoPPV/Viajes`):** con
  hacer _push_ a la rama de producción, Netlify redepliega solo.
- **Si aún no está conectado:** en Netlify → *Add new site › Import an existing project*
  → GitHub → elige `SantiagoPPV/Viajes` → *Publish directory* = `.` (o raíz) → *Deploy*.
  En *Site configuration › Build & deploy › Branches* elige la rama que quieras publicar.

## Estructura del repo

| Archivo | Qué es |
|---|---|
| `index.html` | La app completa (UI + lógica + capa de almacenamiento Supabase). |
| `netlify.toml` | Config de Netlify (sitio estático, cabeceras de seguridad). |
| `supabase/itinerario_estado.sql` | Migración: tabla de estado + RLS. |

## Notas de seguridad

- El acceso es **público a la tabla `itinerario_estado`**: cualquiera con la URL del sitio
  puede leer y editar el itinerario. Es intencional para un planificador de pareja sin
  cuentas. Para restringirlo, cambia las políticas del SQL por unas con PIN/clave o con
  autenticación de Supabase.
- Solo se expone la llave `anon` (pública). Nunca publiques la `service_role`.
