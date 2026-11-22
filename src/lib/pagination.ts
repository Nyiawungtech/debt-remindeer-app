/** Keyset pagination also handles a project API row limit smaller than requested. */
export async function collectPages<T extends { id: string }>(
  fetchPage: (after: string | null) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const batch = await fetchPage(after);
    if (!batch.length) return rows;
    const last = batch.at(-1)!.id;
    if (last === after)
      throw new Error("The data service did not advance to the next page.");
    rows.push(...batch);
    after = last;
  }
}
