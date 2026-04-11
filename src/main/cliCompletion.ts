/**
 * Shell completion scripts for `mnemo completion bash|zsh|fish`.
 */

const NOTE_SUBS =
  'list show search new import graph autolink categories set-category category';
const TOP_CMDS = 'note mcp mcp-http gui completion help';

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
    note)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${NOTE_SUBS}" -- "\${cur}") )
        return
      fi
      local sub="\${COMP_WORDS[2]}"
      case "\${sub}" in
        list)
          COMPREPLY=( $(compgen -W "-c --category --exact --shallow --no-descendants -r --recursive -v --verbose --json --no-json" -- "\${cur}") )
          ;;
        show|search|new|import|graph|autolink|categories|set-category|category)
          COMPREPLY=( $(compgen -W "--json --no-json" -- "\${cur}") )
          ;;
      esac
      ;;
    mcp)
      COMPREPLY=( $(compgen -W "--db --vault --turso-url --turso-token" -- "\${cur}") )
      ;;
    completion)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
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
  cmds=(note mcp mcp-http gui completion help)
  if (( CURRENT == 2 )); then
    _describe -t commands command cmds
    return
  fi
  case "\${words[2]}" in
    note)
      if (( CURRENT == 3 )); then
        _values 'note subcommand' list show search new import graph autolink categories set-category category
        return
      fi
      case "\${words[3]}" in
        list)
          _arguments '*: :_files' '-c+:category path:' '--category+:category path:' \
            '--exact' '--shallow' '--no-descendants' '-r' '--recursive' '-v' '--verbose' '--json' '--no-json'
          ;;
        *)
          _arguments '--json' '--no-json'
          ;;
      esac
      ;;
    mcp)
      _arguments '--db+:path:' '--vault+:path:' '--turso-url+:url:' '--turso-token+:token:'
      ;;
    completion)
      _values 'shell' bash zsh fish
      ;;
  esac
}

compdef _mnemo mnemo
`;

const FISH = `# mnemo fish completion — save to ~/.config/fish/completions/mnemo.fish
# or: mnemo completion fish | source

complete -c mnemo -f -n '__fish_use_subcommand' -a note -d 'Vault CLI'
complete -c mnemo -f -n '__fish_use_subcommand' -a mcp -d 'MCP stdio'
complete -c mnemo -f -n '__fish_use_subcommand' -a mcp-http -d 'MCP HTTP'
complete -c mnemo -f -n '__fish_use_subcommand' -a gui -d 'Desktop app'
complete -c mnemo -f -n '__fish_use_subcommand' -a completion -d 'Shell completion'
complete -c mnemo -f -n '__fish_use_subcommand' -a help -d 'Help'

complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'list' -d 'List notes'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'show' -d 'Show note'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'search' -d 'Search'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'new' -d 'New note'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'import' -d 'Import file'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'graph' -d 'Link graph'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'autolink' -d 'Recompute links'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'categories' -d 'Category tree'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
  -a 'set-category' -d 'Set note folder'
complete -c mnemo -f -n '__fish_seen_subcommand_from note; and not __fish_seen_subcommand_from list show search new import graph autolink categories set-category category' \\
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
