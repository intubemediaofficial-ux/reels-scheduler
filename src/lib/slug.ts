export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";
}

const RESERVED = new Set(["new", "admin", "api", "settings", "www", "app"]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}
