/* eslint-env node, browser, jasmine */
import { gc, packObjects, indexPack, readObject } from 'isomorphic-git'

import { makeFixture } from './__helpers__/FixtureFS.js'

const oids = [
  '5a9da3272badb2d3c8dbab463aed5741acb15a33',
  '0bfe8fa3764089465235461624f2ede1533e74ec',
  '414a0afa7e20452d90ab52de1c024182531c5c52',
  '97b32c43e96acc7873a1990e409194cb92421522',
  '328e74b65839f7e5a8ae3b54e0b49180a5b7b82b',
  'fdba2ad440c231d15a2179f729b4b50ab5860df2',
  '5171f8a8291d7edc31a6670800d5967cfd6be830',
  '7983b4770a894a068152dfe6f347ea9b5ae561c5',
  'f03ae7b490022507f83729b9227e723ab1587a38',
  'a59efbcd7640e659ec81887a2599711f8d9ef801',
  'e5abf40a5b37382c700f51ac5c2aeefdadb8e184',
  '5477471ab5a6a8f2c217023532475044117a8f2c',
]

async function createPackAndIndex({ fs, gitdir, oidSubset }) {
  const cache = {}
  const { filename } = await packObjects({
    fs,
    gitdir,
    oids: oidSubset,
    write: true,
    cache,
  })
  await indexPack({
    fs,
    dir: gitdir,
    filepath: `objects/pack/${filename}`,
    gitdir,
    cache,
  })
  return filename
}

describe('gc', () => {
  it('consolidates multiple packs into one', async () => {
    const { fs, gitdir } = await makeFixture('test-packObjects')
    const cache = {}

    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(0, 6) })
    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(6) })

    const packDir = `${gitdir}/objects/pack`
    const beforeFiles = await fs.readdir(packDir)
    const beforePacks = beforeFiles.filter(f => f.endsWith('.pack'))
    expect(beforePacks.length).toBe(2)

    const result = await gc({ fs, gitdir, cache })

    expect(result.packsRemoved).toBe(2)
    expect(result.objectsConsolidated).toBe(12)

    const afterFiles = await fs.readdir(packDir)
    const afterPacks = afterFiles.filter(f => f.endsWith('.pack'))
    const afterIdxs = afterFiles.filter(f => f.endsWith('.idx'))
    expect(afterPacks.length).toBe(1)
    expect(afterIdxs.length).toBe(1)

    for (const oid of oids) {
      const obj = await readObject({ fs, gitdir, oid, cache: {} })
      expect(obj).toBeDefined()
      expect(obj.oid).toBe(oid)
    }
  })

  it('is idempotent with a single pack', async () => {
    const { fs, gitdir } = await makeFixture('test-packObjects')
    const cache = {}

    await createPackAndIndex({ fs, gitdir, oidSubset: oids })

    const result = await gc({ fs, gitdir, cache })

    expect(result.packsRemoved).toBe(0)
    expect(result.objectsConsolidated).toBe(0)
  })

  it('handles repos with no packs', async () => {
    const { fs, gitdir } = await makeFixture('test-packObjects')

    const result = await gc({ fs, gitdir })

    expect(result.packsRemoved).toBe(0)
    expect(result.objectsConsolidated).toBe(0)
  })

  it('handles freshly initialized repos', async () => {
    const { fs, dir } = await makeFixture('test-init')

    const result = await gc({ fs, dir })

    expect(result.packsRemoved).toBe(0)
    expect(result.objectsConsolidated).toBe(0)
  })

  it('deduplicates objects shared across packs', async () => {
    const { fs, gitdir } = await makeFixture('test-packObjects')
    const cache = {}

    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(0, 8) })
    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(4) })

    const result = await gc({ fs, gitdir, cache })

    expect(result.packsRemoved).toBe(2)
    expect(result.objectsConsolidated).toBe(12)

    const packDir = `${gitdir}/objects/pack`
    const afterFiles = await fs.readdir(packDir)
    const afterPacks = afterFiles.filter(f => f.endsWith('.pack'))
    expect(afterPacks.length).toBe(1)

    for (const oid of oids) {
      const obj = await readObject({ fs, gitdir, oid, cache: {} })
      expect(obj).toBeDefined()
    }
  })

  it('consolidates three packs into one', async () => {
    const { fs, gitdir } = await makeFixture('test-packObjects')
    const cache = {}

    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(0, 4) })
    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(4, 8) })
    await createPackAndIndex({ fs, gitdir, oidSubset: oids.slice(8) })

    const packDir = `${gitdir}/objects/pack`
    const beforePacks = (await fs.readdir(packDir)).filter(f =>
      f.endsWith('.pack')
    )
    expect(beforePacks.length).toBe(3)

    const result = await gc({ fs, gitdir, cache })

    expect(result.packsRemoved).toBe(3)
    expect(result.objectsConsolidated).toBe(12)

    const afterPacks = (await fs.readdir(packDir)).filter(f =>
      f.endsWith('.pack')
    )
    expect(afterPacks.length).toBe(1)
  })
})
