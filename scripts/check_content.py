#!/usr/bin/env python3
"""Validate curated relationships, test shape and imported content paths."""
import json
from pathlib import Path
import re
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def main():
    data = ROOT / 'data'
    catalog = json.loads((data / 'catalog.json').read_text(encoding='utf-8'))
    chapters, problems, notes = (catalog[k] for k in ('chapters', 'problems', 'notes'))
    for collection in (chapters, problems, notes):
        ids = [item['id'] for item in collection]
        assert len(ids) == len(set(ids)), 'Duplicate IDs'
    assert len({p['number'] for p in problems}) == len(problems), 'Duplicate canonical problems'
    problem_ids, note_ids = {p['id'] for p in problems}, {n['id'] for n in notes}
    linked_problems, linked_notes = set(), set()
    for chapter in chapters:
        assert 2 <= len(chapter['problemIds']) <= 4, chapter['id']
        assert set(chapter['problemIds']) <= problem_ids, chapter['id']
        assert set(chapter['noteIds']) <= note_ids, chapter['id']
        assert chapter.get('overview', '').strip(), ('Missing chapter introduction', chapter['id'])
        linked_problems.update(chapter['problemIds'])
        linked_notes.update(chapter['noteIds'])
    assert linked_problems == problem_ids, ('Orphan problems', problem_ids - linked_problems)
    assert linked_notes == note_ids, ('Orphan notes', note_ids - linked_notes)
    for problem in problems:
        for field in ('statement', 'starter', 'solution', 'explanation', 'sourceUrl', 'constraints', 'examples', 'tests'):
            assert problem.get(field), (problem['id'], field)
        assert set(problem['sourceNoteIds']) <= note_ids, problem['id']
        for case in problem['examples'] + problem['tests']:
            assert isinstance(case['args'], list) and 'expected' in case, problem['id']
        if problem['kind'] == 'design':
            assert problem['className'], problem['id']
            for case in problem['tests']:
                operations, arguments = case['args']
                assert len(operations) == len(arguments) == len(case['expected']), problem['id']
                assert operations[0] == problem['className'], problem['id']
    local_image_count, remote_image_count = 0, 0
    for note in notes:
        path = data / note['path']
        assert path.is_file(), note
        body = path.read_text(encoding='utf-8')
        images = re.findall(r'!\[[^\]]*\]\(([^\n)]+)\)', body)
        images += re.findall(r'<img[^>]+src=[\"\']([^\"\']+)', body)
        for image in images:
            if image.startswith('/content/'):
                assert (data / unquote(image.lstrip('/'))).is_file(), (note['id'], image)
                local_image_count += 1
            elif image.startswith(('https://', 'http://')):
                remote_image_count += 1
            else:
                raise AssertionError(('Unresolved image', note['id'], image))
    print(f'PASS {len(chapters)} chapters / {len(problems)} shared problems / {len(notes)} notes')
    print(f'PASS {sum(len(p["tests"]) for p in problems)} full-suite cases, all chapter/note/problem references')
    print(f'PASS {local_image_count} local image references; {remote_image_count} original remote image references preserved')


if __name__ == '__main__':
    main()
