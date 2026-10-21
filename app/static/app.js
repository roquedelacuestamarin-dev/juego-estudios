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
  $("#mode-label").replaceChildren(
    node("span", "status-dot"),
    document.createTextNode(
      state.mode === "local"
        ? "Modo local · sin IA generativa"
        : state.ai_available
          ? "Asistente con IA · OpenAI"
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
  $("#generate-button").disabled =
    generating ||
    chatting ||
    uploading ||
    !hasFiles ||
    pending ||
    invalid ||
    !state.ai_available;
  $("#send-button").disabled = chatting || generating;
  $("#generate-button").classList.toggle("busy", generating);
  $("#generation-description").textContent = generating
    ? "Preparando contenido y comprobando sus referencias…"
    : pending
      ? "Estamos leyendo tus archivos. Puedes seguir conversando."
      : invalid
        ? "Revisa los archivos señalados antes de preparar el contenido."
        : hasFiles
          ? "Tu material está listo. Prepararemos el contenido con tus preferencias."
          : "Adjunta material para preparar el contenido de tu aventura.";
  $("#generation-status").textContent = state.package
    ? `Contenido preparado · ${state.package.topics.length} tema(s) · ${state.package.sources.length} referencia(s). El juego aún no está disponible.`
    : state.generation_status === "error"
      ? "La preparación no terminó. Revisa el mensaje de error y vuelve a intentarlo."
      : "";
  $("#download-package").hidden = !state.package;
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
  if (supported.some((file) => file.size > state.limits.file_mb * 1024 ** 2)) {
    notify(`Cada archivo admite hasta ${state.limits.file_mb} MB.`, true);
    return;
  }
  uploading = true;
  render();
  let added = 0;
  try {
    // Una petición por archivo mantiene las cargas pequeñas al atravesar el proxy de la web.
    for (const file of supported) {
      const body = new FormData();
      body.append("files", file);
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
$("#drop-zone").addEventListener("keydown", (event) => {
  if (["Enter", " "].includes(event.key)) {
    event.preventDefault();
    $("#file-input").click();
  }
});
["dragenter", "dragover"].forEach((name) =>
  $("#drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    $("#drop-zone").classList.add("dragover");
  }),
);
["dragleave", "drop"].forEach((name) =>
  $("#drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    $("#drop-zone").classList.remove("dragover");
  }),
);
$("#drop-zone").addEventListener("drop", (event) =>
  upload(event.dataTransfer.files),
);
if ("webkitdirectory" in document.createElement("input"))
  $("#folder-button").hidden = false;
$("#folder-button").addEventListener("click", () => $("#folder-input").click());
$("#nav-material").addEventListener("click", () => {
  $("#materials").scrollIntoView({ behavior: "smooth" });
  $("#drop-zone").focus({ preventScroll: true });
});
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
      "Contenido educativo preparado. El motor del juego sigue pendiente.",
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
    "Suma",
    "Resta",
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
    "Pulsa Generar juego: en esta etapa prepara un paquete educativo con referencias, sin pedir aprobación previa de una historia.",
    "El videojuego, sus misiones y los enlaces compartidos se incorporarán cuando esté conectado el motor.",
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
    "En modo local el procesamiento ocurre en este servidor. Si se activa OpenAI, se envían fragmentos extraídos y mensajes al proveedor. Su retención se rige además por las condiciones de la cuenta del proveedor.",
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
