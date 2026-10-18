"""Chapter organization and safe catalog regeneration regressions."""
from contextlib import redirect_stdout
from copy import deepcopy
import importlib.util
import io
from itertools import product
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from check_content import ROOT, validate_chapter_groups


STRUCTURE_IDS = {
    'arrays-hashing', 'strings', 'matrix', 'linked-reversal', 'linked-fast-slow',
    'stack-queue', 'monotonic', 'heap', 'tree-recursion', 'tree-traversal',
    'binary-search-tree', 'graphs', 'trie',
}
ALGORITHM_IDS = {
    'two-pointers', 'sliding-window', 'prefix-sums', 'binary-search',
    'backtracking-subsets', 'backtracking-combinations', 'dp-foundations',
    'knapsack', 'dp-two-dimensions', 'dp-state-machine', 'dp-interval',
    'dp-tree', 'greedy-intervals', 'bits-trie',
}


class ChapterOrganizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))

    def test_two_ordered_groups_classify_every_topic_once(self):
        chapters = self.catalog['chapters']
        validate_chapter_groups(chapters)
        self.assertEqual({c['id'] for c in chapters if c['group'] == '数据结构'}, STRUCTURE_IDS)
        self.assertEqual({c['id'] for c in chapters if c['group'] == '算法'}, ALGORITHM_IDS)
        self.assertEqual(len(chapters), 27)
        by_id = {c['id']: c for c in chapters}
        self.assertEqual(by_id['bits-trie']['problemIds'], ['single-number', 'number-of-1-bits'])
        self.assertEqual(by_id['trie']['problemIds'], ['implement-trie-prefix-tree'])
        self.assertNotIn('Trie', by_id['bits-trie']['overview'])
        self.assertNotIn('位运算', by_id['trie']['overview'])

    def test_content_check_rejects_unknown_duplicate_and_interleaved_groups(self):
        for invalid in ('unknown', 'duplicate', 'interleaved', 'order', 'mixed-bits'):
            with self.subTest(invalid=invalid):
                chapters = deepcopy(self.catalog['chapters'])
                if invalid == 'unknown':
                    chapters[0]['group'] = '基础结构'
                elif invalid == 'duplicate':
                    chapters[1]['id'] = chapters[0]['id']
                elif invalid == 'interleaved':
                    chapters[0]['group'], chapters[-1]['group'] = chapters[-1]['group'], chapters[0]['group']
                elif invalid == 'order':
                    chapters[0]['order'] = 99
                else:
                    next(c for c in chapters if c['id'] == 'bits-trie')['problemIds'].append('implement-trie-prefix-tree')
                with self.assertRaises(AssertionError):
                    validate_chapter_groups(chapters)

    def test_generator_roundtrip_preserves_problems_and_all_chinese_overlays(self):
        spec = importlib.util.spec_from_file_location('catalog_roundtrip', ROOT / 'scripts/build_catalog.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, data = root / 'source', root / 'data'
            source.mkdir()
            # Imported originals are enough for a portable regeneration test;
            # their assets already use stable /content/ URLs.
            for note in self.catalog['notes']:
                shutil.copy2(ROOT / 'data' / note['path'], source / Path(note['path']).name)
            shutil.copytree(ROOT / 'data/translations', data / 'translations')
            with patch.object(builder, 'ROOT', root), \
                 patch.object(sys, 'argv', ['build_catalog.py', '--source', str(source)]), \
                 patch.object(builder, 'validate_references', return_value=0) as reference_checks, \
                 redirect_stdout(io.StringIO()):
                builder.main()
            # Structural regeneration exercises no reference solutions or judge.
            reference_checks.assert_called_once_with()
            rebuilt = json.loads((data / 'catalog.json').read_text(encoding='utf-8'))
            self.assertEqual(rebuilt['chapters'], self.catalog['chapters'])
            self.assertEqual(rebuilt['problems'], self.catalog['problems'])
            self.assertEqual(len(rebuilt['problems']), 66)
            self.assertEqual(sum(len(p['tests']) for p in rebuilt['problems']), 1997)
            self.assertEqual(len(rebuilt['notes']), 30)
            for before, after in zip(self.catalog['notes'], rebuilt['notes']):
                with self.subTest(note=before['id']):
                    self.assertEqual({k: v for k, v in before.items() if k != 'sourcePath'},
                                     {k: v for k, v in after.items() if k != 'sourcePath'})
                    self.assertTrue(after.get('chinesePath'))
                    for field in ('path', 'chinesePath'):
                        self.assertEqual((ROOT / 'data' / before[field]).read_bytes(),
                                         (data / after[field]).read_bytes())

    def test_rain_water_is_one_problem_shared_by_both_approaches(self):
        problems = [p for p in self.catalog['problems'] if p['number'] == 42]
        self.assertEqual(len(problems), 1)
        problem = problems[0]
        self.assertEqual((problem['id'], problem['title'], problem['method'], problem['difficulty']),
                         ('trapping-rain-water', '接雨水', 'trap', 'Hard'))
        self.assertEqual(problem['examples'], [
            {'args': [[0,1,0,2,1,0,1,3,2,1,2,1]], 'expected': 6},
            {'args': [[4,2,0,3,2,5]], 'expected': 9},
        ])
        self.assertIn('240224-opposite-double-pointer', problem['sourceNoteIds'])
        self.assertEqual({c['id'] for c in self.catalog['chapters'] if problem['id'] in c['problemIds']},
                         {'two-pointers', 'monotonic'})
        cases = {tuple(case['args'][0]): case['expected'] for case in problem['tests']}
        for height, expected in [
            ([0], 0), ([1,0], 0), ([0,1,2,3], 0), ([3,2,1,0], 0),
            ([3,1,1,3], 4), ([5,4,1,2], 1), ([3,0,2,0,4], 7),
            ([100000]+[0]*19998+[100000], 1999800000),
            (list(range(20000)), 0), ([100000,0]*10000, 999900000),
        ]:
            self.assertEqual(cases[tuple(height)], expected)

    def test_problem_only_rebuild_does_not_import_changed_blog_notes(self):
        spec = importlib.util.spec_from_file_location('preserve_notes_catalog', ROOT / 'scripts/build_catalog.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data').mkdir()
            target = root / 'data/catalog.json'
            target.write_text(json.dumps(self.catalog), encoding='utf-8')
            with patch.object(builder, 'ROOT', root), \
                 patch.object(sys, 'argv', ['build_catalog.py', '--keep-notes']), \
                 patch.object(builder, 'import_notes') as import_notes, \
                 patch.object(builder, 'validate_references', return_value=0), \
                 redirect_stdout(io.StringIO()):
                builder.main()
            import_notes.assert_not_called()
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), self.catalog)

    def test_rain_water_reference_and_oracle_match_horizontal_water_layers(self):
        spec = importlib.util.spec_from_file_location('rain_water_catalog', ROOT / 'scripts/build_catalog.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        problem = next(p for p in self.catalog['problems'] if p['number'] == 42)
        namespace = {}
        # Only the maintained reference is executed here; user code stays in Docker.
        exec(problem['solution'], namespace)
        solve = namespace['Solution']().trap

        def water_layers(height):
            # Count water cells row by row between the outermost walls.
            volume = 0
            for level in range(1, max(height) + 1):
                walls = [i for i, h in enumerate(height) if h >= level]
                if len(walls) >= 2:
                    volume += sum(h < level for h in height[walls[0]:walls[-1]+1])
            return volume

        for length in range(1, 8):
            for height in product(range(3), repeat=length):
                expected = water_layers(height)
                self.assertEqual(solve(list(height)), expected, height)
                self.assertEqual(builder.rain_water_oracle(height), expected, height)
        for case in problem['tests']:
            height, = case['args']
            if max(height) <= 30:
                self.assertEqual(case['expected'], water_layers(height), height)


if __name__ == '__main__':
    unittest.main()
