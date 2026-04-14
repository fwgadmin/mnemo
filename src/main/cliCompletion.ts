/**
 * Shell completion scripts for `mnemo completion bash|zsh|fish`.
 */

const NOTE_SUBS =
  'list show search new compose write edit import graph autolink categories set-category category';
const HELP_TOPICS = 'topics vault workspace sync note mcp mcp-http config clients desktop full';
const TOP_CMDS =
  'add a find f search list import graph categories autolink set-category category compose write edit note workspace sync mcp mcp-http gui completion help';

const BASH = `#!/usr/bin/env bash
# mnemo bash completion — source with: eval "$(mnemo completion bash)"
_mnemo() {
  local cur prev words cword
  _init_completion 2>/dev/null || {
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
  }

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${TOP_CMDS}" -- "\${cur}") )
    return
  fi

  local cmd="\${COMP_WORDS[1]}"
  case "\${cmd}" in
    add|a)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token --json --no-json -e --edit -c --category --title --body -t -b" -- "\${cur}") )
      ;;
    compose|write|edit)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token --json --no-json -c --category" -- "\${cur}") )
      ;;
    list)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token --json --no-json -c --category --exact --shallow --no-descendants -r --recursive -v --verbose --ids --no-pager --plain --pager-size --from --page --limit --page-size" -- "\${cur}") )
      ;;
    find|f|search)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token --json --no-json -c --category --exact --shallow --no-descendants -r --recursive" -- "\${cur}") )
      ;;
    import|graph|categories|autolink|set-category|category)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token --json --no-json" -- "\${cur}") )
      ;;
    note)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${NOTE_SUBS}" -- "\${cur}") )
        return
      fi
      local sub="\${COMP_WORDS[2]}"
      case "\${sub}" in
        list)
          COMPREPLY=( $(compgen -W "-c --category --exact --shallow --no-descendants -r --recursive -v --verbose --ids --no-pager --plain --pager-size --from --page --limit --page-size --json --no-json" -- "\${cur}") )
          ;;
        search)
          COMPREPLY=( $(compgen -W "-c --category --exact --shallow --no-descendants -r --recursive --json --no-json" -- "\${cur}") )
          ;;
        new)
          COMPREPLY=( $(compgen -W "-e --edit -c --category --title --body -t -b --json --no-json" -- "\${cur}") )
          ;;
        compose|write)
          COMPREPLY=( $(compgen -W "-c --category --json --no-json" -- "\${cur}") )
          ;;
        edit)
          COMPREPLY=( $(compgen -W "--json --no-json -c --category" -- "\${cur}") )
          ;;
        show|import|graph|autolink|categories|set-category|category)
          COMPREPLY=( $(compgen -W "--json --no-json" -- "\${cur}") )
          ;;
      esac
      ;;
    mcp)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token" -- "\${cur}") )
      ;;
    workspace)
      COMPREPLY=( $(compgen -W "list new switch archive delete --json --no-json" -- "\${cur}") )
      ;;
    sync)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "pull push" -- "\${cur}") )
      else
        COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token --workspace --json --no-json" -- "\${cur}") )
      fi
      ;;
    completion)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      fi
      ;;
    help)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${HELP_TOPICS}" -- "\${cur}") )
      fi
      ;;
  esac
}
complete -F _mnemo mnemo
`;

const ZSH = `#compdef mnemo
# mnemo zsh completion — source with: source <(mnemo completion zsh)

_mnemo() {
  local -a cmds
  cmds=(add a find f search list import graph categories autolink set-category category compose write edit note workspace sync mcp mcp-http gui completion help)
  # help <topic> completed in case help below
  if (( CURRENT == 2 )); then
    _describe -t commands command cmds
    return
  fi
  case "\${words[2]}" in
    add|a)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:' '--json' '--no-json' \
        '-e' '--edit' '-c+:category path:' '--category+:category path:' '--title+:title:' '--body+:body:' '-t+:title:' '-b+:body:'
      ;;
    compose|write|edit)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:' '--json' '--no-json' \
        '-c+:category path:' '--category+:category path:'
      ;;
    list)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:' '--json' '--no-json' \
        '-c+:category path:' '--category+:category path:' \
        '--exact' '--shallow' '--no-descendants' '-r' '--recursive' '-v' '--verbose' '--ids' \
        '--no-pager' '--plain' '--pager-size+:rows:' '--from+:from index:' \
        '--page' '--limit' '--page-size'
      ;;
    find|f|search)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:' '--json' '--no-json' \
        '-c+:category path:' '--category+:category path:' \
        '--exact' '--shallow' '--no-descendants' '-r' '--recursive'
      ;;
    import|graph|categories|autolink|set-category|category)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:' '--json' '--no-json'
      ;;
    note)
      if (( CURRENT == 3 )); then
        _values 'note subcommand' list show search new compose write edit import graph autolink categories set-category category
        return
      fi
      case "\${words[3]}" in
        list)
          _arguments '*: :_files' '-c+:category path:' '--category+:category path:' \
            '--exact' '--shallow' '--no-descendants' '-r' '--recursive' '-v' '--verbose' '--ids' \
            '--no-pager' '--plain' '--pager-size+:rows:' '--from+:from index:' \
            '--page' '--limit' '--page-size' '--json' '--no-json'
          ;;
        search)
          _arguments '*: :_files' '-c+:category path:' '--category+:category path:' \
            '--exact' '--shallow' '--no-descendants' '-r' '--recursive' '--json' '--no-json'
          ;;
        new)
          _arguments '-e' '--edit' '-c+:category path:' '--category+:category path:' \
            '--title+:title:' '--body+:body:' '-t+:title:' '-b+:body:' '--json' '--no-json'
          ;;
        compose|write)
          _arguments '-c+:category path:' '--category+:category path:' '--json' '--no-json'
          ;;
        edit)
          _arguments '--json' '--no-json' '-c+:category path:' '--category+:category path:'
          ;;
        *)
          _arguments '--json' '--no-json'
          ;;
      esac
      ;;
    mcp)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:'
      ;;
    workspace)
      _arguments '--json' '--no-json' \
        '1:subcommand:(list new switch archive delete)'
      ;;
    sync)
      if (( CURRENT == 3 )); then
        _values 'sync subcommand' pull push
        return
      fi
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:' '--workspace+:workspace id or index:' '--json' '--no-json'
      ;;
    completion)
      _values 'shell' bash zsh fish
      ;;
    help)
      _values 'help topic' topics vault workspace sync note mcp mcp-http config clients desktop full
      ;;
  esac
}

compdef _mnemo mnemo
`;

