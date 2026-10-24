from app.models import Source
from app.worlds import create_worlds


def source(id, text):
    return Source(id=id, file_id=id, filename=id+'.pdf', page=1, method='text', excerpt=text)


def test_separate_subjects_and_source_linked_actions():
    sources=[source('a','La suma combina cantidades para obtener un total. Ejemplo: 5 + 3 = 8.'),
             source('b','Las plantas utilizan la luz del sol para realizar la fotosíntesis y liberar oxígeno.'),
             source('c','La historia estudia los cambios de las sociedades a lo largo del tiempo.')]
    worlds=create_worlds(sources,[])
    assert {w.biome for w in worlds} == {'crystal','forest','ruins'}
    for w in worlds:
        assert [m.kind for m in w.missions][0] == 'order'
        assert w.missions[-1].kind == 'encounter'
        assert len([m for m in w.missions if m.kind!='encounter'])==2
        s=next(s for s in sources if s.id in w.source_ids)
        assert ' '.join(w.missions[0].items) in s.excerpt
        assert all(set(m.source_ids)<=set(w.source_ids) for m in w.missions)
    math=next(w for w in worlds if w.biome=='crystal')
    assert math.missions[1].kind=='balance' and math.missions[1].solution==[8]


def test_incorrect_or_large_arithmetic_does_not_create_energy_mission():
    for equation in ['5 + 3 = 99','50 + 30 = 80','5 - 9 = 4','-5 + 3 = 8']:
        world=create_worlds([source('a','La suma combina cantidades para obtener un total. '+equation)],[])[0]
        assert world.missions[1].kind=='restore'


def test_no_readable_explanation_means_no_world():
    assert create_worlds([source('a','123')],[])==[]


def test_mixed_document_creates_separate_worlds_with_matching_ideas():
    worlds=create_worlds([source('mixto', 'La suma combina cantidades para obtener un total. Ejemplo: 5 + 3 = 8. Las plantas utilizan la luz del sol para realizar la fotosíntesis y liberar oxígeno.')], [])
    assert {w.biome for w in worlds} == {'crystal','forest'}
    forest=next(w for w in worlds if w.biome=='forest')
    assert 'plantas' in ' '.join(forest.missions[0].items)
    assert 'suma' not in ' '.join(forest.missions[0].items)
