# Desplegar la versión de prueba

El repositorio incluye `Dockerfile` y `render.yaml` para publicar la web y la API juntas. La URL pública solo existe después de que Render complete el despliegue.

## Render: pasos del propietario

1. Inicia sesión en Render y conecta tu cuenta de GitHub con acceso a `roquedelacuestamarin-dev/juego-estudios`.
2. Abre [Deploy to Render](https://render.com/deploy?repo=https://github.com/roquedelacuestamarin-dev/juego-estudios). Si la importación directa no muestra un repositorio privado, usa **New → Blueprint**, autoriza el repositorio y selecciona la rama `main`.
3. Render leerá `render.yaml`. La configuración solicita el plan `free`, una sola aplicación Docker y modo local, sin claves de IA. Comprueba que la pantalla siga ofreciendo ese plan antes de crear el servicio; si no está disponible, no es necesario contratar otro plan para revisar el proyecto.
4. Crea el servicio y espera a que el build y la comprobación de salud terminen. Abre la dirección HTTPS que Render muestre para el servicio.
5. Comprueba que aparece «Modo local», adjunta un PDF pequeño y prepara el contenido. Para que podamos validar el despliegue externo, comparte la dirección pública de la aplicación (nunca claves ni credenciales).

El plan de prueba puede suspender el servicio por inactividad; la primera visita puede tardar. No se configura disco persistente: las sesiones y documentos se pierden al reiniciar o redesplegar. El límite de retención sigue siendo un máximo de 24 horas, no una garantía de conservación. Este servicio es para pruebas con material sin datos personales.

El perfil ligero procesa un archivo a la vez y admite hasta 20 archivos, 3 MB por archivo, 20 MB acumulados, 10 páginas/diapositivas y 20.000 caracteres por archivo. La interfaz lee estos límites del servidor. Se mantienen la extracción y el OCR reales. No hay tareas de IA de pago.

`EDU_COOKIE_SECURE=true` exige HTTPS. Render comunica el origen mediante `RENDER_EXTERNAL_URL`, que se utiliza automáticamente; para un dominio propio, establece `EDU_PUBLIC_ORIGIN` con su origen HTTPS exacto. Los despliegues automáticos están desactivados: las actualizaciones se publican desde el panel de Render.

## Probar la imagen localmente

```bash
docker build -t isla-saber:local .
docker run --rm -p 8000:8000 --memory=512m --cpus=1 isla-saber:local
```

Para ejecutar la prueba funcional automatizada del contenedor:

```bash
docker build -t isla-saber:preview .
python3 scripts/container_smoke.py
```

La prueba crea y elimina su propio contenedor, sin publicar puertos ni llamar a proveedores de IA.

El contenedor usa un usuario sin privilegios, dependencias congeladas y un modelo OCR comprobado mediante SHA-256. El contexto de build excluye claves, sesiones, Git y archivos de prueba. El contenedor local no marca la cookie como Secure por defecto para permitir probar por HTTP; el Blueprint de Render sí la marca.

No se debe ejecutar este servidor con múltiples workers o réplicas: sus bloqueos y su cola son locales al proceso.

## Ruta inicial recomendada

Publicar el servicio completo en una máquina o contenedor Linux con almacenamiento persistente, Tesseract 5 y Python 3.12/3.13. Ejecutar `scripts/setup.sh` durante la preparación y `scripts/start.sh` como proceso principal. Montar `EDU_DATA_DIR` en disco privado y persistente. Mantener una sola instancia y un solo worker.

## Vercel y juego.elchucao.cl

El dominio previsto es **juego.elchucao.cl**. No se necesita cambiar los nameservers de `elchucao.cl` ni sus registros de correo. El operador de DNS puede ser NIC Chile o el proveedor al que apunten los nameservers actuales.

Una vez que el backend de Render esté operativo:

1. En Vercel, **Add New → Project**, importa el repositorio GitHub existente `roquedelacuestamarin-dev/juego-estudios`, rama `main` y directorio raíz. `vercel.json` utiliza la configuración de web estática; no seleccionar FastAPI como framework.
2. Este proyecto ya utiliza `https://isla-saber-sdt9.onrender.com` como servidor predeterminado. No necesitas agregar variables para ese servidor. Si lo cambias en el futuro, `EDU_BACKEND_ORIGIN` permite indicar otro origen HTTPS (sin `/api`, rutas ni claves). Una variable ausente o vacía utiliza el servidor predeterminado; un valor explícito inválido sigue deteniendo el build.
3. Publica el proyecto. `scripts/build-vercel.mjs` genera únicamente recursos públicos y una reescritura `/api/*` hacia Render. No sube documentos, sesiones, claves ni el servidor Python a la web estática.
4. En **Settings → Domains**, agrega `juego.elchucao.cl`. Copia exactamente el registro DNS indicado por Vercel en el administrador DNS actual del dominio, únicamente para el nombre `juego`. Si ya existe ese registro, revisarlo antes de reemplazarlo. No inventar un destino CNAME, porque Vercel puede asignar uno específico del proyecto.
5. En Render, establece `EDU_PUBLIC_ORIGIN=https://juego.elchucao.cl` y redespliega. Para probar antes con el dominio temporal de Vercel, usa temporalmente ese origen exacto y cámbialo después al dominio definitivo.
6. Espera la verificación DNS y HTTPS de Vercel. Comprueba el recorrido desde `juego.elchucao.cl`: sesión, archivo pequeño, extracción, conversación, configuración descargable y eliminación. Comparte esa dirección cuando esté activa para verificarla también desde aquí.

No hay datos de una cuenta Vercel o Render disponibles en esta sesión; el repositorio y los archivos de despliegue no crean servicios ni modifican DNS por sí solos. No se necesita compartir contraseñas por chat.

La web envía cada archivo en una solicitud separada. El perfil de Render limita cada uno a 3 MB para mantener pequeñas las solicitudes que atraviesan el proxy de Vercel. Si una carga falla tras otras exitosas, la interfaz comunica cuántos archivos se conservaron. Verificar los límites efectivos de ambos alojamientos durante el despliegue real.

Para probar el build estático sin desplegar:

```bash
node scripts/build-vercel.mjs
node --test tests/vercel.test.mjs
```

La versión estática sigue necesitando Render para todos los endpoints `/api/*`. No existe un juego jugable ni conversación generativa de IA hasta completar las integraciones correspondientes.

Para escalar: PostgreSQL, almacenamiento temporal con caducidad, cola de trabajos externa y cuotas autenticadas compartidas; separar workers OCR de la API. Se necesitan esos cambios antes de múltiples réplicas. La integración del juego será un servicio/adaptador distinto.
