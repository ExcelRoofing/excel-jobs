export type TagHit = {
  slug: string;
  folder: string;
};

type TagDef = TagHit & { phrases: string[] };

/** English folder names match the Excel Jobs tag list. Phrases include French. */
export const TAGS: TagDef[] = [
  { slug: "before", folder: "Before", phrases: ["before", "avant"] },
  { slug: "during", folder: "During", phrases: ["during", "pendant"] },
  { slug: "after", folder: "After", phrases: ["after", "apres"] },
  { slug: "damage", folder: "Damage", phrases: ["damage", "dommage", "dommages"] },
  { slug: "flashing", folder: "Flashing", phrases: ["flashing", "solin", "solins"] },
  { slug: "skylight", folder: "Skylight", phrases: ["skylight", "skylights", "puits de lumiere"] },
  { slug: "solar", folder: "Solar", phrases: ["solar", "solaire"] },
  { slug: "materials", folder: "Materials", phrases: ["materials", "material", "materiaux", "materiel"] },
  { slug: "safety", folder: "Safety", phrases: ["safety", "securite"] },
  { slug: "completion", folder: "Completion", phrases: ["completion", "fin des travaux"] },
];

export function fold(input: string): string {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tag words in a caption, in the order they appear. Whole words only. */
export function detectTags(text: string | null | undefined): TagHit[] {
  if (!text || !text.trim()) return [];
  const folded = fold(text);
  const hits: { index: number; tag: TagHit }[] = [];
  for (const tag of TAGS) {
    let best: number | null = null;
    for (const phrase of tag.phrases) {
      const needle = fold(phrase);
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?=$|[^a-z0-9])`, "g");
      const match = re.exec(folded);
      if (match && (best === null || match.index < best)) best = match.index;
    }
    if (best !== null) hits.push({ index: best, tag: { slug: tag.slug, folder: tag.folder } });
  }
  hits.sort((a, b) => a.index - b.index || a.tag.slug.localeCompare(b.tag.slug));
  return hits.map((hit) => hit.tag);
}
