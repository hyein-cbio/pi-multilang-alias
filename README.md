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
```

All supported aliases are registered when the extension loads. Aliases stay out of the generic menu shown for `/`, but appear in autocomplete after you start typing one (for example, `/모` or `/벼`). The active input environment is detected again when an alias is invoked, allowing the current input source to change during a Pi session.

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
