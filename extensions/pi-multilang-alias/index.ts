import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import koLocaleAliases from "./aliases/locales/ko.json";
import zhCnLocaleAliases from "./aliases/locales/zh-CN.json";
import ko2SetAliases from "./aliases/layouts/ko-2set.json";
import ko3FinalAliases from "./aliases/layouts/ko-3-final.json";
import {
  filterRootSlashSuggestions,
  invokeDirectAlias,
  loadCustomAliases,
  mergeAliasGroups,
  selectBuiltInAliases,
  ALL_ALIAS_GROUP_IDS,
  type AliasGroup,
  type AliasGroupId,
} from "./config";
import { detectEnvironment, readyMessage } from "./environment";
import { registerAliasSettings } from "./settings";

const builtInAliases = {
  ko: koLocaleAliases,
  "zh-CN": zhCnLocaleAliases,
  "ko-2set": ko2SetAliases,
  "ko-3-final": ko3FinalAliases,
} as Record<AliasGroupId, AliasGroup[]>;

export default function (pi: ExtensionAPI) {
  registerAliasSettings(pi);
  pi.on("session_start", (_event, ctx) => {
    const custom = loadCustomAliases({
      cwd: ctx.cwd,
      configDirName: CONFIG_DIR_NAME,
      includeProject: ctx.isProjectTrusted(),
    });
    const aliases = mergeAliasGroups(
      selectBuiltInAliases(builtInAliases, custom.enabledGroups ?? ALL_ALIAS_GROUP_IDS),
      custom.aliases,
    );
    const aliasNames = new Set(aliases.flatMap((group) => group.aliases));

    for (const warning of custom.warnings) {
      const message = `pi-multilang-alias: ${warning}`;
      if (ctx.hasUI) ctx.ui.notify(message, "warning");
      else console.warn(message);
    }

    // Register all enabled groups, independent of the currently active input source.
    for (const group of aliases) {
      for (const alias of group.aliases) {
        pi.registerCommand(alias, {
          description: `Alias for /${group.target}`,
          handler: async (_args, commandCtx) => {
            // Detect the current input source at invocation time rather than
            // reusing the layout that was active when the extension loaded.
            const environment = detectEnvironment();
            const aliasLanguage = environment.keyboardLanguage ?? environment.locale;
            const message = readyMessage(aliasLanguage);

            if (
              await invokeDirectAlias(group, {
                reload: () => commandCtx.reload(),
                shutdown: () => commandCtx.shutdown(),
              })
            ) {
              return;
            }

            commandCtx.ui.setEditorText(`/${group.target}`);
            commandCtx.ui.notify(`/${group.target} ${message}`, "info");
          },
        });
      }
    }

    if (ctx.mode !== "tui") return;

    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: current.triggerCharacters,
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        if (!suggestions || suggestions.prefix !== "/") return suggestions;

        return {
          ...suggestions,
          items: filterRootSlashSuggestions(suggestions.items, aliasNames),
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
}
