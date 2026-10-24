"""Comprueba la imagen Docker con 512 MB, OCR real y una sesión HTTP privada."""
import subprocess
import uuid


CHECK = r'''
import io,time
import fitz,httpx
from PIL import Image,ImageDraw,ImageFont

with httpx.Client(base_url='http://127.0.0.1:8000',headers={'X-Isla-Request':'1'},timeout=15) as client:
    for attempt in range(100):
        try:
            health=client.get('/api/health')
            if health.status_code==200: break
        except httpx.HTTPError:
            pass
        time.sleep(.1)
    else:
        raise AssertionError('El servidor no inició')
    assert health.json()['ocr_available'] is True
    assert health.json()['engine']=='ready'
    assert 'Isla Saber' in client.get('/').text
    assert client.post('/api/session',json={}).status_code==200
    with fitz.open() as doc:
        page=doc.new_page();page.insert_text((50,70),'Suma y resta de numeros enteros. La suma combina cantidades. La resta calcula diferencias.')
        pdf=doc.tobytes()
    image=Image.new('RGB',(1400,400),'white')
    draw=ImageDraw.Draw(image)
    font=ImageFont.truetype('/app/app/static/regular.ttf',38)
    draw.text((40,40),'La fotosíntesis transforma la energía de la luz.',font=font,fill='black')
    draw.text((40,130),'Las plantas utilizan agua y liberan oxígeno.',font=font,fill='black')
    buffer=io.BytesIO();image.save(buffer,'JPEG')
    response=client.post('/api/files',files=[('files',('apuntes.pdf',pdf)),('files',('foto.jpg',buffer.getvalue()))])
    assert response.status_code==202,response.text
    for attempt in range(200):
        state=client.get('/api/state').json()
        if all(f['status'] not in ('queued','processing') for f in state['files']):break
        time.sleep(.1)
    assert len(state['files'])==2
    assert all(f['status']=='ready' for f in state['files']),state['files']
    source=client.get('/api/files/'+state['files'][1]['id']+'/text').json()
    assert source['pages'][0]['method']=='ocr'
    assert 'fotosíntesis' in source['pages'][0]['text'].lower()
    response=client.post('/api/chat',json={'message':'Llámame Luna. Sumas fáciles y restas difíciles.'})
    assert response.status_code==200,response.text
    result=client.post('/api/generate',json={})
    assert result.status_code==200,result.text
    package=result.json()['package']
    assert package['preferences']['topic_difficulty']=={'Suma':'facil','Resta':'dificil'}
    assert package['engine']['status']=='ready'
    assert client.delete('/api/session').status_code==200
    assert client.get('/api/state').status_code==401
    print('PASS Docker: web, PDF, OCR español, chat, preferencias, paquete con fuentes y borrado; límite 512 MB.')
'''


def main():
    name = 'isla-smoke-' + uuid.uuid4().hex[:10]
    subprocess.run(['docker', 'run', '--rm', '-d', '--name', name, '--memory=512m', '--cpus=1',
                    '-e', 'EDU_MAX_FILE_MB=3', '-e', 'EDU_MAX_SESSION_MB=20',
                    '-e', 'EDU_MAX_PAGES=10', '-e', 'EDU_MAX_TEXT_CHARS=20000',
                    'isla-saber:preview'], check=True, capture_output=True)
    try:
        subprocess.run(['docker', 'exec', '-i', name, '/app/.venv/bin/python', '-'],
                       input=CHECK, text=True, check=True, timeout=60)
    finally:
        subprocess.run(['docker', 'rm', '-f', name], check=False, capture_output=True)


if __name__ == '__main__':
    main()
