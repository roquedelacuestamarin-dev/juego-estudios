"use strict";
const $ = (selector) => document.querySelector(selector);
let state,
  chatting = false,
  generating = false,
  uploading = false,
  toastTimer,
  polling = false;
let renderedMessages = "";

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = error ? "toast error" : "toast";
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      toast.hidden = true;
    },
    error ? 12000 : 6500,
  );
}
async function api(path, options = {}) {
  const headers = { "X-Isla-Request": "1", ...options.headers };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "No pudimos completar la solicitud. Inténtalo de nuevo.",
    );
  return data;
}
async function refresh() {
  state = await api("/api/state");
  render();
}
function render() {
  if (!state) return;
  if (!state.package) {
    try { sessionStorage.removeItem("isla-world-progress"); } catch {}
  }
  $("#mode-label").replaceChildren(
    node("span", "status-dot"),
    document.createTextNode(
      state.mode === "local"
        ? "Modo local · sin IA generativa"
        : state.ai_available
          ? `Asistente con IA · ${state.mode === "gemini" ? "Gemini" : "OpenAI"}`
          : "IA pendiente de credencial",
    ),
  );
  $("#profile-name").textContent = state.preferences.nickname;
  $(".avatar.mini").textContent = state.preferences.nickname
    .slice(0, 1)
    .toUpperCase();
  $("#file-count").textContent =
    `${state.files.length} / ${state.limits.files}`;
  $("#nav-count").textContent = state.files.length;
  $("#file-limits").textContent =
    `Hasta ${state.limits.files} archivos · ${state.limits.file_mb} MB cada uno · ${state.limits.session_mb} MB por sesión`;
  const signature = JSON.stringify(state.messages);
  if (signature !== renderedMessages) {
    $("#messages")
      .querySelectorAll(".dynamic-message")
      .forEach((el) => el.remove());
    state.messages.forEach((message) => {
      const article = node(
        "article",
        `message dynamic-message ${message.role}${message.error ? " error" : ""}`,
      );
      if (message.role === "assistant")
        article.append(node("div", "message-avatar", "✦"));
      const body = node("div", "message-body");
      body.append(
        node(
          "span",
          "message-author",
          message.role === "assistant" ? "GUÍA DE LA ISLA" : "TÚ",
        ),
      );
      body.append(node("div", "bubble", message.content));
      article.append(body);
      $("#messages").append(article);
    });
    renderedMessages = signature;
    $("#messages").scrollTop = $("#messages").scrollHeight;
  }
  $("#file-list").replaceChildren();
  const labels = {
    queued: "En cola",
    processing: "Leyendo material…",
    ready: "Listo para preparar",
    needs_review: "Necesita una versión legible",
    error: "No se pudo procesar",
  };
  state.files.forEach((file) => {
    const li = node("li", "file-item");
    li.append(
      node(
        "span",
        "file-icon",
        file.name.split(".").pop().slice(0, 4).toUpperCase(),
      ),
    );
    const info = node("div", "file-info");
    info.append(node("span", "file-name", file.name));
    const status = node(
      "span",
      `file-status ${["error", "needs_review"].includes(file.status) ? "error" : ""}`,
      labels[file.status],
    );
    if (["queued", "processing"].includes(file.status))
      status.classList.add("busy");
    info.append(status);
    if (file.error) info.append(node("span", "file-status error", file.error));
    if (file.status === "ready") {
      const review = node("button", "file-review", "Ver texto y referencias");
      review.addEventListener("click", () => showText(file.id));
      info.append(review);
    }
    const remove = node("button", "file-remove", "×");
    remove.setAttribute("aria-label", `Eliminar ${file.name}`);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await api(`/api/files/${file.id}`, { method: "DELETE" });
        await refresh();
        notify(
          "Archivo y contenido derivado eliminados. Se conservan tus preferencias.",
        );
      } catch (error) {
        notify(error.message, true);
        remove.disabled = false;
      }
    });
    li.append(info, remove);
    $("#file-list").append(li);
  });
  const pending = state.files.some((file) =>
    ["queued", "processing"].includes(file.status),
  );
  const invalid = state.files.some((file) =>
    ["needs_review", "error"].includes(file.status),
  );
  const hasFiles = state.files.length > 0;
  $("#material-empty").hidden = hasFiles;
  $("#generate-button").disabled =
    generating ||
    chatting ||
    uploading ||
    !hasFiles ||
    pending ||
    invalid ||
    !state.ai_available;
  $("#send-button").disabled = chatting || generating;
  $("#chat-attach").disabled = uploading;
  $("#generate-button").classList.toggle("busy", generating);
  $("#generation-description").textContent = generating
    ? "Preparando contenido y comprobando sus referencias…"
    : uploading
      ? "Estamos subiendo tus archivos. Espera a que termine la carga."
      : !state.ai_available
        ? "Falta configurar la clave de IA en el servidor o activar el modo local."
    : pending
      ? "Estamos leyendo tus archivos. Puedes seguir conversando."
      : invalid
        ? "Revisa los archivos señalados antes de preparar el contenido."
        : hasFiles
          ? "Tu material está listo. Pulsa Generar juego; después aparecerá Explorar mis mundos."
          : "Adjunta material para preparar el contenido de tu aventura.";
  $("#generation-status").textContent = state.package
    ? `Contenido preparado · ${state.package.topics.length} tema(s) · ${state.package.sources.length} referencia(s). ${state.package.engine?.worlds?.length ? `${state.package.engine.worlds.length} mundo(s) listos para explorar.` : "Vuelve a generar para crear los mundos de exploración."}`
    : state.generation_status === "error"
      ? "La preparación no terminó. Revisa el mensaje de error y vuelve a intentarlo."
      : "";
  $("#download-package").hidden = !state.package;
  $("#play-button").hidden = !state.package?.engine?.worlds?.length;
  $("#chat-upload-status").textContent = uploading
    ? "Preparando y subiendo tus archivos…"
    : pending
      ? "Leyendo tus archivos. Puedes seguir escribiendo aquí."
      : hasFiles
        ? `${state.files.length} archivo(s) adjunto(s). Puedes revisar su estado en Mi material.`
        : "Adjunta tus apuntes aquí y escribe qué quieres practicar.";
  $("#upload-status").textContent = uploading
    ? "Subiendo archivos…"
    : pending
      ? "La lectura puede tardar un momento."
      : "";
}

