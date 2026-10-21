# Contrato del motor · versión 1.0.0

El esquema JSON se exporta mediante `GET /api/schema` y se deriva de `EducationPackage` en `app/models.py`. `GET /api/package` entrega el último paquete privado. Todos los modelos rechazan campos inesperados. `validate_references` comprueba que los objetivos solo citen identificadores existentes.

Campos principales:

| Campo | Uso |
| --- | --- |
| `schema_version` | Versión semántica del contrato |
| `preferences` | Apodo, nivel opcional, dificultad general/por tema e intereses |
| `level_basis` | `user` o `unknown`; no se afirma una inferencia de nivel inexistente |
| `topics[].objectives` | Objetivos con IDs de fragmentos fuente |
| `sources` | Archivo, página/diapositiva cuando existe, fragmento, método texto/OCR |
| `preparation_mode` | `local` u `openai`; permite interpretar las limitaciones |
| `curriculum_alignment` | `not_verified` hasta contrastar objetivos oficiales |
| `engine` | Estado, versión de capacidades y espacios reservados para narrativa/actividades |

El paquete contiene extractos privados: **no es un formato para compartir públicamente**. Un futuro artefacto público debe excluir fuentes y conversación, conservando solo contenido publicable autorizado. No existe endpoint público de lectura de documentos.

## Interfaz reservada

En 1.0.0 el único estado aceptado es `not_integrated`; `capability_version` y `narrative` deben ser `null`; `activities` debe estar vacío. Rechazar contenido fuera de capacidades evita inventar reglas del futuro motor. No se genera ni ejecuta código de IA.

Cuando el propietario entregue el motor, implementar un adaptador con:

1. `capabilities()`: versión, actividades conocidas, tipos de contenido y límites admitidos.
2. `create(package, capabilities)`: validación del contrato y transformación a recursos del motor; solo tipos de actividades programadas y probadas.
3. `status(job_id)`: `queued`, `processing`, `ready` o `error`, con autorización por sesión y reintentos idempotentes.
4. `play_url(job_id)`: solo si el artefacto existe, terminó de validarse y pasó la prueba de inicio.

Estas firmas son la interfaz propuesta, no endpoints ya disponibles. La versión del contrato deberá evolucionar para permitir capacidades concretas. El flujo final será **Generar juego → preparar → generar → validar → entrar a jugar**, sin una pantalla obligatoria de aprobación de trama o misiones. Actualmente solo se llega a `prepared`, con estado del motor pendiente.

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
