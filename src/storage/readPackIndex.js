import { GitPackIndex } from '../models/GitPackIndex.js'

export const PackfileCache = Symbol('PackfileCache')

async function loadPackIndex({
  fs,
  filename,
  getExternalRefDelta,
  emitter,
  emitterPrefix,
}) {
  const idx = await fs.read(filename)
  return GitPackIndex.fromIdx({ idx, getExternalRefDelta })
}

const MAX_PACK_CACHE_SIZE = 5

export function readPackIndex({
  fs,
  cache,
  filename,
  getExternalRefDelta,
  emitter,
  emitterPrefix,
}) {
  // Try to get the packfile index from the in-memory cache
  if (!cache[PackfileCache]) cache[PackfileCache] = new Map()
  const map = cache[PackfileCache]
  let p = map.get(filename)
  if (p) {
    // LRU: move to end (most recently used)
    map.delete(filename)
    map.set(filename, p)
    return p
  }
  p = loadPackIndex({
    fs,
    filename,
    getExternalRefDelta,
    emitter,
    emitterPrefix,
  })
  map.set(filename, p)
  // LRU eviction: remove oldest entries when over capacity
  while (map.size > MAX_PACK_CACHE_SIZE) {
    const oldest = map.keys().next().value
    map.delete(oldest)
  }
  return p
}
