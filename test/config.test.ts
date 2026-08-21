import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
