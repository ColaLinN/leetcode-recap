#!/usr/bin/env python3
"""Validate curated relationships, test shape and imported content paths."""
import json
from collections import Counter
from pathlib import Path
import re
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def validate_chapter_groups(chapters):
    ids = [chapter['id'] for chapter in chapters]
    assert len(ids) == len(set(ids)), 'Each topic must occur in exactly one group'
    groups = Counter(chapter.get('group') for chapter in chapters)
    assert groups == {'数据结构': 13, '算法': 14}, ('Unexpected chapter groups', groups)
    assert [chapter['group'] for chapter in chapters] == ['数据结构'] * 13 + ['算法'] * 14, 'Chapter group order'
    assert [chapter['order'] for chapter in chapters] == list(range(1, len(chapters) + 1)), 'Chapter order'
    by_id = {chapter['id']: chapter for chapter in chapters}
    assert by_id['bits-trie']['title'] == '位运算'
    assert by_id['bits-trie']['group'] == '算法'
    assert by_id['bits-trie']['problemIds'] == ['single-number', 'number-of-1-bits']
    assert by_id['trie']['title'] == '字典树'
    assert by_id['trie']['group'] == '数据结构'
    assert by_id['trie']['problemIds'] == ['implement-trie-prefix-tree']


def main():
    data = ROOT / 'data'
    catalog = json.loads((data / 'catalog.json').read_text(encoding='utf-8'))
    chapters, problems, notes = (catalog[k] for k in ('chapters', 'problems', 'notes'))
    validate_chapter_groups(chapters)
    for collection in (chapters, problems, notes):
        ids = [item['id'] for item in collection]
        assert len(ids) == len(set(ids)), 'Duplicate IDs'
    assert len({p['number'] for p in problems}) == len(problems), 'Duplicate canonical problems'
    problem_ids, note_ids = {p['id'] for p in problems}, {n['id'] for n in notes}
    linked_problems, linked_notes = set(), set()
    for chapter in chapters:
        assert 1 <= len(chapter['problemIds']) <= 4, chapter['id']
        assert len(chapter['problemIds']) == len(set(chapter['problemIds'])), ('Duplicate problem in topic', chapter['id'])
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
        paths = [note['path']]
        if note.get('chinesePath'):
            paths.append(note['chinesePath'])
            assert note.get('originalTitle'), ('Missing original title', note['id'])
            assert re.search(r'[\u4e00-\u9fff]', note['title']), ('Untranslated note title', note['id'])
            assert {link['url'] for link in note.get('problemLinks', [])} == {
                link['url'] for link in note.get('originalProblemLinks', [])
            }, ('Translated link index differs from original', note['id'])
        for relative_path in paths:
            path = data / relative_path
            assert path.is_file(), (note['id'], relative_path)
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
    print(f'PASS {sum(bool(n.get("chinesePath")) for n in notes)} Chinese notes; {sum(bool(n.get("translationStale")) for n in notes)} translations awaiting source refresh')
    print(f'PASS {local_image_count} local image references; {remote_image_count} original remote image references preserved')


if __name__ == '__main__':
    main()
