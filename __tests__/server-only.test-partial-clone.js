/* eslint-env node, browser, jasmine */
import {
  Errors,
  clone,
  fetchObjects,
  getConfig,
  listFiles,
  readBlob,
  readCommit,
  resolveRef,
  walk,
  TREE,
} from 'isomorphic-git'
import http from 'isomorphic-git/http'

import { makeFixture } from './__helpers__/FixtureFS.js'

const localhost =
  typeof window === 'undefined' ? 'localhost' : window.location.hostname

const partialUrl = () => `http://${localhost}:8888/test-partial-clone.git`
// test-clone.git deliberately has no uploadpack.allowFilter, which is what
// makes it the "server does not support partial clone" case.
const unfilteredUrl = () => `http://${localhost}:8888/test-clone.git`

async function packFiles(fs, gitdir, ext) {
  const names = await fs.readdir(`${gitdir}/objects/pack`)
  return names.filter(n => n.endsWith(ext))
}

describe('partial clone', () => {
  it('clones without blobs and records promisor state', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-partial-clone-a')
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: partialUrl(),
      ref: 'master',
      singleBranch: true,
      noCheckout: true,
      filter: 'blob:none',
    })

    expect(await packFiles(fs, gitdir, '.promisor')).not.toEqual([])

    expect(
      await getConfig({ fs, dir, gitdir, path: 'extensions.partialclone' })
    ).toBe('origin')
    expect(
      await getConfig({ fs, dir, gitdir, path: 'remote.origin.promisor' })
    ).toBe('true')
    expect(
      await getConfig({
        fs,
        dir,
        gitdir,
        path: 'remote.origin.partialclonefilter',
      })
    ).toBe('blob:none')
    expect(
      await getConfig({ fs, dir, gitdir, path: 'core.repositoryformatversion' })
    ).toBe('1')
  })

  it('walks the whole tree without fetching any blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-partial-clone-b')
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: partialUrl(),
      ref: 'master',
      singleBranch: true,
      noCheckout: true,
      filter: 'blob:none',
    })
    const oid = await resolveRef({
      fs,
      gitdir,
      ref: 'refs/remotes/origin/master',
    })
    const { commit } = await readCommit({ fs, gitdir, oid })

    const seen = []
    await walk({
      fs,
      dir,
      gitdir,
      trees: [TREE({ ref: commit.tree })],
      map: async (filepath, [entry]) => {
        if (!entry || filepath === '.') return undefined
        // oid() and type() must be answerable from the tree object alone;
        // if they reached for blob content this would throw NotFoundError.
        seen.push([filepath, await entry.type(), await entry.oid()])
        return undefined
      },
    })

    expect(seen.map(([p]) => p).sort()).toEqual([
      'a.txt',
      'link.txt',
      'run.sh',
      'sub',
      'sub/b.txt',
    ])
  })

  it('reading a filtered-out blob fails until fetchObjects backfills it', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-partial-clone-c')
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: partialUrl(),
      ref: 'master',
      singleBranch: true,
      noCheckout: true,
      filter: 'blob:none',
    })
    const oid = await resolveRef({
      fs,
      gitdir,
      ref: 'refs/remotes/origin/master',
    })
    const { commit } = await readCommit({ fs, gitdir, oid })
    let found
    await walk({
      fs,
      dir,
      gitdir,
      trees: [TREE({ ref: commit.tree })],
      map: async (filepath, [entry]) => {
        if (entry && filepath === 'a.txt') found = await entry.oid()
        return undefined
      },
    })
    if (!found) throw new Error('a.txt is missing from the cloned tree')
    const blobOid = found

    let err = null
    try {
      await readBlob({ fs, dir, gitdir, oid: blobOid })
    } catch (e) {
      err = e
    }
    expect(err).not.toBeNull()
    expect(err.code).toBe(Errors.NotFoundError.code)

    await fetchObjects({ fs, http, dir, gitdir, oids: [blobOid] })

    const { blob } = await readBlob({ fs, dir, gitdir, oid: blobOid })
    expect(Buffer.from(blob).toString('utf8')).toBe('hello\nsecond\n')
  })

  it('fetchObjects backfills a batch in one call', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-partial-clone-d')
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: partialUrl(),
      ref: 'master',
      singleBranch: true,
      noCheckout: true,
      filter: 'blob:none',
    })
    const oid = await resolveRef({
      fs,
      gitdir,
      ref: 'refs/remotes/origin/master',
    })
    const { commit } = await readCommit({ fs, gitdir, oid })
    const oids = []
    await walk({
      fs,
      dir,
      gitdir,
      trees: [TREE({ ref: commit.tree })],
      map: async (filepath, [entry]) => {
        if (entry && (await entry.type()) === 'blob')
          oids.push(await entry.oid())
        return undefined
      },
    })
    expect(oids.length).toBeGreaterThan(1)

    await fetchObjects({ fs, http, dir, gitdir, oids })

    for (const blobOid of oids) {
      const { blob } = await readBlob({ fs, dir, gitdir, oid: blobOid })
      expect(blob).toBeDefined()
    }
  })

  it('refuses rather than silently full-cloning when the server lacks filter', async () => {
    const { fs, dir, gitdir } = await makeFixture(
      'test-partial-clone-unsupported'
    )
    let err = null
    try {
      await clone({
        fs,
        http,
        dir,
        gitdir,
        url: unfilteredUrl(),
        ref: 'master',
        singleBranch: true,
        noCheckout: true,
        filter: 'blob:none',
      })
    } catch (e) {
      err = e
    }
    // A slow success here would mean every blob was downloaded regardless.
    expect(err).not.toBeNull()
    expect(err.code).toBe(Errors.RemoteCapabilityError.code)
    expect(err.data.capability).toBe('filter')
  })

  it('leaves unfiltered clones complete', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-partial-clone-full')
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: partialUrl(),
      ref: 'master',
      singleBranch: true,
      filter: undefined,
    })
    expect(await packFiles(fs, gitdir, '.promisor')).toEqual([])
    expect(
      await getConfig({ fs, dir, gitdir, path: 'remote.origin.promisor' })
    ).toBeUndefined()
    expect((await listFiles({ fs, dir, gitdir })).sort()).toEqual([
      'a.txt',
      'link.txt',
      'run.sh',
      'sub/b.txt',
    ])
  })
})
