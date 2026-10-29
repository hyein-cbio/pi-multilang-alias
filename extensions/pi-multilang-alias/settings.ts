import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import {
  ALIAS_GROUPS,
  ALL_ALIAS_GROUP_IDS,
  getAliasConfigPaths,
  loadCustomAliases,
  saveEnabledGroups,
  SETTINGS_COMMAND,
  type AliasGroupId,
} from "./config";

export function registerAliasSettings(pi: ExtensionAPI): void {
  pi.registerCommand(SETTINGS_COMMAND, {
    description: "Choose enabled alias languages and keyboard layouts",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/alias-settings requires interactive TUI mode.", "warning");
        return;
      }

      const globalScope = "Global — all projects";
      const projectScope = "Project — override global selection";
      const trusted = ctx.isProjectTrusted();
      const scope = await ctx.ui.select("Alias settings: save to", [
        globalScope,
        ...(trusted ? [projectScope] : []),
      ]);
      if (!scope) return;
      const project = scope === projectScope;
      const options = { cwd: ctx.cwd, configDirName: CONFIG_DIR_NAME, includeProject: project && trusted };
      const paths = getAliasConfigPaths(options);
      const path = project ? paths.project : paths.global;
      const config = loadCustomAliases(options);
      for (const warning of config.warnings) ctx.ui.notify(warning, "warning");

      const selected = await ctx.ui.custom<AliasGroupId[] | undefined>((tui, theme, keys, done) => {
        const checked = new Set(config.enabledGroups ?? ALL_ALIAS_GROUP_IDS);
        let cursor = 0;
        return {
          render(width: number): string[] {
            return [
              theme.fg("accent", "Alias languages and keyboard layouts"),
              theme.fg("dim", `Save to: ${path}`),
              ...ALIAS_GROUPS.map(({ id, label }, index) => {
                const line = `${index === cursor ? ">" : " "} [${checked.has(id) ? "✓" : " "}] ${label}`;
                return index === cursor ? theme.fg("accent", line) : line;
              }),
              theme.fg("dim", "↑/↓ move · Space toggle · Enter save & reload · Esc cancel"),
              theme.fg("dim", "Custom aliases are always kept. Project selections override global settings."),
            ].map((line) => truncateToWidth(line, width));
          },
          handleInput(data: string): void {
            if (keys.matches(data, "tui.select.cancel")) {
              done(undefined);
              return;
            }
            if (matchesKey(data, "space")) {
              const id = ALIAS_GROUPS[cursor]!.id;
              if (checked.has(id)) checked.delete(id);
              else checked.add(id);
            } else if (keys.matches(data, "tui.select.up")) {
              cursor = (cursor - 1 + ALIAS_GROUPS.length) % ALIAS_GROUPS.length;
            } else if (keys.matches(data, "tui.select.down")) {
              cursor = (cursor + 1) % ALIAS_GROUPS.length;
            } else if (keys.matches(data, "tui.select.confirm")) {
              done(ALL_ALIAS_GROUP_IDS.filter((id) => checked.has(id)));
              return;
            } else {
              return;
            }
            tui.requestRender();
          },
          invalidate() {},
        };
      });
      if (selected === undefined) return;

      try {
        saveEnabledGroups(path, selected);
      } catch (error) {
        ctx.ui.notify(`Could not save alias settings: ${(error as Error).message}`, "error");
        return;
      }
      ctx.ui.notify(`Alias settings saved to ${path}. Reloading extensions.`, "info");
      // Reload removes old command registrations as well as adding newly enabled ones.
      await ctx.reload();
    },
  });
}
