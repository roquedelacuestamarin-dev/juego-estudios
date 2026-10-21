import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function backendOrigin(value) {
  if (!value) throw new Error("Configura EDU_BACKEND_ORIGIN en Vercel con la dirección HTTPS del servidor de Render.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" || url.port || !url.hostname.includes(".") ||
      url.hostname.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
    throw new Error("EDU_BACKEND_ORIGIN debe ser un origen HTTPS público, sin credenciales, puerto, ruta ni parámetros.");
  }
  return url.origin;
}

export async function build(value, destination = path.join(root, ".vercel/output")) {
  const backend = backendOrigin(value);
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.join(destination, "static"), { recursive: true });
  await cp(path.join(root, "app/static"), path.join(destination, "static/static"), { recursive: true });
  await cp(path.join(root, "app/static/index.html"), path.join(destination, "static/index.html"));
  const config = {
    version: 3,
    routes: [
      {
        src: "/(.*)",
        headers: {
          "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Cache-Control": "no-store",
          "X-Frame-Options": "DENY"
        },
        continue: true
      },
      { src: "/api/(.*)", dest: `${backend}/api/$1` },
      { handle: "filesystem" }
    ]
  };
  await writeFile(path.join(destination, "config.json"), JSON.stringify(config, null, 2) + "\n");
  console.log("Web estática y conexión al servidor preparadas. El OCR se ejecutará en el servidor externo.");
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await build(process.env.EDU_BACKEND_ORIGIN);
}
