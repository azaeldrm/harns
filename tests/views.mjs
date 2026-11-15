import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { stage } from "./stage.mjs";

const s = stage();
const herdr = join(s.dir, "node_modules", "herdr", "index.js");
writeFileSync(herdr, readFileSync(herdr, "utf8")
  .replace("shared = () => null, setShared = () => {}", "shared = k => globalThis.store[k] ?? null, setShared = (k, v) => { globalThis.store[k] = v; }"));
globalThis.store = {};
const { preferredView, chatOn } = await s.load("common.js");
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
};
const store = () => { globalThis.store = {}; return globalThis.store; };
const views = (all) => { globalThis.store["herdr-chat.views"] = all; };

store();
check("a new session opens on Chat unless set otherwise", preferredView("t1:1:claude-code"), "chat");

store()["herdr-chat.default-view"] = "terminal";
check("with Terminal as the default, a new session opens on its terminal", preferredView("t1:1:claude-code"), "terminal");

store()["herdr-chat.default-view"] = "chat";
check("with Chat as the default, a new session opens on Chat", preferredView("t1:1:claude-code"), "chat");

store();
views({ "t1:1:claude-code": "terminal" });
check("a session left on its terminal reopens there", preferredView("t1:1:claude-code"), "terminal");

store()["herdr-chat.default-view"] = "terminal";
views({ "t1:1:claude-code": "chat" });
check("a session left on Chat reopens there over the default", preferredView("t1:1:claude-code"), "chat");

store()["herdr-chat.default-view"] = "nonsense";
views({ "t1:1:claude-code": "terminal" });
check("an unknown default leaves new sessions on Chat, a kept view still wins", [preferredView("t2:1:claude-code"), preferredView("t1:1:claude-code")], ["chat", "terminal"]);

store()["herdr-chat.chat"] = false;
check("with the chat off every tab opens on its terminal", preferredView("t1:1:claude-code"), "terminal");

store()["herdr-chat.chat"] = true;
check("chatOn is off only when the chat key is false", [chatOn(), preferredView("t1:1:claude-code")], [true, "chat"]);

s.cleanup();
process.exit(failed ? 1 : 0);
