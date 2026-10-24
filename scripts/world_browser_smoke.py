"""Play real missions through canvas clicks and DOM controls; no game-state shortcuts."""
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

ROOT=Path(__file__).resolve().parents[1]

def travel(page, world, destination, bridge=False):
    canvas=page.locator('#world-canvas')
    while True:
        x,y=map(int,canvas.get_attribute('data-position').split(','))
        if {'x':x,'y':y}==destination: return
        route=page.evaluate('''async ({world,start,end,bridge})=>{
            const {makeMap,findPath}=await import('/static/game.mjs');
            return findPath(makeMap(world),start,end,bridge);
        }''', {'world':world,'start':{'x':x,'y':y},'end':destination,'bridge':bridge})
        assert route, (world['id'],x,y,destination)
        camx=max(0,min(36*32-960,x*32+16-480))
        camy=max(0,min(26*32-600,y*32+16-300))
        visible=[p for p in route if 4<p['x']*32+16-camx<956 and 4<p['y']*32+16-camy<596]
        point=visible[-1]
        box=canvas.bounding_box()
        canvas.click(position={'x':(point['x']*32+16-camx)*box['width']/960,'y':(point['y']*32+16-camy)*box['height']/600})
        expect(canvas).to_have_attribute('data-position',f"{point['x']},{point['y']}",timeout=15000)


def main():
    with tempfile.TemporaryDirectory() as directory:
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        base=f'http://127.0.0.1:{port}'
        env=dict(os.environ,EDU_DATA_DIR=directory,EDU_AI_MODE='local',EDU_AI_API_KEY='',EDU_PUBLIC_ORIGIN='',EDU_COOKIE_SECURE='false')
        proc=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',str(port),'--no-access-log'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(60):
                try:urllib.request.urlopen(base+'/api/health',timeout=1).close();break
                except OSError:time.sleep(.1)
            with sync_playwright() as pw:
                browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
                page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
                page.on('pageerror',lambda err:errors.append(str(err)))
                page.goto(base)
                expect(page.locator('#mode-label')).to_contain_text('Modo local')
                fixtures=[('matematicas.pdf','La suma combina cantidades para obtener un total. Ejemplo: 5 + 3 = 8.'),('ciencias.pdf','Las plantas utilizan la luz del sol para realizar la fotosintesis y liberar oxigeno.'),('historia.pdf','La historia estudia los cambios de las sociedades a lo largo del tiempo.')]
                files=[]
                for name,text in fixtures:
                    with fitz.open() as doc:
                        p=doc.new_page();p.insert_textbox(fitz.Rect(40,40,550,800),text,fontsize=14)
                        files.append({'name':name,'mimeType':'application/pdf','buffer':doc.tobytes()})
                page.locator('#file-input').set_input_files(files)
                expect(page.get_by_text('Listo para preparar',exact=True)).to_have_count(3,timeout=20000)
                page.locator('#generate-button').click()
                expect(page.locator('#play-button')).to_be_visible(timeout=15000)
                pack=page.evaluate("async()=>await (await fetch('/api/package')).json()")
                page.locator('#play-button').click()
                expect(page.locator('.world-card')).to_have_count(3)
                page.screenshot(path=str(ROOT/'test-results/world-atlas.png'))
                for world in pack['engine']['worlds'][:2]:
                    page.locator('.world-card').filter(has=page.get_by_role('heading',name=world['name'],exact=True)).get_by_role('button').click()
                    m=page.evaluate("async w=>(await import('/static/game.mjs')).makeMap(w)",world)
                    travel(page,world,m['guide']);page.get_by_role('button',name='Interactuar · E').click()
                    expect(page.locator('.adventure-dialogue')).to_contain_text('Hola')
                    page.get_by_role('button',name='Continuar',exact=True).click()
                    page.screenshot(path=str(ROOT/f"test-results/world-{world['id']}.png"))
                    for index,mission in enumerate(world['missions']):
                        if mission['kind']=='encounter':
                            travel(page,world,m['guardian'],True);page.get_by_role('button',name='Interactuar · E').click()
                            pos=page.locator('#world-canvas').get_attribute('data-position')
                            page.keyboard.press('ArrowRight')
                            expect(page.locator('#world-canvas')).to_have_attribute('data-position',pos)
                            page.locator('.adventure-question input').fill('respuesta equivocada')
                            page.get_by_role('button',name='Responder',exact=True).click()
                            expect(page.locator('.adventure-dialogue')).to_contain_text('Todavía no')
                            page.locator('.adventure-question input').fill(mission['answer'])
                            page.get_by_role('button',name='Responder',exact=True).click()
                        else:
                            if mission['kind']=='order':
                                # Wrong piece is rejected without consuming it or granting a star.
                                travel(page,world,m['pickups'][0]);page.get_by_role('button',name='Interactuar · E').click()
                                travel(page,world,m['workshop']);page.get_by_role('button',name='Interactuar · E').click()
                                expect(page.locator('.adventure-status').first).to_contain_text('no encaja')
                                page.get_by_role('button',name='Soltar objeto').click()
                            order=mission['solution'] if mission['kind']!='balance' else [2]*(mission['solution'][0]//3)+([mission['solution'][0]%3-1] if mission['solution'][0]%3 else [])
                            for item in order:
                                travel(page,world,m['pickups'][[2,0,1,3][item]])
                                page.get_by_role('button',name='Interactuar · E').click()
                                travel(page,world,m['workshop']);page.get_by_role('button',name='Interactuar · E').click()
                        expect(page.locator('.adventure-dialogue')).to_contain_text('Misión completada')
                        page.get_by_role('button',name='Continuar',exact=True).click()
                        print('PASS',world['subject'],mission['kind'],flush=True)
                    travel(page,world,m['beacon'],True);page.get_by_role('button',name='Interactuar · E').click()
                    expect(page.locator('.adventure-dialogue')).to_contain_text('Mundo recuperado')
                    page.get_by_role('button',name='Continuar',exact=True).click()
                    page.screenshot(path=str(ROOT/f"test-results/world-{world['id']}-complete.png"))
                    page.get_by_role('button',name='← Mundos',exact=True).click()
                page.get_by_role('button',name='Volver a mis apuntes',exact=True).click()
                page.reload();page.locator('#play-button').click()
                expect(page.get_by_text('★ Faro recuperado',exact=True)).to_have_count(2)
                page.get_by_role('button',name='Volver a mis apuntes',exact=True).click()
                page.locator('#footer-privacy').click();page.get_by_role('button',name='Borrar toda mi sesión').click()
                expect(page.locator('#play-button')).to_be_hidden()
                assert page.evaluate("sessionStorage.getItem('isla-world-progress')") is None
                assert not errors,errors
                print('PASS navegación real, orden incorrecto, energía, concepto, preguntas, faros, recarga y borrado',flush=True)
                browser.close()
        finally:proc.terminate();proc.wait(timeout=10)

if __name__=='__main__':main()
