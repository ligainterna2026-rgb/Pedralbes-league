# Liga Futsal v7

Prototipo local de la Liga Interna de fútbol sala.

## Cambios de esta versión

- Registro con selector de jugador: cada usuario elige directamente su ficha al crear la cuenta.
- El jugador seleccionado queda vinculado automáticamente y recibe el rol **Jugador** sin aprobación del administrador.
- Un jugador ya vinculado desaparece del selector para evitar dos cuentas con la misma ficha.
- El administrador sigue pudiendo corregir una vinculación si alguien se equivoca.
- Los roles **Árbitro** y **Administrador** solo se asignan desde el panel de administración.
- Una misma cuenta puede ser **Jugador + Árbitro** o **Jugador + Árbitro + Administrador**.
- El esquema de Supabase incluye un trigger preparado para hacer esta vinculación automáticamente al publicar la web.
- Se mantiene el fondo más luminoso de la versión anterior, los recordatorios, streaming, estadísticas, disponibilidad y resto de funciones.

## Abrir

Descomprime el ZIP y abre `index.html` en el navegador.

La autenticación de esta versión sigue siendo una simulación local. No uses una contraseña real hasta conectar Supabase.


## v10 · Edición del calendario
El panel Admin incluye un editor para cambiar jornadas, equipos local/visitante, añadir o eliminar partidos y restaurar el calendario original. Los descansos se recalculan automáticamente.


## v17
Añade perfiles individuales de equipo, MVP con fotos, partido por confirmar en la ficha del jugador, directo público con permisos de edición para árbitros, clasificación provisional en vivo y cuadro dinámico de play off.
