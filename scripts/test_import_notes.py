"""Regression checks for source-note link indexing (no third-party dependencies)."""
import unittest

from import_notes import extract_problem_links


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


if __name__ == '__main__':
    unittest.main()
