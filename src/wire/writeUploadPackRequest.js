import { GitPktLine } from '../models/GitPktLine.js'

export function writeUploadPackRequest({
  capabilities = [],
  wants = [],
  haves = [],
  shallows = [],
  depth = null,
  since = null,
  exclude = [],
  filter = null,
}) {
  const packstream = []
  wants = [...new Set(wants)] // remove duplicates
  let firstLineCapabilities = ` ${capabilities.join(' ')}`
  for (const oid of wants) {
    packstream.push(GitPktLine.encode(`want ${oid}${firstLineCapabilities}\n`))
    firstLineCapabilities = ''
  }
  for (const oid of shallows) {
    packstream.push(GitPktLine.encode(`shallow ${oid}\n`))
  }
  if (depth !== null) {
    packstream.push(GitPktLine.encode(`deepen ${depth}\n`))
  }
  if (since !== null) {
    packstream.push(
      GitPktLine.encode(`deepen-since ${Math.floor(since.valueOf() / 1000)}\n`)
    )
  }
  for (const oid of exclude) {
    packstream.push(GitPktLine.encode(`deepen-not ${oid}\n`))
  }
  // upload-request = want-list *shallow-line *1depth-request [filter-request] flush-pkt
  // Position is load-bearing, and so is the matching 'filter' capability on the
  // first want line: without it the server may accept this line and ignore it,
  // returning every blob while appearing to succeed.
  if (filter !== null) {
    packstream.push(GitPktLine.encode(`filter ${filter}\n`))
  }
  packstream.push(GitPktLine.flush())
  for (const oid of haves) {
    packstream.push(GitPktLine.encode(`have ${oid}\n`))
  }
  packstream.push(GitPktLine.encode(`done\n`))
  return packstream
}
