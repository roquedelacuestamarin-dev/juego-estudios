import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { backendOrigin, build } from "../scripts/build-vercel.mjs";

test("exige un servidor HTTPS explícito y sin credenciales", () => {
  for (const value of [undefined, "http://server.example.com", "https://user:secret@server.example.com", "https://server.example.com/api", "https://localhost", "https://127.0.0.1", "https://server.example.com?key=secret"]) {
    assert.throws(() => backendOrigin(value));
  }
  assert.equal(backendOrigin("https://isla.example.com/"), "https://isla.example.com");
});

test("produce solo la web pública y dirige la API al servidor elegido", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "isla-vercel-"));
  try {
    const config = await build("https://isla.example.com", temp);
    assert.deepEqual(await readdir(temp), ["config.json", "static"]);
    assert.deepEqual(config.routes[1], { src: "/api/(.*)", dest: "https://isla.example.com/api/$1" });
    assert.match(await readFile(path.join(temp, "static/index.html"), "utf8"), /\/static\/app.js/);
    assert.match(await readFile(path.join(temp, "static/static/app.js"), "utf8"), /\/api\/session/);
    const files = await readdir(path.join(temp, "static"), { recursive: true });
    assert.ok(!files.some(name => /\.py$|sqlite|\.env|traineddata/.test(name)));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
