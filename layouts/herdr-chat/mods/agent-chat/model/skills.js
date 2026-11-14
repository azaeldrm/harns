/**
 * The skill being typed at the end of `text`: its start, trigger and query, or null. `/` only opens a message; the
 * others start any word.
 */
export function skillToken(text, triggers) {
  const m = /(?:^|\s)([^\s]+)$/.exec(text);
  if (!m) return null;
  const start = text.length - m[1].length, trigger = m[1][0];
  if (!triggers?.includes(trigger) || (trigger === "/" && start !== 0)) return null;
  return { start, trigger, query: m[1].slice(1) };
}

/** Whose it is, nearest first: the project's, the person's, or what came with the harness. */
function ownership(skill) {
  return skill.source === "project" ? 0 : skill.source === "personal" ? 1 : 2;
}

/**
 * The skills matching what's typed: name starts first, then names containing it, then descriptions; a project's, then
 * the person's own, then what came with the harness, each alphabetical.
 */
export function matchSkills(skills, query, invoke = "") {
  const tail = invoke.slice(1);
  const typed = query.toLowerCase();
  const q = tail && typed.startsWith(tail) ? typed.slice(tail.length) : typed;
  const rank = s => {
    const name = s.name.toLowerCase();
    return name.startsWith(q) ? 0 : name.includes(q) ? 1 : s.description.toLowerCase().includes(q) ? 2 : 3;
  };
  return skills.map(s => [rank(s), s]).filter(([r]) => r < 3)
    .sort((a, b) => a[0] - b[0] || ownership(a[1]) - ownership(b[1]) || a[1].name.localeCompare(b[1].name)).map(([, s]) => s);
}

/** The text with the token replaced by the skill as its harness takes it, ready for the rest of the message. */
export function withSkill(text, token, invoke, name) {
  return `${text.slice(0, token.start)}${invoke}${name} `;
}

/** The reader's S lines as skills. */
export function parseSkills(stdout) {
  return stdout.split("\n").filter(l => l.startsWith("S|")).map(l => {
    const [, name, description = "", source = ""] = l.split("|").map(decodeURIComponent);
    return { name, description, source };
  });
}
