import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AliasStrategy = "prefill" | "api";

export type AliasGroup = {
  aliases: string[];
  target: string;
  strategy: AliasStrategy;
};

export type AliasConfigResult = {
  aliases: AliasGroup[];
  warnings: string[];
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

  const aliases = (value as { aliases?: unknown }).aliases;
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) {
    return {
      aliases: [],
      warnings: [`Invalid alias config in ${path}: "aliases" must be an object.`],
    };
  }

  const result: AliasGroup[] = [];
  const warnings: string[] = [];
  for (const [alias, target] of Object.entries(aliases)) {
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

  return { aliases: result, warnings };
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
  const agentDir =
    options.agentDir ??
    process.env.PI_CODING_AGENT_DIR ??
    join(options.homeDir ?? homedir(), ".pi", "agent");
  const globalResult = readAliasFile(join(agentDir, CONFIG_FILE_NAME));
  const projectResult = options.includeProject === false
    ? { aliases: [], warnings: [] }
    : readAliasFile(join(options.cwd, options.configDirName, CONFIG_FILE_NAME));

  return {
    aliases: mergeAliasGroups(globalResult.aliases, projectResult.aliases),
    warnings: [...globalResult.warnings, ...projectResult.warnings],
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
