# GarageFlow — agent guide

GarageFlow is the operating system for an independent general-repair garage. See `CONTEXT.md` for the domain language (Account, Location, Repair Order, Kanban Stage, Invoice, …) — use those exact terms in code and prose.

## Git rules (apply to every agent, always)

- **Never push to `main`** (or any default/protected branch). Do all work on a dedicated branch and open a Pull Request. `main` only advances by merging a reviewed PR.
- **Commit after every self-contained change** — small, focused commits with clear messages. Don't accumulate a whole task's worth of edits into one commit.
- Never force-push a shared branch or rewrite published history.

## Working an issue

To take a GitHub issue from URL to PR, use the **`/github-issue <issue-url>`** skill (`.claude/skills/github-issue/`). It uses the `AI_AGENT_GITHUB` PAT to claim the issue (assign + 👀 reaction), work in a dedicated git worktree (`~/.claude-worktrees/…`) off a new branch, commit per step, push, open a PR that closes the issue, drop the 👀 reaction, and remove the worktree when the PR is ready.
