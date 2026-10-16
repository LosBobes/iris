# iris-guards

A Claude Code mod (function-hooks plugin) that enforces three repo rules
automatically. Claude Code loads it from `.claude/skills/iris-guards/` in any
session opened in this repo; nothing to install.

| Guard | Hook | What it does |
| --- | --- | --- |
| Contract drift | `tool.call` on Edit/Write, `turn.complete` | After an edit to `iris-api/openapi.yaml`, `internal/domain/{types,enums}.go` or `apps/web/src/types/*.ts`, compares everything this branch changed (vs `origin/main`) and tells Claude which side of the contract-sync rule is missing; toasts a summary at the end of the turn. |
| Pre-push gate | `tool.call` on Bash | On `git push`, runs the checks for each surface the branch changed (`gofmt -l`, `go vet`, `go test` in `iris-api/`; `npm run lint`, `npm test`, `npm run build` in `apps/web/`) and refuses the push with the failing output. Docs-only pushes run nothing. |
| Production guard | `tool.check` on Bash | `make deploy/ssh/logs/db-pull`, `ssh`/`scp`/`rsync`, `docker compose -f docker-compose.prod.yml`, `git reset --hard`, force pushes, pushes to `main` and `gh workflow run deploy` are denied unless the user's latest prompt asks for that kind of action; when it does, the command still needs approval. |

The rules live in `hooks/rules.ts` (pure functions); `hooks/register.ts`
wires them to the engine.

```bash
claude plugin validate .claude/skills/iris-guards
claude plugin test .claude/skills/iris-guards
```
