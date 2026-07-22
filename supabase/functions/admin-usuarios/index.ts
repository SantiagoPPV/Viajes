// ============================================================================
//  Edge Function: admin-usuarios
//  Gestión segura de usuarios. Usa la llave service_role (que vive SOLO aquí en
//  el servidor, nunca en el navegador) para crear/editar/borrar cuentas de
//  Supabase Auth. Antes de hacer nada, verifica que quien llama es administrador
//  leyendo su sesión (JWT) y consultando la tabla perfiles.
//
//  Acciones (POST con JSON { accion, ... }):
//    • crear    { usuario, password, nombre, rol, paginas }
//    • editar   { id, nombre, rol, paginas }
//    • password { id, password }
//    • borrar   { id }
//
//  Despliegue: ver docs/CONFIGURACION_CUENTAS.md (se puede desde el panel de
//  Supabase, sin instalar nada). Las variables SUPABASE_URL,
//  SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase sola.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOMINIO = "@viajes.local"; // correo "fantasma" = usuario + este dominio

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const norm = (s: string) => (s ?? "").toString().trim().toLowerCase();
const PAGINAS_VALIDAS = ["viajes", "salud", "retos"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  const URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) ¿Quién llama? Cliente con el token del usuario que hizo la petición.
  const authHeader = req.headers.get("Authorization") ?? "";
  const comoLlamante = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uerr } = await comoLlamante.auth.getUser();
  if (uerr || !user) return json({ error: "No autenticado" }, 401);

  // 2) Cliente con permisos de administrador (service_role) para todo lo demás.
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // 3) ¿El llamante es admin?
  const { data: perfil } = await admin
    .from("perfiles").select("rol").eq("id", user.id).single();
  if (!perfil || perfil.rol !== "admin") {
    return json({ error: "Solo los administradores pueden gestionar usuarios." }, 403);
  }

  // 4) Ejecutar la acción pedida.
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const accion = body.accion;

  const limpiarPaginas = (p: unknown) =>
    Array.isArray(p) ? p.map(norm).filter((x) => PAGINAS_VALIDAS.includes(x)) : [];
  const limpiarRol = (r: unknown) => (r === "admin" ? "admin" : "usuario");

  try {
    if (accion === "crear") {
      const usuario = norm(body.usuario as string);
      const password = (body.password as string) ?? "";
      if (!usuario) return json({ error: "Falta el usuario." }, 400);
      if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);

      const { data: creado, error } = await admin.auth.admin.createUser({
        email: usuario + DOMINIO,
        password,
        email_confirm: true,
        user_metadata: { usuario },
      });
      if (error) return json({ error: "No se pudo crear: " + error.message }, 400);

      const { error: perr } = await admin.from("perfiles").insert({
        id: creado.user.id,
        usuario,
        nombre: (body.nombre as string) ?? usuario,
        rol: limpiarRol(body.rol),
        paginas: limpiarPaginas(body.paginas),
      });
      if (perr) {
        // deshacer el usuario de Auth si el perfil falló (p. ej. usuario duplicado)
        await admin.auth.admin.deleteUser(creado.user.id);
        return json({ error: "No se pudo crear el perfil: " + perr.message }, 400);
      }
      return json({ ok: true, id: creado.user.id });
    }

    if (accion === "editar") {
      const id = body.id as string;
      if (!id) return json({ error: "Falta el id." }, 400);
      const cambios: Record<string, unknown> = {
        nombre: (body.nombre as string) ?? null,
        rol: limpiarRol(body.rol),
        paginas: limpiarPaginas(body.paginas),
      };
      const { error } = await admin.from("perfiles").update(cambios).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (accion === "password") {
      const id = body.id as string;
      const password = (body.password as string) ?? "";
      if (!id) return json({ error: "Falta el id." }, 400);
      if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (accion === "borrar") {
      const id = body.id as string;
      if (!id) return json({ error: "Falta el id." }, 400);
      if (id === user.id) return json({ error: "No puedes borrarte a ti mismo." }, 400);
      // borra el usuario de Auth; el perfil y sus datos se borran en cascada (FK)
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida: " + accion }, 400);
  } catch (e) {
    return json({ error: "Error inesperado: " + (e as Error).message }, 500);
  }
});
