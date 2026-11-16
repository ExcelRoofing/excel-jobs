export type MentionPerson = { id: string; name: string };

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMentions(body: string, people: MentionPerson[]) {
  const ids = new Set<string>();
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const person of sorted) {
    const name = person.name.trim();
    if (name.length < 2) continue;
    const re = new RegExp(`@${escapeReg(name)}(?=$|[\\s.,!?:;])`, "i");
    if (re.test(body)) ids.add(person.id);
  }
  const tokens = body.match(/@([\p{L}']+)/gu) || [];
  for (const token of tokens) {
    const first = token.slice(1).toLocaleLowerCase();
    const matches = people.filter((p) => (p.name.split(/\s+/)[0] || "").toLocaleLowerCase() === first);
    if (matches.length === 1) ids.add(matches[0].id);
  }
  return [...ids];
}
