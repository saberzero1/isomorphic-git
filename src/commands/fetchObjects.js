// @ts-check
import '../typedefs.js'

import { MissingParameterError } from '../errors/MissingParameterError.js'
import { RemoteCapabilityError } from '../errors/RemoteCapabilityError.js'
import { GitConfigManager } from '../managers/GitConfigManager.js'
import { GitRemoteManager } from '../managers/GitRemoteManager.js'
import { GitPackIndex } from '../models/GitPackIndex.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { addCredentialUsername } from '../utils/addCredentialUsername.js'
import { collect } from '../utils/collect.js'
import { emptyPackfile } from '../utils/emptyPackfile.js'
import { filterCapabilities } from '../utils/filterCapabilities.js'
import { join } from '../utils/join.js'
import { pkg } from '../utils/pkg.js'
import { parseUploadPackResponse } from '../wire/parseUploadPackResponse.js'
import { writeUploadPackRequest } from '../wire/writeUploadPackRequest.js'

/**
 * Fetch specific objects by oid, for backfilling a partial clone.
 *
 * Unlike `_fetch` this never touches refs, shallow state or FETCH_HEAD — it
 * only adds objects to the object database. Pass every oid you need at once:
 * the server handles a multi-want request in a single round trip, and issuing
 * one request per object is the difference between one fetch and N.
 *
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {any} args.cache
 * @param {HttpClient} args.http
 * @param {ProgressCallback} [args.onProgress]
 * @param {AuthCallback} [args.onAuth]
 * @param {AuthFailureCallback} [args.onAuthFailure]
 * @param {AuthSuccessCallback} [args.onAuthSuccess]
 * @param {string} args.gitdir
 * @param {string[]} args.oids
 * @param {string} [args.remote]
 * @param {string} [args.url]
 * @param {string} [args.corsProxy]
 * @param {Object<string, string>} [args.headers]
 *
 * @returns {Promise<{ packfile: string | undefined }>}
 */
export async function _fetchObjects({
  fs,
  cache,
  http,
  onProgress,
  onAuth,
  onAuthSuccess,
  onAuthFailure,
  gitdir,
  oids,
  remote: _remote,
  url: _url,
  corsProxy,
  headers = {},
}) {
  if (!oids || oids.length === 0) return { packfile: undefined }

  const config = await GitConfigManager.get({ fs, gitdir })
  const remote = _remote || 'origin'
  const url = _url || (await config.get(`remote.${remote}.url`))
  if (typeof url === 'undefined') {
    throw new MissingParameterError('remote OR url')
  }
  if (corsProxy === undefined) {
    corsProxy = await config.get('http.corsProxy')
  }

  const GitRemoteHTTP = GitRemoteManager.getRemoteHelperFor({ url })
  const remoteHTTP = await GitRemoteHTTP.discover({
    http,
    onAuth: addCredentialUsername({ config, onAuth }),
    onAuthSuccess,
    onAuthFailure: addCredentialUsername({ config, onAuth: onAuthFailure }),
    corsProxy,
    service: 'git-upload-pack',
    url,
    headers,
    protocolVersion: 1,
  })

  // A promisor blob is not at a ref tip, so allow-tip-sha1-in-want is not
  // enough — the server must accept any oid reachable from one.
  if (
    !remoteHTTP.capabilities.has('allow-reachable-sha1-in-want') &&
    !remoteHTTP.capabilities.has('allow-any-sha1-in-want')
  ) {
    throw new RemoteCapabilityError('allow-reachable-sha1-in-want', 'oids')
  }

  const capabilities = filterCapabilities(
    [...remoteHTTP.capabilities],
    [
      'multi_ack_detailed',
      'no-done',
      'side-band-64k',
      'ofs-delta',
      `agent=${pkg.agent}`,
    ]
  )

  const packstream = writeUploadPackRequest({
    capabilities,
    wants: [...new Set(oids)],
    haves: [],
  })
  const packbuffer = Buffer.from(await collect(packstream))
  const raw = await GitRemoteHTTP.connect({
    http,
    onProgress,
    corsProxy,
    service: 'git-upload-pack',
    url,
    auth: remoteHTTP.auth,
    body: [packbuffer],
    headers,
  })
  const response = await parseUploadPackResponse(raw.body)
  const packfile = Buffer.from(await collect(response.packfile))
  if (raw.body.error) throw raw.body.error

  const packfileSha = packfile.slice(-20).toString('hex')
  if (packfileSha === '' || emptyPackfile(packfile)) {
    return { packfile: undefined }
  }

  const relative = `objects/pack/pack-${packfileSha}.pack`
  const fullpath = join(gitdir, relative)
  await fs.write(fullpath, packfile)
  const getExternalRefDelta = oid => readObject({ fs, cache, gitdir, oid })
  const idx = await GitPackIndex.fromPack({
    pack: packfile,
    getExternalRefDelta,
    onProgress,
  })
  await fs.write(fullpath.replace(/\.pack$/, '.idx'), await idx.toBuffer())
  // Backfilled objects are still only-what-was-asked-for, so this pack is as
  // promisor as the original: without the marker a later integrity check would
  // read the repo as complete.
  await fs.write(fullpath.replace(/\.pack$/, '.promisor'), '')

  return { packfile: relative }
}
