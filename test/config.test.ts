import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ALL_ALIAS_GROUP_IDS,
  getAliasConfigPaths,
  saveEnabledGroups,
  selectBuiltInAliases,
  type AliasGroupId,
  filterRootSlashSuggestions,
  invokeDirectAlias,
  loadCustomAliases,
  mergeAliasGroups,
  type AliasGroup,
} from "../extensions/pi-multilang-alias/config.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-multilang-alias-"));
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  return { root, agentDir, cwd };
}

function writeConfig(path: string, aliases: Record<string, unknown>) {
  writeFileSync(path, JSON.stringify({ aliases }), "utf8");
}

test("missing config files produce no aliases or warnings", () => {
  const { agentDir, cwd } = fixture();
  assert.deepEqual(loadCustomAliases({ cwd, configDirName: ".pi", agentDir }), {
    aliases: [],
    warnings: [],
    enabledGroups: ALL_ALIAS_GROUP_IDS,
  });
});

test("loads global and project aliases with project precedence", () => {
  const { agentDir, cwd } = fixture();
  writeConfig(join(agentDir, "pi-multilang-alias.json"), {
    "/exit": "/quit",
    "/shared": "/model",
  });
  writeConfig(join(cwd, ".pi", "pi-multilang-alias.json"), {
    "/project": "/session",
    "/shared": "/resume",
  });

  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  const byAlias = new Map(result.aliases.map((group) => [group.aliases[0], group]));
  assert.equal(byAlias.get("exit")?.target, "quit");
  assert.equal(byAlias.get("exit")?.strategy, "api");
  assert.equal(byAlias.get("project")?.target, "session");
  assert.equal(byAlias.get("shared")?.target, "resume");
  assert.deepEqual(result.warnings, []);
});

test("custom quit and reload aliases invoke the direct API strategy", async () => {
  const { agentDir, cwd } = fixture();
  writeConfig(join(agentDir, "pi-multilang-alias.json"), {
    "/again": "/reload",
    "/exit": "/quit",
  });
  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  const calls: string[] = [];
  const actions = {
    reload: () => { calls.push("reload"); },
    shutdown: () => { calls.push("shutdown"); },
  };

  assert.equal(await invokeDirectAlias(result.aliases[0]!, actions), true);
  assert.equal(await invokeDirectAlias(result.aliases[1]!, actions), true);
  assert.deepEqual(calls, ["reload", "shutdown"]);
});

const prefillAliasCases = [
  ["layouts/ko-2set.json", {
    tree: ["ㅅㄱㄷㄷ"], fork: ["래가"], clone: ["치ㅐㅜㄷ"], hotkeys: ["ㅙ사됸"],
  }],
  // Sebeolsik Final composes o+r as 채, n+e as 셔, o+t as 처, and k+e as 겨.
  // hotkeys ends with y=ㄹ (initial consonant), s=ㄴ (final consonant), with no vowel between them.
  ["layouts/ko-3-final.json", {
    tree: ["ㅓㅐㅕㅕ"], fork: ["ㅏ채ㄱ"], clone: ["ㅔㅈㅊ셔"],
    hotkeys: ["ㄴ처겨ㄹㄴ", "ㄴ처겨\u1105\u1160\u11ab"],
  }],
  ["locales/ko.json", {
    tree: ["트리"], fork: ["포크"], clone: ["클론"], hotkeys: ["단축키"],
  }],
  ["locales/zh-CN.json", {
    tree: ["树"], fork: ["分叉"], clone: ["克隆"], hotkeys: ["快捷键"],
  }],
] as const;

for (const [file, expected] of prefillAliasCases) {
  test(`${file}: navigation and hotkeys aliases use prefill and stay out of the root menu`, async () => {
    const builtIn = JSON.parse(readFileSync(
      new URL(`../extensions/pi-multilang-alias/aliases/${file}`, import.meta.url),
      "utf8",
    )) as AliasGroup[];
    const aliases = mergeAliasGroups(builtIn);
    const actions = {
      reload: () => { assert.fail("must not reload"); },
      shutdown: () => { assert.fail("must not shut down"); },
    };

    for (const [target, names] of Object.entries(expected)) {
      assert.deepEqual(builtIn.filter((group) => group.target === target), [
        { aliases: names, target, strategy: "prefill" },
      ]);
      for (const alias of names) {
        const matches = aliases.filter((group) => group.aliases.includes(alias));
        assert.deepEqual(matches, [{ aliases: [alias], target, strategy: "prefill" }]);
        assert.equal(await invokeDirectAlias(matches[0]!, actions), false);
      }
    }

    const canonicalItems = Object.keys(expected).map((value) => ({ value }));
    const aliasNames = new Set(aliases.flatMap((group) => group.aliases));
    const aliasItems = Object.values(expected).flatMap((names) =>
      names.flatMap((value) => [{ value }, { value: `${value}:2` }]),
    );
    assert.deepEqual(filterRootSlashSuggestions([
      ...canonicalItems, ...aliasItems,
    ], aliasNames), canonicalItems);
  });
}

