# Activación online de cuentas y permisos · v7

La versión 7 simula en local los roles **Visitante / Jugador / Árbitro / Administrador**. Al registrarse, cada persona elige directamente qué jugador es y queda vinculada a esa ficha con el rol **Jugador**, sin aprobación previa. El administrador solo asigna después los roles extra de **Árbitro** y/o **Administrador**.

## Cuenta principal

Usar como cuenta de administración de los servicios de la liga:

**ligainterna2026@gmail.com**

No hace falta compartir la contraseña con nadie ni introducirla en los archivos de la web.

## Pasos cuando vayamos a publicar

1. Crear un proyecto en Supabase con el correo de la liga.
2. En **Authentication > Providers**, dejar Email activado y exigir confirmación de correo si se desea.
3. Ejecutar `supabase-schema.sql` en el SQL Editor.
4. Crear mediante Supabase Auth la cuenta `ligainterna2026@gmail.com` sin seleccionar jugador.
5. Copiar el UUID de ese usuario y ejecutar las dos líneas finales del SQL sustituyendo `ADMIN_USER_UUID`.
6. En el formulario público de registro, cargar únicamente jugadores todavía libres y enviar el jugador elegido como `options.data.player_id` al hacer `supabase.auth.signUp(...)`.
7. El trigger `handle_new_user()` del SQL vinculará automáticamente ese usuario con el jugador y le asignará el rol `player`. Si el jugador ya estuviera ocupado, el registro se rechazará y no se sobrescribirá ninguna cuenta.
8. Crear un bucket público `player-photos` para las fotos de perfil y aplicar una política que permita a cada usuario modificar solo su propia carpeta y al administrador cualquier foto.
9. Conectar el frontend a `@supabase/supabase-js` usando **Project URL** y **anon public key**. La `service_role` jamás debe ponerse en el navegador.
10. Publicar la web (por ejemplo, en Vercel/Netlify/Cloudflare Pages) y configurar el dominio si se desea.
11. En YouTube, crear el canal con el correo de la liga y pegar en la web el enlace del directo/grabación de cada partido.

## Modelo de permisos preparado

- **Visitante:** lectura pública de equipos, plantillas, clasificación, jornadas, estadísticas, disponibilidad, 5 ideal, streaming y grabaciones.
- **Jugador:** se obtiene automáticamente al registrarse y seleccionar una ficha libre; puede votar únicamente su disponibilidad y cambiar únicamente su foto.
- **Árbitro:** lo asigna el administrador y puede coexistir con Jugador. Solo edita los partidos que tenga asignados.
- **Administrador:** lo asigna la cuenta principal de la liga y gestiona todo, incluidos usuarios, roles, fotos, partidos, 5 ideal y enlaces de YouTube.

## Importante sobre la demo local

El formulario de registro de `index.html` es solo para probar la interfaz y guarda los datos en el navegador. **No uses una contraseña real** en esta versión. En producción, las contraseñas serán gestionadas por Supabase Auth y nunca se guardarán en el frontend.


## Registro que usará el frontend

La llamada de producción será equivalente a:

```js
await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      player_id: 'celta-guillem',
      display_name: 'Guillem'
    }
  }
});
```

El navegador **no** enviará nunca `admin` ni `referee` como roles. Esos permisos se gestionan desde el panel de administración una vez iniciada la sesión con la cuenta principal.
