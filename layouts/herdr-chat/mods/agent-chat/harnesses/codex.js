import { codexThread, daemonChoices, daemonReply } from "./codex-daemon.js";

export default {
  id: "codex",
  label: "Codex",
  images: "paste",
  mirror: true,
  prompt: { columns: true, notes: true },
  modes: { default: "Default mode", plan: "Plan mode" },
  switching: {
    model: "/model {model}", effort: "/model {model} --reasoning={effort}", nextMode: ["shift+tab"],
    screenMode: { pattern: "(Plan mode) \\(shift\\+tab", names: { "plan mode": "Plan mode" }, none: "Default mode" },
  },
  box: { style: "mark", mark: "›", stopAtBlank: true },
  skills: { triggers: ["$", "/"], invoke: "$", user: ["~/.codex/skills", "~/.agents/skills"], project: [".codex/skills", ".agents/skills"], skip: [], enterTwice: true },
  daemon: { thread: codexThread, choices: daemonChoices, reply: daemonReply },
  reader: "codex",
};
