import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
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

test("root slash menu filtering hides aliases, including suffixed duplicates", () => {
  const items = [
    { value: "model" },
    { value: "종료" },
    { value: "종료:2" },
  ];
  assert.deepEqual(filterRootSlashSuggestions(items, new Set(["종료"])), [{ value: "model" }]);
});
