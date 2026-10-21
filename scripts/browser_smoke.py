"""Recorrido real en Chromium. No llama a proveedores de IA ni usa datos del usuario."""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results'


def main():
    OUTPUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        env = dict(os.environ, EDU_DATA_DIR=directory, EDU_AI_MODE='local', EDU_AI_API_KEY='',
                   EDU_PUBLIC_ORIGIN='', EDU_COOKIE_SECURE='false')
        proc = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1',
                                 '--port', str(port), '--no-access-log'], cwd=ROOT, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(60):
                try:
                    urllib.request.urlopen(base + '/api/health', timeout=1).close(); break
                except OSError:
                    time.sleep(.1)
            else:
                raise AssertionError('El servidor no inició')
            with fitz.open() as doc:
                page = doc.new_page(); page.insert_text((50, 70), 'Suma y resta de numeros enteros. La suma combina cantidades. La resta calcula la diferencia.')
                material = doc.tobytes()
            with sync_playwright() as pw:
                executable = os.getenv('CHROMIUM_PATH') or shutil.which('chromium')
                browser = pw.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
                for name, width, height in [('desktop', 1440, 1050), ('tablet', 820, 1180), ('mobile', 390, 844)]:
                    context = browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True)
                    page = context.new_page(); errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base); expect(page.get_by_text('Modo local · sin IA generativa')).to_be_visible()
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    if os.getenv('AXE_SCRIPT'):
                        # DevTools eval solo para instrumentar la auditoría; no modifica la CSP de la app.
                        page.evaluate(Path(os.environ['AXE_SCRIPT']).read_text())
                        audit = page.evaluate("async () => await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})")
                        assert not audit['violations'], [(v['id'], [n['target'] for n in v['nodes']]) for v in audit['violations']]
                        print(f'PASS accesibilidad automatizada {name}: 0 infracciones detectadas', flush=True)
                    expect(page.locator('#generate-button')).to_be_disabled()
                    page.screenshot(path=str(OUTPUT / f'{name}.png'), full_page=True)
                    page.locator('#file-input').set_input_files([
                        {'name': 'matematicas.pdf', 'mimeType': 'application/pdf', 'buffer': material},
                        {'name': 'dañado.pdf', 'mimeType': 'application/pdf', 'buffer': b'not a PDF'},
                    ])
                    expect(page.locator('#toast')).to_contain_text('1 archivo(s) se guardaron antes del error')
                    expect(page.locator('#file-count')).to_have_text('1 / 20')
                    expect(page.get_by_text('Listo para preparar', exact=True)).to_be_visible(timeout=15000)
                    page.locator('#message-input').fill('Llámame Luna. Sumas fáciles y restas difíciles.')
                    page.locator('#send-button').click()
                    expect(page.locator('.dynamic-message.assistant')).to_contain_text('Luna')
                    page.reload(); expect(page.locator('.dynamic-message.assistant')).to_contain_text('resta: dificil')
                    page.locator('#generate-button').click()
                    expect(page.locator('#generation-status')).to_contain_text('Contenido preparado', timeout=15000)
                    with page.expect_download() as download:
                        page.locator('#download-package').click()
                    package = json.loads(Path(download.value.path()).read_text())
                    assert package['engine']['status'] == 'not_integrated'
                    assert package['preferences']['topic_difficulty'] == {'Suma': 'facil', 'Resta': 'dificil'}
                    page.get_by_text('Ver texto y referencias').click()
                    expect(page.locator('#modal')).to_be_visible()
                    expect(page.locator('.extracted-page')).to_contain_text('La suma combina cantidades')
                    page.keyboard.press('Escape'); expect(page.locator('#modal')).not_to_be_visible()
                    page.locator('#mobile-settings').click()
                    if os.getenv('AXE_SCRIPT'):
                        page.evaluate(Path(os.environ['AXE_SCRIPT']).read_text())
                        audit = page.evaluate("async () => await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})")
                        assert not audit['violations'], [(v['id'], [n['target'] for n in v['nodes']]) for v in audit['violations']]
                    page.locator('[name="nickname"]').fill('Sol')
                    page.get_by_role('button', name='Guardar preferencias').click()
                    expect(page.locator('#download-package')).to_be_hidden()
                    page.locator('#message-input').fill('<img src=x onerror=alert(1)>')
                    page.locator('#send-button').click()
                    expect(page.locator('.dynamic-message.user').last).to_contain_text('<img src=x onerror=alert(1)>')
                    expect(page.locator('.dynamic-message.user img')).to_have_count(0)
                    page.get_by_role('button', name='Eliminar matematicas.pdf').click()
                    expect(page.locator('#file-count')).to_have_text('0 / 20')
                    page.locator('#footer-privacy').click()
                    page.get_by_role('button', name='Borrar toda mi sesión').click()
                    expect(page.locator('#modal')).not_to_be_visible()
                    expect(page.locator('.dynamic-message')).to_have_count(0)
                    assert not errors, errors
                    print(f'PASS {name}: carga, chat, preferencias persistentes, generación, descarga, fuentes, XSS y eliminación', flush=True)
                    context.close()
                browser.close()
        finally:
            proc.terminate(); proc.wait(timeout=10)


if __name__ == '__main__':
    main()
