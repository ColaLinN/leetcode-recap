"""Chapter organization and safe catalog regeneration regressions."""
from contextlib import redirect_stdout
from copy import deepcopy
import importlib.util
import io
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
            self.assertEqual(len(rebuilt['problems']), 65)
            self.assertEqual(sum(len(p['tests']) for p in rebuilt['problems']), 1934)
            self.assertEqual(len(rebuilt['notes']), 30)
            for before, after in zip(self.catalog['notes'], rebuilt['notes']):
                with self.subTest(note=before['id']):
                    self.assertEqual({k: v for k, v in before.items() if k != 'sourcePath'},
                                     {k: v for k, v in after.items() if k != 'sourcePath'})
                    self.assertTrue(after.get('chinesePath'))
                    for field in ('path', 'chinesePath'):
                        self.assertEqual((ROOT / 'data' / before[field]).read_bytes(),
                                         (data / after[field]).read_bytes())


if __name__ == '__main__':
    unittest.main()
