#!/usr/bin/env python3
"""Rebuild the curated, self-contained Python practice catalog.

The deterministic suites use small independent exhaustive/state-model oracles.
This script executes only the trusted reference snippets below. User submissions
are always executed by the Docker judge, never by this script.
"""
from __future__ import annotations
from collections import Counter, deque, OrderedDict
from copy import deepcopy
from functools import lru_cache
from itertools import combinations, permutations, product
import argparse
import json
from pathlib import Path
import random
import textwrap
from import_notes import DEFAULT_SOURCE, import_notes

ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(20261019)
PROBLEMS = []
ENDLESS = 'https://github.com/EndlessCheng/codeforces-go'


def add(number, slug, title, difficulty, tags, signature, body, statement, constraints,
        cases, oracle, explanation, *, argTypes=None, returnType='raw', compare='exact', mutates=None,
        examples=None, kind='solution', className=None, fullSource=None, starter=None):
    source = 'from typing import List, Optional\n\nclass Solution:\n    def ' + signature + ':\n' + textwrap.indent(textwrap.dedent(body).strip(), '        ') + '\n'
    template = 'from typing import List, Optional\n\nclass Solution:\n    def ' + signature + ':\n        # 在这里实现你的解法\n        pass\n'
    tests = [{'args': deepcopy(args), 'expected': oracle(*deepcopy(args))} for args in cases]
    if examples:
        for args, expected in examples:
            actual = oracle(*deepcopy(args))
            assert canonical(actual, compare) == canonical(expected, compare), (slug, actual, expected)
        rendered_examples = [{'args': a, 'expected': e} for a, e in examples]
    else:
        rendered_examples = deepcopy(tests[:2])
    p = dict(id=slug, number=number, title=title, difficulty=difficulty, tags=tags,
             statement=statement, examples=rendered_examples, constraints=constraints,
             starter=starter or template, solution=fullSource or source, explanation=explanation,
             method=signature.split('(')[0], kind=kind, argTypes=argTypes or [], returnType=returnType,
             compare=compare, tests=tests, sourceUrl='https://leetcode.cn/problems/' + slug + '/',
             referenceUrls=[ENDLESS], sourceNoteIds=[])
    if mutates is not None: p['mutates'] = mutates
    if className: p['className'] = className
    PROBLEMS.append(p)


def canonical(value, mode):
    if mode == 'unordered': return sorted(value)
    if mode == 'nested-unordered': return sorted(sorted(v) for v in value)
    return value


def arr_cases(minimum=0, maximum=12, count=24, lo=-5, hi=5):
    return [[rng.choices(range(lo, hi + 1), k=rng.randint(minimum, maximum))] for _ in range(count)]


def sum_pair(a, target):
    return next([i, j] for i in range(len(a)) for j in range(i+1, len(a)) if a[i]+a[j] == target)

two_cases = [[[2,7,11,15],9], [[3,2,4],6], [[3,3],6], [[-3,4,3,90],0]]
while len(two_cases) < 30:
    a = rng.choices(range(-30,31), k=rng.randint(2,18)); i,j = rng.sample(range(len(a)),2); t=a[i]+a[j]
    if sum(a[x]+a[y]==t for x in range(len(a)) for y in range(x+1,len(a)))==1:two_cases.append([a,t])
add(1,'two-sum','两数之和','Easy',['数组','哈希表'],'twoSum(self, nums: List[int], target: int) -> List[int]', '''
seen = {}
for i, value in enumerate(nums):
    if target - value in seen:
        return [seen[target - value], i]
    seen[value] = i
''','给定整数数组 `nums` 和整数 `target`，返回两个不同下标，使对应元素之和等于目标值。保证恰有一组答案；下标顺序不限。',['2 ≤ nums.length ≤ 10⁴','-10⁹ ≤ nums[i], target ≤ 10⁹','只能使用每个位置一次'],two_cases,sum_pair,'扫描数组时记录已经见过的值及下标，查询目标值与当前值的差。先查询再插入可避免复用同一位置。时间 O(n)，额外空间 O(n)。',compare='unordered',examples=[([[2,7,11,15],9],[0,1]),([[3,2,4],6],[1,2])])

words=['','a','ab','abc','aab','listen','中文','aaaa','rat','anagram']
anagram_cases=[[a,b] for a in words for b in [a,a[::-1],a+'z']]
add(242,'valid-anagram','有效的字母异位词','Easy',['字符串','哈希表'],'isAnagram(self, s: str, t: str) -> bool','''
from collections import Counter
return Counter(s) == Counter(t)
''','两个字符串中每个字符出现次数都相同，则它们互为字母异位词。返回 `s` 与 `t` 是否满足这一条件。',['0 ≤ s.length, t.length ≤ 5×10⁴','字符按 Python Unicode 字符比较'],anagram_cases,lambda s,t: sorted(s)==sorted(t),'用计数表比较每个字符的频次。时间 O(n+m)，额外空间取决于不同字符数量。',examples=[(['anagram','nagaram'],True),(['rat','car'],False)])

pal_cases=[[s] for s in ['', 'A man, a plan, a canal: Panama','race a car',' ', '0P', 'a.', 'ab_a', '.,','Madam', '12:21','12321']]
add(125,'valid-palindrome','验证回文串','Easy',['双指针','字符串'],'isPalindrome(self, s: str) -> bool','''
left, right = 0, len(s) - 1
while left < right:
    if not s[left].isalnum():
        left += 1
    elif not s[right].isalnum():
        right -= 1
    else:
        if s[left].lower() != s[right].lower():
            return False
        left += 1
        right -= 1
return True
''','只保留字符串中的英文字母和数字，并将字母转为小写。判断处理后的字符串从左到右和从右到左是否相同；空串视为回文。',['0 ≤ s.length ≤ 2×10⁵','s 由可打印 ASCII 字符组成'],pal_cases,lambda s:(lambda x:x==x[::-1])(''.join(c.lower() for c in s if c.isalnum())),'左右指针跳过非字母数字字符，再比较忽略大小写后的字符。时间 O(n)，额外空间 O(1)。',examples=[(['A man, a plan, a canal: Panama'],True),(['race a car'],False)])

def longest_unique(s):
    return max((j-i for i in range(len(s)+1) for j in range(i,len(s)+1) if len(set(s[i:j]))==j-i), default=0)
unique_cases=[[s] for s in ['', 'abcabcbb','bbbbb','pwwkew',' ','abba','dvdf','你好世界你好']]+[[''.join(rng.choices('abcde ',k=rng.randrange(25)))] for _ in range(26)]
add(3,'longest-substring-without-repeating-characters','无重复字符的最长子串','Medium',['滑动窗口','字符串'],'lengthOfLongestSubstring(self, s: str) -> int','''
last, left, answer = {}, 0, 0
for right, ch in enumerate(s):
    if ch in last:
        left = max(left, last[ch] + 1)
    last[ch] = right
    answer = max(answer, right - left + 1)
return answer
''','返回 `s` 中不含重复字符的最长连续子串长度。子串必须连续，字符按 Unicode 字符计数。',['0 ≤ s.length ≤ 5×10⁴'],unique_cases,longest_unique,'记录字符上一次出现的位置；发现重复时把左边界移到重复位置之后，且左边界不能后退。时间 O(n)，空间 O(k)。',examples=[(['abcabcbb'],3),(['bbbbb'],1)])

def group_oracle(strs):
    remaining=list(strs); groups=[]
    while remaining:
        first=remaining.pop(0); group=[first]; rest=[]
        for x in remaining:
            (group if sorted(x)==sorted(first) else rest).append(x)
        groups.append(group);remaining=rest
    return groups
add(49,'group-anagrams','字母异位词分组','Medium',['哈希表','字符串'],'groupAnagrams(self, strs: List[str]) -> List[List[str]]','''
from collections import defaultdict
buckets = defaultdict(list)
for word in strs:
    buckets[''.join(sorted(word))].append(word)
return list(buckets.values())
''','把 `strs` 中字符组成相同的字符串放在同一组。每个输入字符串恰好出现一次，组间和组内顺序均不限。',['1 ≤ strs.length ≤ 10⁴','0 ≤ strs[i].length ≤ 100','字符串只含小写英文字母'],[[['eat','tea','tan','ate','nat','bat']],[['']],[['a']],[['ab','ba','ab','b','']]]+[[[''.join(rng.choices('abc',k=rng.randrange(6))) for _ in range(rng.randint(1,15))]] for _ in range(22)],group_oracle,'排序后的字符串可以作为异位词的统一键。长度上界为 L 时，时间 O(nL log L)，空间 O(nL)。',compare='nested-unordered',examples=[([['eat','tea','tan','ate','nat','bat']],[['bat'],['nat','tan'],['ate','eat','tea']]),([['']],[['']])])

matrix_cases=[[[[1]]],[[[1,2],[3,4]]],[[[1,2,3],[4,5,6],[7,8,9]]]]+[[[[rng.randrange(-9,10) for _ in range(n)] for _ in range(n)]] for n in range(1,7) for _ in range(3)]
add(48,'rotate-image','旋转图像','Medium',['矩阵','原地操作'],'rotate(self, matrix: List[List[int]]) -> None','''
n = len(matrix)
for i in range(n):
    for j in range(i + 1, n):
        matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
for row in matrix:
    row.reverse()
''','将 n×n 整数矩阵顺时针旋转 90°。必须直接修改传入的 `matrix`，函数返回 `None`；系统比较修改后的矩阵。',['1 ≤ n ≤ 20','matrix 是 n×n 方阵'],matrix_cases,lambda matrix:[list(row) for row in zip(*matrix[::-1])],'先沿主对角线转置，再反转每一行。时间 O(n²)，额外空间 O(1)。',mutates=0,examples=[([[[1,2],[3,4]]],[[3,1],[4,2]]),([[[1]]],[[1]])])

def zero_oracle(matrix):
    rows={i for i,row in enumerate(matrix) if 0 in row}; cols={j for row in matrix for j,x in enumerate(row) if x==0}
    return [[0 if i in rows or j in cols else x for j,x in enumerate(row)] for i,row in enumerate(matrix)]
zero_cases=[[[[1,1,1],[1,0,1],[1,1,1]]],[[[0,1,2,0],[3,4,5,2],[1,3,1,5]]],[[[0]]],[[[1]]]]+[[[[rng.randrange(4) for _ in range(n)] for _ in range(m)]] for m in range(1,6) for n in range(1,5)]
add(73,'set-matrix-zeroes','矩阵置零','Medium',['矩阵','原地操作'],'setZeroes(self, matrix: List[List[int]]) -> None','''
first_row = any(x == 0 for x in matrix[0])
first_col = any(row[0] == 0 for row in matrix)
for i in range(1, len(matrix)):
    for j in range(1, len(matrix[0])):
        if matrix[i][j] == 0:
            matrix[i][0] = matrix[0][j] = 0
for i in range(1, len(matrix)):
    for j in range(1, len(matrix[0])):
        if matrix[i][0] == 0 or matrix[0][j] == 0:
            matrix[i][j] = 0
if first_row:
    matrix[0][:] = [0] * len(matrix[0])
if first_col:
    for row in matrix:
        row[0] = 0
''','若原矩阵中的某个元素为 0，则将它所在的整行和整列都设为 0。所有判断依据修改前的矩阵。原地修改，返回 `None`；系统比较修改后的矩阵。',['1 ≤ m,n ≤ 200','matrix 是 m×n 矩阵'],zero_cases,zero_oracle,'用首行首列保存需要清零的标记，并单独保存首行、首列原本是否含零。时间 O(mn)，额外空间 O(1)。',mutates=0,examples=[([[[1,1,1],[1,0,1],[1,1,1]]],[[1,0,1],[0,0,0],[1,0,1]])])

def spiral_oracle(matrix):
    a=deepcopy(matrix);out=[]
    while a:
        out.extend(a.pop(0));a=[list(row) for row in zip(*a)][::-1]
    return out
add(54,'spiral-matrix','螺旋矩阵','Medium',['矩阵','模拟'],'spiralOrder(self, matrix: List[List[int]]) -> List[int]','''
top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
answer = []
while top <= bottom and left <= right:
    answer.extend(matrix[top][left:right + 1]); top += 1
    for i in range(top, bottom + 1):
        answer.append(matrix[i][right])
    right -= 1
    if top <= bottom:
        answer.extend(matrix[bottom][left:right + 1][::-1]); bottom -= 1
    if left <= right:
        for i in range(bottom, top - 1, -1):
            answer.append(matrix[i][left])
        left += 1
return answer
''','从左上角开始，按向右、向下、向左、向上的顺序逐层向内遍历矩阵，返回所有元素的访问序列。',['1 ≤ m,n ≤ 10','matrix 是 m×n 矩阵'],[[[[i*n+j for j in range(n)] for i in range(m)]] for m in range(1,6) for n in range(1,6)],spiral_oracle,'维护四条边界，每遍历一条边就收缩对应边界。单行、单列时检查边界，避免重复访问。时间 O(mn)，除结果外空间 O(1)。',examples=[([[[1,2,3],[4,5,6],[7,8,9]]],[1,2,3,6,9,8,7,4,5])])

add(15,'3sum','三数之和','Medium',['双指针','排序'],'threeSum(self, nums: List[int]) -> List[List[int]]','''
nums.sort()
answer = []
for i, x in enumerate(nums):
    if i and x == nums[i - 1]:
        continue
    left, right = i + 1, len(nums) - 1
    while left < right:
        total = x + nums[left] + nums[right]
        if total < 0:
            left += 1
        elif total > 0:
            right -= 1
        else:
            answer.append([x, nums[left], nums[right]])
            left += 1; right -= 1
            while left < right and nums[left] == nums[left - 1]:
                left += 1
            while left < right and nums[right] == nums[right + 1]:
                right -= 1
return answer
''','返回数组中所有由三个不同位置组成、元素之和为 0 的三元组。相同数值的三元组只返回一次，结果顺序不限。',['3 ≤ nums.length ≤ 3000','-10⁵ ≤ nums[i] ≤ 10⁵'],[[[-1,0,1,2,-1,-4]],[[0,0,0]],[[0,1,1]]]+arr_cases(3,14),lambda nums:[list(x) for x in sorted({tuple(sorted(x)) for x in combinations(nums,3) if sum(x)==0})],'排序后固定第一个数，用相向双指针寻找另外两个数。跳过重复值以去重。时间 O(n²)，排序空间由实现决定。',compare='nested-unordered',examples=[([[-1,0,1,2,-1,-4]],[[-1,-1,2],[-1,0,1]]),([[0,0,0]],[[0,0,0]])])

