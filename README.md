# Isla Saber

Primera etapa de una plataforma para preparar aventuras educativas a partir de material de estudio. Interfaz original en español con estética de exploración y pixel art. **No incluye todavía un videojuego ni misiones jugables.**

## Qué funciona

- Conversación, carga múltiple, arrastrar archivos, selección opcional de carpetas, estados, eliminación y vista del texto extraído.
- PDF digital y escaneado; JPG, PNG y WebP con OCR real en español (Tesseract). DOCX y PPTX: texto y tablas.
- Asistente local por reglas: reconoce temas básicos, apodo, curso y dificultad por tema. Por ejemplo: `Llámame Luna. Estoy en 7º básico. Sumas fáciles y restas difíciles.` Conserva preferencias durante la sesión y permite corregirlas mediante un formulario.
- Preparación de un paquete JSON validado, versionado y relacionado con fuentes/páginas. Sin confirmación previa de historia o misiones.
- Adaptador de OpenAI implementado para conversación y preparación semántica, **pendiente de verificar con credenciales reales**. No hay búsquedas web.
- Sesiones privadas con cookies HttpOnly, cuotas, rechazo de archivos incompatibles y caducidad de datos. No hay cuentas, cobros ni enlaces compartidos.

## Publicar en juego.elchucao.com

