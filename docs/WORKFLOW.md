# Workflow

Every change, however small, goes through an issue, a feature branch and a pull request.
This is the loop; [CLAUDE.md](../CLAUDE.md) points here.

## Board

The [Kanban Trust Issues](https://github.com/users/theoleuthardt/projects/2) project (private)
has four columns in its `Status` field:

| Column      | Meaning                             | Set when              |
| ----------- | ----------------------------------- | --------------------- |
| Backlog     | Known, not started                  | The issue is created  |
| In Progress | A branch exists and work is ongoing | The branch is created |
| In Review   | A PR is open and being reviewed     | The PR is opened      |
| Done        | Merged into `main`                  | The PR is merged      |

Move cards with the helper, it adds the issue to the board first if it is missing:

```bash
scripts/kanban-status.sh <issue-number> <backlog|progress|review|done>
```

## Epics and sub-issues

- An **epic** is an issue labelled `epic` that describes an outcome. It contains no code
  work itself.
- The work lives in **feature issues** (labelled `feature`, `bug` or `chore`) that are
  attached to the epic as **sub-issues**.
- An epic card moves to _In Progress_ with its first sub-issue and to _Done_ when all of
  them are done. Close it by hand once the last sub-issue is merged.

Attach a sub-issue (needs the numeric database id, not the issue number):

```bash
child_id=$(gh api repos/theoleuthardt/trust-issues/issues/<child-number> --jq .id)
gh api -X POST repos/theoleuthardt/trust-issues/issues/<epic-number>/sub_issues -F sub_issue_id="$child_id"
```

## The loop

1. **Issue.** Create it with the matching template. Give it labels (`feature`, `bug`,
   `chore`, `docs` and an `area:*` label) and put it on the board in _Backlog_.
2. **Branch** from an up-to-date `main`, named `<issue-number>-<short-description>`:

   ```bash
   git switch main && git pull
   git switch -c 42-add-level-select
   scripts/kanban-status.sh 42 progress
   ```

3. **Test first.** Write the failing test that expresses the behaviour, look at it, then
   implement. A confirmed test is a contract: change it only when the desired behaviour
   changed, and say so in the PR.
4. **Implement** in small commits using Conventional Commits (`feat:`, `fix:`, `docs:`,
   `refactor:`, `test:`, `chore:`), each mentioning the issue, e.g.
   `feat(frontend): level select screen (#42)`.
5. **Check locally:** `task check` (lint, format, types, tests). For UI changes run the
   game (`task dev`) and click through the feature, including touch mode (`?touch=1`).
6. **Review locally:** `review main` (see below). Verify every finding against the code;
   fix real ones, ignore wrong ones, and mention in the PR what you decided.
7. **Push and open the PR** against `main`:

   ```bash
   git push -u origin 42-add-level-select
   gh pr create --title "feat: level select" --body "Closes #42"
   scripts/kanban-status.sh 42 review
   ```

   One issue, one branch, one PR. A PR that also refactors something unrelated is split.

   **Stacked PRs.** When a change depends on another one that is not merged yet, branch
   from that branch and open the PR with `--base <that-branch>`. CI runs for every pull
   request, so the stack is checked as it grows. Merge bottom-up with squash merges; the
   branch of a merged PR is deleted and GitHub retargets the PR above it to `main`.

8. **CI must be green** and review findings resolved, then the PR is squash-merged and the
   branch deleted. After the merge: `scripts/kanban-status.sh 42 done`.

## Local review with `review`

`review [base-branch]` (default `main`) runs CodeRabbit on the current branch and falls
back to an Ollama cloud model (GLM) when CodeRabbit is unavailable or rate limited.

- The fallback only sees the diff, not the repository. Treat its output as a second
  opinion and verify each point in the code before changing anything.
- Output is NDJSON findings with a severity. Fix `critical` and `major` findings before
  merging; judge the rest on their merit.
- Run it before opening the PR and again after substantial fixes.
- Environment: `OLLAMA_REVIEW_MODEL`, `OLLAMA_API_KEY` and optionally `OLLAMA_URL` are read
  from the environment, not from this repository.

## Pull request expectations

- Title in Conventional Commits form, body contains `Closes #<n>`.
- Follows `.github/pull_request_template.md`.
- Tests accompany behaviour changes; docs are updated when behaviour, endpoints or the
  workflow change.
- No commented-out code, no unused exports, no secrets, no unrelated changes.