async function upload(files, folder = false) {
  if (uploading || !state) return;
  const allowed = /\.(pdf|png|jpe?g|webp|docx|pptx)$/i;
  const all = [...files];
  const supported = all.filter((file) => allowed.test(file.name));
  const omitted = all.length - supported.length;
  if (!folder && omitted) {
    notify("Formato no admitido. Usa PDF, JPG, PNG, WebP, DOCX o PPTX.", true);
    return;
  }
  if (!supported.length) {
    notify("No hay archivos compatibles en esta selección.", true);
    return;
  }
  if (supported.length + state.files.length > state.limits.files) {
    notify(
      `La selección supera el máximo de ${state.limits.files} archivos.`,
      true,
    );
    return;
  }
  uploading = true;
  render();
  let added = 0;
  try {
    const limit = state.limits.file_mb * 1024 ** 2;
    const large = supported.filter((file) => file.size > limit);
    if (large.some((file) => !/\.(png|jpe?g|webp)$/i.test(file.name))) {
      throw new Error(`Los documentos admiten hasta ${state.limits.file_mb} MB cada uno. Divide los documentos grandes antes de adjuntarlos.`);
    }
    if (large.some((file) => file.size > 20 * 1024 ** 2)) {
      throw new Error("Las imágenes que quieras optimizar deben pesar como máximo 20 MB cada una.");
    }
    if (large.length && !(await confirmImageOptimization(large))) {
      notify("Carga cancelada. No se subió ningún archivo de esta selección.");
      return;
    }
    // Una petición por archivo mantiene las cargas pequeñas al atravesar el proxy de la web.
    for (const file of supported) {
      const body = new FormData();
      const prepared = await prepareImage(file);
      body.append("files", prepared);
      await api("/api/files", { method: "POST", body });
      added += 1;
    }
    await refresh();
    notify(
      `${supported.length} archivo(s) añadido(s).${omitted ? ` Se omitieron ${omitted} formatos no compatibles de la carpeta.` : ""}`,
    );
  } catch (error) {
    notify(`${added ? `${added} archivo(s) se guardaron antes del error. ` : ""}${error.message}`, true);
    await refresh().catch(() => {});
  } finally {
    uploading = false;
    $("#file-input").value = "";
    $("#folder-input").value = "";
    render();
  }
}

$("#file-input").addEventListener("change", (event) =>
  upload(event.target.files),
);
$("#folder-input").addEventListener("change", (event) =>
  upload(event.target.files, true),
);
$("#chat-attach").addEventListener("click", () => $("#file-input").click());
["dragenter", "dragover"].forEach((name) =>
  $("#chat-form").addEventListener(name, (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    $("#chat-form").classList.add("dragover");
  }),
);
["dragleave", "drop"].forEach((name) =>
  $("#chat-form").addEventListener(name, (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    $("#chat-form").classList.remove("dragover");
  }),
);
$("#chat-form").addEventListener("drop", (event) => {
  if (event.dataTransfer?.files.length) upload(event.dataTransfer.files);
});
if ("webkitdirectory" in document.createElement("input"))
  $("#folder-button").hidden = false;
