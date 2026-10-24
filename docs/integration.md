# Contrato del motor · versión 2.0.0

`GET /api/schema` exporta `EducationPackage`; `GET /api/package` descarga el paquete privado. Contiene extractos del estudiante, por lo que no es un enlace compartible.

## Mundos y misiones

`engine.status=ready`, `capability_version=2.0`. `worlds` contiene hasta seis mundos por materia detectada. Cada uno tiene `id`, `subject`, `name`, `biome`, `missions` y `source_ids`. Los biomas originales son cumbres de cristal (matemáticas), bosque (ciencias), ruinas (historia), valle otoñal (lenguaje), costa (geografía) y pradera para otros materiales.

El compilador `app/worlds.py` separa fragmentos por palabras clave, incluso dentro de un mismo documento, y conserva los identificadores originales. La clasificación es aproximada. Los escenarios son plantillas con terrenos y posiciones diferentes, no mapas creados libremente por un modelo. Si no hay una explicación legible, la generación indica qué corregir.

Cada mundo tiene tres misiones:

1. `order`: recoger físicamente tres piezas de una explicación y llevarlas al taller en un orden coherente. Solo el orden original de la fuente se acepta en esta versión.
2. `balance`: para operaciones enteras correctas explícitas en los apuntes (`+`, `-`, `×`, `*`, resultado entre 1 y 12), transportar cristales de 1–3 unidades y depositar la cantidad exacta. Si no hay una operación compatible, `restore`: recuperar y entregar el concepto que completa una idea de la fuente.
3. `encounter`: breve pregunta al guardián, al otro lado del puente. Tras resolverla, el jugador debe caminar hasta el faro y encenderlo.

Cada misión usa `instruction`, `items`, `solution`, `answer` cuando corresponde, `explanation` y `source_ids`. Se validan límites, índices y referencias. Esa validación no prueba exactitud pedagógica. Las operaciones se comprueban aritméticamente antes de producir una misión de energía.

`activities` conserva el contenido estructurado de preguntas para los encuentros. En modo local se deriva de fragmentos. Con OpenAI/Gemini el proveedor prepara ese contenido; el compilador lo transforma en misiones admitidas. El modelo no ejecuta ni genera el código del motor. No hay llamadas a IA durante el movimiento o la resolución del mapa.

## Motor y progreso

`app/static/game.mjs` dibuja el mundo y los personajes originales en Canvas 2D, con movimiento por casillas, colisiones, búsqueda de caminos, interacción por proximidad, mochila, puente bloqueado y faro. Teclado: flechas/WASD y E. Móvil: cruceta y botón de interacción; también se puede tocar un destino. La vista móvil acerca la cámara para que el personaje sea legible.

Los errores permiten reintentar y no consumen intentos de API. Las respuestas breves se comparan sin distinguir mayúsculas, acentos ni espacios repetidos; no se evalúan sinónimos. Cada misión completada aporta una estrella, hasta tres por mundo. No es la futura regla de tres estrellas por misión ni una calificación escolar.

El progreso se guarda en `sessionStorage`, asociado a la huella del paquete y con caducidad. Guarda posiciones y misiones, no documentos ni conversaciones. Permite recargar o cerrar el diálogo en la misma pestaña. No se sincroniza entre dispositivos y puede perderse al cerrar la pestaña o caducar la sesión del servidor. Borrar la sesión o invalidar su paquete elimina el progreso local. Si el navegador bloquea el almacenamiento, el juego continúa en memoria.

Los paquetes anteriores deben regenerarse: se actualizó la huella del motor y la web no presenta el cuestionario viejo como un mundo. Actualizar tanto Render como Vercel.

## Alcance de esta versión

Primera aventura para iterar con estudiantes de 10–16 años, no reproducción de Doodle Champion Island. Las mecánicas de recogida, reconstrucción y energía ya funcionan; no hay deportes, audio, combate, multijugador, enlaces compartidos, avatar personalizable, misiones infinitas ni evaluación curricular. La narrativa usa un arco sencillo de restaurar un faro y el apodo del estudiante. La calidad de los encuentros con IA real requiere una clave y validación posterior.
