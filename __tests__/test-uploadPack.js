/* eslint-env node, browser, jasmine */
import { uploadPack, collect, pkg } from 'isomorphic-git/internal-apis'

import { makeFixture } from './__helpers__/FixtureFS.js'

describe('uploadPack', () => {
  it('advertiseRefs: true', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-uploadPack')
    const res = await uploadPack({ fs, gitdir, advertiseRefs: true })
    const buffer = Buffer.from(await collect(res))
    // The advertised agent carries this package's own version, so both the
    // line and its pkt-length prefix are derived rather than pinned; hard
    // coding them makes every version bump look like a wire regression.
    const headLine = `5a8905a02e181fe1821068b8c0f48cb6633d5b81 HEAD\0thin-pack side-band side-band-64k shallow deepen-since deepen-not allow-tip-sha1-in-want allow-reachable-sha1-in-want symref=HEAD:refs/heads/master agent=${pkg.agent}\n`
    const headPkt =
      (headLine.length + 4).toString(16).padStart(4, '0') + headLine
    expect(buffer.toString('utf8')).toBe(
      `${headPkt}003f5a8905a02e181fe1821068b8c0f48cb6633d5b81 refs/heads/master
0000`
    )
  })
})
