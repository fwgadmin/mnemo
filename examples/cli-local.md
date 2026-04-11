# CLI — local SQLite vault

By default the CLI uses the same data directory as the desktop app on Linux:

- **Data:** `~/.local/share/mnemo/` (override with `MNEMO_HOME`)
- **Database:** `mnemo.db`
- **Vault:** `vault/` (markdown mirror files, one `.md` per note)

## List and search

```bash
# All notes (ref, modified, title, uuid)
mnemo note list

# With folder column (matches GUI “category” / first tag)
mnemo note list -v

# Only notes under a folder (includes subfolders by default)
mnemo note list -c "Work/Meetings"

# This folder only, not nested paths
mnemo note list -c "Work" --exact

# Full-text search
mnemo note search "nginx buffer"
```

## Show a note

`ref` is the stable **#** column from `note list` (not necessarily row order).

```bash
mnemo note show 3
mnemo note show <uuid>
```

## Create and import

```bash
mnemo note new --title "Standup notes" --body "## Today\n- …" -c "Work/Meetings"

mnemo note import ./README.md -c Docs

# Pipe content
echo "# Draft" | mnemo note import - -t "Draft" -c Unassigned
```

## Categories (folders)

First tag = folder path. Special names: **General**, **Unassigned**, or nested paths like `Work/Meetings`.

```bash
mnemo note categories
mnemo note categories --flat

mnemo note set-category 5 "Work/Archive"

mnemo note category rename "OldName" "NewName"
mnemo note category promote "Work/Meetings"
mnemo note category demote "Archive" --under "Work"
```

## Graph and links

```bash
mnemo note graph
mnemo note graph --format dot > graph.dot
# dot -Tpng graph.dot -o graph.png

mnemo note autolink --dry-run
mnemo note autolink
```

## Custom paths (one-off)

```bash
MNEMO_HOME=/tmp/mnemo-test mnemo note list

mnemo note list --db /tmp/test.db --vault /tmp/vault
```
