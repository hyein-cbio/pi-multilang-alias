import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AliasStrategy = "prefill" | "api";

export type AliasGroup = {
  aliases: string[];
  target: string;
  strategy: AliasStrategy;
};

export const ALIAS_GROUPS = [
  { id: "ko", label: "한국어 — Korean" },
  { id: "zh-CN", label: "简体中文 — Simplified Chinese" },
  { id: "ko-2set", label: "두벌식 — Korean two-set" },
  { id: "ko-3-final", label: "세벌식 최종 — Korean three-set final" },
] as const;
export type AliasGroupId = (typeof ALIAS_GROUPS)[number]["id"];
export const ALL_ALIAS_GROUP_IDS = ALIAS_GROUPS.map((group) => group.id);
export const SETTINGS_COMMAND = "alias-settings";

export type AliasConfigResult = {
  aliases: AliasGroup[];
  warnings: string[];
  enabledGroups?: AliasGroupId[];
};

type LoadAliasConfigOptions = {
  cwd: string;
  configDirName: string;
  includeProject?: boolean;
  agentDir?: string;
  homeDir?: string;
};

const CONFIG_FILE_NAME = "pi-multilang-alias.json";
const SLASH_COMMAND = /^\/[^/\s]+$/;

function readAliasFile(path: string): AliasConfigResult {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return { aliases: [], warnings: [] };
    }
    return {
      aliases: [],
      warnings: [`Could not read ${path}: ${(error as Error).message}`],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      aliases: [],
      warnings: [`Invalid JSON in ${path}: ${(error as Error).message}`],
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { aliases: [], warnings: [`Invalid alias config in ${path}: expected an object.`] };
  }

  const config = value as Record<string, unknown>;
  const warnings: string[] = [];
  let enabledGroups: AliasGroupId[] | undefined;
  if ("enabledGroups" in config) {
    if (isAliasGroupSelection(config.enabledGroups)) {
      enabledGroups = [...new Set(config.enabledGroups)];
    } else {
      warnings.push(`Invalid enabledGroups in ${path}: expected an array of known group IDs (${ALL_ALIAS_GROUP_IDS.join(", ")}).`);
    }
  }

  const result: AliasGroup[] = [];
  const aliases = config.aliases;
  if (aliases !== undefined && (!aliases || typeof aliases !== "object" || Array.isArray(aliases))) {
    warnings.push(`Invalid alias config in ${path}: "aliases" must be an object.`);
    return { aliases: result, warnings, enabledGroups };
  }
  for (const [alias, target] of Object.entries(aliases ?? {})) {
    if (alias === `/${SETTINGS_COMMAND}`) {
      warnings.push(`Ignored reserved alias ${JSON.stringify(alias)} in ${path}.`);
      continue;
    }
    if (!SLASH_COMMAND.test(alias) || typeof target !== "string" || !SLASH_COMMAND.test(target)) {
      warnings.push(
        `Ignored invalid alias ${JSON.stringify(alias)} in ${path}: alias and target must be command names beginning with "/" and cannot contain whitespace.`,
      );
      continue;
    }

    const targetName = target.slice(1);
    result.push({
      aliases: [alias.slice(1)],
      target: targetName,
      strategy: targetName === "quit" || targetName === "reload" ? "api" : "prefill",
    });
  }

  return { aliases: result, warnings, enabledGroups };
}

function isAliasGroupSelection(value: unknown): value is AliasGroupId[] {
  return Array.isArray(value) && value.every((id) => ALL_ALIAS_GROUP_IDS.includes(id));
}

export function getAliasConfigPaths(options: LoadAliasConfigOptions) {
  const agentDir =
    options.agentDir ??
    process.env.PI_CODING_AGENT_DIR ??
    join(options.homeDir ?? homedir(), ".pi", "agent");
  return {
    global: join(agentDir, CONFIG_FILE_NAME),
    project: join(options.cwd, options.configDirName, CONFIG_FILE_NAME),
  };
}

// Preserve custom aliases and unrelated fields; never overwrite malformed config.
export function saveEnabledGroups(path: string, enabledGroups: AliasGroupId[]): void {
  if (!isAliasGroupSelection(enabledGroups)) throw new Error("Invalid alias group selection.");
  let source = "{}";
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const config: unknown = JSON.parse(source);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Invalid alias config in ${path}: expected an object.`);
  }
  const content = JSON.stringify({ ...config, enabledGroups: [...new Set(enabledGroups)] }, null, 2) + "\n";
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function selectBuiltInAliases(
  groups: Record<AliasGroupId, AliasGroup[]>,
  enabledGroups: readonly AliasGroupId[],
): AliasGroup[] {
  return ALL_ALIAS_GROUP_IDS.filter((id) => enabledGroups.includes(id)).flatMap((id) => groups[id]);
}

export function mergeAliasGroups(...sources: AliasGroup[][]): AliasGroup[] {
  const effective = new Map<string, AliasGroup>();
  for (const groups of sources) {
    for (const group of groups) {
      for (const alias of group.aliases) {
        effective.set(alias, { ...group, aliases: [alias] });
      }
    }
  }
  return [...effective.values()];
}

export function loadCustomAliases(options: LoadAliasConfigOptions): AliasConfigResult {
  const paths = getAliasConfigPaths(options);
  const globalResult = readAliasFile(paths.global);
  const projectResult: AliasConfigResult = options.includeProject === false
    ? { aliases: [], warnings: [] }
    : readAliasFile(paths.project);

  return {
    aliases: mergeAliasGroups(globalResult.aliases, projectResult.aliases),
    warnings: [...globalResult.warnings, ...projectResult.warnings],
    enabledGroups: projectResult.enabledGroups ?? globalResult.enabledGroups ?? [...ALL_ALIAS_GROUP_IDS],
  };
}

export async function invokeDirectAlias(
  group: AliasGroup,
  actions: { reload: () => Promise<void> | void; shutdown: () => Promise<void> | void },
): Promise<boolean> {
  if (group.strategy !== "api") return false;
  if (group.target === "reload") {
    await actions.reload();
    return true;
  }
  if (group.target === "quit") {
    await actions.shutdown();
    return true;
  }
  return false;
}

export function filterRootSlashSuggestions<T extends { value: string }>(
  items: T[],
  aliasNames: ReadonlySet<string>,
): T[] {
  return items.filter((item) => !aliasNames.has(item.value.replace(/:\d+$/, "")));
}