test("custom navigation and hotkeys aliases also use the prefill strategy", () => {
  const { agentDir, cwd } = fixture();
  writeConfig(join(agentDir, "pi-multilang-alias.json"), {
    "/history": "/tree",
    "/branch": "/fork",
    "/duplicate": "/clone",
    "/shortcuts": "/hotkeys",
  });

  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  assert.deepEqual(result.aliases, [
    { aliases: ["history"], target: "tree", strategy: "prefill" },
    { aliases: ["branch"], target: "fork", strategy: "prefill" },
    { aliases: ["duplicate"], target: "clone", strategy: "prefill" },
    { aliases: ["shortcuts"], target: "hotkeys", strategy: "prefill" },
  ]);
  assert.deepEqual(result.warnings, []);
});

test("malformed JSON and invalid entries warn without throwing", () => {
  const { agentDir, cwd } = fixture();
  writeFileSync(join(agentDir, "pi-multilang-alias.json"), "{", "utf8");
  writeConfig(join(cwd, ".pi", "pi-multilang-alias.json"), {
    valid: "/quit",
    "/with args": "/quit",
    "/bad-target": "quit",
    "/good": "/model",
  });

  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  assert.deepEqual(result.aliases.map((group) => group.aliases[0]), ["good"]);
  assert.equal(result.warnings.length, 4);
  assert.match(result.warnings[0] ?? "", /Invalid JSON/);
});

test("honors PI_CODING_AGENT_DIR", () => {
  const { root, cwd } = fixture();
  const configuredAgentDir = join(root, "configured-agent");
  mkdirSync(configuredAgentDir);
  writeConfig(join(configuredAgentDir, "pi-multilang-alias.json"), { "/env": "/quit" });
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = configuredAgentDir;
  try {
    const result = loadCustomAliases({ cwd, configDirName: ".pi", includeProject: false });
    assert.equal(result.aliases[0]?.aliases[0], "env");
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
});

test("built-ins remain and custom aliases override without duplicate registration", () => {
  const builtIn: AliasGroup[] = [{ aliases: ["종료", "끝"], target: "quit", strategy: "api" }];
  const custom: AliasGroup[] = [{ aliases: ["종료"], target: "model", strategy: "prefill" }];
  const merged = mergeAliasGroups(builtIn, custom);
  assert.deepEqual(merged.map((group) => [group.aliases[0], group.target]), [
    ["종료", "model"],
    ["끝", "quit"],
  ]);
});

test("group-only config supports multiple selections and empty project override", () => {
  const { agentDir, cwd } = fixture();
  writeFileSync(join(agentDir, "pi-multilang-alias.json"), JSON.stringify({ enabledGroups: ["ko", "ko-2set", "ko"] }));
  const options = { cwd, configDirName: ".pi", agentDir };
  assert.deepEqual(loadCustomAliases(options).enabledGroups, ["ko", "ko-2set"]);
  assert.deepEqual(loadCustomAliases(options).warnings, []);
  writeFileSync(join(cwd, ".pi", "pi-multilang-alias.json"), JSON.stringify({ enabledGroups: [] }));
  assert.deepEqual(loadCustomAliases(options).enabledGroups, []);
  assert.deepEqual(loadCustomAliases({ ...options, includeProject: false }).enabledGroups, ["ko", "ko-2set"]);
});

test("project aliases alone inherit global group selection", () => {
  const { agentDir, cwd } = fixture();
  writeFileSync(join(agentDir, "pi-multilang-alias.json"), JSON.stringify({ enabledGroups: ["ko"] }));
  writeConfig(join(cwd, ".pi", "pi-multilang-alias.json"), { "/mine": "/model" });
  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  assert.deepEqual(result.enabledGroups, ["ko"]);
  assert.equal(result.aliases[0]?.aliases[0], "mine");
});

test("invalid group selections warn and fall back without discarding aliases", () => {
  const { agentDir, cwd } = fixture();
  const options = { cwd, configDirName: ".pi", agentDir };
  writeFileSync(join(agentDir, "pi-multilang-alias.json"), JSON.stringify({ enabledGroups: ["zh-CN"] }));
  for (const enabledGroups of [null, true, "ko", {}, ["unknown"], ["ko", 123]]) {
    writeFileSync(join(cwd, ".pi", "pi-multilang-alias.json"), JSON.stringify({ enabledGroups, aliases: { "/mine": "/quit" } }));
    const result = loadCustomAliases(options);
    assert.deepEqual(result.enabledGroups, ["zh-CN"]);
    assert.equal(result.aliases[0]?.aliases[0], "mine");
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0]!, /Invalid enabledGroups/);
  }
});

