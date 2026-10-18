# LeetCode Recap implementation contract

Personal local Chinese algorithm learning app. iOS-inspired pale surfaces, tactile controls. React/TS + FastAPI + SQLite + Docker Python judge. Import all source Markdown + assets, curated chapters with 2–4 judgeable problems per chapter; include supplemental categories via attributed EndlessCheng references. Preserve source notes and reading links. Shared problem identity across chapters. LeetCode Solution method signatures, tree/list/design adapters. Run examples or custom args, submit full local suite. Draft autosave, history, review flag, resume, progress. No auth/payment.

## Data contract (`data/catalog.json`)
`{chapters:[{id,title,subtitle,group,problemIds:[id],noteIds:[id],order}], problems:[{id,number,title,difficulty,tags,statement,examples:[{args:[...],expected:...}],constraints:[str],starter,solution,explanation,method,kind:'solution'|'design',className?,argTypes?:['listnode'|'tree'|'cyclelist'|'raw',...],returnType?:'listnode'|'tree'|'raw',compare?:'exact'|'unordered'|'nested-unordered',mutates?:int,tests:[{args:[...],expected:...}],sourceUrl,sourceNoteIds:[id]}], notes:[{id,title,path,sourcePath,problemLinks?:[{title,url}]}]}`. Paths are relative to `data`, Markdown images rewritten to `/content/...`. Design test args: `[operations:[str],arguments:[[...]]]`. Cycle list adapter arg is `{values:[...],pos:int}`.

## HTTP contract
- GET `/api/health`: `{ok,judge:{available,detail}}`
- GET `/api/catalog`: catalog chapters/notes plus problems excluding solution/tests; includes `progress` map id -> `{accepted,review,attempts}`; each problem `testCount`.
- GET `/api/problems/{id}`: full safe problem (no solution/tests) + `draft:string|null`, `review`, `accepted`
- GET `/api/problems/{id}/solution`: `{solution,explanation}`
- PUT `/api/problems/{id}/draft` body `{code}`
- PUT `/api/problems/{id}/review` body `{review:boolean}`
- POST `/api/problems/{id}/run` body `{code,customArgs?:[...]} `; optional custom input expected is computed via reference solution. For design same args shape.
- POST `/api/problems/{id}/submit` body `{code}`
- GET `/api/problems/{id}/submissions`: `{submissions:[{id,status,passed,total,elapsedMs,createdAt,code,results:[...]}]}`
- GET `/api/resume`: `{problemId:string|null}`
- execution result `{status:'Accepted'|'Wrong Answer'|'Runtime Error'|'Time Limit Exceeded'|'Output Limit Exceeded'|'Judge Unavailable',passed,total,elapsedMs,results:[{index,status,input,expected,actual,stdout,error,elapsedMs}],submissionId?}`
- Serve `/content` from `data/content`; serve frontend build at root. API bound loopback in scripts. Vite dev proxy `/api` & `/content`.

Persistence SQLite `runtime/recap.sqlite3`; no local subprocess execution fallback for untrusted code. Docker build image `recap-python:local` from `backend/judge/Dockerfile`. Each execution no network, read-only filesystem, dropped capabilities, no-new-privileges, pids/memory/cpu/time/output limits. Docker unavailable => explicit unavailable response, notes usable. Local setup must verify Docker and actual judge.

## Ownership
Backend agent owns backend/ (incl tests); catalog agent owns data/, scripts/import_notes.py and data generation scripts; frontend agent owns frontend/. Root owns deployment, docs, integration and final review. Do not commit independently. Communicate contract changes.
