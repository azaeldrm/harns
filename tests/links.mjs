import { stage } from "./stage.mjs";
const s = stage();
const { fileLink, fileLinks } = await s.load("links.js");
let failed = 0;
const check = (got, want, what) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"} ${what}${ok ? "" : `: got ${JSON.stringify(got)}`}`);
  if (!ok) failed++;
};
const kb = "/srv/homelab/docker/syncthing/data/obsidian-vault/Knowledge Base/murmur";
check(fileLink("/srv/code/murmur/BACKLOG.md", "/home/azael"), "/srv/code/murmur/BACKLOG.md", "an absolute path as written");
check(fileLink(`<${kb}/BACKLOG.md:188>`, "/srv/code/murmur"), `${kb}/BACKLOG.md`, "angle brackets and a line after a colon are dropped");
check(fileLink(`${kb.replace(/ /g, "%20")}/0.6.0/STORY.md:551:3`, null), `${kb}/0.6.0/STORY.md`, "an encoded space, a line and column");
check(fileLink("STORY.md", "/srv/code/murmur"), "/srv/code/murmur/STORY.md", "a relative path is in the session's folder");
check(fileLink("./docs/../BACKLOG.md#L12", "/srv/code/murmur/"), "/srv/code/murmur/BACKLOG.md", "dots and an anchor");
check(fileLink("file:///srv/code/murmur/BACKLOG.md", null), "/srv/code/murmur/BACKLOG.md", "a file URL");
check(fileLink("file:///C:/Users/me/notes.md", null), "C:/Users/me/notes.md", "a Windows file URL");
check(fileLink("C:\\Users\\me\\notes.md:4", null), "C:/Users/me/notes.md", "a Windows path");
check(fileLink("notes.md", "C:\\Users\\me"), "C:/Users/me/notes.md", "relative to a Windows folder");
check([fileLink("https://herdr.dev", "/x"), fileLink("mailto:a@b.c", "/x"), fileLink("#top", "/x"), fileLink("STORY.md", ""), fileLink("docs/", "/x")],
  [null, null, null, null, null], "web addresses, anchors, folders and a relative path with no folder aren't files");
const reply = "Files: [STORY.md](</srv/kb/murmur/0.8.2/STORY.md>) and [`BACKLOG.md`](/srv/code/murmur/BACKLOG.md:1), "
  + "again [here](/srv/code/murmur/BACKLOG.md:40), ![shot](docs/shot.png), [site](https://herdr.dev) and [notes](docs/notes.md).";
check(fileLinks(reply), [{ name: "STORY.md", url: "</srv/kb/murmur/0.8.2/STORY.md>" }, { name: "BACKLOG.md", url: "/srv/code/murmur/BACKLOG.md:1" },
  { name: "notes.md", url: "docs/notes.md" }], "a reply's file links, each once, without images or web links");
check(fileLinks("[a](a.md) [b](b.md) [c](c.md)", 2).map(f => f.name), ["a.md", "b.md"], "at most the limit");
check(fileLinks("no links here"), [], "a reply without links has none");
check(fileLinks("```md\n[a](a.md)\n```\n[b](b.md)").map(f => f.name), ["b.md"], "links in a code block are code");
process.exit(failed ? 1 : 0);
