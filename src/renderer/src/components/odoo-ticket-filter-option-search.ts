/**
 * Search matching for the ticket toolbar's facet dropdowns.
 *
 * cmdk's default filter is a fuzzy subsequence scorer, which keeps any row whose
 * search text merely contains the typed characters in order. On the project
 * facet that scored every project on queries like `zz` — the shared base64url
 * instance id supplied the missing letters — so the box stopped narrowing at
 * all. A plain substring match is what a 168-entry list needs.
 */

/** Case- and accent-insensitive, so `developpements` matches `Développements`. */
export function normalizeOdooFilterSearch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function odooFilterOptionMatches(searchText: string, query: string): boolean {
  const needle = normalizeOdooFilterSearch(query)
  return needle ? normalizeOdooFilterSearch(searchText).includes(needle) : true
}