add(11,'container-with-most-water','盛最多水的容器','Medium',['双指针','贪心'],'maxArea(self, height: List[int]) -> int','''
left, right, answer = 0, len(height) - 1, 0
while left < right:
    answer = max(answer, min(height[left], height[right]) * (right - left))
    if height[left] <= height[right]:
        left += 1
    else:
        right -= 1
return answer
''','在下标 i 处竖起高度为 `height[i]` 的线段。选择两条线段，与横轴构成容器。容量为两线段距离乘较短高度，返回最大容量。',['2 ≤ height.length ≤ 10⁵','0 ≤ height[i] ≤ 10⁴'],[[[1,8,6,2,5,4,8,3,7]],[[1,1]],[[0,0]]]+arr_cases(2,30,lo=0,hi=20),lambda h:max(min(h[i],h[j])*(j-i) for i in range(len(h)) for j in range(i+1,len(h))),'面积受较短边限制。移动长边不可能在缩短宽度后提高当前上界，因此每次移动短边。时间 O(n)，空间 O(1)。',examples=[([[1,8,6,2,5,4,8,3,7]],49),([[1,1]],1)])

window_cases=[[7,[2,3,1,2,4,3]],[4,[1,4,4]],[11,[1,1,1,1,1,1,1,1]],[1,[1]]]+[[rng.randint(1,40),rng.choices(range(1,10),k=rng.randint(1,20))] for _ in range(26)]
add(209,'minimum-size-subarray-sum','长度最小的子数组','Medium',['滑动窗口'],'minSubArrayLen(self, target: int, nums: List[int]) -> int','''
left = total = 0
answer = len(nums) + 1
for right, x in enumerate(nums):
    total += x
    while total >= target:
        answer = min(answer, right - left + 1)
        total -= nums[left]; left += 1
return 0 if answer > len(nums) else answer
''','在正整数数组 `nums` 中，找和至少为 `target` 的最短非空连续子数组，返回长度；不存在时返回 0。',['1 ≤ target ≤ 10⁹','1 ≤ nums.length ≤ 10⁵','1 ≤ nums[i] ≤ 10⁴'],window_cases,lambda t,a:min([j-i for i in range(len(a)) for j in range(i+1,len(a)+1) if sum(a[i:j])>=t] or [0]),'正数使窗口和随右端扩展而增大。达到目标后连续收缩左端，记录仍满足条件的最短长度。时间 O(n)，空间 O(1)。',examples=[([7,[2,3,1,2,4,3]],2),([11,[1,1,1,1,1,1,1,1]],0)])
add(1004,'max-consecutive-ones-iii','最大连续 1 的个数 III','Medium',['滑动窗口'],'longestOnes(self, nums: List[int], k: int) -> int','''
left = zeros = answer = 0
for right, x in enumerate(nums):
    zeros += x == 0
    while zeros > k:
        zeros -= nums[left] == 0
        left += 1
    answer = max(answer, right - left + 1)
return answer
''','`nums` 只含 0 和 1。最多将 k 个 0 翻转为 1，返回可以得到的最长连续 1 的长度。',['1 ≤ nums.length ≤ 10⁵','0 ≤ k ≤ nums.length'],[[[1,1,1,0,0,0,1,1,1,1,0],2],[[0],0],[[0],1],[[1,1],0]]+[[rng.choices([0,1],k=n),rng.randrange(n+1)] for n in range(1,30)],lambda a,k:max([j-i for i in range(len(a)+1) for j in range(i,len(a)+1) if a[i:j].count(0)<=k]),'维护窗口中零的数量，超过 k 时移动左端。所有合法窗口都可通过翻转其零变为全 1。时间 O(n)，空间 O(1)。',examples=[([[1,1,1,0,0,0,1,1,1,1,0],2],6),([[0],0],0)])

add(560,'subarray-sum-equals-k','和为 K 的子数组','Medium',['前缀和','哈希表'],'subarraySum(self, nums: List[int], k: int) -> int','''
from collections import defaultdict
counts = defaultdict(int, {0: 1})
prefix = answer = 0
for x in nums:
    prefix += x
    answer += counts[prefix - k]
    counts[prefix] += 1
return answer
''','统计 `nums` 中元素和恰好为 k 的非空连续子数组数量。相同数值但位置不同的子数组分别计数。',['1 ≤ nums.length ≤ 2×10⁴','-1000 ≤ nums[i] ≤ 1000','-10⁷ ≤ k ≤ 10⁷'],[[[1,1,1],2],[[1,2,3],3],[[0,0,0],0]]+[[a[0],rng.randint(-10,10)] for a in arr_cases(1,20)],lambda a,k:sum(sum(a[i:j])==k for i in range(len(a)) for j in range(i+1,len(a)+1)),'前缀和之差等于子数组和。维护之前各前缀和出现次数，查询 prefix-k 的次数。初始前缀和 0 出现一次。时间 O(n)，空间 O(n)。',examples=[([[1,1,1],2],2),([[1,2,3],3],2)])

def product_oracle(a):
    return [__import__('math').prod(a[:i]+a[i+1:]) for i in range(len(a))]
add(238,'product-of-array-except-self','除自身以外数组的乘积','Medium',['数组','前缀和'],'productExceptSelf(self, nums: List[int]) -> List[int]','''
answer = [1] * len(nums)
prefix = 1
for i, x in enumerate(nums):
    answer[i] = prefix
    prefix *= x
suffix = 1
for i in range(len(nums) - 1, -1, -1):
    answer[i] *= suffix
    suffix *= nums[i]
return answer
''','返回与 `nums` 等长的数组，第 i 项是除 `nums[i]` 外所有元素的乘积。不得使用除法，要求线性时间。',['2 ≤ nums.length ≤ 10⁵','-30 ≤ nums[i] ≤ 30','测试数据保证相关乘积可用 32 位整数表示'],[[[1,2,3,4]],[[-1,1,0,-3,3]],[[0,0]],[[2,3]]]+arr_cases(2,10,lo=-2,hi=2),product_oracle,'结果等于左侧所有元素乘积乘右侧所有元素乘积。两遍扫描分别累积前缀积与后缀积。时间 O(n)，除结果外空间 O(1)。',examples=[([[1,2,3,4]],[24,12,8,6]),([[-1,1,0,-3,3]],[0,0,9,0,0])])

range_cases=[[[5,7,7,8,8,10],8],[[5,7,7,8,8,10],6],[[],0]]+[[sorted(a[0]),rng.randrange(-7,8)] for a in arr_cases(0,25)]
add(34,'find-first-and-last-position-of-element-in-sorted-array','在排序数组中查找元素的首尾位置','Medium',['二分查找'],'searchRange(self, nums: List[int], target: int) -> List[int]','''
from bisect import bisect_left, bisect_right
left = bisect_left(nums, target)
if left == len(nums) or nums[left] != target:
    return [-1, -1]
return [left, bisect_right(nums, target) - 1]
''','`nums` 按非递减顺序排列。返回 target 的首次与末次出现下标；不存在则返回 `[-1,-1]`。要求 O(log n) 时间。',['0 ≤ nums.length ≤ 10⁵','nums 已排序'],range_cases,lambda a,t:[a.index(t),len(a)-1-a[::-1].index(t)] if t in a else [-1,-1],'分别找第一个 ≥target 的位置和第一个 >target 的位置。后者减一就是右边界。时间 O(log n)，空间 O(1)。',examples=[([[5,7,7,8,8,10],8],[3,4]),([[],0],[-1,-1])])

search_cases=[[[-1,0,3,5,9,12],9],[[-1,0,3,5,9,12],2]]+[[sorted(rng.sample(range(-50,51),rng.randint(1,35))),rng.randrange(-55,56)] for _ in range(28)]
add(704,'binary-search','二分查找','Easy',['二分查找'],'search(self, nums: List[int], target: int) -> int','''
left, right = 0, len(nums) - 1
while left <= right:
    middle = (left + right) // 2
    if nums[middle] == target:
        return middle
    if nums[middle] < target:
        left = middle + 1
    else:
        right = middle - 1
return -1
''','给定严格递增的整数数组 `nums`，返回 target 的下标，不存在时返回 -1。要求 O(log n) 时间。',['1 ≤ nums.length ≤ 10⁴','nums 中的元素互不相同'],search_cases,lambda a,t:a.index(t) if t in a else -1,'维护闭区间候选范围，比较中点后丢弃不可能的一半。时间 O(log n)，空间 O(1)。',examples=[([[-1,0,3,5,9,12],9],4),([[-1,0,3,5,9,12],2],-1)])

rotated_cases=[[[4,5,6,7,0,1,2],0],[[4,5,6,7,0,1,2],3],[[1],0]]
for _ in range(30):
    a=sorted(rng.sample(range(-40,41),rng.randint(1,30)));cut=rng.randrange(len(a));a=a[cut:]+a[:cut];rotated_cases.append([a,rng.choice(a+[99,-99])])
add(33,'search-in-rotated-sorted-array','搜索旋转排序数组','Medium',['二分查找'],'search(self, nums: List[int], target: int) -> int','''
left, right = 0, len(nums) - 1
while left <= right:
    mid = (left + right) // 2
    if nums[mid] == target:
        return mid
    if nums[left] <= nums[mid]:
        if nums[left] <= target < nums[mid]:
            right = mid - 1
        else:
            left = mid + 1
    else:
        if nums[mid] < target <= nums[right]:
            left = mid + 1
        else:
            right = mid - 1
return -1
''','严格递增数组在某个位置旋转后得到 `nums`。返回 target 在当前数组中的下标；不存在时返回 -1。要求 O(log n) 时间。',['1 ≤ nums.length ≤ 5000','nums 中的元素互不相同'],rotated_cases,lambda a,t:a.index(t) if t in a else -1,'中点将区间分为两半，其中至少一半有序。判断 target 是否落在有序半边的值域，再决定下一轮范围。时间 O(log n)，空间 O(1)。',examples=[([[4,5,6,7,0,1,2],0],4),([[4,5,6,7,0,1,2],3],-1)])

