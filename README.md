# pi-multilang-alias

Multilingual and keyboard-layout aliases for [Pi](https://pi.dev), so slash commands remain usable while a non-English input source is active.

## Install

Install globally for the current user:

```bash
pi install npm:pi-multilang-alias
```

Or install directly from GitHub:

```bash
pi install git:github.com/hyein-cbio/pi-multilang-alias
```

Install into the current project instead with `pi install -l ...`.

After installation, start a new Pi session. Manage the package with:

```bash
pi list
pi update --extensions
pi remove npm:pi-multilang-alias
```

## Included aliases

The package currently includes:

- Korean locale aliases
- Simplified Chinese locale aliases
- Korean two-set (두벌식) keyboard-layout aliases
- Korean three-set final (세벌식 최종) keyboard-layout aliases

Examples:

```text
/모델   -> /model
/模型   -> /model
/벼ㅑㅅ -> /quit       # Korean two-set layout
/ㅅㄱㄷㄷ -> /tree     # Korean two-set layout
/래가   -> /fork      # Korean two-set layout
```

Tree and fork aliases are included for every supported locale and keyboard layout:

| Locale / layout | `/tree` alias | `/fork` alias |
|---|---|---|
| Korean | `/트리` | `/포크` |
| Simplified Chinese | `/树` | `/分叉` |
| Korean two-set | `/ㅅㄱㄷㄷ` | `/래가` |
| Korean three-set final | `/ㅓㅐㅕㅕ` | `/ㅏ채ㄱ` |

For these aliases, press Enter once to replace the alias with `/tree` or `/fork`, then press Enter again to open Pi's built-in selector. Pi exposes APIs for navigating or forking from a specific entry, but no public API for opening these selectors, so these aliases use the same editor-prefill flow as other commands without a direct API.

Clone and hotkeys aliases are also included:

| Locale / layout | `/clone` alias | `/hotkeys` alias |
|---|---|---|
| Korean | `/클론` | `/단축키` |
| Simplified Chinese | `/克隆` | `/快捷键` |
| Korean two-set | `/치ㅐㅜㄷ` | `/ㅙ사됸` |
| Korean three-set final | `/ㅔㅈㅊ셔` | `/ㄴ처겨ㄹㄴ` |

These use the same two-Enter flow: the first Enter prefills `/clone` or `/hotkeys`, and the second executes Pi's built-in command. The three-set final hotkeys alias also accepts the conjoining-jamo form `ㄴ처겨\u1105\u1160\u11ab` emitted by libhangul-based input methods (Unicode escapes shown for clarity).

By default, all supported aliases are registered when the extension loads. Aliases stay out of the generic menu shown for `/`, but appear in autocomplete after you start typing one (for example, `/모` or `/벼`). The active input environment is detected again when an alias is invoked, allowing the current input source to change during a Pi session.

## Choose alias languages and layouts

Run `/alias-settings` in interactive TUI mode to choose which built-in alias groups to enable:

```text
> [✓] 한국어 — Korean
  [ ] 简体中文 — Simplified Chinese
  [✓] 두벌식 — Korean two-set
  [ ] 세벌식 최종 — Korean three-set final
```

- Choose **Global** (all projects) or **Project** (only offered in trusted projects).
- Use **↑/↓** to move and **Space** to toggle any number of checkmarks.
- **Enter** saves and reloads extensions so disabled aliases are unregistered.
- **Esc** cancels without saving.

The selection is stored in the same config files used for custom aliases (below). Existing custom aliases and unrelated settings are preserved. A project selection replaces the global selection, so changing the global selection does not override an existing project selection.

You can also edit the config directly:

```json
{
  "enabledGroups": ["ko", "ko-2set"],
  "aliases": {
    "/exit": "/quit"
  }
}
```

Available group IDs are `ko`, `zh-CN`, `ko-2set`, and `ko-3-final`. Omitting `enabledGroups` inherits the lower-precedence selection (all groups by default); `[]` disables all built-in groups. Custom aliases remain enabled regardless of group selection. Invalid selections warn and fall back to the lower-precedence selection. Remove the project's `enabledGroups` field to restore global inheritance.

`/alias-settings` remains available even when all groups are disabled and is reserved: it cannot be replaced by a custom alias. Changing a config file manually requires `/reload` or a fresh session.

## Custom aliases

Add aliases without changing the installed package by creating either of these files:

```text
~/.pi/agent/pi-multilang-alias.json   # global: all projects
.pi/pi-multilang-alias.json           # project-local: current project
```

`PI_CODING_AGENT_DIR` replaces `~/.pi/agent` when it is set. The project config directory follows Pi's configured project directory name and project-local aliases are only read for trusted projects.

Configuration is merged from lowest to highest precedence:

1. Built-in package aliases
2. Global user aliases
3. Project-local aliases

A later definition replaces an earlier alias with the same name. For example:

```json
{
  "aliases": {
    "/exit": "/quit",
    "/종료": "/quit",
    "/끝": "/quit",
    "/모델선택": "/model"
  }
}
```

Both alias names and targets must be non-empty slash-command names. Command arguments and whitespace in targets are not supported; use `"/모델선택": "/model"`, not `"/모델선택": "/model sonnet"`. Invalid entries are ignored with a warning, and unreadable or malformed files do not prevent Pi from starting. Missing files are silently ignored.

Run `/reload` or start a fresh Pi session after changing a config file. Custom aliases targeting `/quit` or `/reload` use Pi's direct API, just like the built-ins, so they do not make an LLM request. Custom aliases also remain hidden from the generic `/` menu.

`pi-exit-alias` can overlap with aliases such as `/exit`. Avoid installing both packages if duplicate command registrations are undesirable.

### Personal shorthand macros (Korean and English)

Aliases are not limited to Pi's native commands or translations. You can use them as personal shorthand for commands provided by other installed extensions. For example, if an extension provides `/review`, add Korean and English shortcuts to your own config:

```json
{
  "aliases": {
    "/검토": "/review",
    "/ㄱㅌ": "/review",
    "/rv": "/review",
    "/check": "/review"
  }
}
```

After `/reload`, these shortcuts expand in the editor:

```text
/검토  → Enter → /review
/ㄱㅌ  → Enter → /review
/rv    → Enter → /review
/check → Enter → /review
```

The first Enter replaces the shorthand with `/review`; inspect or edit it, then press Enter again to execute it. The extension providing `/review` must be installed and loaded: this package only expands the alias, not implements the target command.

These are optional examples, not built-in aliases. Choose Korean or English names that do not conflict with your existing commands. This is single-command shorthand, not a multi-command macro engine: targets cannot include arguments or arbitrary prompt text, and arguments typed after an alias are currently not forwarded. You can add arguments manually after expansion, before the second Enter. Aliases targeting `/quit` or `/reload` are exceptions to the two-Enter flow and execute directly on the first Enter.

## Detection and test overrides

The extension detects the active input source on macOS, Linux, and Windows. For deterministic testing, these environment variables can override detection:

```bash
PI_ALIAS_LOCALE=en-GB
PI_ALIAS_KEYBOARD_LANGUAGE=ko
PI_ALIAS_KEYBOARD_LAYOUT=ko-2set
```

## Development

Run the extension from a checkout:

```bash
pi --no-extensions -e .
```

To inspect the registered commands without starting a session:

```bash
printf '%s\n' '{"type":"get_commands"}' | pi --no-session --offline --mode rpc
```

## License

MIT