const FISH = `# mnemo fish completion — save to ~/.config/fish/completions/mnemo.fish
# or: mnemo completion fish | source

complete -c mnemo -f -n '__fish_use_subcommand' -a add -d 'New note'
complete -c mnemo -f -n '__fish_use_subcommand' -a a -d 'New note (alias)'
complete -c mnemo -f -n '__fish_use_subcommand' -a find -d 'Search'
complete -c mnemo -f -n '__fish_use_subcommand' -a f -d 'Search (alias)'
complete -c mnemo -f -n '__fish_use_subcommand' -a search -d 'Search'
complete -c mnemo -f -n '__fish_use_subcommand' -a list -d 'List notes'
complete -c mnemo -f -n '__fish_use_subcommand' -a import -d 'Import file'
complete -c mnemo -f -n '__fish_use_subcommand' -a graph -d 'Link graph'
complete -c mnemo -f -n '__fish_use_subcommand' -a categories -d 'Category tree'
complete -c mnemo -f -n '__fish_use_subcommand' -a autolink -d 'Recompute links'
complete -c mnemo -f -n '__fish_use_subcommand' -a set-category -d 'Set folder'
complete -c mnemo -f -n '__fish_use_subcommand' -a category -d 'Folder ops'
complete -c mnemo -f -n '__fish_use_subcommand' -a compose -d 'Create in editor'
complete -c mnemo -f -n '__fish_use_subcommand' -a write -d 'Alias compose'
complete -c mnemo -f -n '__fish_use_subcommand' -a edit -d 'Edit in editor'
complete -c mnemo -f -n '__fish_use_subcommand' -a note -d 'Vault CLI (advanced)'
complete -c mnemo -f -n '__fish_use_subcommand' -a workspace -d 'Vault workspaces'
complete -c mnemo -f -n '__fish_use_subcommand' -a sync -d 'Remote/local sync'
complete -c mnemo -f -n '__fish_seen_subcommand_from sync' -a 'pull push' -d 'pull=remote→local push=local→remote'
complete -c mnemo -f -n '__fish_use_subcommand' -a mcp -d 'MCP stdio'
complete -c mnemo -f -n '__fish_use_subcommand' -a mcp-http -d 'MCP HTTP'
complete -c mnemo -f -n '__fish_use_subcommand' -a gui -d 'Desktop app'
complete -c mnemo -f -n '__fish_use_subcommand' -a completion -d 'Shell completion'
complete -c mnemo -f -n '__fish_use_subcommand' -a help -d 'Progressive help'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'topics' -d 'List sections'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'vault' -d 'Vault commands'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'workspace' -d 'Workspaces CLI'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'sync' -d 'mnemo sync push/pull'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'note' -d 'Legacy mnemo note'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'mcp' -d 'MCP stdio'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'mcp-http' -d 'MCP HTTP'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'config' -d 'cli.json'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'clients' -d 'MCP clients'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'desktop' -d 'GUI shortcuts'
complete -c mnemo -f -n '__fish_seen_subcommand_from help' -a 'full' -d 'Full reference'

complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'list' -d 'List notes'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'show' -d 'Show note'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'search' -d 'Search'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'new' -d 'New note'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'compose' -d 'Create in editor'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'write' -d 'Alias compose'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'edit' -d 'Edit in editor'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'import' -d 'Import file'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'graph' -d 'Link graph'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'autolink' -d 'Recompute links'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'categories' -d 'Category tree'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'set-category' -d 'Set note folder'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new compose write edit import graph autolink categories set-category category' \\
  -a 'category' -d 'Rename / promote / demote folders'

complete -c mnemo -f -n '__fish_seen_subcommand_from completion' -a 'bash' -d 'Bash'
complete -c mnemo -f -n '__fish_seen_subcommand_from completion' -a 'zsh' -d 'Zsh'
complete -c mnemo -f -n '__fish_seen_subcommand_from completion' -a 'fish' -d 'Fish'

complete -c mnemo -s h -l help -d 'Help'
complete -c mnemo -l json -d 'JSON output (note)'
complete -c mnemo -l no-json -d 'Text output (note)'
`;

export function printCompletionScript(shell: 'bash' | 'zsh' | 'fish'): void {
  switch (shell) {
    case 'bash':
      process.stdout.write(BASH);
      break;
    case 'zsh':
      process.stdout.write(ZSH);
      break;
    case 'fish':
      process.stdout.write(FISH);
      break;
    default: {
      const _: never = shell;
      void _;
    }
  }
}