# Linked list adapters take JSON arrays; returned nodes are serialized to arrays.
add(206,'reverse-linked-list','反转链表','Easy',['链表'],'reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]','''
previous = None
while head:
    following = head.next
    head.next = previous
    previous, head = head, following
return previous
''','反转单链表，返回新的头节点。输入和输出使用节点值数组；空数组表示空链表。节点定义由判题器提供。',['0 ≤ 节点数 ≤ 5000','-5000 ≤ Node.val ≤ 5000'],[[[1,2,3,4,5]],[[]],[[1]]]+arr_cases(0,30),lambda a:a[::-1],'循环保存后继、反转指向，再前移两个指针。时间 O(n)，额外空间 O(1)。',argTypes=['listnode'],returnType='listnode',examples=[([[1,2,3,4,5]],[5,4,3,2,1]),([[]],[])])
add(876,'middle-of-the-linked-list','链表的中间结点','Easy',['链表','快慢指针'],'middleNode(self, head: Optional[ListNode]) -> Optional[ListNode]','''
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
return slow
''','返回链表中间结点。结点数为偶数时返回两个中间结点中的后一个。结果序列化为从该结点开始的链表值数组。',['1 ≤ 节点数 ≤ 100'],[[[1,2,3,4,5]],[[1,2,3,4,5,6]],[[1]]]+arr_cases(1,30),lambda a:a[len(a)//2:],'慢指针每次一步，快指针每次两步。快指针走到末尾时，慢指针位于所需中点。时间 O(n)，空间 O(1)。',argTypes=['listnode'],returnType='listnode',examples=[([[1,2,3,4,5]],[3,4,5]),([[1,2,3,4,5,6]],[4,5,6])])
remove_cases=[[[1,2,3,4,5],2],[[1],1],[[1,2],2],[[1,2],1]]+[[a[0],rng.randint(1,len(a[0]))] for a in arr_cases(1,30)]
add(19,'remove-nth-node-from-end-of-list','删除链表的倒数第 N 个结点','Medium',['链表','双指针'],'removeNthFromEnd(self, head: Optional[ListNode], n: int) -> Optional[ListNode]','''
dummy = ListNode(0, head)
slow = fast = dummy
for _ in range(n + 1):
    fast = fast.next
while fast:
    slow, fast = slow.next, fast.next
slow.next = slow.next.next
return dummy.next
''','删除单链表的倒数第 n 个结点，返回新头节点。n 从 1 开始；保证 n 不超过结点数量。',['1 ≤ 节点数 ≤ 30','1 ≤ n ≤ 节点数'],remove_cases,lambda a,n:a[:len(a)-n]+a[len(a)-n+1:],'使用哨兵结点统一删除头节点的情况。让两个指针间隔 n+1 步，后指针到达末尾时，前指针停在待删结点前。时间 O(n)，空间 O(1)。',argTypes=['listnode','raw'],returnType='listnode',examples=[([[1,2,3,4,5],2],[1,2,3,5]),([[1],1],[])])
cycle_cases=[[{'values':[3,2,0,-4],'pos':1}],[{'values':[1],'pos':-1}],[{'values':[],'pos':-1}]]
for n in range(1,25):cycle_cases.append([{'values':rng.choices(range(10),k=n),'pos':rng.randrange(-1,n)}])
add(141,'linked-list-cycle','环形链表','Easy',['链表','快慢指针'],'hasCycle(self, head: Optional[ListNode]) -> bool','''
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
    if slow is fast:
        return True
return False
''','判断链表是否含环。输入用 `{"values":[节点值...],"pos":下标}` 描述：pos=-1 表示无环，否则尾结点连接到该下标结点。pos 仅用于构建链表，不传给 `hasCycle`。',['0 ≤ 节点数 ≤ 10⁴','pos 为 -1 或合法的零起始下标'],cycle_cases,lambda d:d['pos']>=0,'快慢指针在环中会相遇；若快指针先到达空指针则没有环。必须比较结点身份而非值。时间 O(n)，空间 O(1)。',argTypes=['cyclelist'],examples=[([{'values':[3,2,0,-4],'pos':1}],True),([{'values':[1],'pos':-1}],False)])


def design(number,slug,title,difficulty,tags,name,source,template,statement,constraints,cases,oracle,explanation,examples):
    add(number,slug,title,difficulty,tags,'unused(self)', 'pass',statement,constraints,cases,oracle,explanation,
        kind='design',className=name,fullSource=textwrap.dedent(source).strip()+'\n',starter=textwrap.dedent(template).strip()+'\n',examples=examples)


def numarray_model(ops,args):
    nums=args[0][0];return [None]+[sum(nums[x[0]:x[1]+1]) for x in args[1:]]
numarray_cases=[[['NumArray','sumRange','sumRange','sumRange'],[[[-2,0,3,-5,2,-1]],[0,2],[2,5],[0,5]]]]
for _ in range(22):
    a=rng.choices(range(-20,21),k=rng.randint(1,30));q=[]
    for _ in range(15):
        i=rng.randrange(len(a));j=rng.randrange(i,len(a));q.append([i,j])
    numarray_cases.append([['NumArray']+['sumRange']*len(q),[[a]]+q])
design(303,'range-sum-query-immutable','区域和检索 · 数组不可变','Easy',['前缀和','设计'],'NumArray','''
class NumArray:
    def __init__(self, nums):
        self.prefix = [0]
        for x in nums:
            self.prefix.append(self.prefix[-1] + x)
    def sumRange(self, left, right):
        return self.prefix[right + 1] - self.prefix[left]
''','''
class NumArray:
    def __init__(self, nums: list[int]):
        pass
    def sumRange(self, left: int, right: int) -> int:
        pass
''','实现 `NumArray(nums)`。`sumRange(left,right)` 返回闭区间内的元素和。输入为操作名数组和参数数组，构造操作的结果为 null。',['1 ≤ nums.length ≤ 10⁴','0 ≤ left ≤ right < nums.length','最多 10⁴ 次查询'],numarray_cases,numarray_model,'构造时保存长度为 n+1 的前缀和。区间和为 prefix[right+1]-prefix[left]。预处理 O(n)，每次查询 O(1)，空间 O(n)。',examples=[(numarray_cases[0],[None,1,-1,-3])])

add(20,'valid-parentheses','有效的括号','Easy',['栈'],'isValid(self, s: str) -> bool','''
stack = []
pairs = {')': '(', ']': '[', '}': '{'}
for ch in s:
    if ch in pairs:
        if not stack or stack.pop() != pairs[ch]:
            return False
    else:
        stack.append(ch)
return not stack
''','字符串仅包含 `()[]{}`。判断所有括号是否按正确顺序、正确类型成对闭合。空字符串在本地扩展用例中视为有效。',['0 ≤ s.length ≤ 10⁴'],[[s] for s in ['','()','()[]{}','(]','([)]','{[]}','(',']','((()))']] + [[''.join(rng.choices('()[]{}',k=rng.randrange(20)))] for _ in range(30)],lambda s:(lambda t: t=='')(__import__('functools').reduce(lambda t,_:t.replace('()','').replace('[]','').replace('{}',''),range(len(s)),s)),'左括号入栈，右括号必须与栈顶配对。扫描结束后栈为空才有效。时间 O(n)，空间 O(n)。',examples=[(['()[]{}'],True),(['([)]'],False)])


def minstack_model(ops,args):
    stack=[];out=[None]
    for op,arg in zip(ops[1:],args[1:]):
        if op=='push':stack.append(arg[0]);out.append(None)
        elif op=='pop':stack.pop();out.append(None)
        elif op=='top':out.append(stack[-1])
        else:out.append(min(stack))
    return out
minstack_cases=[[['MinStack','push','push','push','getMin','pop','top','getMin'],[[],[-2],[0],[-3],[],[],[],[]]]]
for _ in range(20):
    ops=['MinStack'];args=[[]];size=0
    for _ in range(40):
        op=rng.choice(['push','pop','top','getMin'] if size else ['push']);ops.append(op);args.append([rng.randrange(-99,100)] if op=='push' else []);size += (op=='push')-(op=='pop')
    minstack_cases.append([ops,args])
design(155,'min-stack','最小栈','Medium',['栈','设计'],'MinStack','''
class MinStack:
    def __init__(self):
        self.values = []
    def push(self, val):
        self.values.append((val, min(val, self.values[-1][1]) if self.values else val))
    def pop(self):
        self.values.pop()
    def top(self):
        return self.values[-1][0]
    def getMin(self):
        return self.values[-1][1]
''','''
class MinStack:
    def __init__(self):
        pass
    def push(self, val: int) -> None:
        pass
    def pop(self) -> None:
        pass
    def top(self) -> int:
        pass
    def getMin(self) -> int:
        pass
''','实现支持 `push(val)`、`pop()`、`top()` 和 `getMin()` 的栈；`getMin` 返回当前栈中最小值。所有操作要求 O(1)。调用 pop/top/getMin 时保证非空。构造、push、pop 的输出为 null。',['-2³¹ ≤ val < 2³¹','最多 3×10⁴ 次操作'],minstack_cases,minstack_model,'每个栈元素同时保存当前值与截至该位置的最小值。弹出时最小值随之恢复。各操作 O(1)，空间 O(n)。',examples=[(minstack_cases[0],[None,None,None,None,-3,None,0,-2])])


def queue_model(ops,args):
    q=[];out=[None]
    for op,arg in zip(ops[1:],args[1:]):
        if op=='push':q.append(arg[0]);out.append(None)
        elif op=='pop':out.append(q.pop(0))
        elif op=='peek':out.append(q[0])
        else:out.append(not q)
    return out
queue_cases=[[['MyQueue','push','push','peek','pop','empty'],[[],[1],[2],[],[],[]]]]
for _ in range(20):
    ops=['MyQueue'];args=[[]];size=0
    for _ in range(40):
        op=rng.choice(['push','pop','peek','empty'] if size else ['push','empty']);ops.append(op);args.append([rng.randrange(-50,51)] if op=='push' else []);size+=(op=='push')-(op=='pop')
    queue_cases.append([ops,args])
design(232,'implement-queue-using-stacks','用栈实现队列','Easy',['队列','栈','设计'],'MyQueue','''
class MyQueue:
    def __init__(self):
        self.incoming, self.outgoing = [], []
    def push(self, x):
        self.incoming.append(x)
    def _move(self):
        if not self.outgoing:
            while self.incoming:
                self.outgoing.append(self.incoming.pop())
    def pop(self):
        self._move()
        return self.outgoing.pop()
    def peek(self):
        self._move()
        return self.outgoing[-1]
    def empty(self):
        return not self.incoming and not self.outgoing
''','''
class MyQueue:
    def __init__(self):
        pass
    def push(self, x: int) -> None:
        pass
    def pop(self) -> int:
        pass
    def peek(self) -> int:
        pass
    def empty(self) -> bool:
        pass
''','仅使用两个栈实现先进先出的队列，提供 push、pop、peek、empty。pop 返回并移除队首；peek 只查看队首。调用 pop/peek 时队列非空。构造和 push 的输出为 null。',['最多 100 次操作','-10⁴ ≤ x ≤ 10⁴'],queue_cases,queue_model,'一个栈接收新元素，另一个栈按相反顺序提供队首。只有输出栈为空时才批量搬运，每个元素最多搬运一次，均摊 O(1)。',examples=[(queue_cases[0],[None,None,None,1,1,False])])

add(739,'daily-temperatures','每日温度','Medium',['单调栈'],'dailyTemperatures(self, temperatures: List[int]) -> List[int]','''
answer = [0] * len(temperatures)
stack = []
for i, value in enumerate(temperatures):
    while stack and temperatures[stack[-1]] < value:
        previous = stack.pop()
        answer[previous] = i - previous
    stack.append(i)
return answer
''','对每天的温度，计算至少还要等多少天才能遇到严格更高的温度。之后没有更高温度则记为 0。',['1 ≤ temperatures.length ≤ 10⁵','30 ≤ temperatures[i] ≤ 100'],[[[73,74,75,71,69,72,76,73]],[[30,40,50,60]],[[30,30,30]]]+arr_cases(1,35,lo=30,hi=100),lambda a:[next((j-i for j in range(i+1,len(a)) if a[j]>a[i]),0) for i in range(len(a))],'维护温度非递增的下标栈，当前温度能解决栈顶等待的问题。每个下标入栈、出栈各一次。时间 O(n)，空间 O(n)。',examples=[([[73,74,75,71,69,72,76,73]],[1,1,4,2,1,1,0,0])])

hist_cases=[[[2,1,5,6,2,3]],[[2,4]],[[0]],[[2,2,2]],[[5,4,3,2,1]],[[1,2,3,4,5]]]+arr_cases(1,22,lo=0,hi=10)
add(84,'largest-rectangle-in-histogram','柱状图中最大的矩形','Hard',['单调栈'],'largestRectangleArea(self, heights: List[int]) -> int','''
values = [0] + heights + [0]
stack = [0]
answer = 0
for i in range(1, len(values)):
    while values[stack[-1]] > values[i]:
        h = values[stack.pop()]
        answer = max(answer, h * (i - stack[-1] - 1))
    stack.append(i)
return answer
''','每根柱子的宽度为 1，高度由 heights 给出。求完全位于柱状图内部、边与坐标轴平行的矩形的最大面积。',['1 ≤ heights.length ≤ 10⁵','0 ≤ heights[i] ≤ 10⁴'],hist_cases,lambda a:max(min(a[i:j])*(j-i) for i in range(len(a)) for j in range(i+1,len(a)+1)),'用单调递增栈寻找每根柱子左右第一个更矮边界。弹栈时即可确定它作为最矮柱子的最大宽度；两端加零哨兵。时间 O(n)，空间 O(n)。',examples=[([[2,1,5,6,2,3]],10),([[2,4]],4)])
windowmax_cases=[[[1,3,-1,-3,5,3,6,7],3],[[1],1],[[9,9,9],2]]+[[a[0],rng.randint(1,len(a[0]))] for a in arr_cases(1,35)]
add(239,'sliding-window-maximum','滑动窗口最大值','Hard',['单调队列','堆','滑动窗口'],'maxSlidingWindow(self, nums: List[int], k: int) -> List[int]','''
from collections import deque
q, answer = deque(), []
for i, x in enumerate(nums):
    while q and q[0] <= i - k:
        q.popleft()
    while q and nums[q[-1]] <= x:
        q.pop()
    q.append(i)
    if i >= k - 1:
        answer.append(nums[q[0]])
return answer
''','长度为 k 的窗口从 nums 左端逐格移向右端。按顺序返回每个窗口内的最大值。',['1 ≤ k ≤ nums.length ≤ 10⁵','-10⁴ ≤ nums[i] ≤ 10⁴'],windowmax_cases,lambda a,k:[max(a[i:i+k]) for i in range(len(a)-k+1)],'双端队列保存值递减的候选下标。队首移除过期元素，队尾移除被新值支配的元素，队首即最大值。时间 O(n)，空间 O(k)。',examples=[([[1,3,-1,-3,5,3,6,7],3],[3,3,5,5,6,7])])

add(215,'kth-largest-element-in-an-array','数组中的第 K 个最大元素','Medium',['堆','排序'],'findKthLargest(self, nums: List[int], k: int) -> int','''
import heapq
heap = []
for x in nums:
    heapq.heappush(heap, x)
    if len(heap) > k:
        heapq.heappop(heap)
return heap[0]
''','返回 nums 按降序排列后的第 k 项，重复元素分别计数。k 从 1 开始。',['1 ≤ k ≤ nums.length ≤ 10⁵'],[[[3,2,1,5,6,4],2],[[3,2,3,1,2,4,5,5,6],4]]+[[a[0],rng.randint(1,len(a[0]))] for a in arr_cases(1,35)],lambda a,k:sorted(a,reverse=True)[k-1],'维护大小为 k 的小根堆，只保留当前最大的 k 个数。堆顶为这 k 个数的最小值，也就是所求值。时间 O(n log k)，空间 O(k)。',examples=[([[3,2,1,5,6,4],2],5),([[3,2,3,1,2,4,5,5,6],4],4)])

def stone_oracle(stones):
    while len(stones)>1:
        stones.sort();y=stones.pop();x=stones.pop()
        if y!=x:stones.append(y-x)
    return stones[0] if stones else 0
add(1046,'last-stone-weight','最后一块石头的重量','Easy',['堆'],'lastStoneWeight(self, stones: List[int]) -> int','''
import heapq
heap = [-x for x in stones]
heapq.heapify(heap)
while len(heap) > 1:
    y, x = -heapq.heappop(heap), -heapq.heappop(heap)
    if y != x:
        heapq.heappush(heap, x - y)
return -heap[0] if heap else 0
''','反复取出最重的两块石头 x≤y：若相等则都消失，否则留下重量 y-x 的石头。返回最后剩余重量；全消失返回 0。',['1 ≤ stones.length ≤ 30','1 ≤ stones[i] ≤ 1000'],[[[2,7,4,1,8,1]],[[1]],[[2,2]],[[1,1,1]]]+arr_cases(1,30,lo=1,hi=50),stone_oracle,'用负数模拟大根堆，每轮弹出两个最大重量并将差放回。时间 O(n log n)，空间 O(n)。',examples=[([[2,7,4,1,8,1]],1),([[2,2]],0)])

# Tree cases use LeetCode breadth-first arrays (null means a missing child).
class Node:
    def __init__(self,val=0,left=None,right=None):self.val,self.left,self.right=val,left,right


def tree(a):
    if not a or a[0] is None:return None
    root=Node(a[0]);q=deque([root]);i=1
    while q and i<len(a):
        node=q.popleft()
        for attr in ['left','right']:
            if i<len(a) and a[i] is not None:
                child=Node(a[i]);setattr(node,attr,child);q.append(child)
            i+=1
    return root


def serialize_tree(root):
    out=[];q=deque([root])
    while q:
        node=q.popleft();out.append(node.val if node else None)
        if node:q.extend([node.left,node.right])
    while out and out[-1] is None:out.pop()
    return out


def random_tree(n):
    if not n:return []
    nodes=[Node(rng.randrange(-9,10)) for _ in range(n)];slots=[(nodes[0],'left'),(nodes[0],'right')]
    for child in nodes[1:]:
        index=rng.randrange(len(slots));parent,attr=slots.pop(index);setattr(parent,attr,child);slots.extend([(child,'left'),(child,'right')])
    return serialize_tree(nodes[0])


def tree_levels(a):
    root=tree(a);q=deque([root] if root else []);out=[]
    while q:
        level=[]
        for _ in range(len(q)):
            node=q.popleft();level.append(node.val)
            for child in [node.left,node.right]:
                if child:q.append(child)
        out.append(level)
    return out


def inorder_oracle(a):
    root=tree(a);stack=[];out=[];current=root
    while current or stack:
        while current:stack.append(current);current=current.left
        current=stack.pop();out.append(current.val);current=current.right
    return out


def adjacency(a):
    root=tree(a);nodes=[];edges=[]
    def walk(node,parent=-1):
        if not node:return
        i=len(nodes);nodes.append(node.val)
        if parent>=0:edges.append((parent,i))
        walk(node.left,i);walk(node.right,i)
    walk(root)
    adj=[[] for _ in nodes]
    for u,v in edges:adj[u].append(v);adj[v].append(u)
    return nodes,edges,adj


def diameter_oracle(a):
    nodes,_,adj=adjacency(a);best=0
    for start in range(len(nodes)):
        q=deque([(start,-1,0)])
        while q:
            u,p,d=q.popleft();best=max(best,d)
            q.extend((v,u,d+1) for v in adj[u] if v!=p)
    return best


def tree_rob_oracle(a):
    vals,edges,_=adjacency(a);best=0
    for mask in range(1<<len(vals)):
        if all(not(mask>>u&1 and mask>>v&1) for u,v in edges):best=max(best,sum(v for i,v in enumerate(vals) if mask>>i&1))
    return best


def path_oracle(a):
    vals,_,adj=adjacency(a);best=-10**18
    for start in range(len(vals)):
        q=[(start,-1,vals[start])]
        while q:
            u,p,s=q.pop();best=max(best,s);q.extend((v,u,s+vals[v]) for v in adj[u] if v!=p)
    return best

basic_trees=[[],[1],[3,9,20,None,None,15,7],[1,None,2,3],[1,2,3,4,5],[1,2,2,3,4,4,3]]+[random_tree(rng.randrange(16)) for _ in range(25)]
add(104,'maximum-depth-of-binary-tree','二叉树的最大深度','Easy',['二叉树','递归'],'maxDepth(self, root: Optional[TreeNode]) -> int','''
if root is None:
    return 0
return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
''','返回从根结点到最远叶子结点的结点数。空树深度为 0。树用层序数组输入，null 表示缺失结点。',['0 ≤ 节点数 ≤ 10⁴'],[[a] for a in basic_trees],lambda a:len(tree_levels(a)),'空树返回 0；非空树深度为左右子树最大深度加 1。时间 O(n)，递归空间 O(h)。',argTypes=['tree'],examples=[([[3,9,20,None,None,15,7]],3),([[]],0)])
add(100,'same-tree','相同的树','Easy',['二叉树','递归'],'isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool','''
if not p or not q:
    return p is q
return p.val == q.val and self.isSameTree(p.left, q.left) and self.isSameTree(p.right, q.right)
''','两棵二叉树的结构完全相同，且对应结点的值相等时称为相同的树。判断给定的 p、q 是否相同。',['每棵树节点数在 0～100 之间'],[[a,a] for a in basic_trees]+[[[1,2],[1,None,2]],[[1,2,1],[1,1,2]]]+[[random_tree(5),random_tree(5)] for _ in range(15)],lambda a,b:serialize_tree(tree(a))==serialize_tree(tree(b)),'同步比较两棵树：都为空则相同，只有一个为空则不同，否则比较根值和两对子树。时间 O(n)，空间 O(h)。',argTypes=['tree','tree'],examples=[([[1,2,3],[1,2,3]],True),([[1,2],[1,None,2]],False)])
add(102,'binary-tree-level-order-traversal','二叉树的层序遍历','Medium',['二叉树','广度优先搜索'],'levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]','''
from collections import deque
q = deque([root] if root else [])
answer = []
while q:
    level = []
    for _ in range(len(q)):
        node = q.popleft()
        level.append(node.val)
        if node.left: q.append(node.left)
        if node.right: q.append(node.right)
    answer.append(level)
return answer
''','按从上到下的层次遍历二叉树，每层从左到右。返回二维数组，每个子数组保存一层结点值。空树返回空数组。',['0 ≤ 节点数 ≤ 2000'],[[a] for a in basic_trees],tree_levels,'使用队列。每轮固定当前队列长度，这些结点恰好属于同一层。时间 O(n)，空间 O(w)，w 为最大层宽。',argTypes=['tree'],examples=[([[3,9,20,None,None,15,7]],[[3],[9,20],[15,7]]),([[]],[])])
add(94,'binary-tree-inorder-traversal','二叉树的中序遍历','Easy',['二叉树','栈'],'inorderTraversal(self, root: Optional[TreeNode]) -> List[int]','''
answer = []
def dfs(node):
    if node:
        dfs(node.left)
        answer.append(node.val)
        dfs(node.right)
dfs(root)
return answer
''','按“左子树 → 根结点 → 右子树”的顺序返回二叉树结点值。空树返回空数组。',['0 ≤ 节点数 ≤ 100'],[[a] for a in basic_trees],inorder_oracle,'递归函数在访问左子树后记录根值，再访问右子树。可用显式栈模拟递归。时间 O(n)，空间 O(h)。',argTypes=['tree'],examples=[([[1,None,2,3]],[1,3,2]),([[]],[])])
add(98,'validate-binary-search-tree','验证二叉搜索树','Medium',['二叉搜索树','递归'],'isValidBST(self, root: Optional[TreeNode]) -> bool','''
def check(node, lower, upper):
    if not node:
        return True
    return lower < node.val < upper and check(node.left, lower, node.val) and check(node.right, node.val, upper)
return check(root, float('-inf'), float('inf'))
''','判断二叉树是否为严格二叉搜索树：每个结点左子树的所有值都小于它，右子树的所有值都大于它；左右子树也必须满足此条件。不允许重复值。',['1 ≤ 节点数 ≤ 10⁴','-2³¹ ≤ Node.val < 2³¹'],[[a] for a in basic_trees if a]+[[[2,1,3]],[[5,1,4,None,None,3,6]],[[2,2,2]],[[5,4,6,None,None,3,7]]],lambda a:(lambda seq:all(x<y for x,y in zip(seq,seq[1:])))(inorder_oracle(a)),'把祖先传递的开区间上下界递归传入子树，只比较直接父子值不够。时间 O(n)，空间 O(h)。',argTypes=['tree'],examples=[([[2,1,3]],True),([[5,1,4,None,None,3,6]],False)])


def make_bst(vals):
    if not vals:return []
    def build(a):
        if not a:return None
        m=len(a)//2;return Node(a[m],build(a[:m]),build(a[m+1:]))
    return serialize_tree(build(sorted(vals)))
bsts=[make_bst(rng.sample(range(-100,101),rng.randint(1,35))) for _ in range(25)]
add(230,'kth-smallest-element-in-a-bst','二叉搜索树中第 K 小的元素','Medium',['二叉搜索树','中序遍历'],'kthSmallest(self, root: Optional[TreeNode], k: int) -> int','''
stack = []
while root or stack:
    while root:
        stack.append(root)
        root = root.left
    root = stack.pop()
    k -= 1
    if k == 0:
        return root.val
    root = root.right
''','给定有效的二叉搜索树和从 1 开始的 k，返回第 k 小的结点值。所有结点值互不相同。',['1 ≤ k ≤ 节点数 ≤ 10⁴'],[[[3,1,4,None,2],1]]+[[a,rng.randint(1,len(inorder_oracle(a)))] for a in bsts],lambda a,k:sorted(inorder_oracle(a))[k-1],'二叉搜索树的中序遍历严格递增，第 k 个访问到的结点就是答案。时间 O(h+k)，空间 O(h)。',argTypes=['tree','raw'],examples=[([[3,1,4,None,2],1],1)])

def bst_search_oracle(a,value):
    root=tree(a);q=deque([root] if root else [])
    while q:
        node=q.popleft()
        if node.val==value:return serialize_tree(node)
        if node.left:q.append(node.left)
        if node.right:q.append(node.right)
    return []
add(700,'search-in-a-binary-search-tree','二叉搜索树中的搜索','Easy',['二叉搜索树'],'searchBST(self, root: Optional[TreeNode], val: int) -> Optional[TreeNode]','''
while root and root.val != val:
    root = root.left if val < root.val else root.right
return root
''','在二叉搜索树中查找值为 val 的结点，返回以该结点为根的子树；不存在则返回空树。返回值序列化为层序数组。',['1 ≤ 节点数 ≤ 5000','树是有效二叉搜索树'],[[[4,2,7,1,3],2],[[4,2,7,1,3],5]]+[[a,rng.choice(inorder_oracle(a)+[999])] for a in bsts],bst_search_oracle,'利用搜索树的顺序性质，每次只走向可能包含目标的一侧。时间 O(h)，空间 O(1)。',argTypes=['tree','raw'],returnType='tree',examples=[([[4,2,7,1,3],2],[2,1,3]),([[4,2,7,1,3],5],[])])

add(78,'subsets','子集','Medium',['回溯','位运算'],'subsets(self, nums: List[int]) -> List[List[int]]','''
answer = [[]]
for x in nums:
    answer += [subset + [x] for subset in answer]
return answer
''','nums 中元素互不相同，返回它的所有子集，包含空集和全集。子集顺序及子集内元素顺序不限。',['0 ≤ nums.length ≤ 10','nums 中元素互不相同'],[[[1,2,3]],[[]],[[0]]]+[[rng.sample(range(-10,11),rng.randrange(9))] for _ in range(22)],lambda a:[list(x) for size in range(len(a)+1) for x in combinations(a,size)],'对每个数，每个已有子集都有不选和选两种扩展。枚举出 2ⁿ 个结果，时间 O(n2ⁿ)，除结果外可用 O(n) 回溯栈。',compare='nested-unordered',examples=[([[1,2]],[[],[1],[2],[1,2]])])
add(77,'combinations','组合','Medium',['回溯'],'combine(self, n: int, k: int) -> List[List[int]]','''
answer, path = [], []
def dfs(start):
    if len(path) == k:
        answer.append(path.copy())
        return
    for value in range(start, n - (k - len(path)) + 2):
        path.append(value)
        dfs(value + 1)
        path.pop()
dfs(1)
return answer
''','从整数 1 到 n 中选择 k 个不同数字，返回所有组合。组合与组合内顺序不限，不允许重复组合。',['1 ≤ k ≤ n ≤ 20'],[[4,2],[1,1],[5,5]]+[[n,k] for n in range(2,9) for k in range(1,n+1)],lambda n,k:[list(x) for x in combinations(range(1,n+1),k)],'沿递增顺序选择元素，避免重复组合。剩余可选数不足以凑齐 k 个时剪枝。输出规模为 C(n,k)，时间 O(k·C(n,k))。',compare='nested-unordered',examples=[([4,2],[[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]])])
add(46,'permutations','全排列','Medium',['回溯'],'permute(self, nums: List[int]) -> List[List[int]]','''
answer, path, used = [], [], [False] * len(nums)
def dfs():
    if len(path) == len(nums):
        answer.append(path.copy())
        return
    for i, x in enumerate(nums):
        if not used[i]:
            used[i] = True
            path.append(x)
            dfs()
            path.pop()
            used[i] = False
dfs()
return answer
''','给定元素互不相同的 nums，返回所有排列。结果数组的顺序不限，但每个排列内部的顺序代表一个不同答案。',['1 ≤ nums.length ≤ 6','nums 中元素互不相同'],[[[1,2,3]],[[0,1]],[[1]]]+[[rng.sample(range(-8,9),rng.randint(1,6))] for _ in range(18)],lambda a:[list(x) for x in permutations(a)],'用 used 数组记录某位置是否已选，每层选择一个未使用元素并在回溯时恢复。时间 O(n·n!)，除结果外空间 O(n)。',compare='unordered',examples=[([[1,2]],[[1,2],[2,1]])])


def combination_oracle(candidates,target):
    return [sorted(x for x,count in zip(candidates,counts) for _ in range(count)) for counts in product(*(range(target//x+1) for x in candidates)) if sum(x*c for x,c in zip(candidates,counts))==target]
combo_cases=[[[2,3,6,7],7],[[2,3,5],8],[[2],1],[[1],4]]+[[rng.sample(range(2,9),rng.randint(1,4)),rng.randint(1,16)] for _ in range(20)]
add(39,'combination-sum','组合总和','Medium',['回溯'],'combinationSum(self, candidates: List[int], target: int) -> List[List[int]]','''
candidates.sort()
answer, path = [], []
def dfs(start, remaining):
    if remaining == 0:
        answer.append(path.copy())
        return
    for i in range(start, len(candidates)):
        x = candidates[i]
        if x > remaining:
            break
        path.append(x)
        dfs(i, remaining - x)
        path.pop()
dfs(0, target)
return answer
''','从互不相同的正整数 candidates 中选择若干数，使和等于 target。每个候选数可重复使用。返回所有不同的数值组合，顺序不限。',['1 ≤ candidates.length ≤ 30','1 ≤ candidates[i] ≤ 200','1 ≤ target ≤ 40'],combo_cases,combination_oracle,'固定递增的选取下标避免重复组合，重复使用当前数时递归仍从该下标开始。候选值大于剩余目标即可剪枝。复杂度取决于搜索树和答案数量。',compare='nested-unordered',examples=[([[2,3,6,7],7],[[2,2,3],[7]]),([[2],1],[])])

add(70,'climbing-stairs','爬楼梯','Easy',['动态规划'],'climbStairs(self, n: int) -> int','''
a, b = 1, 1
for _ in range(n):
    a, b = b, a + b
return a
''','到达 n 级楼梯顶部，每次可以上 1 级或 2 级。返回不同步长序列的数量。',['1 ≤ n ≤ 45'],[[n] for n in range(1,46)],lambda n:sum(__import__('math').comb(n-k,k) for k in range(n//2+1)),'最后一步来自 n-1 或 n-2 级，因此 f(n)=f(n-1)+f(n-2)。两个变量滚动维护状态。时间 O(n)，空间 O(1)。',examples=[([2],2),([3],3)])

def robber_oracle(a):
    return max(sum(a[i] for i in range(len(a)) if mask>>i&1) for mask in range(1<<len(a)) if not(mask & (mask<<1)))
add(198,'house-robber','打家劫舍','Medium',['动态规划'],'rob(self, nums: List[int]) -> int','''
skip = take = 0
for x in nums:
    skip, take = max(skip, take), skip + x
return max(skip, take)
''','房屋沿直线排列，第 i 间存有 nums[i] 金额。不能同时选择相邻房屋，返回可获得的最大金额。可以不选择任何房屋。',['1 ≤ nums.length ≤ 100','0 ≤ nums[i] ≤ 400'],[[[1,2,3,1]],[[2,7,9,3,1]],[[0]],[[9]]]+arr_cases(1,12,lo=0,hi=20),robber_oracle,'维护“不选当前房屋”和“选当前房屋”两种状态。选当前只能接在上一步不选的状态之后。时间 O(n)，空间 O(1)。',examples=[([[1,2,3,1]],4),([[2,7,9,3,1]],12)])

def lis_oracle(a):
    return max(len(seq) for mask in range(1<<len(a)) if (seq:=[a[i] for i in range(len(a)) if mask>>i&1]) is not None and all(x<y for x,y in zip(seq,seq[1:])))
add(300,'longest-increasing-subsequence','最长递增子序列','Medium',['动态规划','二分查找'],'lengthOfLIS(self, nums: List[int]) -> int','''
from bisect import bisect_left
tails = []
for x in nums:
    i = bisect_left(tails, x)
    if i == len(tails):
        tails.append(x)
    else:
        tails[i] = x
return len(tails)
''','返回 nums 的最长严格递增子序列长度。子序列可以删除元素，但保留剩余元素的相对顺序，不要求连续。',['1 ≤ nums.length ≤ 2500','-10⁴ ≤ nums[i] ≤ 10⁴'],[[[10,9,2,5,3,7,101,18]],[[0,1,0,3,2,3]],[[7,7,7,7]]]+arr_cases(1,12),lis_oracle,'tails[i] 保存长度 i+1 的递增子序列最小末尾值。二分找到可替换的位置，保持后续扩展机会。时间 O(n log n)，空间 O(n)。',examples=[([[10,9,2,5,3,7,101,18]],4),([[7,7,7,7]],1)])
add(416,'partition-equal-subset-sum','分割等和子集','Medium',['背包动态规划','回溯'],'canPartition(self, nums: List[int]) -> bool','''
total = sum(nums)
if total % 2:
    return False
target = total // 2
reachable = [False] * (target + 1)
reachable[0] = True
for x in nums:
    for value in range(target, x - 1, -1):
        reachable[value] = reachable[value] or reachable[value - x]
return reachable[target]
''','判断能否把 nums 的全部元素分成两个互不重叠的子集，使两个子集的元素和相等。每个位置的元素只可使用一次。',['1 ≤ nums.length ≤ 200','1 ≤ nums[i] ≤ 100'],[[[1,5,11,5]],[[1,2,3,5]],[[1]],[[2,2]]]+arr_cases(1,12,lo=1,hi=15),lambda a:sum(a)%2==0 and any(sum(x)==sum(a)//2 for n in range(len(a)+1) for x in combinations(a,n)),'总和必须是偶数，问题转为能否选出总和一半。0/1 背包倒序更新，避免同一元素被重复使用。时间 O(n·sum)，空间 O(sum)。',examples=[([[1,5,11,5]],True),([[1,2,3,5]],False)])


def coin_oracle(coins,amount):
    q=deque([(0,0)]);seen={0}
    while q:
        total,count=q.popleft()
        if total==amount:return count
        for c in coins:
            if total+c<=amount and total+c not in seen:seen.add(total+c);q.append((total+c,count+1))
    return -1
add(322,'coin-change','零钱兑换','Medium',['背包动态规划'],'coinChange(self, coins: List[int], amount: int) -> int','''
dp = [0] + [amount + 1] * amount
for value in range(1, amount + 1):
    for coin in coins:
        if coin <= value:
            dp[value] = min(dp[value], dp[value - coin] + 1)
return dp[amount] if dp[amount] <= amount else -1
''','每种硬币有无限枚，求恰好凑出 amount 的最少硬币数。不可能时返回 -1，amount=0 时返回 0。',['1 ≤ coins.length ≤ 12','1 ≤ coins[i] ≤ 2³¹-1','0 ≤ amount ≤ 10⁴'],[[[1,2,5],11],[[2],3],[[1],0],[[7,11],13]]+[[rng.sample(range(1,20),rng.randint(1,6)),rng.randrange(100)] for _ in range(25)],coin_oracle,'令 dp[x] 为凑出 x 的最少枚数，枚举最后一枚硬币转移。不可达状态用大值表示。时间 O(amount·硬币种类)，空间 O(amount)。',examples=[([[1,2,5],11],3),([[2],3],-1),([[1],0],0)])
add(494,'target-sum','目标和','Medium',['背包动态规划'],'findTargetSumWays(self, nums: List[int], target: int) -> int','''
from collections import defaultdict
counts = {0: 1}
for x in nums:
    following = defaultdict(int)
    for total, count in counts.items():
        following[total + x] += count
        following[total - x] += count
    counts = following
return counts.get(target, 0)
''','在每个 nums[i] 前独立选择 + 或 -，将所有带符号的数相加。返回结果等于 target 的符号选择数量。+0 和 -0 是两种不同选择。',['1 ≤ nums.length ≤ 20','0 ≤ nums[i] ≤ 1000','sum(nums) ≤ 1000','-1000 ≤ target ≤ 1000'],[[[1,1,1,1,1],3],[[0,0,0],0],[[1],2]]+[[a[0],rng.randint(-20,20)] for a in arr_cases(1,11,lo=0,hi=8)],lambda a,t:sum(sum(x*s for x,s in zip(a,signs))==t for signs in product([-1,1],repeat=len(a))),'记录处理前 i 个数时每种和的方案数。对当前数分别加、减，并累加到下一层；零的两条路径也要分别累计。时间 O(n·sum)，空间 O(sum)。',examples=[([[1,1,1,1,1],3],5),([[0,0,0],0],8)])


def lcs_oracle(a,b):
    subs={''.join(a[i] for i in range(len(a)) if mask>>i&1) for mask in range(1<<len(a))}
    def contained(s):
        it=iter(b);return all(any(ch==x for x in it) for ch in s)
    return max(map(len,filter(contained,subs)))
lcs_cases=[['abcde','ace'],['abc','abc'],['abc','def'],['','abc'],['abc','']]+[[''.join(rng.choices('abcd',k=rng.randrange(9))),''.join(rng.choices('abcd',k=rng.randrange(10)))] for _ in range(25)]
add(1143,'longest-common-subsequence','最长公共子序列','Medium',['二维动态规划','字符串'],'longestCommonSubsequence(self, text1: str, text2: str) -> int','''
previous = [0] * (len(text2) + 1)
for a in text1:
    current = [0]
    for j, b in enumerate(text2):
        current.append(previous[j] + 1 if a == b else max(previous[j + 1], current[-1]))
    previous = current
return previous[-1]
''','返回 text1 和 text2 的最长公共子序列长度。子序列保持相对顺序但不要求连续，没有公共字符时返回 0。本地也支持空串。',['0 ≤ text1.length, text2.length ≤ 1000','字符串由小写英文字母组成'],lcs_cases,lcs_oracle,'以两个前缀的长度定义状态。末尾相同时接到左上角状态之后，不同时取去掉任意一侧末尾的较大值。时间 O(mn)，滚动数组空间 O(n)。',examples=[(['abcde','ace'],3),(['abc','def'],0)])
add(62,'unique-paths','不同路径','Medium',['二维动态规划'],'uniquePaths(self, m: int, n: int) -> int','''
dp = [1] * n
for _ in range(m - 1):
    for j in range(1, n):
        dp[j] += dp[j - 1]
return dp[-1]
''','在 m 行 n 列网格中，从左上格到右下格，每次只能向右或向下移动一格。返回不同路径数量。',['1 ≤ m,n ≤ 100','测试数据保证答案 ≤ 2×10⁹'],[[m,n] for m in range(1,9) for n in range(1,9)]+[[20,10],[10,20]],lambda m,n:__import__('math').comb(m+n-2,m-1),'每格路径数等于上方与左方路径数之和。首行首列均为 1，用一维数组滚动更新。时间 O(mn)，空间 O(n)。',examples=[([3,7],28),([3,2],3)])


def stock_model(prices,cooldown=False):
    @lru_cache(None)
    def f(i,holding,blocked):
        if i==len(prices):return 0 if not holding else -10**9
        answer=f(i+1,holding,False)
        if holding:answer=max(answer,prices[i]+f(i+1,False,cooldown))
        elif not blocked:answer=max(answer,-prices[i]+f(i+1,True,False))
        return answer
    return f(0,False,False)
stock_cases=[[[7,1,5,3,6,4]],[[1,2,3,4,5]],[[7,6,4,3,1]],[[1]],[[0]]]+arr_cases(1,20,lo=0,hi=20)
add(122,'best-time-to-buy-and-sell-stock-ii','买卖股票的最佳时机 II','Medium',['状态机动态规划','贪心'],'maxProfit(self, prices: List[int]) -> int','''
return sum(max(0, b - a) for a, b in zip(prices, prices[1:]))
''','prices[i] 为第 i 天股价。可完成多次买入卖出，但任意时刻最多持有一股。可在同一天先卖再买。返回最大总利润，不交易时利润为 0。',['1 ≤ prices.length ≤ 3×10⁴','0 ≤ prices[i] ≤ 10⁴'],stock_cases,lambda p:stock_model(p),'任意一段上涨的买卖利润等于逐日正收益之和，因此把所有相邻上涨差值累加。也可用持有/未持有两个状态。时间 O(n)，空间 O(1)。',examples=[([[7,1,5,3,6,4]],7),([[7,6,4,3,1]],0)])
add(309,'best-time-to-buy-and-sell-stock-with-cooldown','买卖股票的最佳时机含冷冻期','Medium',['状态机动态规划'],'maxProfit(self, prices: List[int]) -> int','''
hold, sold, rest = -prices[0], float('-inf'), 0
for price in prices[1:]:
    hold, sold, rest = max(hold, rest - price), hold + price, max(rest, sold)
return max(sold, rest)
''','可以多次买卖股票且最多持有一股。卖出后的下一天是冷冻期，不能买入；再下一天可以。返回最大利润。',['1 ≤ prices.length ≤ 5000','0 ≤ prices[i] ≤ 1000'],[[[1,2,3,0,2]],[[1]]]+arr_cases(1,20,lo=0,hi=20),lambda p:stock_model(p,True),'保存持有、当天卖出、可买入休息三个状态。买入只能来自上一天休息状态，不能来自上一天卖出。用旧状态同时转移。时间 O(n)，空间 O(1)。',examples=[([[1,2,3,0,2]],3),([[1]],0)])


def pal_subseq_oracle(s):
    return max(len(x) for mask in range(1<<len(s)) if (x:=''.join(s[i] for i in range(len(s)) if mask>>i&1))==x[::-1])
add(516,'longest-palindromic-subsequence','最长回文子序列','Medium',['区间动态规划','字符串'],'longestPalindromeSubseq(self, s: str) -> int','''
n = len(s)
dp = [[0] * n for _ in range(n)]
for i in range(n - 1, -1, -1):
    dp[i][i] = 1
    for j in range(i + 1, n):
        dp[i][j] = dp[i + 1][j - 1] + 2 if s[i] == s[j] else max(dp[i + 1][j], dp[i][j - 1])
return dp[0][n - 1]
''','返回 s 中最长回文子序列的长度。可以删除若干字符但须保留相对顺序；不要求连续。',['1 ≤ s.length ≤ 1000','s 只含小写英文字母'],[['bbbab'],['cbbd'],['a'],['abcdef'],['aaaaaa']]+[[''.join(rng.choices('abcd',k=rng.randint(1,12)))] for _ in range(24)],pal_subseq_oracle,'区间 dp[i][j] 表示该子串中的答案。两端相同可同时选入，否则舍弃一端取较大值。按左端递减顺序计算。时间 O(n²)，空间 O(n²)。',examples=[(['bbbab'],4),(['cbbd'],2)])


def balloons_oracle(nums):
    @lru_cache(None)
    def f(a):
        if not a:return 0
        return max((a[i-1] if i else 1)*a[i]*(a[i+1] if i+1<len(a) else 1)+f(a[:i]+a[i+1:]) for i in range(len(a)))
    return f(tuple(nums))
add(312,'burst-balloons','戳气球','Hard',['区间动态规划'],'maxCoins(self, nums: List[int]) -> int','''
a = [1] + nums + [1]
n = len(a)
dp = [[0] * n for _ in range(n)]
for width in range(2, n):
    for left in range(n - width):
        right = left + width
        dp[left][right] = max(dp[left][k] + dp[k][right] + a[left] * a[k] * a[right] for k in range(left + 1, right))
return dp[0][-1]
''','每次戳破一个气球，获得它与当前左右相邻气球数值乘积的金币。缺失的邻居视为 1。所有气球都戳破后，求最多金币。邻接关系随戳破而改变。',['1 ≤ nums.length ≤ 300','0 ≤ nums[i] ≤ 100'],[[[3,1,5,8]],[[1,5]],[[0]],[[0,1,0]]]+arr_cases(1,7,22,lo=0,hi=7),balloons_oracle,'在两端补 1，定义开区间的最大收益。枚举区间中最后戳破的气球，此时左右边界确定，两侧子问题独立。时间 O(n³)，空间 O(n²)。',examples=[([[3,1,5,8]],167),([[1,5]],10)])

add(543,'diameter-of-binary-tree','二叉树的直径','Easy',['树形动态规划','二叉树'],'diameterOfBinaryTree(self, root: Optional[TreeNode]) -> int','''
answer = 0
def depth(node):
    nonlocal answer
    if not node:
        return 0
    left, right = depth(node.left), depth(node.right)
    answer = max(answer, left + right)
    return max(left, right) + 1
depth(root)
return answer
''','二叉树中任意两个结点间最长路径所含的边数称为直径。路径可以不经过根结点。单个结点的直径为 0。',['1 ≤ 节点数 ≤ 10⁴'],[[a] for a in basic_trees if a]+[[[1,2]]],diameter_oracle,'向父结点返回单侧最大深度，在当前结点合并左右深度更新全局直径。深度按结点计数，左右深度之和恰好是边数。时间 O(n)，空间 O(h)。',argTypes=['tree'],examples=[([[1,2,3,4,5]],3),([[1,2]],1)])
tree_rob_cases=[[[3,2,3,None,3,None,1]],[[3,4,5,1,3,None,1]],[[1]]]+[[random_tree(rng.randint(1,12))] for _ in range(23)]
# Robber's canonical inputs are nonnegative.
for c in tree_rob_cases:c[0]=[abs(x) if x is not None else None for x in c[0]]
add(337,'house-robber-iii','打家劫舍 III','Medium',['树形动态规划'],'rob(self, root: Optional[TreeNode]) -> int','''
def dfs(node):
    if not node:
        return 0, 0
    left_skip, left_take = dfs(node.left)
    right_skip, right_take = dfs(node.right)
    skip = max(left_skip, left_take) + max(right_skip, right_take)
    take = node.val + left_skip + right_skip
    return skip, take
return max(dfs(root))
''','房屋组成一棵二叉树，每个结点值为金额。不能同时选择由一条边直接连接的两间房屋。返回可获得的最大金额。',['1 ≤ 节点数 ≤ 10⁴','0 ≤ Node.val ≤ 10⁴'],tree_rob_cases,tree_rob_oracle,'每个子树返回不选根、选根两个状态。选根时孩子都不能选；不选根时每个孩子可独立取较大状态。时间 O(n)，空间 O(h)。',argTypes=['tree'],examples=[([[3,2,3,None,3,None,1]],7),([[3,4,5,1,3,None,1]],9)])
add(124,'binary-tree-maximum-path-sum','二叉树中的最大路径和','Hard',['树形动态规划'],'maxPathSum(self, root: Optional[TreeNode]) -> int','''
answer = float('-inf')
def gain(node):
    nonlocal answer
    if not node:
        return 0
    left = max(0, gain(node.left))
    right = max(0, gain(node.right))
    answer = max(answer, node.val + left + right)
    return node.val + max(left, right)
gain(root)
return answer
''','路径由一个或多个不同结点组成，相邻结点之间必须有边。路径可从任意结点开始和结束，且不能重复经过结点。返回非空路径的最大结点值之和。',['1 ≤ 节点数 ≤ 3×10⁴','-1000 ≤ Node.val ≤ 1000'],[[[1,2,3]],[[-10,9,20,None,None,15,7]],[[-3]],[[-2,-1]]]+[[a] for a in basic_trees if a],path_oracle,'向父结点只能贡献一条单侧路径；当前结点可合并左右正贡献形成完整路径。答案初始化为负无穷以覆盖全负数树。时间 O(n)，空间 O(h)。',argTypes=['tree'],examples=[([[-10,9,20,None,None,15,7]],42),([[-3]],-3)])


def islands_oracle(grid):
    m,n=len(grid),len(grid[0]);parent=list(range(m*n))
    def find(x):
        while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
        return x
    for i in range(m):
        for j in range(n):
            if grid[i][j]=='1':
                for x,y in [(i+1,j),(i,j+1)]:
                    if x<m and y<n and grid[x][y]=='1':parent[find(i*n+j)]=find(x*n+y)
    return len({find(i*n+j) for i in range(m) for j in range(n) if grid[i][j]=='1'})
island_cases=[[[list('11110'),list('11010'),list('11000'),list('00000')]],[[list('11000'),list('11000'),list('00100'),list('00011')]],[[['0']]],[[['1']]]]+[[[[rng.choice('01') for _ in range(n)] for _ in range(m)]] for m in range(1,7) for n in range(1,5)]
add(200,'number-of-islands','岛屿数量','Medium',['图','深度优先搜索','矩阵'],'numIslands(self, grid: List[List[str]]) -> int','''
m, n = len(grid), len(grid[0])
seen = set()
answer = 0
for i in range(m):
    for j in range(n):
        if grid[i][j] != '1' or (i, j) in seen:
            continue
        answer += 1
        stack = [(i, j)]
        seen.add((i, j))
        while stack:
            x, y = stack.pop()
            for nx, ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if 0 <= nx < m and 0 <= ny < n and grid[nx][ny] == '1' and (nx,ny) not in seen:
                    seen.add((nx,ny))
                    stack.append((nx,ny))
return answer
''','二维网格由字符串字符 "1"（陆地）和 "0"（水）组成。上下左右相邻陆地连成一座岛，斜向不连接。网格外均为水，返回岛屿数量。',['1 ≤ m,n ≤ 300','grid[i][j] 是字符串 "0" 或 "1"'],island_cases,islands_oracle,'逐格寻找尚未访问的陆地，每次搜索标记整个连通块并增加计数。使用显式栈避免深递归。时间 O(mn)，空间 O(mn)。',examples=[(island_cases[0],1),(island_cases[1],3)])


def course_oracle(n,edges):
    reach=[[False]*n for _ in range(n)]
    for a,b in edges:reach[b][a]=True
    for k in range(n):
        for i in range(n):
            for j in range(n):reach[i][j]=reach[i][j] or reach[i][k] and reach[k][j]
    return not any(reach[i][i] for i in range(n))
course_cases=[[2,[[1,0]]],[2,[[1,0],[0,1]]],[1,[]],[3,[[0,0]]],[4,[[1,0],[2,0],[3,1],[3,2]]]]
for n in range(2,10):
    for _ in range(3):course_cases.append([n,[[i,j] for i in range(n) for j in range(n) if rng.random()<.15]])
add(207,'course-schedule','课程表','Medium',['图','拓扑排序'],'canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool','''
from collections import deque
edges = [[] for _ in range(numCourses)]
indegree = [0] * numCourses
for a, b in prerequisites:
    edges[b].append(a)
    indegree[a] += 1
q = deque(i for i in range(numCourses) if indegree[i] == 0)
finished = 0
while q:
    node = q.popleft()
    finished += 1
    for following in edges[node]:
        indegree[following] -= 1
        if indegree[following] == 0:
            q.append(following)
return finished == numCourses
''','课程编号为 0 到 numCourses-1。每个 `[a,b]` 表示修 a 前必须先修 b。判断是否存在一种顺序可以完成所有课程。',['1 ≤ numCourses ≤ 2000','0 ≤ prerequisites.length ≤ 5000','0 ≤ a,b < numCourses','先修关系不重复'],course_cases,course_oracle,'将先修关系看作有向边，进行拓扑排序。每次移除入度为零结点；若最终无法移除全部结点，剩余图含环。时间 O(V+E)，空间 O(V+E)。',examples=[([2,[[1,0]]],True),([2,[[1,0],[0,1]]],False)])


def network_oracle(times,n,k):
    d=[[float('inf')]*n for _ in range(n)]
    for i in range(n):d[i][i]=0
    for u,v,w in times:d[u-1][v-1]=min(d[u-1][v-1],w)
    for mid in range(n):
        for i in range(n):
            for j in range(n):d[i][j]=min(d[i][j],d[i][mid]+d[mid][j])
    result=max(d[k-1]);return -1 if result==float('inf') else result
network_cases=[[[[2,1,1],[2,3,1],[3,4,1]],4,2],[[[1,2,1]],2,1],[[[1,2,1]],2,2],[[],1,1]]
for n in range(2,10):
    for _ in range(3):network_cases.append([[[i,j,rng.randrange(10)] for i in range(1,n+1) for j in range(1,n+1) if i!=j and rng.random()<.25],n,rng.randint(1,n)])
add(743,'network-delay-time','网络延迟时间','Medium',['图','最短路径','堆'],'networkDelayTime(self, times: List[List[int]], n: int, k: int) -> int','''
import heapq
edges = [[] for _ in range(n + 1)]
for u, v, w in times:
    edges[u].append((v, w))
distance = [float('inf')] * (n + 1)
distance[k] = 0
heap = [(0, k)]
while heap:
    cost, u = heapq.heappop(heap)
    if cost != distance[u]:
        continue
    for v, w in edges[u]:
        if cost + w < distance[v]:
            distance[v] = cost + w
            heapq.heappush(heap, (cost + w, v))
answer = max(distance[1:])
return -1 if answer == float('inf') else answer
''','n 个结点编号为 1..n。times 中 `[u,v,w]` 表示从 u 到 v 的有向边，耗时 w。从 k 同时向网络发送信号，返回所有结点都收到信号的最早时间；存在不可达结点则返回 -1。',['1 ≤ n ≤ 100','0 ≤ times.length ≤ 6000','0 ≤ w ≤ 100','同一有向边不重复'],network_cases,network_oracle,'边权非负，使用堆优化 Dijkstra 求源点到所有点的最短路，再取最大值。跳过堆里的过期距离。时间 O((V+E) log V)，空间 O(V+E)。',examples=[([[[2,1,1],[2,3,1],[3,4,1]],4,2],2),([[[1,2,1]],2,2],-1)])


def merge_oracle(intervals):
    parent=list(range(len(intervals)))
    def find(i):
        while i!=parent[i]:i=parent[i]
        return i
    for i in range(len(intervals)):
        for j in range(i):
            a,b=intervals[i];c,d=intervals[j]
            if max(a,c)<=min(b,d):parent[find(i)]=find(j)
    groups={}
    for i,(a,b) in enumerate(intervals):
        key=find(i)
        if key not in groups:groups[key]=[a,b]
        else:groups[key]=[min(a,groups[key][0]),max(b,groups[key][1])]
    return list(groups.values())
merge_cases=[[[[1,3],[2,6],[8,10],[15,18]]],[[[1,4],[4,5]]],[[[1,4],[2,3]]]]
for _ in range(25):
    ints=[]
    for _ in range(rng.randint(1,20)):
        a,b=sorted(rng.sample(range(31),2));ints.append([a,b])
    merge_cases.append([ints])
add(56,'merge-intervals','合并区间','Medium',['贪心','区间','排序'],'merge(self, intervals: List[List[int]]) -> List[List[int]]','''
intervals.sort()
answer = []
for left, right in intervals:
    if not answer or left > answer[-1][1]:
        answer.append([left, right])
    else:
        answer[-1][1] = max(answer[-1][1], right)
return answer
''','给定若干闭区间 `[start,end]`，合并所有重叠的区间。端点相接也视为重叠。返回互不重叠且覆盖范围与输入一致的区间集合，区间顺序不限。',['1 ≤ intervals.length ≤ 10⁴','0 ≤ start ≤ end ≤ 10⁴'],merge_cases,merge_oracle,'按左端点排序，当前区间只可能与最后一个已合并区间相交。相交时扩展右端点，否则开启新区间。时间 O(n log n)，除结果外空间由排序决定。',compare='unordered',examples=[([[[1,3],[2,6],[8,10],[15,18]]],[[1,6],[8,10],[15,18]]),([[[1,4],[4,5]]],[[1,5]])])


def jump_oracle(a):
    reached={0}
    for i in range(len(a)):
        if i in reached:reached.update(range(i+1,min(len(a),i+a[i]+1)))
    return len(a)-1 in reached
add(55,'jump-game','跳跃游戏','Medium',['贪心'],'canJump(self, nums: List[int]) -> bool','''
farthest = 0
for i, length in enumerate(nums):
    if i > farthest:
        return False
    farthest = max(farthest, i + length)
    if farthest >= len(nums) - 1:
        return True
return True
''','初始位于下标 0，nums[i] 表示从该位置最多可向右跳多少格。判断能否到达最后一个下标；数组只有一个元素时已经到达。',['1 ≤ nums.length ≤ 10⁴','0 ≤ nums[i] ≤ 10⁵'],[[[2,3,1,1,4]],[[3,2,1,0,4]],[[0]],[[1,0]]]+arr_cases(1,30,lo=0,hi=5),jump_oracle,'扫描已可达的位置并更新最远可达下标。如果当前下标已经超出可达范围，后面也无法越过这个缺口。时间 O(n)，空间 O(1)。',examples=[([[2,3,1,1,4]],True),([[3,2,1,0,4]],False)])

single_cases=[[[2,2,1]],[[4,1,2,1,2]],[[-1]]]
for _ in range(27):
    vals=rng.sample(range(-100,101),rng.randint(1,20));a=[vals[0]]+vals[1:]*2;rng.shuffle(a);single_cases.append([a])
add(136,'single-number','只出现一次的数字','Easy',['位运算'],'singleNumber(self, nums: List[int]) -> int','''
answer = 0
for x in nums:
    answer ^= x
return answer
''','非空 nums 中恰有一个元素出现一次，其余元素均出现两次。返回只出现一次的元素，要求线性时间和常数额外空间。',['1 ≤ nums.length ≤ 3×10⁴','-3×10⁴ ≤ nums[i] ≤ 3×10⁴'],single_cases,lambda a:next(x for x in a if a.count(x)==1),'异或满足交换律与结合律，x^x=0、x^0=x。所有成对元素抵消，剩下目标值。时间 O(n)，空间 O(1)。',examples=[([[2,2,1]],1),([[4,1,2,1,2]],4)])
add(191,'number-of-1-bits','位 1 的个数','Easy',['位运算'],'hammingWeight(self, n: int) -> int','''
answer = 0
while n:
    n &= n - 1
    answer += 1
return answer
''','给定非负整数 n，返回它的 32 位二进制表示中 1 的数量。前导零不计入。',['0 ≤ n < 2³²'],[[0],[11],[128],[2147483645],[2**32-1]]+[[rng.randrange(2**32)] for _ in range(30)],lambda n:bin(n).count('1'),'n & (n-1) 每次清除最低位的 1。循环次数等于 1 的数量。时间 O(置位数)，空间 O(1)。',examples=[([11],3),([128],1)])


def trie_model(ops,args):
    words=set();out=[None]
    for op,arg in zip(ops[1:],args[1:]):
        if op=='insert':words.add(arg[0]);out.append(None)
        elif op=='search':out.append(arg[0] in words)
        else:out.append(any(w.startswith(arg[0]) for w in words))
    return out
trie_cases=[[['Trie','insert','search','search','startsWith','insert','search'],[[],['apple'],['apple'],['app'],['app'],['app'],['app']]]]
for _ in range(24):
    ops=['Trie'];args=[[]];pool=[''.join(rng.choices('abcd',k=rng.randint(1,7))) for _ in range(12)]
    for _ in range(40):
        op=rng.choice(['insert','search','startsWith']);word=rng.choice(pool)
        if op=='startsWith':word=word[:rng.randint(1,len(word))]
        ops.append(op);args.append([word])
    trie_cases.append([ops,args])
design(208,'implement-trie-prefix-tree','实现 Trie（前缀树）','Medium',['字典树','字符串','设计'],'Trie','''
class Trie:
    def __init__(self):
        self.root = {}
    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node['#'] = True
    def _find(self, text):
        node = self.root
        for ch in text:
            if ch not in node:
                return None
            node = node[ch]
        return node
    def search(self, word):
        node = self._find(word)
        return node is not None and '#' in node
    def startsWith(self, prefix):
        return self._find(prefix) is not None
''','''
class Trie:
    def __init__(self):
        pass
    def insert(self, word: str) -> None:
        pass
    def search(self, word: str) -> bool:
        pass
    def startsWith(self, prefix: str) -> bool:
        pass
''','实现前缀树。insert(word) 插入单词；search(word) 判断完整单词是否已插入；startsWith(prefix) 判断是否存在已插入单词以 prefix 开头。插入同一单词多次不改变查询结果。构造与 insert 输出 null。',['1 ≤ word.length,prefix.length ≤ 2000','只含小写英文字母','最多 3×10⁴ 次操作'],trie_cases,trie_model,'沿字符逐层建立字典结点，用独立终止标记区分完整单词与前缀。每次操作时间 O(L)，总空间 O(已插入字符总数)。',examples=[(trie_cases[0],[None,None,True,False,True,None,True])])


def lru_model(ops,args):
    capacity=args[0][0];items=[];out=[None]
    for op,arg in zip(ops[1:],args[1:]):
        key=arg[0];index=next((i for i,(k,v) in enumerate(items) if k==key),None)
        if op=='get':
            if index is None:out.append(-1)
            else:
                item=items.pop(index);items.append(item);out.append(item[1])
        else:
            if index is not None:items.pop(index)
            items.append((key,arg[1]))
            if len(items)>capacity:items.pop(0)
            out.append(None)
    return out
lru_cases=[[['LRUCache','put','put','get','put','get','put','get','get','get'],[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]], [['LRUCache','put','put','get','put','get','get'],[[1],[2,1],[2,2],[2],[3,3],[2],[3]]]]
for cap in range(1,6):
    for _ in range(5):
        ops=['LRUCache'];args=[[cap]]
        for _ in range(60):
            op=rng.choice(['get','put']);key=rng.randrange(9);ops.append(op);args.append([key] if op=='get' else [key,rng.randrange(100)])
        lru_cases.append([ops,args])
design(146,'lru-cache','LRU 缓存','Medium',['设计','哈希表','链表'],'LRUCache','''
from collections import OrderedDict
class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.data = OrderedDict()
    def get(self, key):
        if key not in self.data:
            return -1
        self.data.move_to_end(key)
        return self.data[key]
    def put(self, key, value):
        self.data[key] = value
        self.data.move_to_end(key)
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)
''','''
class LRUCache:
    def __init__(self, capacity: int):
        pass
    def get(self, key: int) -> int:
        pass
    def put(self, key: int, value: int) -> None:
        pass
''','实现容量固定的最近最少使用缓存。get(key) 返回值，缺失返回 -1；命中时更新最近使用顺序。put(key,value) 新增或更新键并标记为最近使用，容量超限时删除最久未使用的键。get/put 平均 O(1)。构造和 put 输出 null。',['1 ≤ capacity ≤ 3000','0 ≤ key ≤ 10⁴','0 ≤ value ≤ 10⁵','最多 2×10⁵ 次操作'],lru_cases,lru_model,'用哈希表定位键，用双向链表维护使用先后。Python OrderedDict 同时提供这两种能力，命中或更新后移至尾部，超限弹出头部。每次操作平均 O(1)，空间 O(capacity)。',examples=[(lru_cases[0],[None,None,None,1,None,-1,None,-1,3,4])])

# Cross-topic problems keep a single identity, draft, history and progress record.
CHAPTERS = [
('arrays-hashing','数组与哈希表','从线性扫描到快速索引','数据结构',['two-sum','valid-anagram','product-of-array-except-self'],['roadmap','eng','240523-sort'],
 '先弄清输入输出与重复值含义，再选择能把“查找”变快的结构。哈希表把常见查询降为平均 O(1)，前后缀积则可消除重复计算。','重复元素按位置还是按数值去重？先查询再写入能避免在两数之和中重复使用同一位置。','先做两数之和，再做字母计数，最后用两遍扫描练习前后缀积。'),
('strings','字符串','字符频次、窗口与规范化','数据结构',['valid-palindrome','longest-substring-without-repeating-characters','group-anagrams'],['eng','240228-same-dire-double-pointer-slide-window'],
 '字符串可视为字符序列。遇到忽略符号和大小写的问题先规范比较规则；遇到异位词用频次或排序键；连续不重复片段用滑动窗口。','子串要求连续，子序列只要求相对顺序。移除重复字符时左边界不能后退。','验证回文串 → 无重复字符的最长子串 → 字母异位词分组。'),
('matrix','矩阵与原地操作','二维边界与空间复用','数据结构',['rotate-image','set-matrix-zeroes','spiral-matrix'],['todolist'],
 '二维遍历先确定行列数及合法坐标。旋转可以分解为转置与反转，矩阵置零可复用首行首列作为标记，螺旋遍历维护四条边界。','单行、单列和首行首列含零最容易出错。原地题必须修改参数；只返回一个新矩阵不会通过判题。','旋转图像 → 矩阵置零 → 螺旋矩阵。矩阵扫描一般为 O(mn)。'),
('linked-reversal','链表反转与删除','维护结点而非数组下标','数据结构',['reverse-linked-list','remove-nth-node-from-end-of-list','middle-of-the-linked-list'],['240229-04-linked-list-reverse','240303-06-linked-list-remove'],
 '链表改动是修改结点之间的引用。先保存后继再断开连接；哨兵结点能统一头结点删除与普通结点删除。','空链表、只剩一个结点、删除头结点容易遗漏。不要只修改节点值来代替需要的结构操作。','反转链表 → 中间结点 → 删除倒数第 N 个结点。典型解法 O(n) 时间、O(1) 额外空间。'),
('linked-fast-slow','快慢指针与 LRU','速度差与最近使用顺序','数据结构',['middle-of-the-linked-list','linked-list-cycle','lru-cache'],['240303-05-linked-list-slow-fast-cycle','240525-lru'],
 '快慢指针以不同速度遍历同一条链，可寻找中点或判断环。LRU 则把哈希定位与双向链表顺序结合，缓存访问后移动到最近使用端。','环检测要比较结点身份而非节点值。偶数长度中点需确认取前一个还是后一个；LRU 更新已有键也算一次使用。','中间结点 → 环形链表 → LRU 缓存。前两题 O(n)，LRU 单次操作平均 O(1)。'),
('stack-queue','栈与队列','后进先出与先进先出','数据结构',['valid-parentheses','min-stack','implement-queue-using-stacks'],['roadmap'],
 '栈适合管理尚未完成且后来的先处理的任务；队列适合按进入顺序处理。辅助状态可随栈元素一起保存，两个栈可以实现均摊常数时间的队列。','括号必须类型与嵌套顺序都匹配。最小值重复出现时也要正确恢复；输出栈非空时不应重复搬运输入栈。','有效括号 → 最小栈 → 双栈队列。区分最坏单次成本与均摊成本。'),
('monotonic','单调栈与单调队列','维护永远可能有用的候选','数据结构',['daily-temperatures','largest-rectangle-in-histogram','sliding-window-maximum'],['240514-monotonic-stack','240515-monotonic-queue'],
 '单调结构通过淘汰被当前元素支配的候选来避免重复比较。栈用于求下一个更大或更小元素，队列还需要移除过期的窗口下标。','保存下标才能计算距离和判断是否过期。严格大于与大于等于会影响重复值处理；柱状图注意两端哨兵。','每日温度 → 滑动窗口最大值 → 最大矩形。每个下标入出各一次，时间通常 O(n)。'),
('heap','堆与优先队列','持续维护极值候选','数据结构',['last-stone-weight','kth-largest-element-in-an-array','sliding-window-maximum'],['240525-heap','240523-sort'],
 '堆能在动态集合中快速取最小值。Python heapq 是小根堆，取最大值可存负数；维护第 K 大时保留 K 个最大值的小根堆。','第 K 大包含重复值。使用负数模拟大根堆时，小心弹出后符号转换；固定窗口堆还需要清理过期元素。','最后一块石头 → 第 K 大 → 用堆重新尝试滑动窗口最大值。插入弹出 O(log n)。'),
('tree-recursion','二叉树递归','明确子问题返回什么','数据结构',['maximum-depth-of-binary-tree','same-tree','diameter-of-binary-tree'],['240305-07-binary-tree-and-recursion','240309-08-binary-tree-and-recursion-v2'],
 '写递归前明确空树答案、当前根需要左右子树的什么信息，以及函数返回给父节点的含义。深度与直径虽然相关，但返回状态和全局答案不同。','深度按结点数，直径按边数；路径可能不经过根。空树的返回值必须与递推式一致。','最大深度 → 相同的树 → 直径。每个结点处理一次为 O(n)，递归栈 O(h)。'),
('tree-traversal','二叉树遍历','递归顺序与按层访问','数据结构',['binary-tree-inorder-traversal','binary-tree-level-order-traversal','maximum-depth-of-binary-tree'],['240309-09-bt-front-middle-back-traversal','240311-bp-level-order-traversal','240309-10-bp-nearest-ancestor'],
 '深度优先遍历的前、中、后序由处理根的时机决定。广度优先遍历使用队列，每轮固定当前层长度，再加入下一层。最近公共祖先笔记也可在此继续阅读。','空树返回空结果。层序遍历时若直接遍历不断增长的队列，会把不同层混在一起。','中序遍历 → 层序遍历 → 用层数重写最大深度。遍历时间 O(n)，队列空间 O(最大层宽)。'),
('binary-search-tree','二叉搜索树','让中序与值域帮助搜索','数据结构',['validate-binary-search-tree','kth-smallest-element-in-a-bst','search-in-a-binary-search-tree'],['240309-09-bt-front-middle-back-traversal','240309-10-bp-nearest-ancestor'],
 '严格二叉搜索树要求左子树所有值小于根、右子树所有值大于根。中序遍历严格递增，值的上下界能从祖先一路向下传递。','只比较直接父子结点不足以验证整棵树；重复值在本章定义中不合法。搜索最坏时间为 O(h)，不保证树平衡。','搜索结点 → 验证 BST → 第 K 小。中序选择可提前停止。'),
('graphs','图遍历与最短路径','连通、依赖与距离','数据结构',['number-of-islands','course-schedule','network-delay-time'],['240524-graph-v1-iteration','240524-graph-v2'],
 '先辨别图是有向还是无向、有权还是无权。连通块用 DFS/BFS，依赖关系用拓扑排序，非负边单源最短路可用 Dijkstra。','访问标记要在入栈或入队时完成。不能把无向连通概念直接套在课程依赖上；Dijkstra 不支持负权边。','岛屿数量 → 课程表 → 网络延迟时间。最后一题顺便复习优先队列。'),
('trie','字典树','共享前缀，区分路径与完整单词','数据结构',['implement-trie-prefix-tree'],['roadmap'],
 '字典树按字符逐层连接节点，共有前缀的单词共享同一条路径。插入时建立缺失的节点，查询时逐字符前进，并用独立的结束标记记录完整单词。','路径存在只说明前缀存在，search 还必须检查结束标记；startsWith 不要求结束标记。重复插入不能破坏已有单词或前缀。','通过实现 Trie 分别练习 insert、search 与 startsWith，并对照同一字符串作为前缀和完整单词时的不同结果。单次操作时间 O(L)，空间取决于新增字符路径的数量。'),
('two-pointers','相向双指针','从两端收缩候选空间','算法',['valid-palindrome','3sum','container-with-most-water'],['240224-opposite-double-pointer'],
 '在有序性或单调性支持下，从两端同时观察可以一次排除一批候选。排序后固定一个元素，再在余下区间使用相向双指针。','三数之和需要对结果去重；盛水容器移动短边有证明依据，不能套用为任意问题的通用规则。','验证回文串 → 盛最多水的容器 → 三数之和。双指针扫描 O(n)，固定一层后通常为 O(n²)。'),
('sliding-window','滑动窗口','把连续区间维护成状态','算法',['longest-substring-without-repeating-characters','minimum-size-subarray-sum','max-consecutive-ones-iii'],['240228-same-dire-double-pointer-slide-window'],
 '右端扩展窗口，更新区间状态；条件不满足时移动左端恢复合法性。判断题目是在求合法窗口最大值还是达标窗口最小值。','最短子数组的和需要正数单调性，负数输入不能直接复用该解法。注意 k=0 与整个数组都合法的情况。','先练无重复字符，再做最短和与最多翻转 k 个零。两端各走一遍，时间 O(n)。'),
('prefix-sums','前缀和与前后缀','把区间查询变成差值','算法',['range-sum-query-immutable','subarray-sum-equals-k','product-of-array-except-self'],['roadmap'],
 'prefix[i] 保存前 i 个元素的汇总值，闭区间 [l,r] 的和为 prefix[r+1]-prefix[l]。统计子数组时还需要记录历史前缀和的出现次数。','初始前缀和 0 必须计入一次。和为 K 包含负数，固定窗口或直接双指针不成立；乘积需考虑零。','静态区域和 → 和为 K 的子数组 → 除自身以外乘积。预处理 O(n)，单次区间查询 O(1)。'),
('binary-search','二分查找','用不变量处理边界','算法',['binary-search','find-first-and-last-position-of-element-in-sorted-array','search-in-rotated-sorted-array'],['240229-binary-search'],
 '先写清候选区间是闭区间还是半开区间，再定义每次比较会排除哪部分。二分不仅查单值，也能查第一个满足条件的位置。','空数组、单元素、目标缺失和重复值边界都要检查。旋转数组中至少半边有序，但必须先判断哪半边。','基础二分 → 首尾位置 → 旋转数组。每轮候选范围减半，时间 O(log n)。'),
('backtracking-subsets','子集与搜索树','选或不选，以及重复选','算法',['subsets','combination-sum','partition-equal-subset-sum'],['240315-backtrace-subset','240324-dp-principle'],
 '回溯沿搜索树逐步构造答案，每次选择后递归，返回时撤销。子集是每个数选或不选；组合总和允许同一候选继续选择。','结果需要复制当前路径。去重可以通过固定选择顺序完成；0/1 问题不能把允许重复使用的转移直接照搬。','子集 → 组合总和 → 分割等和子集，并比较记忆化或背包怎样合并重复状态。'),
('backtracking-combinations','组合与排列','顺序是否构成不同答案','算法',['combinations','permutations','subsets'],['240316-backtrace-combination','240324-backtrace-permutation'],
 '组合不区分选择顺序，通常限定后续下标递增；排列区分顺序，通常用 used 记录已用位置。剩余元素不足时可以提前剪枝。','排列的内部顺序不能在去重时排序抹掉。组合选择同一批数字只算一次，剪枝上界要包含足够的候选。','先做组合，再做全排列，最后对照子集的选择树。复杂度至少与输出数量成正比。'),
('dp-foundations','动态规划入门','从状态定义到滚动数组','算法',['climbing-stairs','house-robber','longest-increasing-subsequence'],['240324-dp-principle','240329-linear-dp'],
 '先定义状态含义，再写状态转移、初值与遍历顺序。把递归中重复出现的子问题保存下来，就得到记忆化或递推。','打家劫舍更新时需要旧状态，不能让本轮值污染另一状态。严格递增与非递减决定二分边界。','爬楼梯 → 打家劫舍 → 最长递增子序列。先写直观 O(n²) LIS，再练 O(n log n) 优化。'),
('knapsack','背包动态规划','每件用一次或无限次','算法',['partition-equal-subset-sum','coin-change','target-sum'],['240326-dp-backup'],
 '用容量或总和表示状态。0/1 背包中每件只能用一次，压缩数组时容量倒序；完全背包可重复使用，转移需要允许来自当前层。','总和奇偶性可能直接排除答案。目标和中的零有两种符号选择，方案数必须翻倍；不可达与零代价要区分。','分割等和子集 → 零钱兑换 → 目标和，分别练可行性、最小值和计数。'),
('dp-two-dimensions','二维动态规划','网格与两个序列前缀','算法',['unique-paths','longest-common-subsequence'],['240329-linear-dp','240324-dp-principle'],
 '两个独立位置通常需要二维状态，如网格行列、两个字符串前缀长度。按依赖方向填写表格，确定是否只依赖上一行以便滚动压缩。','子序列不同于子串；空前缀的边界行和边界列应先定义。滚动数组要分清本行左方和上一行上方。','不同路径 → 最长公共子序列。二维表时间 O(mn)，很多问题可压缩到 O(n) 空间。'),
('dp-state-machine','状态机动态规划','持有、卖出和冷冻','算法',['best-time-to-buy-and-sell-stock-ii','best-time-to-buy-and-sell-stock-with-cooldown'],['240512-dp-state-machine'],
 '把每天结束时允许的状态列清楚，再画出下一天的合法转移。股票问题中持有与未持有是基本状态，冷冻期要求区分刚卖出与可买入。','同一时刻最多持有一股。冷冻期只能在卖出后的下一天限制买入；所有本轮转移都应来自上轮状态。','不限次数买卖 → 含冷冻期，并把贪心正差求和与状态机解法对照。时间 O(n)，空间 O(1)。'),
('dp-interval','区间动态规划','选择两端与最后一步','算法',['longest-palindromic-subsequence','burst-balloons'],['240512-dp-interval'],
 '状态表示一个区间的最优答案。若问题的“第一步”会让边界不确定，可以改为枚举最后一步，例如气球最后戳哪一个。','区间是闭区间还是开区间要写清楚。短区间是初值，长区间依赖短区间；气球边界的 1 是辅助哨兵。','最长回文子序列 → 戳气球。前者 O(n²)，后者多一层区间分割枚举为 O(n³)。'),
('dp-tree','树形动态规划','向上返回状态，局部合并答案','算法',['diameter-of-binary-tree','house-robber-iii','binary-tree-maximum-path-sum'],['240513-dp-tree'],
 '树的子结构天然互不重叠。后序处理孩子，再在根处合并。返回给父结点的状态可能只允许单条分支，而最终答案可以合并左右两支。','最大路径和全为负数时也必须选至少一个结点。直径计边不计点；打家劫舍应分别保存选根与不选根。','直径 → 打家劫舍 III → 最大路径和。每个结点常数次合并，时间 O(n)，空间 O(h)。'),
('greedy-intervals','贪心与区间','证明每次取舍为什么安全','算法',['jump-game','merge-intervals','container-with-most-water'],['roadmap','240224-opposite-double-pointer','240523-sort'],
 '贪心每步只保留足够描述未来的状态：最远可达位置、当前合并区间、受短边限制的面积。先找到可证明的支配关系，再写局部选择。','不要仅凭样例猜规则。合并闭区间时端点相接需要合并；跳跃长度为零不一定失败，要看前面已能到多远。','跳跃游戏 → 合并区间 → 回顾盛水容器的移动短边证明。排序带来 O(n log n) 成本。'),
('bits-trie','位运算','用二进制表达抵消与计数','算法',['single-number','number-of-1-bits'],['roadmap'],
 '异或满足交换律和结合律，相同数字异或为 0，因此可以逐个抵消成对出现的数字。对非负整数，n & (n - 1) 每次清除最低位的一个 1，可用于统计置位数。','只出现一次的数字依赖其余数字都恰好出现两次这一前提。Python 整数不是固定 32 位，位计数本题只接受非负输入，不要把负数直接套入清除最低位的循环。','只出现一次的数字 → 位 1 的个数。前者扫描数组，时间 O(n)、额外空间 O(1)；后者的循环次数等于二进制中 1 的个数。'),
]


def build_chapters(notes):
    known={n['id'] for n in notes};chapters=[]
    for order,(id,title,subtitle,group,ids,noteids,principle,pitfall,learning) in enumerate(CHAPTERS,1):
        assert all(n in known for n in noteids), (id,noteids)
        chapters.append(dict(id=id,title=title,subtitle=subtitle,group=group,problemIds=ids,noteIds=noteids,order=order,
            overview=f'### 思路\n\n{principle}\n\n### 边界提醒\n\n{pitfall}\n\n### 建议练习顺序\n\n{learning}\n\n分类补充参考：[灵茶山艾府算法模板库]({ENDLESS})。'))
    return chapters


class ListNode:
    def __init__(self,val=0,next=None):self.val,self.next=val,next


def linked(values,pos=-1):
    nodes=[ListNode(x) for x in values]
    for a,b in zip(nodes,nodes[1:]):a.next=b
    if nodes and pos>=0:nodes[-1].next=nodes[pos]
    return nodes[0] if nodes else None


def serialize_linked(node):
    out=[];seen=set()
    while node:
        if id(node) in seen:raise AssertionError('reference solution returned a cyclic list')
        seen.add(id(node));out.append(node.val);node=node.next
    return out


def validate_references():
    total=0
    for p in PROBLEMS:
        namespace={'ListNode':ListNode,'TreeNode':Node}
        exec(p['solution'],namespace)
        for case in p['tests']+p['examples']:
            args=deepcopy(case['args'])
            if p['kind']=='design':
                operations,arguments=args;instance=namespace[p['className']](*arguments[0]);actual=[None]
                for op,argument in zip(operations[1:],arguments[1:]):actual.append(getattr(instance,op)(*argument))
            else:
                for i,typ in enumerate(p['argTypes']):
                    if typ=='tree':args[i]=tree(args[i])
                    elif typ=='listnode':args[i]=linked(args[i])
                    elif typ=='cyclelist':args[i]=linked(args[i]['values'],args[i]['pos'])
                actual=getattr(namespace['Solution'](),p['method'])(*args)
                if 'mutates' in p:actual=args[p['mutates']]
                if p['returnType']=='tree':actual=serialize_tree(actual)
                elif p['returnType']=='listnode':actual=serialize_linked(actual)
            if canonical(actual,p['compare'])!=canonical(case['expected'],p['compare']):
                raise AssertionError((p['id'],case,actual))
            total+=1
    return total



def add_scale_cases():
    """Known-shape cases exercise realistic sizes without self-derived answers."""
    by_id={p['id']:p for p in PROBLEMS}
    def case(id,args,expected):by_id[id]['tests'].append({'args':args,'expected':expected})
    case('two-sum',[list(range(2000)),3997],[1998,1999])
    case('valid-anagram',['ab'*25000,'ba'*25000],True)
    case('valid-anagram',['a'*20000+'b','a'*20001],False)
    case('valid-palindrome',['A, '*30000],True)
    case('longest-substring-without-repeating-characters',['abcdefghijklmnopqrstuvwxyz'*500],26)
    case('rotate-image',[[[20*i+j for j in range(20)] for i in range(20)]],[[20*i+j for i in range(19,-1,-1)] for j in range(20)])
    matrix=[[1]*50 for _ in range(50)];matrix[25][25]=0
    case('set-matrix-zeroes',[matrix],[[0 if i==25 or j==25 else 1 for j in range(50)] for i in range(50)])
    case('3sum',[[0]*1000],[[0,0,0]])
    case('container-with-most-water',[[1]*10000],9999)
    case('minimum-size-subarray-sum',[500,[1]*10000],500)
    case('max-consecutive-ones-iii',[[0,1]*5000,3],7)
    case('subarray-sum-equals-k',[[0]*10000,0],50005000)
    case('product-of-array-except-self',[[1]*1000],[1]*1000)
    case('find-first-and-last-position-of-element-in-sorted-array',[[7]*10000,7],[0,9999])
    case('binary-search',[list(range(10000)),9999],9999)
    case('search-in-rotated-sorted-array',[list(range(2500,5000))+list(range(2500)),2499],4999)
    case('reverse-linked-list',[list(range(500))],list(range(499,-1,-1)))
    case('middle-of-the-linked-list',[list(range(500))],list(range(250,500)))
    case('remove-nth-node-from-end-of-list',[list(range(30)),30],list(range(1,30)))
    case('linked-list-cycle',[{'values':[1]*1000,'pos':0}],True)
    case('daily-temperatures',[[50]*1000],[0]*1000)
    case('largest-rectangle-in-histogram',[[3]*10000],30000)
    case('sliding-window-maximum',[list(range(2000)),1001],list(range(1000,2000)))
    case('kth-largest-element-in-an-array',[list(range(10000)),5000],5000)
    case('longest-increasing-subsequence',[list(range(2000))],2000)
    case('longest-increasing-subsequence',[list(range(2000,0,-1))],1)
    case('house-robber',[[1]*100],50)
    case('partition-equal-subset-sum',[[100]*200],True)
    case('partition-equal-subset-sum',[[1]*199],False)
    case('coin-change',[[1,7,13],10000],coin_oracle([1,7,13],10000))
    case('target-sum',[[0]*20,0],1048576)
    case('longest-common-subsequence',['a'*1000,'a'*1000],1000)
    case('longest-common-subsequence',['a'*1000,'b'*500],0)
    case('unique-paths',[100,1],1)
    case('unique-paths',[16,16],155117520)
    case('best-time-to-buy-and-sell-stock-ii',[[0,1]*5000],5000)
    case('best-time-to-buy-and-sell-stock-with-cooldown',[[0,1]*1000],500)
    case('longest-palindromic-subsequence',['a'*1000],1000)
    case('burst-balloons',[[1]*50],50)
    case('maximum-depth-of-binary-tree',[[1]*1023],10)
    case('diameter-of-binary-tree',[[1]*1023],18)
    case('house-robber-iii',[[1]*1023],682)
    case('binary-tree-maximum-path-sum',[[-1]*1023],-1)
    case('number-of-islands',[[['1' if (i+j)%2==0 else '0' for j in range(50)] for i in range(50)]],1250)
    case('course-schedule',[1000,[[i+1,i] for i in range(999)]],True)
    case('course-schedule',[1000,[[i+1,i] for i in range(999)]+[[0,999]]],False)
    case('network-delay-time',[[[i,i+1,1] for i in range(1,100)],100,1],99)
    case('merge-intervals',[[[i*3,i*3+1] for i in range(1000)]],[[i*3,i*3+1] for i in range(1000)])
    case('jump-game',[[1]*10000],True)
    case('jump-game',[[1]*9998+[0,1]],False)
    case('single-number',[list(range(5000))*2+[6000]],6000)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE)
    args=parser.parse_args()
    add_scale_cases()
    notes=import_notes(args.source, ROOT/'data')
    chapters=build_chapters(notes)
    by_id={p['id']:p for p in PROBLEMS}
    assert len(by_id)==len(PROBLEMS)
    assert all(1<=len(c['problemIds'])<=4 for c in chapters)
    assert all(pid in by_id for c in chapters for pid in c['problemIds'])
    mapped={id for c in chapters for id in c['noteIds']}
    assert mapped=={n['id'] for n in notes}, ('unmapped notes',set(n['id'] for n in notes)-mapped)
    for p in PROBLEMS:
        for note in notes:
            if any('/'+p['id']+'/' in link['url'] for link in note['problemLinks']):p['sourceNoteIds'].append(note['id'])
    count=validate_references()
    catalog={'version':1,'generatedAt':'2026-10-19','chapters':chapters,'problems':PROBLEMS,'notes':notes,
             'attribution':{'supplementalTopics':ENDLESS,'statements':'中文题面、Python 参考实现与本地测试集为本项目整理版本；官方题号和链接保留作对照。',
             'judgeScope':'通过表示通过本项目维护的测试集，不等同于 LeetCode 官方判题结果。'}}
    out=ROOT/'data/catalog.json';out.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    print(f'Catalog: {len(chapters)} chapters, {len(PROBLEMS)} unique problems, {len(notes)} notes, {sum(len(p["tests"]) for p in PROBLEMS)} cases; {count} reference checks passed.')

if __name__=='__main__':main()
