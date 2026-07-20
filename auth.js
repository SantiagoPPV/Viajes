/* ============================================================================
   auth.js — capa compartida de sesión y control de acceso (Viajes + Salud)

   Requiere que la página cargue ANTES la librería de Supabase:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="auth.js"></script>

   Expone window.Auth con:
     • sb                      → cliente de Supabase (con sesión)
     • DOMINIO                 → "@viajes.local"
     • sesion()                → devuelve la sesión actual (o null)
     • perfil()                → devuelve el perfil {usuario,rol,paginas,...} (o null)
     • requerirAcceso(pagina)  → guardia: si no hay sesión → login; si no tiene
                                 permiso → pantalla de bloqueo. Devuelve el perfil.
     • salir()                 → cierra sesión y va a login.html
     • entrar(usuario,pass)    → inicia sesión (para login.html)
     • montarBarra(pagina,perfil) → dibuja el header con navegación + usuario
     • fn(accion,payload)      → llama a la Edge Function admin-usuarios
   ============================================================================ */
(function () {
  const SUPABASE_URL = "https://waxyoduhhydsgysaruto.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndheHlvZHVoaHlkc2d5c2FydXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTk3MTksImV4cCI6MjA5OTQ3NTcxOX0.wVl2WOa-Hew3KcToQv2RCBugs-g-5xHH3iqGQTTO7bU";
  const DOMINIO = "@viajes.local";

  if (typeof supabase === "undefined" || !supabase.createClient) {
    console.error("auth.js: no se cargó la librería de Supabase antes que auth.js");
  }
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "viajes-auth" },
  });

  let _perfil = null;

  async function sesion() {
    const { data } = await sb.auth.getSession();
    return data ? data.session : null;
  }

  async function cargarPerfil(uid) {
    const { data, error } = await sb.from("perfiles").select("*").eq("id", uid).single();
    if (error) return null;
    _perfil = data;
    return data;
  }
  function perfil() { return _perfil; }

  // Metadatos de las páginas navegables
  const PAGINAS = {
    viajes:   { href: "index.html",  icono: "✈", etiqueta: "Viajes" },
    salud:    { href: "salud.html",  icono: "🌿", etiqueta: "Salud" },
    usuarios: { href: "usuarios.html", icono: "👥", etiqueta: "Usuarios", soloAdmin: true },
  };

  function puedeVer(pagina, p) {
    if (!p) return false;
    if (p.rol === "admin") return true;
    if (PAGINAS[pagina] && PAGINAS[pagina].soloAdmin) return false;
    return (p.paginas || []).includes(pagina);
  }

  function primeraPagina(p) {
    if (!p) return "login.html";
    if (puedeVer("viajes", p)) return "index.html";
    if (puedeVer("salud", p)) return "salud.html";
    if (p.rol === "admin") return "usuarios.html";
    return null; // sin acceso a nada
  }

  function pantallaBloqueo(mensaje, conSalir) {
    document.documentElement.innerHTML =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Sin acceso</title><style>' +
      "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
      "background:#e6e0d1;color:#20272b;font-family:system-ui,-apple-system,sans-serif;padding:24px}" +
      ".bx{max-width:420px;text-align:center;background:#f3efe4;border:1px solid #c9c0ab;border-radius:14px;" +
      "padding:34px 28px;box-shadow:0 6px 22px rgba(32,39,43,.12)}" +
      ".bx h1{font-size:22px;margin:0 0 8px}.bx p{color:#4a555b;font-size:15px;line-height:1.5;margin:0 0 18px}" +
      ".bx a,.bx button{font:inherit;font-size:13px;border:1px solid #3e6152;background:#3e6152;color:#fff;" +
      "border-radius:9px;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-block}" +
      "</style></head><body><div class=bx><h1>🔒 Sin acceso</h1><p>" + mensaje + "</p>" +
      (conSalir ? '<button onclick="Auth.salir()">Cambiar de usuario</button>'
                : '<a href="login.html">Ir al inicio de sesión</a>') +
      "</div></body>";
  }

  /* Guardia de página. Llama esto al inicio de cada página protegida.
     pagina = "viajes" | "salud" | "usuarios".  Devuelve el perfil o null. */
  async function requerirAcceso(pagina) {
    const s = await sesion();
    if (!s) { location.replace("login.html"); return null; }
    const p = await cargarPerfil(s.user.id);
    if (!p) {
      pantallaBloqueo("Tu cuenta aún no tiene un perfil asignado. Pide a un administrador que te dé acceso.", true);
      return null;
    }
    if (pagina && !puedeVer(pagina, p)) {
      const destino = primeraPagina(p);
      pantallaBloqueo(
        "No tienes acceso a esta sección." +
        (destino ? " Puedes ir a las secciones que sí tienes asignadas." : ""),
        true);
      return null;
    }
    return p;
  }

  async function entrar(usuario, password) {
    // Acepta un usuario corto (se le agrega @viajes.local) o un correo completo.
    const id = (usuario || "").trim().toLowerCase();
    const email = id.includes("@") ? id : id + DOMINIO;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await cargarPerfil(data.user.id);
    return _perfil;
  }

  async function salir() {
    try { await sb.auth.signOut(); } catch (_) {}
    location.replace("login.html");
  }

  // Llama a la Edge Function admin-usuarios con la sesión actual.
  async function fn(accion, payload) {
    const { data, error } = await sb.functions.invoke("admin-usuarios", {
      body: Object.assign({ accion }, payload || {}),
    });
    if (error) {
      // intenta extraer el mensaje del cuerpo de la respuesta
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  /* Dibuja la barra de navegación superior dentro del elemento #topnav.
     Muestra solo las secciones que el usuario puede ver + su nombre + salir. */
  function montarBarra(paginaActual, p) {
    const cont = document.getElementById("topnav");
    if (!cont) return;
    const enlaces = Object.keys(PAGINAS)
      .filter((k) => puedeVer(k, p))
      .map((k) => {
        const m = PAGINAS[k], act = k === paginaActual ? " active" : "";
        const aria = k === paginaActual ? ' aria-current="page"' : "";
        return '<a class="navlink' + act + '" href="' + m.href + '"' + aria + ">" +
               m.icono + " " + m.etiqueta + "</a>";
      }).join("");
    const quien = (p && (p.nombre || p.usuario)) || "";
    cont.innerHTML =
      '<span class="brand">Mi panel <span class="amp">·</span> personal</span>' +
      enlaces +
      '<span class="whoami" title="' + (p ? p.usuario : "") + '">' +
        (p && p.rol === "admin" ? "★ " : "") + quien + "</span>" +
      '<button class="navlink logout" onclick="Auth.salir()">Salir</button>';
  }

  window.Auth = {
    sb, DOMINIO, sesion, perfil, requerirAcceso, entrar, salir, fn,
    montarBarra, puedeVer, primeraPagina, PAGINAS,
  };
})();
