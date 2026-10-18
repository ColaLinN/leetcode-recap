# 题库与笔记维护

## 导入博客

全部博客专题原文和素材复制到 `data/content`。导入命令会刷新笔记索引与图片路径，但不会清除 SQLite 中的个人记录。源路径可以显式指定，具体参数见 `python scripts/import_notes.py --help`。

```sh
.venv/bin/python scripts/import_notes.py
```

若需要根据项目中维护的题目定义重新生成完整题库：

```sh
.venv/bin/python scripts/build_catalog.py
.venv/bin/python -m backend.validate_catalog --workers 2
```

仅维护本地题目、保持当前已导入笔记与译文不变时，使用 `.venv/bin/python scripts/build_catalog.py --keep-notes`。这不会自动导入博客仓库中的后续改动。

生成器仅执行项目内维护的可信参考解，用独立模型生成并校验测试预期；不接收用户提交代码。常规练习的提交代码始终在 Docker 中运行。

导入后重启服务。已有题目通过 `sourceNoteIds` 关联笔记；新增笔记可能需要在章节的 `noteIds` 中手动关联。不要把草稿与提交历史写入题库文件。

## 中文笔记

原文保存在 `data/content/`，中文维护稿保存在 `data/translations/notes/`；`data/translations/notes.json` 记录中文标题、相关题目标题和对应源文件的 SHA-256。导入时自动生成 `data/content/zh/`，无需手改生成文件。中文只翻译正文、标题和链接标签，代码围栏与链接目标保持原样。

笔记索引中的 `path`、`originalTitle`、`originalProblemLinks` 指向原文；`chinesePath`、`title`、`problemLinks` 用于默认中文显示。前端可随时切换原文。源文件发生变化后，导入器把 `translationStale` 标记为真，页面会提示查看最新原文；复核并更新中文维护稿后，再更新索引中的源文件摘要并重新导入。

修改后运行 `scripts/test_import_notes.py` 和 `scripts/check_content.py`，检查代码、链接、素材以及重复导入后译文是否保留。当前 30 篇均提供中文版本，348 个相关题目链接标签已翻译；66 道本地练习的题面和讲解均为中文。

## 题目模型

`data/catalog.json` 包含 `chapters`、`problems`、`notes`。`chapters` 是两个大章节下面的具体专题，`group` 只取“数据结构”或“算法”；`order` 是全局专题顺序。首页与侧栏共用这一归类，分区题量按题目 ID 去重。专题引用共享题目 ID，避免同一题重复保存进度。

位运算使用原有 `bits-trie` ID，字典树单独使用 `trie` ID。重组目录只改专题归属与顺序，不迁移数据库中的题目草稿和记录。每题需要：

| 字段 | 用途 |
| --- | --- |
| id / number / title | 稳定 ID、LeetCode 对照编号、标题 |
| statement / constraints | 简洁完整的题意和有效输入范围 |
| starter / method | 答题模板和系统调用的方法名 |
| examples / tests | 参数数组与预期输出，分别用于样例运行和完整提交 |
| solution / explanation | Python 参考解与思路 |
| sourceUrl / sourceNoteIds | 原题链接和博客笔记关联 |
| kind / className | 普通方法题或设计类题与类名 |
| argTypes / returnType | raw、listnode、tree、cyclelist 等适配 |
| compare / mutates | 输出比较规则或原地修改参数位置 |

链表返回值被转回数组；树使用层序数组；设计题把每次操作返回值组成数组，构造函数为 `null`。无序答案需选择适当比较器，不要依赖参考实现恰好返回的顺序。

维护测试时，保留手工核实的标准示例，再加入空输入（如题意允许）、单元素、重复值、边界值与不同形状。参考实现通过测试只能证明其与预期一致，不能代替独立核对。修改数据后重新执行后端测试和全题库 Docker 回归。

新增题目使用独立的随机种子，避免重排旧题测试集。「42. 接雨水」以独立的前后缀最大值模型生成预期，参考解使用双指针；回归另按水平水层枚举小输入核对，并覆盖 20,000 根柱子的规模边界。

练习组的题单在创建时固定。题库新增题目后，新建“全部题目”组会包含新题；已有组可通过“编辑”选择新增题目，不会重置旧进度，也不会自动扩展历史复习组。

## 内容来源

博客内容是学习笔记，并非所有链接都有完整题面。本项目保留这些链接作为延伸阅读，仅对补齐结构化数据的精选题启用判题。新增题面、模板、讲解和测试独立维护，避免把外部题单直接当成可执行题库。

分类补充参考灵茶山艾府的公开题单；外部链接需要联网访问，本地笔记与精选题不需要。图片与公式通过 Markdown 渲染，导入会重写本地图片路径。源文件本身缺失的图片需补回源仓库后重新导入。
