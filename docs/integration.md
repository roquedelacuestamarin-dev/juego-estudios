# Contrato del motor · versión 1.1.0

El esquema de `EducationPackage` se exporta en `GET /api/schema`. El paquete privado se descarga en `GET /api/package`. Sus extractos no deben compartirse públicamente.

La primera expedición funciona en el navegador: `engine.status=ready`, `capability_version=1.0`, de 1 a 8 actividades. Cada actividad tiene `kind` (`recall` o `choice`), `prompt`, `answer`, `options`, `explanation` y `source_ids`. Se rechazan campos extra, fuentes inexistentes y preguntas de opción cuya respuesta no esté en 2–4 opciones distintas. Esta validación comprueba estructura y referencias, no demuestra exactitud pedagógica.

El modo local crea hasta 6 ejercicios de completar fragmentos exactos de las fuentes; no genera conocimiento nuevo. Los proveedores OpenAI/Gemini reciben materia, preferencias e historial y devuelven actividades estructuradas. El motor nunca ejecuta código de IA; presenta texto mediante `textContent`.

Cada acierto al primer intento suma 10 puntos. La respuesta se compara sin distinguir mayúsculas, acentos ni espacios repetidos; no se usa evaluación semántica. Después de responder se muestran explicación y fuente. Al terminar se puede revisar o repetir. El progreso vive en memoria de la pestaña, no persiste al recargar. No hay clasificaciones ni calificaciones académicas.

La pantalla inicial no predetermina materias. Preferencias muestra temas indicados o presentes en el paquete generado. Los paquetes antiguos no habilitan Jugar: hay que generarlos otra vez. La huella de generación incluye la versión del motor para invalidar la caché anterior.

Esta primera actividad de repaso no completa todavía los requisitos de aventura que siguen a continuación; los puntos actuales no sustituyen el futuro sistema de estrellas.

## Requisitos conservados para la etapa posterior

- Aventura original en pixel art; zona central, personajes, mapa y misiones.
- Historia vinculada a la materia y las preferencias; personajes que usen el apodo.
- Dificultad fácil, media y difícil; personalización opcional de personaje.
- Cantidad de misiones configurable dentro de límites aún por definir.
- Tres estrellas obligatorias para completar cada misión.
- Reintentos con preguntas distintas o con otro orden; sin pistas durante las misiones.
- Compartir mediante enlace que no exponga documentos ni conversaciones.
- Mantener cobertura de contenidos y respuestas correctas; no prometer variantes infinitas.

**Pendiente de definición por el propietario:** cálculo de estrellas, actividades concretas, límites de misiones y condiciones detalladas de victoria. No se han inventado estos requisitos. Tampoco hay precios definitivos ni cobros.
