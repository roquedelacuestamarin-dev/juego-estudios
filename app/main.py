import asyncio
import hashlib
import json
import logging
import os
import secrets
import shutil
import signal
import sys
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.agent import AgentError, converse, prepare
from app.config import Settings
from app.extract import MaterialError, validate_file
from app.models import EducationPackage, MessageInput, Preferences
from app.store import Store

logger = logging.getLogger("isla.metrics")
ROOT = Path(__file__).resolve().parent
COOKIE = "isla_session"


def create_app(cfg: Settings | None = None):
    cfg = cfg or Settings()
    store = Store(cfg.data_dir, cfg.retention_hours)
    locks = defaultdict(asyncio.Lock)
    workers = asyncio.Semaphore(cfg.extraction_workers)
    tasks = set()
    rate = defaultdict(deque)
    uploads = cfg.data_dir / "uploads"
    uploads.mkdir(exist_ok=True, mode=0o700)

    async def cleanup_loop():
        while True:
            await asyncio.sleep(60)
            store.cleanup()
            for sid in list(locks):
                if not locks[sid].locked() and store.get(sid) is None:
                    locks.pop(sid, None)
            for key in list(rate):
                if not rate[key] or rate[key][-1] < time.monotonic() - 3600:
                    rate.pop(key, None)

    @asynccontextmanager
    async def lifespan(app):
        store.cleanup()
        store.recover()
        for p in uploads.iterdir():
            if p.is_file():
                p.unlink()
        cleaner = asyncio.create_task(cleanup_loop())
        yield
        cleaner.cancel()
        for task in list(tasks):
            task.cancel()
        await asyncio.gather(cleaner, *tasks, return_exceptions=True)

    app = FastAPI(title="Isla Saber", version="0.1.0", lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.settings = store, cfg
    app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

    def spawn(coro):
        task = asyncio.create_task(coro)
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    def session(request):
        sid = request.cookies.get(COOKIE, "")
        state = store.get(sid) if len(sid) == 43 else None
        if state is None:
            raise HTTPException(401, "La sesión terminó. Recarga la página para comenzar otra.")
        return sid, state

    def check_rate(key, maximum, seconds=3600):
        queue = rate[key]
        now = time.monotonic()
        while queue and queue[0] < now - seconds:
            queue.popleft()
        if len(queue) >= maximum:
            raise HTTPException(429, "Se alcanzó el límite de solicitudes. Inténtalo más tarde.")
        queue.append(now)

    def public_state(state):
        return {**state, "files": [{k: v for k, v in f.items() if k not in {"pages", "digest"}} for f in state["files"]],
                "ai_available": cfg.ai_mode == "local" or bool(cfg.ai_key), "mode": cfg.ai_mode,
                "external_search": False, "engine_status": "ready",
                "limits": {"files": cfg.max_files, "file_mb": cfg.max_file_bytes // 1024**2,
                           "session_mb": cfg.max_session_bytes // 1024**2, "pages": cfg.max_pages,
                           "text_chars": cfg.max_text_chars, "generations": cfg.max_generations,
                           "chat": cfg.max_chat, "ai_tokens": cfg.max_ai_tokens,
                           "retention_hours": cfg.retention_hours}}

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        # No devolver cuerpos de solicitudes, datos personales ni secretos en errores.
        return JSONResponse({"detail": "Los datos enviados no tienen el formato esperado o superan los límites."}, status_code=422)

    @app.exception_handler(AgentError)
    async def agent_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.middleware("http")
    async def security(request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            expected = cfg.public_origin or str(request.base_url).rstrip("/")
            if request.headers.get("x-isla-request") != "1" or (origin and origin != expected):
                return JSONResponse({"detail": "Solicitud de origen no permitido."}, status_code=403)
            limit = cfg.max_session_bytes + 1024 * 1024 if request.url.path == "/api/files" else 32 * 1024
            length = request.headers.get("content-length", "0" if request.method == "DELETE" else None)
            if length is None:
                return JSONResponse({"detail": "Se requiere Content-Length."}, status_code=411)
            if not length.isdigit() or int(length) > limit:
                return JSONResponse({"detail": "La solicitud supera el tamaño permitido."}, status_code=413)
            received = 0
            original_receive = request._receive

            async def bounded_receive():
                nonlocal received
                event = await original_receive()
                received += len(event.get("body", b""))
                if received > limit:
                    raise StarletteHTTPException(413, "La solicitud supera el tamaño permitido.")
                return event
            request._receive = bounded_receive
        response = await call_next(request)
        response.headers.update({
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
            "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Cache-Control": "no-store", "X-Frame-Options": "DENY"})
        return response

    @app.get("/")
    async def index():
        return FileResponse(ROOT / "static" / "index.html")

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "mode": cfg.ai_mode, "ai_configured": bool(cfg.ai_key),
                "ocr_available": bool(shutil.which("tesseract") and (cfg.tessdata_dir / "spa.traineddata").is_file()),
                "engine": "ready", "engine_version": "2.0"}

    @app.post("/api/session")
    async def get_session(request: Request):
        sid = request.cookies.get(COOKIE, "")
        state = store.get(sid) if len(sid) == 43 else None
        if state is None:
            address = request.client.host if request.client else "unknown"
            check_rate("new:" + hashlib.sha256(address.encode()).hexdigest(), 30)
            store.cleanup()
            with store.connect() as db:
                if db.execute("SELECT count(*) FROM sessions").fetchone()[0] >= 200:
                    raise HTTPException(503, "El servidor alcanzó su capacidad temporal. Inténtalo más tarde.")
            sid = store.create()
            state = store.get(sid)
        response = JSONResponse(public_state(state))
        response.set_cookie(COOKIE, sid, max_age=max(1, int(state["expires_at"] - time.time())),
                            httponly=True, secure=cfg.cookie_secure, samesite="strict", path="/")
        return response

    @app.get("/api/state")
    async def state(request: Request):
        _, value = session(request)
        return public_state(value)

    @app.delete("/api/session")
    async def delete_session(request: Request):
        sid, _ = session(request)
        async with locks[sid]:
            state = store.get(sid)
            store.delete(sid)
            for f in state["files"] if state else []:
                for path in uploads.glob(f["id"] + ".*"):
                    path.unlink(missing_ok=True)
        response = JSONResponse({"deleted": True})
        response.delete_cookie(COOKIE, path="/")
        return response

    async def process_file(sid, fid, path):
        started = time.monotonic()
        proc = None
        try:
            async with workers:
                async with locks[sid]:
                    state = store.get(sid)
                    if not state or not any(f["id"] == fid for f in state["files"]):
                        return
                    for f in state["files"]:
                        if f["id"] == fid:
                            f["status"] = "processing"
                    store.save(sid, state)
                child_env = {k: v for k, v in os.environ.items() if k in {"PATH", "LANG", "LC_ALL", "SYSTEMROOT"}}
                child_env.update(EDU_TESSDATA_DIR=str(cfg.tessdata_dir.resolve()),
                                 EDU_MAX_PAGES=str(cfg.max_pages), EDU_MAX_TEXT_CHARS=str(cfg.max_text_chars))
                proc = await asyncio.create_subprocess_exec(sys.executable, "-m", "app.extract", str(path.resolve()),
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                    cwd=ROOT.parent, env=child_env, start_new_session=True)
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=75)
                result = json.loads(stdout) if proc.returncode == 0 else {"ok": False, "error": "Se agotó el límite de procesamiento. Divide el documento."}
                async with locks[sid]:
                    state = store.get(sid)
                    if state:
                        for f in state["files"]:
                            if f["id"] == fid:
                                f.update(status="ready" if result["ok"] else "needs_review",
                                    pages=result.get("pages", []), notes=result.get("notes", []),
                                    error=result.get("error"), page_count=len(result.get("pages", [])))
                        store.save(sid, state)
                logger.info("event=extract status=%s duration_ms=%d", "ok" if result["ok"] else "review", (time.monotonic()-started)*1000)
        except asyncio.CancelledError:
            raise
        except Exception:
            async with locks[sid]:
                state = store.get(sid)
                if state:
                    for f in state["files"]:
                        if f["id"] == fid:
                            f.update(status="error", error="No se completó la lectura en el tiempo disponible. Divide el material o reintenta.")
                    store.save(sid, state)
            logger.info("event=extract status=error")
        finally:
            if proc and proc.returncode is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await proc.wait()
            path.unlink(missing_ok=True)

    @app.post("/api/files", status_code=202)
    async def upload(request: Request):
        sid, _ = session(request)
        check_rate("upload:" + sid, 30)
        form = await request.form(max_files=cfg.max_files, max_fields=0)
        accepted, pending = [], []
        try:
            items = form.getlist("files")
            if not items:
                raise HTTPException(422, "Selecciona al menos un archivo.")
            async with locks[sid]:
                state = store.get(sid)
                if state is None:
                    raise HTTPException(401, "La sesión terminó.")
                if len(state["files"]) + len(items) > cfg.max_files:
                    raise HTTPException(422, f"Se admiten hasta {cfg.max_files} archivos por sesión. Elimina alguno antes de continuar.")
                total = 0
                digests = {f["digest"] for f in state["files"]}
                for item in items:
                    if not hasattr(item, "read"):
                        raise HTTPException(422, "Adjunto no válido.")
                    data = await item.read(cfg.max_file_bytes + 1)
                    if len(data) > cfg.max_file_bytes:
                        raise HTTPException(413, f"Cada archivo admite hasta {cfg.max_file_bytes // 1024**2} MB.")
                    total += len(data)
                    if total + state["upload_bytes"] > cfg.max_session_bytes:
                        raise HTTPException(413, "Se alcanzó el límite acumulado de carga de esta sesión.")
                    name = Path(item.filename.replace("\\", "/")).name[:160]
                    try:
                        ext = validate_file(name, data)
                    except MaterialError as exc:
                        raise HTTPException(422, str(exc)) from exc
                    digest = hashlib.sha256(data).hexdigest()
                    if digest in digests:
                        raise HTTPException(409, "Ese archivo ya está adjunto o se repite en la selección.")
                    digests.add(digest)
                    fid = secrets.token_hex(12)
                    accepted.append({"id": fid, "name": name, "size": len(data), "digest": digest,
                                     "status": "queued", "pages": [], "notes": [], "error": None})
                    pending.append((fid, uploads / (fid + ext), data))
                # Validación de todo el lote antes de escribir: no hay cargas parciales silenciosas.
                for fid, path, data in pending:
                    path.write_bytes(data)
                    path.chmod(0o600)
                state["files"].extend(accepted)
                state["upload_bytes"] += total
                state.update(package=None, fingerprint=None, generation_status="idle")
                store.save(sid, state)
            for fid, path, _ in pending:
                spawn(process_file(sid, fid, path))
            return {"accepted": len(accepted)}
        finally:
            await form.close()

    @app.get("/api/files/{fid}/text")
    async def extracted_text(fid: str, request: Request):
        _, state = session(request)
        f = next((f for f in state["files"] if f["id"] == fid), None)
        if not f:
            raise HTTPException(404, "Archivo no encontrado.")
        return {"name": f["name"], "pages": f["pages"], "notes": f["notes"], "error": f["error"]}

    @app.delete("/api/files/{fid}")
    async def delete_file(fid: str, request: Request):
        sid, _ = session(request)
        async with locks[sid]:
            state = store.get(sid)
            if not state or not any(f["id"] == fid for f in state["files"]):
                raise HTTPException(404, "Archivo no encontrado.")
            state["files"] = [f for f in state["files"] if f["id"] != fid]
            # Conversaciones pueden contener extractos: borrarlas evita conservar el material eliminado.
            state.update(package=None, fingerprint=None, generation_status="idle", messages=[])
            store.save(sid, state)
        for path in uploads.glob(fid + ".*"):
            path.unlink(missing_ok=True)
        return {"deleted": True}

    @app.put("/api/preferences")
    async def preferences(body: Preferences, request: Request):
        sid, _ = session(request)
        async with locks[sid]:
            state = store.get(sid)
            if state is None:
                raise HTTPException(401, "La sesión terminó.")
            state.update(preferences=body.model_dump(), package=None, fingerprint=None, generation_status="idle")
            store.save(sid, state)
        return public_state(state)

    @app.post("/api/chat")
    async def chat(body: MessageInput, request: Request):
        sid, _ = session(request)
        check_rate("chat:" + sid, 15, 60)
        async with locks[sid]:
            state = store.get(sid)
            if state is None:
                raise HTTPException(401, "La sesión terminó.")
            if state["chat_count"] >= cfg.max_chat:
                raise HTTPException(429, "Llegaste al límite de mensajes de esta sesión.")
            state["chat_count"] += 1
            state["messages"].append({"role": "user", "content": body.message})
            try:
                reply = await converse(cfg, state, body.message)
                state["messages"].append({"role": "assistant", "content": reply.reply})
                state.update(preferences=reply.preferences.model_dump(), package=None, fingerprint=None, generation_status="idle")
            except AgentError as exc:
                state["messages"].append({"role": "assistant", "content": str(exc), "error": True})
                state.update(package=None, fingerprint=None, generation_status="idle")
                raise
            finally:
                store.save(sid, state)
        logger.info("event=chat status=ok mode=%s", cfg.ai_mode)
        return public_state(state)

    @app.post("/api/generate")
    async def generate(request: Request):
        sid, _ = session(request)
        async with locks[sid]:
            state = store.get(sid)
            if state is None:
                raise HTTPException(401, "La sesión terminó.")
            if any(f["status"] in {"queued", "processing"} for f in state["files"]):
                raise HTTPException(409, "Espera a que termine la lectura de los archivos.")
            if not state["files"]:
                raise HTTPException(422, "Adjunta material antes de generar.")
            if any(f["status"] != "ready" for f in state["files"]):
                raise HTTPException(422, "Hay material que necesita revisión. Sustitúyelo o elimínalo para no preparar contenido incompleto.")
            fingerprint = hashlib.sha256(json.dumps({"files": [f["digest"] for f in state["files"]],
                "prefs": state["preferences"], "messages": state["messages"], "mode": cfg.ai_mode,
                "model": cfg.ai_model, "engine_version": "2.0"}, sort_keys=True).encode()).hexdigest()
            if state["package"] and state["fingerprint"] == fingerprint:
                return public_state(state)
            if state["generations"] >= cfg.max_generations:
                raise HTTPException(429, "Llegaste al límite de preparaciones de esta sesión.")
            state["generations"] += 1
            state["generation_status"] = "processing"
            store.save(sid, state)
            try:
                package = await prepare(cfg, state)
                state.update(package=package.model_dump(), fingerprint=fingerprint, generation_status="prepared")
            except (AgentError, ValueError) as exc:
                state.update(package=None, generation_status="error")
                if isinstance(exc, AgentError):
                    raise
                raise AgentError("La configuración generada no superó la validación de fuentes. No se entregó al motor.") from exc
            finally:
                store.save(sid, state)
        logger.info("event=prepare status=ok mode=%s sources=%d", cfg.ai_mode, len(package.sources))
        return public_state(state)

    @app.get("/api/package")
    async def package(request: Request):
        _, state = session(request)
        if not state["package"]:
            raise HTTPException(404, "Todavía no hay contenido preparado.")
        return JSONResponse(state["package"], headers={"Content-Disposition": 'attachment; filename="isla-saber-contenido.json"'})

    @app.get("/api/schema")
    async def schema():
        return EducationPackage.model_json_schema()

    return app


app = create_app()
