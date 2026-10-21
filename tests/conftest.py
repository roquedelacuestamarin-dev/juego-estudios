import io
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from app.config import Settings
from app.main import create_app

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def cfg(tmp_path):
    return Settings(data_dir=tmp_path / 'data', tessdata_dir=ROOT / '.runtime/tessdata')


@pytest.fixture
def client(cfg):
    with TestClient(create_app(cfg), headers={'X-Isla-Request': '1'}) as client:
        assert client.post('/api/session', json={}).status_code == 200
        yield client


@pytest.fixture
def pdf():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((60, 70), 'Suma y resta de numeros enteros.\nLa suma combina cantidades. La resta calcula la diferencia.\nEjemplo: 5 + 3 = 8. Ejemplo: 8 - 3 = 5.', fontsize=14)
        return doc.tobytes()


@pytest.fixture
def photo():
    image = Image.new('RGB', (1400, 650), '#f3f0e7')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(ROOT / 'app/static/regular.ttf'), 40)
    for i, text in enumerate(['Apuntes de ciencias', 'La fotosíntesis transforma la energía de la luz.',
                              'Las plantas utilizan agua y dióxido de carbono.', 'Este proceso libera oxígeno.']):
        draw.text((60, 65 + i * 105), text, fill='#242a23', font=font)
    image = image.rotate(1, resample=Image.Resampling.BICUBIC, fillcolor='#f3f0e7')
    output = io.BytesIO(); image.save(output, 'JPEG', quality=88)
    return output.getvalue()
