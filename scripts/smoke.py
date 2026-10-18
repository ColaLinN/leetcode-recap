#!/usr/bin/env python3
"""Exercise real HTTP handlers, curated data, Docker and SQLite together.

Uses a temporary database; never changes personal progress. Requires the built
frontend and recap-python:local Docker image. Run from any working directory.
"""
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from backend.app import create_app


def main():
    catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
    by_number = {p['number']: p for p in catalog['problems']}
    with tempfile.TemporaryDirectory(prefix='recap-smoke-') as folder:
        options = dict(database_path=Path(folder) / 'progress.sqlite3')
        with TestClient(create_app(**options)) as client:
            health = client.get('/api/health').json()
            assert health['ok'] and health['judge']['available'], health
            assert client.get('/').status_code == 200
            assert 'recap' in client.get('/').text.lower()
            for number in (1, 48, 104, 146, 206):
                problem = by_number[number]
                url = '/api/problems/' + problem['id']
                response = client.post(url + '/run', json={'code': problem['solution']})
                assert response.status_code == 200, response.text
                result = response.json()
                assert result['status'] == 'Accepted', (number, result)
                assert result['passed'] == len(problem['examples']), (number, result)
                assert client.get(url + '/submissions').json()['submissions'] == []
                print('PASS HTTP → Docker samples:', number, problem['title'], flush=True)
            p = by_number[1]
            url = '/api/problems/' + p['id']
            result = client.post(url + '/run', json={'code': p['solution'], 'customArgs': [[8, 2, 7], 9]}).json()
            assert result['status'] == 'Accepted' and set(result['results'][0]['actual']) == {1, 2}, result
            assert client.post(url + '/run', json={'code': p['solution'], 'customArgs': []}).status_code == 422
            result = client.post(url + '/submit', json={'code': p['solution']}).json()
            assert result['status'] == 'Accepted' and result['passed'] == len(p['tests']), result
            client.put(url + '/review', json={'review': True}).raise_for_status()
            draft = p['starter'] + '\n# persistence smoke check\n'
            client.put(url + '/draft', json={'code': draft}).raise_for_status()
        with TestClient(create_app(**options)) as restored:
            state = restored.get(url).json()
            assert state['accepted'] and state['review'] and state['draft'] == draft, state
            assert restored.get('/api/resume').json()['problemId'] == p['id']
            history = restored.get(url + '/submissions').json()['submissions']
            assert len(history) == 1 and history[0]['code'] == p['solution']
            progress = restored.get('/api/catalog').json()['progress'][p['id']]
            assert progress == {'accepted': True, 'review': True, 'attempts': 1}, progress
            for note in catalog['notes']:
                response = restored.get('/' + note['path'])
                assert response.status_code == 200, note
                assert response.text.strip(), note
        print('PASS custom input, invalid input, full submit, 30 note routes, restart persistence; personal data untouched.', flush=True)


if __name__ == '__main__':
    main()
