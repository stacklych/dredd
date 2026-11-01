# AGENTS.md

Agent contract for this repository (github.com/stacklych/dredd). Coding
workflow, authority order, and commands: `.claude/skills/coder-agent-dredd/SKILL.md`.

## Unit of work

One GitHub issue on `stacklych/dredd`, delivered as one pull request against `main`.

## Standing authorization (no per-action approval)

- Create and switch local branches; stage files by name; commit using the
  Conventional Changelog format with a package scope (see `CONTRIBUTING.md`).
- Push feature branches to `origin`, including `git push --force-with-lease` on
  a feature branch.
- Open and update pull requests against `main` (`gh pr create`, `gh pr edit`,
  `gh pr comment`).
- Create, label, and comment on GitHub issues (`gh issue`, `gh label`).

## Requires explicit approval

- Any push to `main`; force-push without `--with-lease`, or to `main`.
- Merging or closing pull requests.
- Deleting files (`git rm`), branches, tags, issues, or releases.
- Publishing packages or releases; repository settings.
