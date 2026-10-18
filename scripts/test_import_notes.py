"""Regression checks for source notes and persistent Chinese overlays."""
import hashlib
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import unittest

from import_notes import ROOT, extract_problem_links, import_notes


class ProblemLinkIndexTests(unittest.TestCase):
    def test_unmatched_interval_cannot_swallow_following_heading(self):
        text = '''候选范围为 [i,j)，逐步收缩。
| 区间 | 条件 |
| --- | --- |
| [left,right) | target |

## [ 34. 查找首尾位置 ](https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/)
## [嵌套 [区间] 示例]
'''
        self.assertEqual(extract_problem_links(text), [{
            'title': '34. 查找首尾位置',
            'url': 'https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/'
        }])

    def test_skips_fenced_code_images_and_non_leetcode_hosts(self):
        text = '''```markdown
[仅为代码](https://leetcode.cn/problems/not-a-real-link/)
```
~~~python
[其他围栏](https://leetcode.com/problems/not-a-real-link/)
~~~
![图片](https://leetcode.cn/image.png)
[外部站点](https://leetcode.cn.example.org/problems/example/)
[1. Two Sum](https://leetcode.com/problems/two-sum/)
[重复](https://leetcode.com/problems/two-sum/)
'''
        self.assertEqual(extract_problem_links(text), [{
            'title': '1. Two Sum', 'url': 'https://leetcode.com/problems/two-sum/'
        }])


def fenced_blocks(markdown):
    """Include complete original fence lines, code comments and examples."""
    blocks, current = [], None
    fence_char, fence_size = None, 0
    for line in markdown.splitlines(keepends=True):
        marker = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line.rstrip('\r\n'))
        if current is None:
            if marker:
                token, _ = marker.groups()
                current, fence_char, fence_size = [line], token[0], len(token)
        else:
            current.append(line)
            if marker:
                token, trailing = marker.groups()
                if token[0] == fence_char and len(token) >= fence_size and not trailing.strip():
                    blocks.append(''.join(current))
                    current = None
    if current is not None:
        blocks.append(''.join(current))
    return blocks


class ChineseOverlayTests(unittest.TestCase):
    def test_reimport_preserves_both_languages_and_marks_changed_source(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, data = root / 'source', root / 'data'
            source.mkdir()
            translations = data / 'translations'
            (translations / 'notes').mkdir(parents=True)
            source_path = source / 'example.md'
            original = '# Example\n\n[1. Two Sum](https://leetcode.com/problems/two-sum/)\n'
            chinese = '# 示例\n\n[1. 两数之和](https://leetcode.com/problems/two-sum/)\n'
            source_path.write_text(original, encoding='utf-8')
            overlay_path = translations / 'notes/example.md'
            overlay_path.write_text(chinese, encoding='utf-8')
            (translations / 'notes.json').write_text(json.dumps({
                'version': 1, 'notes': {'example': {
                    'title': '示例', 'path': 'notes/example.md',
                    'sourceSha256': hashlib.sha256(original.encode('utf-8')).hexdigest()
                }}
            }), encoding='utf-8')
            first = import_notes(source, data)[0]
            self.assertEqual(first['title'], '示例')
            self.assertEqual(first['originalTitle'], 'Example')
            self.assertEqual(first['path'], 'content/example.md')
            self.assertEqual(first['chinesePath'], 'content/zh/example.md')
            self.assertEqual(first['sourcePath'], str(source_path.resolve()))
            self.assertEqual(first['problemLinks'][0]['title'], '1. 两数之和')
            self.assertEqual(first['originalProblemLinks'][0]['title'], '1. Two Sum')
            self.assertEqual(first['problemLinks'][0]['url'], first['originalProblemLinks'][0]['url'])
            self.assertFalse(first['translationStale'])
            self.assertEqual((data / first['path']).read_text(), original)
            self.assertEqual((data / first['chinesePath']).read_text(), chinese)
            (data / first['chinesePath']).write_text('generated content may be replaced')
            self.assertEqual(import_notes(source, data)[0], first)
            self.assertEqual((data / first['chinesePath']).read_text(), chinese)
            self.assertEqual(overlay_path.read_text(), chinese)
            self.assertEqual(source_path.read_text(), original)
            source_path.write_text(original + '\nNew source paragraph.\n')
            self.assertTrue(import_notes(source, data)[0]['translationStale'])
            self.assertEqual(overlay_path.read_text(), chinese)

    def test_untranslated_note_remains_available_without_overlay(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source'
            source.mkdir()
            (source / 'example.md').write_text('# Original\n')
            note = import_notes(source, root / 'data')[0]
            self.assertEqual(note['title'], 'Original')
            self.assertNotIn('chinesePath', note)

    def test_all_local_translations_preserve_original_code_urls_and_assets(self):
        index = json.loads((ROOT / 'data/translations/notes.json').read_text())
        originals = {path.stem: path for path in (ROOT / 'data/content').glob('*.md')}
        self.assertEqual(set(index['notes']), set(originals))
        for note_id, entry in index['notes'].items():
            with self.subTest(note=note_id):
                original = originals[note_id].read_text(encoding='utf-8')
                chinese = (ROOT / 'data/translations' / entry['path']).read_text(encoding='utf-8')
                self.assertEqual(fenced_blocks(chinese), fenced_blocks(original))
                # Every remote URL, including source links inside code, stays intact.
                self.assertEqual(re.findall(r'https?://[^\s)\]>]+', chinese),
                                 re.findall(r'https?://[^\s)\]>]+', original))
                self.assertEqual(re.findall(r'!\[[^\]]*\]\(([^\n]*?)\)', chinese),
                                 re.findall(r'!\[[^\]]*\]\(([^\n]*?)\)', original))
                self.assertEqual(entry['sourceSha256'], hashlib.sha256(original.encode('utf-8')).hexdigest())
                self.assertRegex(entry['title'], r'[\u4e00-\u9fff]')
                self.assertIn('# ' + entry['title'], chinese)
                for link in extract_problem_links(chinese):
                    self.assertRegex(link['title'], r'[\u4e00-\u9fff]')


if __name__ == '__main__':
    unittest.main()