$("#folder-button").addEventListener("click", () => $("#folder-input").click());
function showMaterials() {
  $("#materials").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#material-title").focus({ preventScroll: true });
}
$("#nav-material").addEventListener("click", showMaterials);
document.querySelectorAll("[data-prompt]").forEach((button) =>
  button.addEventListener("click", () => {
    $("#message-input").value = button.dataset.prompt;
    $("#message-input").focus();
  }),
);
$("#message-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("#chat-form").requestSubmit();
  }
});
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#message-input").value.trim();
  if (!message || chatting || generating) return;
  chatting = true;
  $("#send-button").classList.add("busy");
  render();
  try {
    state = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    $("#message-input").value = "";
  } catch (error) {
    notify(error.message, true);
    await refresh().catch(() => {});
  } finally {
    chatting = false;
    $("#send-button").classList.remove("busy");
    render();
  }
});
$("#generate-button").addEventListener("click", async () => {
  if (generating) return;
  generating = true;
  render();
  try {
    state = await api("/api/generate", { method: "POST", body: "{}" });
    notify(
      "Mundos preparados. Pulsa Explorar mis mundos para comenzar.",
    );
  } catch (error) {
    notify(error.message, true);
    await refresh().catch(() => {});
  } finally {
    generating = false;
    render();
  }
});

function openModal(title, content) {
  $("#modal-title").textContent = title;
  $("#modal-content").replaceChildren(content);
  $("#modal").showModal();
}
$("#close-modal").addEventListener("click", () => $("#modal").close());
$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) {
    const box = $("#modal").getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      $("#modal").close();
  }
});

