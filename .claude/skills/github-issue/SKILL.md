---
name: github-issue
description: >-
  Work a GitHub issue end-to-end from its URL — using the AI_AGENT_GITHUB PAT: claim it (assign to the token owner + add an 👀 reaction), create a branch, implement the change committing after every step, push, open a PR that closes the issue, then remove the 👀 reaction. Use when the user pastes a github.com/<owner>/<repo>/issues/<n> URL or says "work on this issue / resolve this ticket". Args: <issue-url>.
allowed-tools: [Read, Edit, Write, Grep, Glob, Bash]
---

# github-issue — GitHub issue → PR, autonomously

Run the **entire** procedure below start→finish **without pausing**. Do **not** use AskUserQuestion and do **not** ask the user to confirm steps — make sensible defaults and keep going. **Halt only on unrecoverable errors** (see "Halting"). The end-of-run summary is the only expected user-facing output.

## Arguments

Invoked with `$ARGUMENTS` → `<issue-url>`, e.g. `https://github.com/hpstuff/garage_flow/issues/42`.

Parse it into `OWNER`, `REPO`, `NUMBER`. Accept the plain `#42` / `42` form too **only if** a single GitHub `origin` remote exists to infer `OWNER/REPO` from. If no issue can be resolved, halt: `Usage: /github-issue <github-issue-url>`.

## Identity model — read this first

**The PAT in `AI_AGENT_GITHUB` _is_ the acting identity.** Every GitHub write (assign, reaction, push, PR) and the commit author must be that token's owner — never the human's logged-in `gh` session or any ambient `GITHUB_TOKEN`.

- Check the token is present without printing it: `[ -n "$AI_AGENT_GITHUB" ] && echo "token: set" || echo "token: MISSING"`. If missing → **halt**: `AI_AGENT_GITHUB is not set — export the GitHub PAT and retry.`
- Drive `gh` with the PAT by prefixing every call with `GH_TOKEN="$AI_AGENT_GITHUB"` (this beats any ambient `GITHUB_TOKEN`). Write the commands with the literal `$AI_AGENT_GITHUB` — never expand or echo the value.
- **Never** paste the token into a URL, a log line, or a file. Pushing uses the credential-helper trick below so the secret stays in the environment, out of argv and the transcript.

Resolve the acting identity once and reuse it:

```bash
GH_TOKEN="$AI_AGENT_GITHUB" gh api user -q '.login, (.name // .login), (.email // "")'
GH_TOKEN="$AI_AGENT_GITHUB" gh api user -q '"\(.id)+\(.login)@users.noreply.github.com"'   # ME_NOREPLY fallback
```

Let `ME` = `.login`, `ME_NAME` = `.name` (fallback `.login`), `ME_EMAIL` = `.email` if non-empty else the noreply address above. These are the assignee and the commit author.

## Procedure

### Step 1 — Fetch the issue (as the PAT)

```bash
GH_TOKEN="$AI_AGENT_GITHUB" gh api repos/OWNER/REPO/issues/NUMBER
```

`401`/`403` → `GitHub auth failed — check AI_AGENT_GITHUB.` (halt). `404` → `Issue OWNER/REPO#NUMBER not found.` (halt). If the payload has a `pull_request` key it's a PR, not an issue → halt. Keep the `title`, `body`, and `labels[].name` — this is the **issue context** you code against and reference in the PR.

### Step 2 — Claim the issue (assign + 👀), BEFORE any code

Both are best-effort: on failure print a `⚠` warning and continue (do not halt).

```bash
# assign to the token owner
GH_TOKEN="$AI_AGENT_GITHUB" gh api -X POST repos/OWNER/REPO/issues/NUMBER/assignees -f "assignees[]=ME"

# add the 👀 "I'm looking at this" reaction — capture its id for removal later
GH_TOKEN="$AI_AGENT_GITHUB" gh api -X POST repos/OWNER/REPO/issues/NUMBER/reactions -f content=eyes -q .id
```

Save the returned reaction id to `<scratchpad>/eyes-NUMBER.id` so Step 8 can find it. (Fallback if lost: list `repos/OWNER/REPO/issues/NUMBER/reactions` and pick the entry with `content=="eyes"` and `user.login=="ME"`.) GitHub's reaction set is fixed — `eyes` (👀) is the correct "under review / being looked at" signal.

### Step 3 — Create a dedicated worktree

Never work on the default branch, and never in the user's main checkout — do all work in a throwaway git worktree so the session's working directory stays untouched. Determine everything from the **repo root** (session cwd), branch off the latest default:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"   # halt if this fails — not a git repo
BASE="$(GH_TOKEN="$AI_AGENT_GITHUB" gh api repos/OWNER/REPO -q .default_branch)"   # e.g. main
BRANCH="issue-NUMBER-<slug>"
WT="$HOME/.claude-worktrees/REPO-$BRANCH"

