// @ts-check
import '../typedefs.js'

import { _gc } from '../commands/gc.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Consolidate loose objects and multiple packfiles into a single packfile
 *
 * Repeated fetches accumulate one packfile each, which makes every subsequent
 * object lookup scan more indexes. This rewrites them into one.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<{packsRemoved: number, objectsConsolidated: number}>} Resolves with what the consolidation removed and merged
 *
 * @example
 * // Repack after a series of fetches.
 * const { packsRemoved } = await git.gc({ fs, dir: '/tutorial' })
 * console.log(packsRemoved)
 *
 */
export async function gc({ fs, dir, gitdir = join(dir, '.git'), cache = {} }) {
  try {
    assertParameter('fs', fs)
    assertParameter('gitdir', gitdir)
    const fsp = new FileSystem(fs)
    const updatedGitdir = await discoverGitdir({ fsp, dotgit: gitdir })
    return await _gc({ fs: fsp, cache, gitdir: updatedGitdir })
  } catch (err) {
    err.caller = 'git.gc'
    throw err
  }
}
