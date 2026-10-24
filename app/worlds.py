"""Compile source-linked study material into bounded, playable world missions."""
import re
import unicodedata
from collections import OrderedDict

from app.models import World, Mission


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if not unicodedata.combining(c))


SUBJECTS = [
    ('matematicas', 'Matemáticas', 'crystal', 'Cumbres del equilibrio', r'\bsuma\w*|\bresta\w*|\bfraccion\w*|\becuacion\w*|\bgeometr\w*|\bmultiplica\w*|\bdivision\w*|\bmatematic\w*'),
    ('ciencias', 'Ciencias', 'forest', 'Bosque de las raíces', r'\bfotosintesis\b|\becosistema\w*|\bcelula\w*|\bplantas?\b|\bbiolog\w*|\benergia\b|\boxigeno\b|\bciencia\w*'),
    ('historia', 'Historia', 'ruins', 'Archipiélago de las memorias', r'\bhistoria\b|\bindependencia\b|\bcivilizacion\w*|\bsiglo\w*|\bimperio\w*|\brevolucion\w*'),
    ('lenguaje', 'Lenguaje', 'autumn', 'Valle de las palabras', r'\bnarrador\b|\bpoesia\b|\bcuento\w*|\bgramatica\b|\bliteratura\b|\bcomprension lectora\b'),
    ('geografia', 'Geografía', 'coast', 'Costa de los horizontes', r'\bgeografia\b|\bcontinente\w*|\bcordillera\w*|\bclima\w*|\boceano\w*|\bmapas?\b'),
]


def create_worlds(sources, activities):
    groups = OrderedDict()
    fallback = ('exploracion', 'Tu material', 'meadow', 'Islas del descubrimiento', '')
    for source in sources:
        current = next((s for s in SUBJECTS if re.search(s[4], normalized(source.filename))), fallback)
        per_subject = OrderedDict()
        for sentence in re.split(r'(?<=[.!?])\s+|\n+', source.excerpt):
            # Keep nearby unlabelled explanations with their preceding subject.
            current = next((s for s in SUBJECTS if re.search(s[4], normalized(sentence))), current)
            per_subject.setdefault(current[:4], []).append(sentence)
        for subject, sentences in per_subject.items():
            groups.setdefault(subject, []).append(source.model_copy(update={'excerpt': ' '.join(sentences)}))
    memberships = {}
    for fragments in groups.values():
        for source in fragments:
            memberships[source.id] = memberships.get(source.id, 0) + 1
    worlds = []
    for (key, subject, biome, title), fragments in groups.items():
        ids = {s.id for s in fragments}
        group_text = normalized(' '.join(s.excerpt for s in fragments))
        subject_pattern = next((s[4] for s in SUBJECTS if s[0] == key), None)
        relevant = [a for a in activities if set(a.source_ids) & ids and
                    (all(memberships.get(ref, 0) <= 1 for ref in a.source_ids) or normalized(a.explanation) in group_text or
                     (subject_pattern and re.search(subject_pattern, normalized(a.prompt + ' ' + a.explanation))))]
        sentences = [(s, sentence.strip()) for s in fragments
                     for sentence in re.split(r'(?<=[.!?])\s+|\n+', s.excerpt)
                     if 30 <= len(sentence.strip()) <= 240 and len(sentence.split()) >= 6]
        if not sentences:
            # A shorter but readable source can still supply a reconstruction puzzle.
            sentences = [(s, s.excerpt.strip()) for s in fragments
                         if 20 <= len(s.excerpt.strip()) <= 240 and len(s.excerpt.split()) >= 4]
        if not sentences:
            continue
        source, sentence = sentences[0]
        words = sentence.split()
        cut1, cut2 = max(1, len(words)//3), max(2, 2*len(words)//3)
        parts = [' '.join(words[:cut1]), ' '.join(words[cut1:cut2]), ' '.join(words[cut2:])]
        if len(set(parts)) != 3:
            continue
        missions = [Mission(kind='order', title='Reconstruye el sendero',
            instruction='Recupera las tres piezas de una idea de tus apuntes y llévalas al taller en el orden en que forman una explicación coherente.',
            items=parts, solution=[0, 1, 2], explanation=sentence, source_ids=[source.id])]
        arithmetic = None
        if key == 'matematicas':
            for fragment in fragments:
                for match in re.finditer(r'(?<![\d.,-])(\d{1,2})\s*([+\-×*])\s*(\d{1,2})\s*=\s*(\d{1,2})(?!\d|[.,]\d)', fragment.excerpt):
                    a, op, b, result = match.groups()
                    expected = int(a)+int(b) if op == '+' else int(a)-int(b) if op == '-' else int(a)*int(b)
                    if expected == int(result) and 1 <= expected <= 12:
                        arithmetic = Mission(kind='balance', title='Da energía al puente',
                            instruction=f'El puente necesita {a} {op} {b} unidades de energía. Recoge cristales de 1, 2 o 3 unidades y deposita la cantidad exacta en el taller.',
                            items=['1', '2', '3'], solution=[expected], explanation=f'{a} {op} {b} = {expected}, según tus apuntes.', source_ids=[fragment.id])
                        break
                if arithmetic:
                    break
        if arithmetic:
            missions.append(arithmetic)
        else:
            # Physical delivery of a concept; distractors come from the same document.
            activity = next((a for a in relevant if len(a.answer) <= 70), None)
            if activity:
                answer, prompt, explanation, refs = activity.answer, activity.prompt, activity.explanation, activity.source_ids
            else:
                tokens = re.findall(r'[^\W\d_]{5,}', sentence, re.UNICODE)
                answer = max(tokens, key=len) if tokens else words[len(words)//2]
                prompt = 'Restaura la idea: ' + sentence.replace(answer, '_____', 1)
                explanation, refs = sentence, [source.id]
            candidates = [answer]
            for token in re.findall(r'[^\W\d_]{5,}', ' '.join(s.excerpt for s in fragments), re.UNICODE):
                if normalized(token) not in {normalized(x) for x in candidates}:
                    candidates.append(token)
                if len(candidates) == 3:
                    break
            missions.append(Mission(kind='restore', title='Recupera el concepto perdido', instruction=prompt,
                items=candidates, solution=[0], explanation=explanation, source_ids=refs))
        activity = relevant[-1] if relevant else None
        if activity:
            missions.append(Mission(kind='encounter', title='El encuentro del faro', instruction=activity.prompt,
                items=activity.options, solution=[], answer=activity.answer,
                explanation=activity.explanation, source_ids=activity.source_ids))
        else:
            # A source-derived brief question, only at the final encounter.
            answer = max(words, key=len).strip('.,;:!?')
            missions.append(Mission(kind='encounter', title='El encuentro del faro',
                instruction='Completa esta idea que has reconstruido: ' + sentence.replace(answer, '_____', 1),
                answer=answer, explanation=sentence, source_ids=[source.id]))
        worlds.append(World(id=key, subject=subject, name=title, biome=biome, missions=missions,
                            source_ids=[s.id for s in fragments]))
    return worlds
