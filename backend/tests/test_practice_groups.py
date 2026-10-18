import json
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.database import Store
from backend.tests.test_api import fixture  # shared isolated API + judge fixture


def new_group(client, **body):
    response = client.post('/api/practice-groups', json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_groups_isolate_drafts_progress_history_resume_and_restart(fixture):
    client, _, options = fixture
    a = 'original'
    b = new_group(client, name='第二轮')['id']
    for group, code in ((a, 'first draft'), (b, 'second draft')):
        assert client.put(f'/api/problems/sum/draft?group_id={group}', json={'code': code, 'sessionId': group}).status_code == 200
    client.post(f'/api/problems/sum/visit?group_id={a}', json={'sessionId': a})
    client.post(f'/api/problems/sum/submit?group_id={a}', json={'code': 'submitted first', 'sessionId': a})
    client.put(f'/api/problems/sum/review?group_id={a}', json={'review': True})
    client.post(f'/api/practice-groups/{b}/activate')
    # A late A response/save still belongs to A, regardless of the selected preference.
    client.put(f'/api/problems/sum/draft?group_id={a}', json={'code': 'late first', 'sessionId': a})
    client = TestClient(create_app(**options))
    assert client.get(f'/api/problems/sum?group_id={a}').json() == dict(client.get(f'/api/problems/sum?group_id={a}').json(), draft='late first', accepted=True, review=True)
    assert client.get(f'/api/problems/sum?group_id={b}').json()['draft'] == 'second draft'
    assert client.get(f'/api/problems/sum?group_id={b}').json()['accepted'] is False
    assert client.get(f'/api/problems/sum/submissions?group_id={b}').json()['submissions'] == []
    assert client.get('/api/practice-groups').json()['activeGroupId'] == b
    fresh = new_group(client, restartFrom=a)
    assert fresh['total'] == 1 and fresh['completed'] == 0 and fresh['practiceCount'] == 0
    assert client.get(f'/api/problems/sum?group_id={fresh["id"]}').json()['draft'] is None
    assert client.get(f'/api/problems/sum/submissions?group_id={a}').json()['submissions'][0]['code'] == 'submitted first'
    assert client.get(f'/api/resume?group_id={a}').json()['problemId'] == 'sum'


def test_sessions_deduplicate_refresh_but_keep_runs_submissions_and_browse_timestamps(fixture):
    client, _, _ = fixture
    for _ in range(3):
        assert client.post('/api/problems/sum/visit', json={'sessionId': 'same-visit'}).status_code == 200
    stats = client.get('/api/practice-groups').json()['groups'][0]
    assert stats['practiceCount'] == 0
    body = {'code': 'a', 'sessionId': 'same-visit', 'requestId': 'run-once'}
    run = client.post('/api/problems/sum/run', json=body).json()
    submit = client.post('/api/problems/sum/submit', json=dict(body, requestId='submit-once')).json()
    for item in (run, submit):
        assert item['createdAt'].endswith('+00:00')
        assert item['finishedAt'] >= item['createdAt']
    assert client.get('/api/problems/sum/submissions').json()['submissions'][0]['kind'] == 'submit'
    records = client.get('/api/problems/sum/submissions?include_runs=true').json()['submissions']
    assert [r['kind'] for r in records] == ['submit', 'run']
    stats = client.get('/api/practice-groups').json()['groups'][0]
    assert (stats['practiceCount'], stats['weeklyCount'], stats['streak']) == (1, 1, 1)
    visits = client.get('/api/practice-groups/original/sessions').json()
    assert visits['total'] == 1
    assert visits['sessions'][0]['runs'] == 1 and visits['sessions'][0]['submits'] == 1
    client.post('/api/practice-groups/original/sessions/same-visit/end')
    client.post('/api/problems/sum/visit', json={'sessionId': 'new-visit'})
    assert client.get('/api/practice-groups/original/sessions').json()['total'] == 2
    # Browsing a second time isn't a second active practice.
    assert client.get('/api/practice-groups').json()['groups'][0]['practiceCount'] == 1


def test_execution_request_replay_does_not_run_twice_or_cross_group(fixture):
    client, judge, _ = fixture
    body = {'code': 'answer', 'sessionId': 'session', 'requestId': 'unique'}
    first = client.post('/api/problems/sum/submit', json=body).json()
    assert client.post('/api/problems/sum/submit', json=body).json()['submissionId'] == first['submissionId']
    assert len(judge.calls) == 1
    assert client.post('/api/problems/sum/submit', json=dict(body, code='changed')).status_code == 409
    b = new_group(client)['id']
    assert client.post(f'/api/problems/sum/run?group_id={b}', json=body).status_code == 409
    assert len(judge.calls) == 1
    assert client.put(f'/api/problems/sum/draft?group_id={b}', json={'code': 'x', 'sessionId': 'session'}).status_code == 409
    assert client.get(f'/api/problems/sum?group_id={b}').json()['draft'] is None


def test_chapter_selection_deduplicates_and_keeps_its_original_membership(fixture):
    client, _, options = fixture
    path = Path(options['data_dir']) / 'catalog.json'
    content = json.loads(path.read_text())
    other = dict(content['problems'][0], id='other', title='第二题')
    content['problems'].append(other)
    content['chapters'] = [dict(id='arrays', title='数组', problemIds=['sum'], group='数据结构'),
                           dict(id='hash', title='哈希', problemIds=['sum'], group='数据结构'),
                           dict(id='dp', title='动态规划', problemIds=['sum', 'other'], group='算法')]
    path.write_text(json.dumps(content))
    group = new_group(client, chapterIds=['arrays', 'hash'])
    catalog = client.get('/api/catalog', params={'group_id': group['id']}).json()
    assert group['total'] == 1
    assert [p['id'] for p in catalog['problems']] == ['sum']
    assert len(catalog['chapters']) == 2 and len(catalog['allChapters']) == 3
    assert client.get(f'/api/problems/other?group_id={group["id"]}').status_code == 404
    assert client.post('/api/practice-groups', json={'chapterIds': []}).status_code == 422
    assert client.post('/api/practice-groups', json={'chapterIds': ['missing']}).status_code == 422
    # Adding catalog topics doesn't silently expand a group's denominator.
    assert client.get('/api/practice-groups').json()['groups'][0]['total'] == 1
    assert new_group(client)['total'] == 2
    restarted = new_group(client, restartFrom=group['id'])
    assert restarted['total'] == 1
    assert restarted['chapterIds'] == ['arrays', 'hash']


def test_legacy_migration_preserves_code_times_flags_resume_and_makes_backup(tmp_path):
    path = tmp_path / 'state.sqlite3'
    result = {'status': 'Accepted', 'passed': 1, 'total': 1}
    timestamp = '2026-01-02T03:04:05+00:00'
    with sqlite3.connect(path) as db:
        db.executescript('''CREATE TABLE progress(problem_id TEXT PRIMARY KEY,draft TEXT,review INTEGER,accepted INTEGER,updated_at TEXT);
            CREATE TABLE submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,problem_id TEXT,code TEXT,result TEXT,created_at TEXT);
            CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);''')
        db.execute('INSERT INTO progress VALUES(?,?,?,?,?)', ('sum', '原代码\n你好', 1, 1, timestamp))
        db.execute('INSERT INTO submissions VALUES(?,?,?,?,?)', (12, 'sum', 'submitted', json.dumps(result), timestamp))
        db.execute("INSERT INTO settings VALUES('last_problem_id','sum')")
    store = Store(path)
    store.configure_catalog(['sum'])
    assert store.state('sum') == {'draft': '原代码\n你好', 'review': True, 'accepted': True}
    assert store.resume() == 'sum'
    assert store.submissions('sum')[0]['createdAt'] == timestamp
    assert store.submissions('sum')[0]['id'] == 12
    assert store.group()['legacyImported'] is True
    assert store.group()['lastPracticedAt'] == timestamp
    assert store.group()['practiceCount'] == 0 and store.sessions('original')['total'] == 0
    assert len(list(tmp_path.glob('*before-practice-groups*.sqlite3'))) == 1
    Store(path).configure_catalog(['sum', 'new-problem'])
    assert store.problem_ids() == ['sum']
    assert len(store.groups()) == 1 and len(store.submissions('sum')) == 1
    with sqlite3.connect(next(tmp_path.glob('*before-practice-groups*.sqlite3'))) as db:
        assert db.execute('SELECT draft FROM progress').fetchone()[0] == '原代码\n你好'
        assert db.execute('SELECT created_at FROM submissions').fetchone()[0] == timestamp


def test_stats_follow_singapore_midnight_and_count_each_session_once_per_week(tmp_path):
    store = Store(tmp_path / 'stats.sqlite3')
    store.configure_catalog(['sum'])
    store.now = lambda: '2026-10-18T15:59:00+00:00'
    store.save_draft('sum', 'a', session_id='s')
    store.now = lambda: '2026-10-18T16:01:00+00:00'
    store.save_draft('sum', 'b', session_id='s')
    assert store.group()['streak'] == 2
    assert store.group()['practiceCount'] == 1 and store.group()['weeklyCount'] == 1
    store.now = lambda: '2026-10-20T16:01:00+00:00'
    assert store.group()['streak'] == 0
    store.now = lambda: '2026-10-25T16:01:00+00:00'
    assert store.group()['weeklyCount'] == 0


def test_group_rename_archive_and_unknown_group_are_explicit(fixture):
    client, _, _ = fixture
    group = new_group(client, name='复习')['id']
    assert client.patch(f'/api/practice-groups/{group}', json={'name': '  重练  ', 'archived': True}).json()['name'] == '重练'
    assert client.patch(f'/api/practice-groups/{group}', json={'archived': False}).json()['archivedAt'] is None
    assert client.patch(f'/api/practice-groups/{group}', json={'name': '   '}).status_code == 422
    assert client.get('/api/catalog?group_id=missing').status_code == 404
    assert client.post('/api/practice-groups/missing/activate').status_code == 404
    assert client.get(f'/api/practice-groups/{group}/sessions?offset=-1').status_code == 422


def test_custom_run_replays_without_recomputing_reference_and_rejects_changed_input(fixture):
    client, judge, _ = fixture
    body = {'code': 'answer', 'customArgs': [[5, 6]], 'requestId': 'custom-once', 'sessionId': 'custom-visit'}
    first = client.post('/api/problems/sum/run', json=body).json()
    second = client.post('/api/problems/sum/run', json=body).json()
    assert first['executionId'] == second['executionId']
    assert len(judge.calls) == 2
    assert client.post('/api/problems/sum/run', json=dict(body, customArgs=[[9, 8]])).status_code == 409
    assert len(judge.calls) == 2


def test_in_flight_submission_remains_in_original_group_after_switch(fixture):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    client, judge, _ = fixture
    entered, release = Event(), Event()
    original_execute = judge.execute

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return original_execute(*args, **kwargs)

    judge.execute = delayed
    other = new_group(client)['id']
    body = {'code': 'in-flight A', 'sessionId': 'A-session', 'requestId': 'pending-A'}
    with ThreadPoolExecutor() as pool:
        future = pool.submit(client.post, '/api/problems/sum/submit?group_id=original', json=body)
        assert entered.wait(5)
        try:
            replay = client.post('/api/problems/sum/submit?group_id=original', json=body).json()
            assert replay['status'] == 'Running'
            client.post(f'/api/practice-groups/{other}/activate')
            client.put(f'/api/problems/sum/draft?group_id={other}', json={'code': 'B draft', 'sessionId': 'B-session'})
        finally:
            release.set()
        assert future.result().json()['status'] == 'Accepted'
    assert len(judge.calls) == 1
    assert client.get('/api/problems/sum?group_id=original').json()['accepted'] is True
    second = client.get(f'/api/problems/sum?group_id={other}').json()
    assert second['draft'] == 'B draft' and second['accepted'] is False
    assert client.get(f'/api/problems/sum/submissions?group_id={other}').json()['submissions'] == []


def test_copy_carries_progress_draft_review_and_resume_without_fabricating_history(fixture):
    client, _, _ = fixture
    client.post('/api/problems/sum/visit', json={'sessionId': 'source-visit'})
    client.put('/api/problems/sum/draft', json={'code': 'source draft', 'sessionId': 'source-visit'})
    client.put('/api/problems/sum/review', json={'review': True})
    original = client.post('/api/problems/sum/submit', json={'code': 'source submitted', 'sessionId': 'source-visit'}).json()
    copied = new_group(client, copyFrom='original')
    group = copied['id']
    assert copied['copiedProgress'] is True and copied['sourceGroupId'] == 'original'
    assert copied['completed'] == 1 and copied['practiceCount'] == 0 and copied['weeklyCount'] == 0
    state = client.get(f'/api/problems/sum?group_id={group}').json()
    assert state['draft'] == 'source draft' and state['review'] is True and state['accepted'] is True
    assert client.get(f'/api/resume?group_id={group}').json()['problemId'] == 'sum'
    assert client.get(f'/api/practice-groups/{group}/sessions').json()['total'] == 0
    assert client.get(f'/api/problems/sum/submissions?group_id={group}').json()['submissions'] == []
    client.put(f'/api/problems/sum/draft?group_id={group}', json={'code': 'copy draft', 'sessionId': 'copy-visit'})
    client.put(f'/api/problems/sum/review?group_id={group}', json={'review': False})
    assert client.get('/api/problems/sum').json()['draft'] == 'source draft'
    assert client.get('/api/problems/sum').json()['review'] is True
    assert client.get('/api/problems/sum/submissions').json()['submissions'][0]['id'] == original['submissionId']
    restarted = new_group(client, restartFrom=group)
    assert restarted['copiedProgress'] is False and restarted['completed'] == 0
    assert client.get(f'/api/problems/sum?group_id={restarted["id"]}').json()['draft'] is None


def test_copy_rejects_ambiguous_or_unknown_source(fixture):
    client, _, _ = fixture
    assert client.post('/api/practice-groups', json={'copyFrom': 'missing'}).status_code == 404
    assert client.post('/api/practice-groups', json={'copyFrom': 'original', 'restartFrom': 'original'}).status_code == 422
    assert client.post('/api/practice-groups', json={'copyFrom': 'original', 'chapterIds': []}).status_code == 422


def expand_catalog(options):
    path = Path(options['data_dir']) / 'catalog.json'
    content = json.loads(path.read_text())
    content['problems'].append(dict(content['problems'][0], id='other', title='第二题'))
    content['chapters'] = [dict(id='arrays', title='数组', problemIds=['sum'], group='数据结构'),
                           dict(id='dp', title='动态规划', problemIds=['other'], group='算法')]
    path.write_text(json.dumps(content))


def test_edit_scope_in_place_preserves_removed_code_history_and_completion(fixture):
    client, _, options = fixture
    expand_catalog(options)
    group = new_group(client, name='可编辑')
    gid = group['id']
    client.put(f'/api/problems/sum/draft?group_id={gid}', json={'code': 'preserve me', 'sessionId': 'scope-visit'})
    client.put(f'/api/problems/sum/review?group_id={gid}', json={'review': True})
    submitted = client.post(f'/api/problems/sum/submit?group_id={gid}', json={'code': 'submitted', 'sessionId': 'scope-visit'}).json()
    client.post(f'/api/problems/sum/visit?group_id={gid}', json={'sessionId': 'scope-visit'})
    edited = client.patch(f'/api/practice-groups/{gid}', json={'name': '原地修改', 'chapterIds': ['dp'], 'problemIds': ['other'], 'expectedUpdatedAt': group['updatedAt']}).json()
    assert edited['id'] == gid and edited['createdAt'] == group['createdAt']
    assert edited['name'] == '原地修改' and edited['total'] == 1 and edited['completed'] == 0
    assert client.get(f'/api/resume?group_id={gid}').json()['problemId'] is None
    assert client.get(f'/api/problems/sum?group_id={gid}').status_code == 404
    copied_without_hidden = new_group(client, copyFrom=gid)
    assert copied_without_hidden['total'] == 1 and copied_without_hidden['completed'] == 0
    restored = client.patch(f'/api/practice-groups/{gid}', json={'chapterIds': None, 'problemIds': ['sum', 'other'], 'expectedUpdatedAt': edited['updatedAt']}).json()
    assert restored['id'] == gid and restored['completed'] == 1 and restored['total'] == 2
    state = client.get(f'/api/problems/sum?group_id={gid}').json()
    assert (state['draft'], state['review'], state['accepted']) == ('preserve me', True, True)
    records = client.get(f'/api/problems/sum/submissions?group_id={gid}').json()['submissions']
    assert records[0]['id'] == submitted['submissionId'] and records[0]['createdAt'] == submitted['createdAt']
    assert client.get(f'/api/practice-groups/{gid}/sessions').json()['total'] == 1


def test_scope_validation_and_stale_edit_do_not_partially_mutate_group(fixture):
    client, _, options = fixture
    expand_catalog(options)
    group = new_group(client, name='unchanged')
    gid = group['id']
    for body in ({'chapterIds': []}, {'problemIds': []}, {'problemIds': ['missing']},
                 {'chapterIds': ['arrays'], 'problemIds': ['other']}, {'completionUpdates': {'missing': True}}):
        assert client.patch(f'/api/practice-groups/{gid}', json=dict(body, name='must not stick')).status_code == 422
        assert client.get(f'/api/practice-groups/{gid}').json()['name'] == 'unchanged'
    first = client.patch(f'/api/practice-groups/{gid}', json={'name': 'new name', 'expectedUpdatedAt': group['updatedAt']}).json()
    assert first['name'] == 'new name'
    assert client.patch(f'/api/practice-groups/{gid}', json={'problemIds': ['sum'], 'expectedUpdatedAt': group['updatedAt']}).status_code == 409
    detail = client.get(f'/api/practice-groups/{gid}').json()
    assert detail['problemIds'] == ['sum', 'other'] and detail['name'] == 'new name'


def test_manual_completion_is_reversible_without_faking_judge_history(fixture):
    client, judge, _ = fixture
    group = new_group(client)
    gid = group['id']
    marked = client.patch(f'/api/practice-groups/{gid}', json={'completionUpdates': {'sum': True}}).json()
    assert marked['completed'] == 1 and marked['manualCount'] == 1 and marked['practiceCount'] == 0
    assert client.get(f'/api/problems/sum?group_id={gid}').json()['accepted'] is True
    assert client.get(f'/api/problems/sum/submissions?group_id={gid}').json()['submissions'] == []
    client.patch(f'/api/practice-groups/{gid}', json={'completionUpdates': {'sum': None}})
    assert client.get(f'/api/problems/sum?group_id={gid}').json()['accepted'] is False
    passed = client.post(f'/api/problems/sum/submit?group_id={gid}', json={'code': 'accepted'}).json()
    reset = client.patch(f'/api/practice-groups/{gid}', json={'completionUpdates': {'sum': False}}).json()
    assert reset['completed'] == 0 and reset['manualCount'] == 1
    assert client.get(f'/api/problems/sum/submissions?group_id={gid}').json()['submissions'][0]['id'] == passed['submissionId']
    copy = new_group(client, copyFrom=gid)
    assert copy['completed'] == 0 and copy['manualCount'] == 1
    judge.status = 'Wrong Answer'
    client.post(f'/api/problems/sum/submit?group_id={gid}', json={'code': 'wrong'})
    assert client.get(f'/api/problems/sum?group_id={gid}').json()['accepted'] is False
    judge.status = 'Accepted'
    client.post(f'/api/problems/sum/submit?group_id={gid}', json={'code': 'accepted again'})
    final = client.get(f'/api/practice-groups/{gid}').json()
    assert final['completed'] == 1 and final['manualCount'] == 0
    # The copied group keeps its independent manual reset.
    assert client.get(f'/api/problems/sum?group_id={copy["id"]}').json()['accepted'] is False
