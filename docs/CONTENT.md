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

生成器仅执行项目内维护的可信参考解，用独立模型生成并校验测试预期；不接收用户提交代码。常规练习的提交代码始终在 Docker 中运行。

导入后重启服务。已有题目通过 `sourceNoteIds` 关联笔记；新增笔记可能需要在章节的 `noteIds` 中手动关联。不要把草稿与提交历史写入题库文件。

## 题目模型

`data/catalog.json` 包含 `chapters`、`problems`、`notes`。章节引用共享题目 ID，避免同一题重复保存进度。每题需要：

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

## 内容来源

博客内容是学习笔记，并非所有链接都有完整题面。本项目保留这些链接作为延伸阅读，仅对补齐结构化数据的精选题启用判题。新增题面、模板、讲解和测试独立维护，避免把外部题单直接当成可执行题库。

分类补充参考灵茶山艾府的公开题单；外部链接需要联网访问，本地笔记与精选题不需要。图片与公式通过 Markdown 渲染，导入会重写本地图片路径。源文件本身缺失的图片需补回源仓库后重新导入。
