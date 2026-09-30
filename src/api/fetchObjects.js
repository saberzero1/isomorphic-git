// @ts-check
import '../typedefs.js'

import { _fetchObjects } from '../commands/fetchObjects.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Fetch specific objects by oid, to backfill a partial (blobless) clone.
 *
 * Only adds objects to the object database: refs, shallow state and FETCH_HEAD
 * are left untouched. The remote must advertise `allow-reachable-sha1-in-want`,
 * since a filtered-out blob is never at a ref tip; otherwise this throws
 * `RemoteCapabilityError`.
 *
 * Pass every oid you need in one call — the server answers a multi-want request
 * in a single round trip.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {HttpClient} args.http - an HTTP client
 * @param {ProgressCallback} [args.onProgress] - optional progress event callback
 * @param {AuthCallback} [args.onAuth] - optional auth fill callback
 * @param {AuthFailureCallback} [args.onAuthFailure] - optional auth rejected callback
 * @param {AuthSuccessCallback} [args.onAuthSuccess] - optional auth approved callback
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string[]} args.oids - The SHA-1 object ids to fetch
 * @param {string} [args.remote='origin'] - Which remote to fetch from
 * @param {string} [args.url] - Overrides the remote's configured url
 * @param {string} [args.corsProxy] - Optional CORS proxy
 * @param {Object<string, string>} [args.headers] - Additional headers
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<{packfile: string | undefined}>} Path of the written pack, if any
 *
 * @example
 * await git.fetchObjects({
 *   fs, http, dir: '/tutorial',
 *   oids: ['a1b2c3...', 'd4e5f6...']
 * })
 *
 */
export async function fetchObjects({
  fs,
  http,
  onProgress,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  dir,
  gitdir = join(dir, '.git'),
  oids,
  remote,
  url,
  corsProxy,
  headers = {},
  cache = {},
}) {
  try {
    assertParameter('fs', fs)
    assertParameter('http', http)
    assertParameter('gitdir', gitdir)
    assertParameter('oids', oids)

    const fsp = new FileSystem(fs)
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir })
    return await _fetchObjects({
      fs: fsp,
      cache,
      http,
      onProgress,
      onAuth,
      onAuthSuccess,
      onAuthFailure,
      gitdir: updatedGitdir,
      oids,
      remote,
      url,
      corsProxy,
      headers,
    })
  } catch (err) {
    err.caller = 'git.fetchObjects'
    throw err
  }
}
