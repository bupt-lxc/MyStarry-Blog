export const STYLES = [
  { id: "default", label: "经典" },
  { id: "style-glass", label: "玻璃" },
  { id: "style-sharp", label: "硬朗" },
  { id: "style-neon", label: "霓虹" },
];

type SavedAppearance = {
  theme?: string | null;
  portfolioStyle?: string | null;
  cardBorder?: string | null;
  version?: string | null;
};

// Self-contained: the same resolver runs before the first browser paint.
export function resolveAppearance(saved: SavedAppearance = {}) {
  const version = "lxc-yellow-neon-v1";
  const defaults = {
    theme: "yellow-theme",
    style: "style-neon",
    border: "normal",
    version,
  };
  if (saved.version !== version) return defaults;
  return {
    theme: [
      "default",
      "yellow-theme",
      "blue-theme",
      "purple-theme",
      "green-theme",
    ].includes(saved.theme ?? "")
      ? saved.theme!
      : defaults.theme,
    style: ["default", "style-glass", "style-sharp", "style-neon"].includes(
      saved.portfolioStyle ?? "",
    )
      ? saved.portfolioStyle!
      : defaults.style,
    border: ["normal", "custom"].includes(saved.cardBorder ?? "")
      ? saved.cardBorder!
      : defaults.border,
    version,
  };
}

export const APPEARANCE_VERSION = resolveAppearance().version;
export const APPEARANCE_VERSION_KEY = "portfolioAppearanceVersion";
export const BORDER_KEY = "cardBorder";
const THEMES = ["yellow-theme", "blue-theme", "purple-theme", "green-theme"];

function readAppearance() {
  try {
    const appearance = resolveAppearance({
      theme: localStorage.getItem("theme"),
      portfolioStyle: localStorage.getItem("portfolioStyle"),
      cardBorder: localStorage.getItem(BORDER_KEY),
      version: localStorage.getItem(APPEARANCE_VERSION_KEY),
    });
    localStorage.setItem("theme", appearance.theme);
    localStorage.setItem("portfolioStyle", appearance.style);
    localStorage.setItem(BORDER_KEY, appearance.border);
    localStorage.setItem(APPEARANCE_VERSION_KEY, appearance.version);
    return appearance;
  } catch {
    return resolveAppearance();
  }
}

export const isCustomBorder = () => readAppearance().border === "custom";

export function applyAppearance(body: HTMLElement = document.body) {
  const appearance = readAppearance();
  body.classList.remove(
    ...THEMES,
    ...STYLES.filter((s) => s.id !== "default").map((s) => s.id),
  );
  body.ownerDocument.documentElement.classList.toggle(
    "cards-custom",
    appearance.border === "custom",
  );
  if (appearance.theme !== "default") body.classList.add(appearance.theme);
  if (appearance.border !== "custom" && appearance.style !== "default")
    body.classList.add(appearance.style);
}

export const appearanceBootstrap = `(()=>{const resolve=${resolveAppearance.toString()};let a=resolve();try{a=resolve({theme:localStorage.getItem('theme'),portfolioStyle:localStorage.getItem('portfolioStyle'),cardBorder:localStorage.getItem('cardBorder'),version:localStorage.getItem('portfolioAppearanceVersion')});localStorage.setItem('theme',a.theme);localStorage.setItem('portfolioStyle',a.style);localStorage.setItem('cardBorder',a.border);localStorage.setItem('portfolioAppearanceVersion',a.version)}catch{}const b=document.body;b.classList.remove('yellow-theme','blue-theme','purple-theme','green-theme','style-glass','style-sharp','style-neon');if(a.theme!=='default')b.classList.add(a.theme);if(a.border!=='custom'&&a.style!=='default')b.classList.add(a.style);document.documentElement.classList.toggle('cards-custom',a.border==='custom')})()`;
