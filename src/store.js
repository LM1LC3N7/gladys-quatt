// -----------------------------------------------------------------------------
// The little state that outlives a restart of the container: the end of an
// HTTP 429 pause, so a restart does not hit a CiC that asked to slow down.
// One JSON file under /data (the only writable volume). Every failure is
// harmless: the integration then only forgets the pause.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** A store in a file. */
export function fileStore(path) {
  return {
    async load() {
      try {
        const json = JSON.parse(await readFile(path, 'utf8'));
        return json !== null && typeof json === 'object' && !Array.isArray(json) ? json : {};
      } catch {
        return {};
      }
    },
    async save(state) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(state), 'utf8');
      await rename(temporary, path);
    },
  };
}

/** A store in memory (tests). */
export function memoryStore(initial = {}) {
  let state = structuredClone(initial);
  return {
    saved: () => structuredClone(state),
    async load() {
      return structuredClone(state);
    },
    async save(next) {
      state = structuredClone(next);
    },
  };
}
