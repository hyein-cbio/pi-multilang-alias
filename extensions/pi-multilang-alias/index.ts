import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import koLocaleAliases from "./aliases/locales/ko.json";
import zhCnLocaleAliases from "./aliases/locales/zh-CN.json";
import ko2SetAliases from "./aliases/layouts/ko-2set.json";
import ko3FinalAliases from "./aliases/layouts/ko-3-final.json";
import { detectEnvironment, readyMessage } from "./environment";

type AliasGroup = {
  aliases: string[];
  target: string;
  strategy: "prefill" | "api";
};

export default function (pi: ExtensionAPI) {
  // The active input source can change after Pi starts. Register every alias
  // up front so command availability is not frozen to the startup layout.
  const aliases = [
    ...koLocaleAliases,
    ...zhCnLocaleAliases,
    ...ko2SetAliases,
    ...ko3FinalAliases,
  ] as AliasGroup[];
  const aliasNames = new Set(aliases.flatMap((group) => group.aliases));

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: current.triggerCharacters,
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        if (!suggestions || suggestions.prefix !== "/") return suggestions;

        return {
          ...suggestions,
          items: suggestions.items.filter((item) => {
            const commandName = item.value.replace(/:\d+$/, "");
            return !aliasNames.has(commandName);
          }),
        };
      },
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      },
      shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
        return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
      },
    }));
  });

  for (const group of aliases) {
    for (const alias of group.aliases) {
      pi.registerCommand(alias, {
        description: `Alias for /${group.target}`,
        handler: async (_args, ctx) => {
          // Detect the current input source at invocation time rather than
          // reusing the layout that was active when the extension loaded.
          const environment = detectEnvironment();
          const aliasLanguage = environment.keyboardLanguage ?? environment.locale;
          const message = readyMessage(aliasLanguage);

          if (group.strategy === "api") {
            if (group.target === "reload") {
              await ctx.reload();
              return;
            }
            if (group.target === "quit") {
              await ctx.shutdown();
              return;
            }
          }

          ctx.ui.setEditorText(`/${group.target}`);
          ctx.ui.notify(`/${group.target} ${message}`, "info");
        },
      });
    }
  }
}
