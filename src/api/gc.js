// @ts-check
import '../typedefs.js'

import { _gc } from '../commands/gc.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

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
