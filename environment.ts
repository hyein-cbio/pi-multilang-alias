import { spawnSync } from "node:child_process";

export type KeyboardLayout = "ko-2set" | "ko-390" | "ko-3-final";
export type KeyboardLanguage = "ko" | "zh-CN" | "zh-TW";

export type AliasEnvironment = {
  locale: string;
  keyboardLanguage?: KeyboardLanguage;
  keyboardLayout?: KeyboardLayout;
};

type InputDetection = {
  language?: KeyboardLanguage;
  layout?: KeyboardLayout;
};

function run(command: string, args: string[]): string | undefined {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
    });
    if (result.status !== 0) return undefined;
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function normalizeLocale(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const base = value.split(/[:@]/, 1)[0].replace(/_/g, "-");
  const [language, region] = base.split("-");
  if (!language) return undefined;

  return region
    ? `${language.toLowerCase()}-${region.toUpperCase()}`
    : language.toLowerCase();
}

function languageFromInputSource(value: string): KeyboardLanguage | undefined {
  if (/korean|hangul/i.test(value)) return "ko";
  if (/chinese.?simplified|simplified.?chinese|\bscim\b/i.test(value)) return "zh-CN";
  if (/chinese.?traditional|traditional.?chinese|\btcim\b|zhuyin/i.test(value)) return "zh-TW";
  return undefined;
}

function detectMacLocale(): string | undefined {
  return normalizeLocale(run("defaults", ["read", "-g", "AppleLocale"]));
}

function layoutFromInputSource(value: string): KeyboardLayout | undefined {
  if (/390Hangul|390Sebulshik/i.test(value)) return "ko-390";
  if (/3SetHangul|3SetKorean/i.test(value)) return "ko-3-final";
  if (/2SetHangul|2SetKorean/i.test(value)) return "ko-2set";
  return undefined;
}

function detectMacInput(): InputDetection {
  const current = run("defaults", [
    "read",
    "com.apple.HIToolbox",
    "AppleCurrentKeyboardLayoutInputSourceID",
  ]);
  const sources = run("defaults", [
    "read",
    "com.apple.HIToolbox",
    "AppleSelectedInputSources",
  ]);

  const currentDetection = current
    ? {
        language: languageFromInputSource(current),
        layout: layoutFromInputSource(current),
      }
    : {};
  if (currentDetection.language || currentDetection.layout) return currentDetection;
  if (!sources) return {};

  return {
    language: languageFromInputSource(sources),
    layout: layoutFromInputSource(sources),
  };
}

function detectLinuxLocale(): string | undefined {
  const output = run("locale", []);
  const value = output?.match(/^LC_MESSAGES=(?:"?)([^"\n]+)(?:"?)$/m)?.[1];
  return normalizeLocale(value);
}

function detectLinuxInput(): InputDetection {
  const xkb = run("setxkbmap", ["-query"]);
  const layout = xkb?.match(/^layout:\s*(.+)$/m)?.[1]?.trim();
  const variant = xkb?.match(/^variant:\s*(.+)$/m)?.[1]?.trim().toLowerCase();
  const configuredLayout = process.env.XKB_DEFAULT_LAYOUT;
  const activeLayout = (layout ?? configuredLayout)?.split(",")[0];

  if (activeLayout === "kr") {
    return {
      language: "ko",
      layout: variant?.includes("390")
        ? "ko-390"
        : variant?.includes("3")
          ? "ko-3-final"
          : "ko-2set",
    };
  }
  if (activeLayout === "cn") return { language: "zh-CN" };
  if (activeLayout === "tw") return { language: "zh-TW" };

  const engine = run("ibus", ["engine"]) ?? run("fcitx5-remote", ["-n"]);
  return { language: engine ? languageFromInputSource(engine) : undefined };
}

function detectWindowsLocale(): string | undefined {
  return normalizeLocale(
    run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-Culture).Name",
    ]),
  );
}

function detectWindowsInput(): InputDetection {
  const inputMethod = run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-WinDefaultInputMethodOverride).InputMethodTip",
  ]);
  const languages = run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-WinUserLanguageList | ConvertTo-Json -Compress)",
  ]);
  const source = `${inputMethod ?? ""} ${languages ?? ""}`;

  if (/0412|ko[-_]KR/i.test(source)) return { language: "ko", layout: "ko-2set" };
  if (/0804|zh[-_]CN|Chinese.?Simplified/i.test(source)) return { language: "zh-CN" };
  if (/0404|zh[-_]TW|Chinese.?Traditional/i.test(source)) return { language: "zh-TW" };
  return {};
}

function languageFromLayout(layout: KeyboardLayout | undefined): KeyboardLanguage | undefined {
  return layout?.startsWith("ko-") ? "ko" : undefined;
}

export function detectEnvironment(): AliasEnvironment {
  const localeOverride = process.env.PI_ALIAS_LOCALE;
  const languageOverride = process.env.PI_ALIAS_KEYBOARD_LANGUAGE as KeyboardLanguage | undefined;
  const layoutOverride = process.env.PI_ALIAS_KEYBOARD_LAYOUT as KeyboardLayout | undefined;

  const input =
    process.platform === "darwin"
      ? detectMacInput()
      : process.platform === "linux"
        ? detectLinuxInput()
        : process.platform === "win32"
          ? detectWindowsInput()
          : {};

  const locale =
    normalizeLocale(localeOverride) ??
    (process.platform === "darwin" ? detectMacLocale() : undefined) ??
    (process.platform === "win32" ? detectWindowsLocale() : undefined) ??
    (process.platform === "linux" ? detectLinuxLocale() : undefined) ??
    normalizeLocale(
      process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? process.env.LANGUAGE,
    ) ??
    "en";

  const keyboardLayout = layoutOverride ?? input.layout;
  const keyboardLanguage =
    languageOverride ?? input.language ?? languageFromLayout(keyboardLayout);

  return { locale, keyboardLanguage, keyboardLayout };
}

export function readyMessage(languageOrLocale: string): string {
  const value = languageOrLocale.toLowerCase();
  if (value.startsWith("zh-cn")) return "准备好了 — 请按 Enter。";
  if (value.startsWith("ko")) return "준비 완료 — Enter를 누르세요.";
  return "Ready — press Enter.";
}
