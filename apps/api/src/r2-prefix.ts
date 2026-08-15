type Listed = {
  objects: { key: string }[];
  truncated?: boolean;
  cursor?: string;
};

type PrefixBucket = {
  list: (opts: { prefix: string; cursor?: string }) => Promise<Listed>;
  delete: (key: string) => Promise<unknown>;
};

/**
 * Delete every object under `prefix`. R2 list pages truncate (~1000 keys);
 * keep listing until the prefix is empty.
 */
export async function deleteR2Prefix(bucket: PrefixBucket, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const listed = await bucket.list(cursor ? { prefix, cursor } : { prefix });
    if (listed.objects.length) {
      await Promise.all(listed.objects.map((o) => bucket.delete(o.key)));
      deleted += listed.objects.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}
