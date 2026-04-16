# Contributing

## Before you push (long‑lived / PR branches)

Merge **`master`** into your branch and fix conflicts **before** pushing, so GitHub stays merge‑clean and you avoid repeated version / lockfile fights:

```bash
git fetch origin
git merge origin/master
# resolve any conflicts, then:
npm install
npm run typecheck
git add -A && git commit -m "merge origin/master into <branch>"
git push origin <branch>
```

If you prefer rebase:

```bash
git fetch origin
git rebase origin/master
```

## Pull requests

Target **`master`**. After opening or updating a PR, keep the branch current with **`master`** until merge (same commands as above).

## GitHub Releases (desktop zips)

The **Release** workflow (`.github/workflows/release.yml`) runs on **tag push** `v*` or **Actions → Release → Run workflow** (`workflow_dispatch`). Enter **`tag`** (e.g. `v2.1.17`) and run from the branch/commit that matches **`package.json`**. Merging to **`master` alone does not** build release assets.