git -C "$REPO_ROOT" fetch origin "$BASE"
# clear any stale worktree/branch of the same name, then create fresh off origin/BASE
git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null || true
git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true
git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WT" "origin/$BASE"
```

`<slug>` = the issue title, lowercased, every non-alphanumeric run collapsed to a single `-`, trimmed, first 40 chars. Branch example: `issue-42-fix-invoice-vat-rounding`; if that branch already exists, append `-2`, `-3`, … .

**All subsequent Read/Edit/Grep/Glob/Bash/git work happens inside `$WT`** — use absolute paths under `$WT`, or `git -C "$WT" …` / `cd "$WT" && …`. Leave the session cwd at the repo root so concurrent runs stay isolated.

### Step 4 — Implement (commit after every step, inside the worktree)

1. Read `$WT/CLAUDE.md` / `$WT/AGENTS.md` first for stack, conventions, build/test commands, and the commit/push rules.
2. Use Grep/Glob/Read to locate the relevant code before editing. Change only what the issue needs — no drive-by refactors.
3. **Commit after each self-contained change** — don't batch the whole task into one commit. Author every commit as the PAT owner:

   ```bash
   git -C "$WT" -c commit.gpgsign=false \
     -c user.name="ME_NAME" -c user.email="ME_EMAIL" \
     commit -am "<concise message>"
   ```

   (Use `git -C "$WT" add -A && git -C "$WT" -c … commit -m …` when new files are involved.)
4. If the project has a build/type-check/test command, run it after changes and fix what you broke before the final commit.
5. Keep a short summary of what you changed and why — this becomes the PR body (**AI_SUMMARY**).

If, after investigating, there are genuinely no changes to make, skip to Step 8 to remove the reaction, then Step 9 to tear down the (empty) worktree, and report why — do not open an empty PR.

### Step 5 — Push the branch (as the PAT, token kept out of argv)

```bash
git -C "$WT" -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$AI_AGENT_GITHUB"; }; f' \
    push "https://github.com/OWNER/REPO.git" "HEAD:refs/heads/issue-NUMBER-<slug>"
```

The helper reads the token from the environment at runtime, so the printed command shows only `$AI_AGENT_GITHUB`, never its value. Push failure → **halt** with the error.

### Step 6 — Open the PR (as the PAT)

```bash
GH_TOKEN="$AI_AGENT_GITHUB" gh api -X POST repos/OWNER/REPO/pulls \
  -f title="<title>" \
  -f head="issue-NUMBER-<slug>" \
  -f base="$BASE" \
  -f body="$(printf '## Summary\nCloses #NUMBER\n\n## What changed\n%s\n' "AI_SUMMARY")" \
  -q .html_url
```

- **Title**: the issue title (optionally prefixed with a conventional-commit type like `fix:`/`feat:`).
- The body **must** contain `Closes #NUMBER` so merging closes the issue.
- Any non-2xx → **halt** with the code + body. Keep `.html_url` (the PR URL).

### Step 7 — (optional) link the PR on the issue

Best-effort comment so the issue points at the PR:

```bash
GH_TOKEN="$AI_AGENT_GITHUB" gh api -X POST repos/OWNER/REPO/issues/NUMBER/comments \
  -f body="PR opened: <pr-url>"
```

### Step 8 — Remove the 👀 reaction (the PR is ready)

```bash
GH_TOKEN="$AI_AGENT_GITHUB" gh api -X DELETE \
  repos/OWNER/REPO/issues/NUMBER/reactions/<reaction-id-from-step-2>
```

Best-effort — warn on failure, don't halt. Do this **only** once the PR is open (or when Step 4 found nothing to do), so the reaction always reflects "someone is actively on this."

### Step 9 — Remove the worktree

Once the PR is open (or the run found nothing to do), tear down the worktree — the branch lives on the remote and in the PR, so nothing is lost:

```bash
git -C "$REPO_ROOT" worktree remove --force "$WT"
```

**Do not** remove it if the run halted before pushing — leave the worktree so the work survives and the human can pick it up or re-run.

## Halting (unrecoverable errors only)

Stop and report clearly — never prompt — on: `AI_AGENT_GITHUB` unset; issue fetch `401`/`403`/`404`; not a git repository; push failure; PR creation non-2xx. Everything else (assign, reaction add/remove, PR-link comment, worktree removal) is a `⚠` warning that does not stop the run. When halting after the worktree exists but before the push, **keep** the worktree.

## Final output

End with a concise summary: issue `OWNER/REPO#NUMBER` + title, branch, worktree path, the commits made, PR URL, and confirmation that the issue was assigned to `ME` and the 👀 reaction was removed.
