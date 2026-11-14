export default {
  id: "opencode",
  label: "OpenCode",
  images: "path",
  mirror: false,
  prompt: { byNumber: true },
  box: null,
  skills: { triggers: ["/", "@"], invoke: "@", user: ["~/.config/opencode/skills", "~/.claude/skills", "~/.agents/skills"], project: [".opencode/skills", ".claude/skills", ".agents/skills"], skip: [], enterTwice: true },
  reader: "opencode",
  modes: { build: "Build", plan: "Plan" },
  switching: { nextMode: ["tab"], screenMode: { pattern: "\u2503\\s+([A-Z][\\w-]*) \u00b7 " } },
};