async function showText(id) {
  try {
    const file = await api(`/api/files/${id}/text`);
    const content = node("div");
    file.notes.forEach((note) => content.append(node("p", "muted", note)));
    file.pages.forEach((page) => {
      const section = node("section", "extracted-page");
      section.append(
        node(
          "h3",
          "",
          `${page.page ? `Página / diapositiva ${page.page}` : "Documento sin paginación"} · ${page.method === "ocr" ? "OCR automático" : "Texto extraído"}`,
        ),
        node("p", "", page.text),
      );
      content.append(section);
    });
    openModal(file.name, content);
  } catch (error) {
    notify(error.message, true);
  }
}
function showPreferences() {
  if (!state) return;
  const content = $("#preferences-template").content.cloneNode(true);
  openModal("A tu manera", content);
  const form = $("#preferences-form");
  ["nickname", "education_level", "difficulty"].forEach((key) => {
    form.elements[key].value = state.preferences[key] || "";
  });
  const topics = new Set([
    ...(state.package?.topics || []).map((topic) => topic.name),
    ...Object.keys(state.preferences.topic_difficulty),
  ]);
  topics.forEach((topic) => {
    const label = node("label", "", topic);
    const select = node("select");
    select.dataset.topic = topic;
    [
      ["", "Usar dificultad general"],
      ["facil", "Fácil"],
      ["media", "Media"],
      ["dificil", "Difícil"],
    ].forEach(([value, text]) => {
      const option = node("option", "", text);
      option.value = value;
      select.append(option);
    });
    select.value = state.preferences.topic_difficulty[topic] || "";
    label.append(select);
    $("#topic-preferences").append(label);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prefs = { ...state.preferences, topic_difficulty: {} };
    ["nickname", "education_level", "difficulty"].forEach((key) => {
      prefs[key] = form.elements[key].value.trim() || null;
    });
    form.querySelectorAll("[data-topic]").forEach((select) => {
      if (select.value)
        prefs.topic_difficulty[select.dataset.topic] = select.value;
    });
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      state = await api("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      $("#modal").close();
      render();
      notify("Preferencias guardadas.");
    } catch (error) {
      notify(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
}
$("#nav-preferences").addEventListener("click", showPreferences);
$("#mobile-settings").addEventListener("click", showPreferences);
$("#help-button").addEventListener("click", () => {
  const content = node("div");
  const list = node("ol");
  [
    "Adjunta material de estudio. Revisa el texto extraído si contiene fórmulas o escritura a mano.",
    "Cuéntale al asistente qué quieres practicar. Puedes ajustar apodo, curso y dificultades en Preferencias.",
    "Pulsa Generar juego y después Explorar mis mundos. Resuelve los retos y revisa las explicaciones con sus fuentes.",
    "Explora un mundo por materia, recoge y coloca piezas de tus apuntes, repara el puente y enciende el faro. Algunos encuentros incluyen preguntas breves. El progreso no es una calificación escolar.",
  ].forEach((text) => list.append(node("li", "", text)));
  content.append(
    list,
    node(
      "p",
      "muted",
      "Modo local: extracción real y reglas básicas, sin conversación generativa. El modo IA requiere una credencial de servidor y puede tener costo. No hay consulta externa ni alineación curricular verificada.",
    ),
  );
  openModal("El comienzo de tu aventura", content);
});
$("#privacy-button").addEventListener("click", () => {
  const content = node("div");
  [
    `Usa un apodo y evita adjuntar nombres, direcciones, notas personales o información de otras personas. Esta sesión no requiere una cuenta.`,
    `Los originales se eliminan al terminar la lectura. El texto extraído, la conversación y la configuración se guardan en el servidor hasta ${state?.limits.retention_hours || 24} horas desde el inicio de la sesión; después se eliminan automáticamente.`,
    "En modo local el procesamiento ocurre en este servidor. Si se activa OpenAI o Gemini, se envían fragmentos extraídos y mensajes al proveedor. Su retención se rige además por las condiciones de la cuenta del proveedor.",
    "Eliminar un archivo borra su extracción, la conversación y la configuración derivada; conserva las preferencias. Borrar la sesión elimina todos sus datos. No hay enlaces públicos ni documentos compartidos.",
    `Límites por sesión: ${state?.limits.generations || 10} preparaciones y ${state?.limits.chat || 60} mensajes. Se contabilizan también los intentos fallidos para limitar el consumo.`,
  ].forEach((text) => content.append(node("p", "", text)));
  const remove = node("button", "danger-button", "Borrar toda mi sesión");
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await api("/api/session", { method: "DELETE" });
      state = await api("/api/session", { method: "POST", body: "{}" });
      $("#modal").close();
      render();
      notify("Tu sesión anterior se eliminó.");
    } catch (error) {
      notify(error.message, true);
      remove.disabled = false;
    }
  });
  content.append(remove);
  openModal("Tus datos, bajo tu control", content);
});

async function poll() {
  if (
    polling ||
    document.hidden ||
    !state ||
    !state.files.some((file) => ["queued", "processing"].includes(file.status))
  )
    return;
  polling = true;
  try {
    await refresh();
  } catch (error) {
    notify(error.message, true);
  } finally {
    polling = false;
  }
}
$("#footer-help").addEventListener("click", () => $("#help-button").click());
$("#footer-privacy").addEventListener("click", () =>
  $("#privacy-button").click(),
);
api("/api/session", { method: "POST", body: "{}" })
  .then((data) => {
    state = data;
    render();
  })
  .catch((error) => {
    $("#mode-label").textContent = "No se pudo iniciar la sesión";
    notify(error.message, true);
  });
setInterval(poll, 1500);


function confirmImageOptimization(files) {
  const dialog = $("#image-upload-dialog");
  $("#image-upload-description").textContent = `Estas imágenes superan los ${state.limits.file_mb} MB por archivo:`;
  $("#image-upload-list").replaceChildren(...files.map((file) => node("li", "", `${file.name} · ${(file.size / 1024 ** 2).toFixed(1)} MB`)));
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "optimize"), { once: true });
    dialog.showModal();
  });
}

async function prepareImage(file) {
  const limit = state.limits.file_mb * 1024 ** 2;
  if (file.size <= limit) return file;
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error(`Cada archivo admite ${state.limits.file_mb} MB. Divide los documentos grandes antes de adjuntarlos.`);
  }
  if (file.size > 20 * 1024 ** 2) throw new Error("Para optimizar una imagen, el original debe pesar como máximo 20 MB.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Imagen demasiado grande. Exporta una copia de menor resolución.");
    const canvas = document.createElement("canvas");
    // Preserve full resolution first; only downsample if necessary for the upload.
    const initialScale = Math.min(1, Math.sqrt(19_900_000 / (bitmap.width * bitmap.height)));
    for (const factor of [1, .85, .7, .5]) {
      const scale = initialScale * factor;
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .9));
      if (blob && blob.size <= limit) return new File([blob], file.name.replace(/\.[^.]+$/, "-optimizada.jpg"), {type: "image/jpeg"});
    }
    throw new Error("No logramos reducir esta imagen sin bajar demasiado su detalle. Divídela en secciones legibles.");
  } finally {
    bitmap?.close();
  }
}

let adventure = null;
$("#play-button").addEventListener("click", async () => {
  if (!state.package?.engine?.worlds?.length || adventure) return;
  try {
    const { launchAdventure } = await import("/static/game.mjs");
    if (!adventure) adventure = launchAdventure(state.package, () => { adventure = null; $("#play-button").focus(); });
  } catch (error) {
    notify("No se pudo abrir el mundo. Recarga la página y vuelve a intentarlo.", true);
  }
});
