#!/usr/bin/env python3
"""Import the blog's topic notes without changing the source repository.

Usage: python3 scripts/import_notes.py [--source /path/to/topics]
Updating notes preserves the curated catalog and all local progress in SQLite.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
from urllib.parse import unquote, quote, urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / 'guzheng/github/blog/fenglyu-doc-site-v1/docs/leetcode/topics'


def apply_chinese_translation(note: dict, original_body: str, data_dir: Path) -> None:
    """Apply an editable local overlay while retaining the imported source.

    Translation sources live separately from generated content, so importing or
    rebuilding the catalog cannot erase them. The digest covers the displayed
    original (after frontmatter removal and asset URL normalization).
    """
    translations = data_dir / 'translations'
    index_path = translations / 'notes.json'
    if not index_path.exists():
        return
    index = json.loads(index_path.read_text(encoding='utf-8'))
    if index.get('version') != 1:
        raise ValueError(f'不支持的中文笔记索引版本：{index_path}')
    entry = index.get('notes', {}).get(note['id'])
    if entry is None:
        return
    translated_path = (translations / entry['path']).resolve()
    if not translated_path.is_relative_to(translations.resolve()):
        raise ValueError(f'中文笔记路径超出翻译目录：{entry["path"]}')
    translated_body = translated_path.read_text(encoding='utf-8')
    output_path = data_dir / 'content' / 'zh' / (note['id'] + '.md')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(translated_body, encoding='utf-8')
    note['originalTitle'] = note['title']
    note['title'] = entry['title']
    note['chinesePath'] = output_path.relative_to(data_dir).as_posix()
    note['originalProblemLinks'] = note['problemLinks']
    note['problemLinks'] = extract_problem_links(translated_body)
    note['translationStale'] = entry.get('sourceSha256') != hashlib.sha256(original_body.encode('utf-8')).hexdigest()


def extract_problem_links(markdown: str) -> list[dict]:
    """Index real single-line links, without consuming math or fenced examples."""
    prose = []
    fence_char, fence_size = None, 0
    for line in markdown.splitlines():
        fence = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line)
        if fence:
            marker, trailing = fence.groups()
            if fence_char is None:
                fence_char, fence_size = marker[0], len(marker)
            elif marker[0] == fence_char and len(marker) >= fence_size and not trailing.strip():
                fence_char, fence_size = None, 0
            continue
        if fence_char is None:
            prose.append(line)
    links, seen = [], set()
    # In particular, an unmatched interval such as [i,j) must never consume
    # subsequent prose or the opening bracket of a genuine link.
    for match in re.finditer(r'(?<!!)\[([^\[\]\r\n]*)\]\((https?://[^)\s]+)\)', '\n'.join(prose)):
        label, url = match.groups()
        hostname = (urlparse(url).hostname or '').lower()
        if hostname in {'leetcode.com', 'leetcode.cn', 'leetcode-cn.com'} and url not in seen:
            links.append({'title': label.strip() or url, 'url': url})
            seen.add(url)
    return links


def import_notes(source: Path, data_dir: Path = ROOT / 'data') -> list[dict]:
    source = source.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f'找不到博客专题目录：{source}')
    content = data_dir / 'content'
    content.mkdir(parents=True, exist_ok=True)
    # Copy all asset directories, including unreferenced images used by future edits.
    for item in sorted(source.iterdir()):
        if item.is_dir():
            shutil.copytree(item, content / item.name, dirs_exist_ok=True)
    notes = []
    for path in sorted(source.glob('*.md')):
        original = path.read_text(encoding='utf-8')
        title_match = re.search(r'^#\s+(.+)$', original, re.M)
        title = title_match.group(1).strip() if title_match else path.stem
        # Frontmatter is Docusaurus metadata, not learning material.
        body = re.sub(r'\A---\s*\n.*?\n---\s*\n', '', original, count=1, flags=re.S)
        def rewrite(match: re.Match) -> str:
            prefix, url, suffix = match.groups()
            decoded = unquote(url.strip().strip('<>'))
            if urlparse(decoded).scheme or decoded.startswith(('#', '/')):
                return match.group(0)
            target = (source / decoded).resolve()
            try:
                relative = target.relative_to(source)
            except ValueError:
                # Preserve external relative reading links instead of guessing a remote.
                return match.group(0)
            if target.exists():
                return prefix + '/content/' + quote(relative.as_posix(), safe='/') + suffix
            return match.group(0)
        # Spaces in legacy image directory names must be escaped in rendered Markdown.
        body = re.sub(r'(!?\[[^\]]*\]\()([^\n]*?)(\))', rewrite, body)
        # Also support HTML images if future notes use them.
        body = re.sub(r'''(\bsrc=["'])([^"']+)(["'])''', rewrite, body)
        out = content / path.name
        out.write_text(body, encoding='utf-8')
        note = {'id': path.stem, 'title': title, 'path': 'content/' + path.name,
                'sourcePath': str(path), 'problemLinks': extract_problem_links(original)}
        apply_chinese_translation(note, body, data_dir)
        notes.append(note)
    return notes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    notes = import_notes(args.source)
    catalog_path = ROOT / 'data/catalog.json'
    catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {'chapters': [], 'problems': []}
    catalog['notes'] = notes
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f'已导入 {len(notes)} 篇笔记，原始博客文件保持不变。')

if __name__ == '__main__':
    main()