test("invalid aliases do not discard a valid group selection", () => {
  const { agentDir, cwd } = fixture();
  writeFileSync(join(agentDir, "pi-multilang-alias.json"), JSON.stringify({ enabledGroups: [], aliases: [] }));
  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  assert.deepEqual(result.enabledGroups, []);
  assert.equal(result.warnings.length, 1);
});

test("untrusted project config is not read for aliases or groups", () => {
  const { agentDir, cwd } = fixture();
  writeFileSync(join(cwd, ".pi", "pi-multilang-alias.json"), "{");
  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir, includeProject: false });
  assert.deepEqual(result.enabledGroups, ALL_ALIAS_GROUP_IDS);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.aliases, []);
});

test("selects only enabled built-in groups while retaining custom aliases", () => {
  const groups = Object.fromEntries(ALL_ALIAS_GROUP_IDS.map((id) => [id, [
    { aliases: [id], target: "model", strategy: "prefill" },
  ]])) as Record<AliasGroupId, AliasGroup[]>;
  assert.deepEqual(selectBuiltInAliases(groups, ["ko", "ko-2set"]).map((group) => group.aliases[0]), ["ko", "ko-2set"]);
  assert.deepEqual(selectBuiltInAliases(groups, ALL_ALIAS_GROUP_IDS).length, 4);
  const custom: AliasGroup[] = [{ aliases: ["mine"], target: "quit", strategy: "api" }];
  assert.deepEqual(mergeAliasGroups(selectBuiltInAliases(groups, []), custom), custom);
});

test("settings command cannot be overridden by a custom alias", () => {
  const { agentDir, cwd } = fixture();
  writeConfig(join(agentDir, "pi-multilang-alias.json"), { "/alias-settings": "/quit" });
  const result = loadCustomAliases({ cwd, configDirName: ".pi", agentDir });
  assert.deepEqual(result.aliases, []);
  assert.match(result.warnings[0]!, /reserved alias/);
});

test("saving selections preserves existing aliases and unrelated fields", () => {
  const { agentDir, cwd } = fixture();
  const options = { cwd, configDirName: ".pi", agentDir };
  const { global: path } = getAliasConfigPaths(options);
  const original = { aliases: { "/mine": "/quit" }, other: { preserve: true } };
  writeFileSync(path, JSON.stringify(original));
  saveEnabledGroups(path, ["ko", "ko-2set", "ko"]);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { ...original, enabledGroups: ["ko", "ko-2set"] });
  assert.deepEqual(loadCustomAliases(options).enabledGroups, ["ko", "ko-2set"]);
  assert.deepEqual(readdirSync(agentDir), ["pi-multilang-alias.json"]);
  saveEnabledGroups(path, []);
  assert.deepEqual(loadCustomAliases(options).enabledGroups, []);
});

test("saving creates config directories and respects configured project directory name", () => {
  const { root, cwd } = fixture();
  const options = { cwd, configDirName: ".custom-pi", agentDir: join(root, "new-agent") };
  const paths = getAliasConfigPaths(options);
  assert.equal(paths.project, join(cwd, ".custom-pi", "pi-multilang-alias.json"));
  saveEnabledGroups(paths.global, ["ko"]);
  saveEnabledGroups(paths.project, ["ko-3-final"]);
  assert.deepEqual(loadCustomAliases(options).enabledGroups, ["ko-3-final"]);
  assert.deepEqual(loadCustomAliases({ ...options, includeProject: false }).enabledGroups, ["ko"]);
});

test("saving refuses malformed config and invalid selections without modifying files", () => {
  const { agentDir } = fixture();
  const path = join(agentDir, "pi-multilang-alias.json");
  for (const source of ["{", "null", "[]", "42"]) {
    writeFileSync(path, source);
    assert.throws(() => saveEnabledGroups(path, ["ko"]));
    assert.equal(readFileSync(path, "utf8"), source);
  }
  writeFileSync(path, "{}");
  assert.throws(() => saveEnabledGroups(path, ["unknown"] as unknown as AliasGroupId[]));
  assert.equal(readFileSync(path, "utf8"), "{}");
});

test("root slash menu filtering hides aliases, including suffixed duplicates", () => {
  const items = [
    { value: "model" },
    { value: "종료" },
    { value: "종료:2" },
  ];
  assert.deepEqual(filterRootSlashSuggestions(items, new Set(["종료"])), [{ value: "model" }]);
});