[Desplegar en Render](https://render.com/deploy?repo=https://github.com/roquedelacuestamarin-dev/juego-estudios) con tu cuenta conectada a GitHub. El Blueprint solicita el plan gratuito y modo local sin claves de IA. Después importa este repositorio en Vercel y conecta el subdominio `juego.elchucao.com`. La aplicación tendrá una dirección pública cuando terminen los despliegues y la verificación DNS. Sigue [los pasos de Render, Vercel y DNS](docs/deployment.md).

## Instalación y ejecución

Requisitos: Linux, Python 3.12 o 3.13, `uv`, `curl`, `sha256sum` y Tesseract 5. En Debian/Ubuntu, un administrador puede instalar Tesseract con `apt-get install tesseract-ocr`. Instala uv según su documentación o mediante `python3 -m pip install uv==0.12.23` en un entorno con permisos.

```bash
cd /workspace/juego-estudios
bash scripts/setup.sh
bash scripts/start.sh
```

El servidor escucha en el puerto 8000 (`PORT` permite cambiarlo). `GET /api/health` comprueba el servicio y la disponibilidad del OCR. La web se sirve en `/`. No requiere Node ni compilación del frontend. Usar **un solo worker**: los bloqueos de sesión son locales al proceso.

`setup.sh` usa `uv.lock` sin modificarlo y descarga el modelo OCR español de Tesseract 4.1.0 por HTTPS, con SHA-256 fijado. Puede repetirse. Los paquetes se guardan en `.venv`; el OCR en `.runtime/tessdata`; los datos en `.data`. El script no inicia procesos persistentes.

## Configuración de IA

El modo predeterminado es `EDU_AI_MODE=local`: no usa API de pago. El OCR y la extracción funcionan realmente; la conversación local es un intérprete limitado por reglas, no un LLM. No responde preguntas abiertas ni deduce todo objetivo o nivel. El nivel desconocido queda como tal.

Para OpenAI, configura **en el gestor de secretos del servidor**, nunca en el navegador ni en Git:

- `EDU_AI_MODE=openai`
- `EDU_AI_API_KEY`: clave de la API, o binding de proxy compatible para `api.openai.com`.
- `EDU_AI_MODEL=gpt-4.1-mini` (configurable; debe admitir Chat Completions y salida JSON).

Reinicia el servidor. Los errores del proveedor se muestran sin revelar respuestas internas ni credenciales. No hay cambio silencioso al modo local cuando falla la IA. Una suscripción de ChatGPT no incluye consumo de la API. Los límites de la aplicación no reemplazan los límites de facturación del proveedor.

Gemini y Ollama **no están implementados**. El adaptador está concentrado en `app/agent.py` para incorporarlos posteriormente. No se enviaron documentos a servicios externos durante esta entrega.

`.env.example` documenta las variables; `.env` no se carga automáticamente. Exporta las variables o utiliza el gestor del alojamiento. Reinicia tras cambios de configuración.

## Límites predeterminados

| Recurso | Límite configurable |
| --- | --- |
| Archivos activos | 20 como máximo (`EDU_MAX_FILES` puede reducirlo) |
| Tamaño individual / total acumulado | 10 MB / 50 MB por sesión |
| PDF / PowerPoint | 30 páginas / diapositivas por archivo |
| Texto extraído | 40.000 caracteres por archivo; 100 fragmentos por paquete |
| Imágenes | 20 megapíxeles; OCR redimensionado a 2.800 px |
| DOCX/PPTX descomprimido | 60 MB; 2.000 entradas ZIP; sin macros/objetos incrustados |
| Preparaciones / mensajes | 10 / 60 por sesión; resultados idénticos reutilizados |
| IA | 24.000 unidades reservadas por sesión, estimación conservadora por bytes de entrada y margen de salida |
| Extracción | 2 procesos simultáneos; 75 s por archivo, 60 s CPU, 1,5 GB por proceso |
| Retención | 24 horas desde crear la sesión; limpieza cada minuto y al iniciar |
| Protección básica de servidor | 200 sesiones activas, 30 nuevas por IP/h, 30 cargas por sesión/h, 15 mensajes/min |

Los intentos fallidos consumen cuota. Eliminar archivos no devuelve la cuota acumulada de carga. Word no tiene paginación estable: se limita por tamaño y texto y se utiliza `page: null`. No se truncan silenciosamente documentos que superan los límites. Se indica cuando el modo local no identifica temas en fragmentos.

## Pruebas

```bash
.venv/bin/pytest -q
.venv/bin/python scripts/browser_smoke.py
```

La prueba del navegador utiliza Chromium del sistema. Si no está disponible, instala el navegador con `.venv/bin/playwright install chromium` y sus dependencias de sistema según Playwright; `CHROMIUM_PATH` permite seleccionar otro ejecutable. Las pruebas inician su propio servidor temporal. Las capturas quedan en `test-results/` (ignorado por Git).

Los documentos de prueba se generan sintéticamente: PDF con texto, imagen con texto impreso rotada y comprimida como JPEG, PDF escaneado, Word y PowerPoint. El OCR real se verifica con Tesseract. Esto **no valida todavía fotografías de cuadernos manuscritos reales**. Para esa comprobación hace falta material representativo sin datos personales.

Detalles de cobertura y resultados: [docs/validation.md](docs/validation.md).

## Privacidad y operación

Los originales se borran al terminar la extracción o al eliminar el archivo. Solo el proceso de extracción lee el archivo; no recibe claves del servidor y tiene límites de tiempo/memoria. No ejecuta adjuntos. Texto, conversación y paquete quedan en SQLite con permisos locales restrictivos y `secure_delete`, hasta caducar o solicitar borrado. Eliminar un archivo también invalida el paquete y elimina la conversación, que podría contener extractos. Borrar la sesión elimina sus datos. No se registran documentos, apodos, conversaciones ni claves en las métricas; se registran eventos, estado y duración.

Los respaldos del alojamiento deben excluir los datos temporales o aplicar una política equivalente. El borrado local no puede borrar copias externas ya creadas. En modo OpenAI se transmiten mensajes y fragmentos al proveedor; su tratamiento depende de las condiciones de la cuenta. Informar y revisar esa política antes de usar material de menores.

Las cuotas anónimas y SQLite son apropiados para un piloto acotado, no un control comercial de abuso. Antes de exposición pública, usar HTTPS (`EDU_COOKIE_SECURE=true`), límites de cuerpo/tasa en el proxy, almacenamiento persistente protegido y controles de acceso apropiados. No usar múltiples réplicas sin migrar los bloqueos, cola y estado a servicios compartidos. No hay restauración entre dispositivos ni recuperación de sesiones sin su cookie.

## Arquitectura y siguientes etapas

`app/static` contiene la presentación; `app/extract.py`, los extractores aislados; `app/agent.py`, la lógica educativa y el adaptador de IA; `app/models.py`, el contrato validado; `app/store.py`, las sesiones; `app/main.py`, la API y coordinación.

- [Contrato y requisitos del futuro motor](docs/integration.md)
- [Despliegue posterior con Vercel y servidor de procesamiento](docs/deployment.md)
- [Licencias de terceros](docs/licenses.md)

La configuración de publicación está incluida en el repositorio. El estado del despliegue y su URL se comprueban en el panel del alojamiento; un commit o un build local no significan que la web ya esté publicada.
