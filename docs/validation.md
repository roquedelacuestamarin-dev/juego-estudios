# Validación de esta entrega

Entorno: Linux, Python 3.12.14, Tesseract 5 con modelo español `tessdata_fast` 4.1.0, Chromium y dependencias fijadas en `uv.lock`.

## Pruebas ejecutadas

`bash scripts/setup.sh`: instalación repetible y verificación del checksum del modelo. La segunda ejecución reutilizó las dependencias y el modelo.

`.venv/bin/pytest -q`: **31 casos aprobados**. Cobertura:

- Recorrido de material → conversación → preferencias por tema → paquete válido con referencias → reutilización sin nueva generación → eliminación.
- Formatos no permitidos, extensiones falsas, archivo vacío, más de 20 archivos, tamaño, cuota acumulada, duplicados y rechazo atómico de lotes.
- Extracción real de PDF con texto, OCR español sobre JPEG con texto impreso rotado/comprimido y PDF escaneado, DOCX y PPTX.
- Imagen en blanco: se solicita una versión legible y se bloquea la preparación para evitar omitir material silenciosamente.
- Límites de páginas y caracteres, archivos ZIP con rutas inválidas, macros y objetos incrustados.
- Separación de sesiones, cookies HttpOnly/SameSite, protección de solicitudes entre sitios, caducidad y borrado.
- Eliminación de originales aún en cola al borrar la sesión.
- Contrato sin código/actividades arbitrarias y rechazo de referencias inexistentes.
- Presupuesto y cuota de generaciones, ausencia de credenciales y fallo simulado del proveedor; conservación del material tras el fallo.
- Respuestas simuladas del proveedor: contrato correcto, JSON inválido y referencias inventadas. Solo la respuesta válida produce un paquete; incluyen OpenAI y Gemini y respuestas fuera de las opciones. Estas pruebas no son llamadas reales a proveedores.
- Documento con instrucciones maliciosas tratado como fuente, sin cambiar reglas en modo local.

El runner muestra un aviso de deprecación de Starlette sobre su adaptador de pruebas httpx; no es un fallo de ejecución. La suite no usa pruebas omitidas ni resultados simulados como evidencia de llamadas reales al proveedor.

`.venv/bin/python scripts/browser_smoke.py`: **3 recorridos aprobados** en Chromium a 1440×1050, 820×1180 y 390×844. Carga real mediante la interfaz, chat, persistencia al recargar, preferencias por tema, preparación y descarga JSON, vista de fuentes, uso de Escape en diálogo, cambio de apodo, prevención de HTML inyectado, borrado de archivo y sesión. Sin errores JavaScript ni desbordamiento horizontal inicial. Capturas en `test-results/`. Además, cada tamaño completa y reinicia la expedición, comprueba respuestas correctas/incorrectas y verifica que no haya materias prefijadas. El botón Adjuntar archivos del chat abre el selector nativo en los tres tamaños. Para una imagen PNG sintética de más de 3 MB aparece el diálogo de optimización: cancelar no carga ningún archivo, y Optimizar y subir permite cargarla y comprobar su texto mediante OCR real.

## Límites de la evidencia

Auditoría automatizada con axe-core 4.11.0: cero infracciones detectadas de las reglas WCAG 2 A/AA y 2.1 AA evaluadas en la pantalla inicial y el diálogo de preferencias, en los tres tamaños. Se corrigieron contraste del texto secundario, interacción anidada en la carga y acceso por teclado a la conversación desplazable. Esto no equivale a una certificación ni sustituye pruebas con lectores de pantalla.

Para reproducir esta comprobación opcional:

```bash
npm install --prefix /tmp/isla-a11y --cache /tmp/isla-npm-cache --no-audit --no-fund axe-core@4.11.0
AXE_SCRIPT=/tmp/isla-a11y/node_modules/axe-core/axe.min.js .venv/bin/python scripts/browser_smoke.py
```

El auditor se inyecta mediante DevTools solo en las pruebas; la CSP de la aplicación permanece activa y no se modifica.

- Los documentos son fixtures sintéticos claramente identificados. No se ha recibido ni validado una foto real de cuaderno manuscrito. El OCR no garantiza transcripción de escritura a mano, fórmulas ni diagramas; se muestra esa limitación y se exige material legible.
- No hubo llamadas a OpenAI: falta `EDU_AI_API_KEY`. Se comprobó el manejo de ausencia de credencial, presupuesto y errores mediante pruebas locales. La calidad semántica de un modelo real queda pendiente.
- El modo local realmente extrae y produce un contrato; sus temas y objetivos son aproximaciones por reglas, no una conversación generativa ni una evaluación curricular.
- Gemini y Ollama no están conectados.
- No se verificó el currículum chileno ni se consultaron fuentes externas.
- No existe motor jugable, cálculo de estrellas, misiones, cobros ni enlaces públicos.
- No se probó Vercel ni otro alojamiento externo. El procedimiento propuesto está en `deployment.md`.

La web y la preparación local son comprobables en este entorno. La expedición de repaso está probada localmente. La conversación con IA real y el mundo explorable siguen pendientes.

## Preparación del despliegue

- `node --test tests/vercel.test.mjs`: 3 casos. El build valida el servidor HTTPS, genera solo recursos públicos y una reescritura de API; no incluye documentos ni secretos. Incluye la regresión del fallo en Vercel: sin variable (o con una vacía) utiliza `https://isla-saber-sdt9.onrender.com`; una configuración explícita puede sustituirlo y sigue validándose.
- Prueba de cookies Secure y origen público `https://juego.elchucao.com` detrás de un proxy: aprobada.
- El recorrido en tres tamaños comprueba ahora también una selección múltiple en la que el segundo archivo está dañado: el primero se conserva y el error parcial se comunica.
- La publicación en Render/Vercel y el cambio DNS requieren conectar las cuentas del propietario. No están validados por estos tests locales.

- Imagen `isla-saber:preview` construida correctamente a partir del Dockerfile y la imagen base fijada por digest. En este entorno se utilizó el proxy existente y su CA mediante un secreto efímero de BuildKit; no se desactivó la verificación TLS ni se guardó el certificado del entorno en la imagen.
- `python3 scripts/container_smoke.py`: aprobado en un contenedor limitado a 512 MB y una CPU. Verificó web, extracción de PDF, OCR español de un JPEG sintético, preferencias por tema, paquete con fuentes y borrado de sesión. El contenedor de prueba se eliminó al finalizar.
