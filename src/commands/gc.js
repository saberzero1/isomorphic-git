// @ts-check
import { GitPackIndex } from '../models/GitPackIndex.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { readObjectPacked } from '../storage/readObjectPacked.js'
import { PackfileCache, readPackIndex } from '../storage/readPackIndex.js'
import { collect } from '../utils/collect.js'
import { join } from '../utils/join.js'

import { _pack } from './pack.js'

/**
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {any} args.cache
 * @param {string} [args.dir]
 * @param {string} [args.gitdir=join(dir, '.git')]
 *
 * @returns {Promise<{packsRemoved: number, objectsConsolidated: number}>}
 */
export async function _gc({ fs, cache, dir, gitdir = join(dir, '.git') }) {
  const packDir = join(gitdir, 'objects/pack')
  const list = await fs.readdir(packDir)
  const pairsByBase = new Map()

  for (const entry of list) {
    if (!entry.endsWith('.pack') && !entry.endsWith('.idx')) continue
    const base = entry.replace(/\.(pack|idx)$/, '')
    if (!pairsByBase.has(base)) {
      pairsByBase.set(base, { base, pack: null, idx: null })
    }
    const pair = pairsByBase.get(base)
    if (entry.endsWith('.pack')) pair.pack = entry
    if (entry.endsWith('.idx')) pair.idx = entry
  }

  const packPairs = [...pairsByBase.values()].filter(
    pair => pair.pack && pair.idx
  )

  if (packPairs.length <= 1) {
    return { packsRemoved: 0, objectsConsolidated: 0 }
  }

  const getExternalRefDelta = oid => readObject({ fs, cache, gitdir, oid })

  const oids = new Set()
  for (const pair of packPairs) {
    const indexFile = join(packDir, pair.idx)
    const p = await readPackIndex({
      fs,
      cache,
      filename: indexFile,
      getExternalRefDelta,
    })
    for (const oid of p.hashes) {
      oids.add(oid)
    }
  }

  const oidsArray = Array.from(oids)
  const packChunks = await _pack({ fs, cache, gitdir, oids: oidsArray })
  const packData = await collect(packChunks)
  const packBuffer = Buffer.from(packData)
  const packSha = packBuffer.slice(-20).toString('hex')
  const packBase = `pack-${packSha}`
  const packPath = join(packDir, `${packBase}.pack`)
  const idxPath = join(packDir, `${packBase}.idx`)

  await fs.write(packPath, packBuffer)

  const idx = await GitPackIndex.fromPack({
    pack: packBuffer,
    getExternalRefDelta,
  })
  await fs.write(idxPath, await idx.toBuffer())

  const sampleOids = oidsArray.slice(0, 3)
  for (const oid of sampleOids) {
    const result = await readObjectPacked({
      fs,
      cache,
      gitdir,
      oid,
      getExternalRefDelta,
    })
    if (!result) {
      throw new Error(`Packed object ${oid} missing after gc`)
    }
  }

  let packsRemoved = 0
  for (const pair of packPairs) {
    if (pair.base === packBase) continue
    await fs.rm(join(packDir, pair.pack))
    await fs.rm(join(packDir, pair.idx))
    packsRemoved++
  }

  if (cache && cache[PackfileCache]) {
    delete cache[PackfileCache]
  }

  return { packsRemoved, objectsConsolidated: oidsArray.length }
}
