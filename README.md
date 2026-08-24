# Mi panel personal · Viajes + Salud

Dos apps estáticas con un header común para navegar entre ellas, hospedadas en
**Netlify** y con estado sincronizado en **Supabase**:

- **`index.html` — Viajes.** Planificador de viaje interactivo, hora por hora:
  motor de horarios que encadena actividades, mapa de clústeres, presupuesto
  (estimado vs. real), checklists de reservas y sincronización en la nube para
  editarlo entre dos personas.
- **`salud.html` — Salud.** Calculadora de macros y micronutrientes con diario
  de comidas, objetivos personalizados (Mifflin-St Jeor + RDA del NIH por sexo),
  catálogo configurable de ~90 alimentos por categorías (carnes, pescados,
  lácteos, legumbres, cereales, verduras, frutas, frutos secos, grasas,
  suplementos…), seguimiento de vitaminas (A, C, D, E, K, B1–B12) y minerales
  (calcio, potasio, magnesio, sodio, cloro, hierro, zinc, selenio, yodo, cobre,
  manganeso…), gestión del stack de suplementación y una guía de nutrientes con
  RDA/UL, funciones y fuentes.

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

### 1. Crear las tablas en Supabase

En tu proyecto de Supabase, ejecuta (SQL Editor → pegar → Run):

- [`supabase/itinerario_estado.sql`](supabase/itinerario_estado.sql) → tabla
  `itinerario_estado` (estado del planificador de viajes).
- [`supabase/salud_estado.sql`](supabase/salud_estado.sql) → tabla
  `salud_estado` (estado de la app de salud/nutrición).

Cada script crea su tabla con RLS y políticas de acceso público a esa única
tabla (apps compartidas sin login). Mientras una tabla no exista, la app
correspondiente sigue funcionando con `localStorage` (solo en ese dispositivo)
y empieza a sincronizar sola en cuanto la creas.

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

## Cambiar la ruta del viaje

Todo el itinerario (orden de paradas, noches y fechas) vive en un solo bloque de
`index.html`, marcado como **`RUTA DEL VIAJE · EDITA AQUÍ`**:

```js
const TRIP_START=new Date(2027,4,6);   // 6 de mayo de 2027 (en JS el mes 4 es mayo)
const AVAILABLE_NIGHTS=23;             // noches del 6 al 29 de mayo
const ROUTE=[
  {id:"hk",       nights:3},                //  6 →  9 may
  {id:"yangshuo", nights:2, sale:"09:15"},  //  9 → 11 may · llega 13:00
  ...
];
const ROUTE_DROP=["osaka"];   // paradas que se eliminan por completo del viaje
const ROUTE_VERSION=4;        // súbela al editar ROUTE para reaplicar la ruta
```

Cada tramo de `XFER` lleva su duración **puerta a puerta** en minutos:

```js
"hk|yangshuo":{mode:"Tren bala", detail:"West Kowloon → Yangshuo",
               time:"3.5–4 h", dur:225, type:"rail"},
```

De ahí sale la duración de la actividad de llegada, y `sale` en `ROUTE` es la hora
a la que arrancan. **La hora a la que aterrizan se calcula sola:** no hay que
volver a cuadrarla a mano cada vez que se reordena la ruta.

Para cambiar la ruta:

1. Mueve, quita o agrega renglones en `ROUTE`. **El orden de la lista es el orden
   del viaje**, `nights` son las noches que se duermen en cada parada y `sale` la
   hora a la que salen hacia ella.
2. Si aparece un tramo nuevo, agrégalo a la tabla `XFER` con la clave
   `"origen|destino"` (modo, detalle, texto de duración, `dur` en minutos y
   `type`: `rail`, `air` o `road`).
3. Ajusta `TRIP_START` y `AVAILABLE_NIGHTS` si cambian las fechas.
4. **Sube `ROUTE_VERSION` en 1.**

Los vuelos internacionales viven en el bloque `VUELOS_INTL`, justo abajo: origen,
destino, horas de salida y llegada, y la escala. De ahí salen los dos listones del
itinerario, la lista de transportes por reservar y las horas de la escala.

Al recargar, el viaje ya guardado se reacomoda solo: orden, noches, fechas,
encabezado y los textos de llegada de cada parada (que se re-escriben con el
tramo que la trae). Nada se pierde: las paradas que salgan de `ROUTE` quedan
**excluidas** (siguen en el viaje, fuera del plan, y se pueden reactivar desde su
tarjeta); solo se borran de verdad las que pongas en `ROUTE_DROP`. Si una parada
baja de noches, las actividades del día sobrante quedan ocultas y la app ofrece
traerlas al último día o descartarlas.

## Estructura del repo

| Archivo | Qué es |
|---|---|
| `index.html` | App de viajes: multi-viaje por usuario (lista, plantilla, editor). |
| `salud.html` | App de salud: macros, micronutrientes, recetas, calendario y suplementos. |
| `retos.html` | App de retos: metas diarias tipo 75 Hard con rachas y calendario. |
| `login.html` / `auth.js` | Inicio de sesión y capa compartida de sesión/permisos. |
| `usuarios.html` | Panel admin: cuentas, roles y accesos por sección. |
| `viajes-admin.html` | Panel admin: todos los viajes y con quién se comparte cada uno. |
| `netlify.toml` | Config de Netlify (sitio estático, cabeceras de seguridad). |
| `supabase/cuentas_schema.sql` | Migración: perfiles, salud_datos, viajes, viaje_acceso + RLS. |
| `supabase/retos_datos.sql` | Migración: tabla de datos de retos por usuario + RLS. |
| `supabase/functions/admin-usuarios/` | Edge Function de gestión segura de usuarios. |
| `supabase/itinerario_estado.sql` | (Legado) tabla clave-valor del planificador original. |
| `supabase/salud_estado.sql` | (Legado) tabla clave-valor de la primera versión de salud. |

## Notas de seguridad

- El acceso es **público a las tablas `itinerario_estado` y `salud_estado`**: cualquiera
  con la URL del sitio puede leer y editar su contenido. Es intencional para apps
  personales/de pareja sin cuentas. Para restringirlo, cambia las políticas del SQL por
  unas con PIN/clave o con autenticación de Supabase.
- Solo se expone la llave `anon` (pública). Nunca publiques la `service_role`.
