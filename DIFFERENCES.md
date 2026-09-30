# Differences from upstream isomorphic-git

**Upstream base**: isomorphic-git commit `5aff8af`
**Fork**: saberzero1/isomorphic-git

## Commands removed

- `annotatedTag`, `tag`, `deleteTag`, `readTag`, `writeTag` (tag management)
- `cherryPick` (cherry-pick operations)
- `stash` (stash operations)
- `addNote`, `removeNote`, `readNote`, `listNotes` (git notes)
- `renameBranch` (branch rename)
- `getRemoteInfo2` (v2 protocol, redundant with `getRemoteInfo`)

## Internal modules removed

- `GitStashManager`, `GitRefStash`
- `CherryPickMergeCommitError`, `CherryPickRootCommitError`
- `walkerToTreeEntryMap`

## Dependencies removed

- `minimisted` (CLI argument parsing — CLI not used)

## New features

- `gc` command: consolidates multiple pack files into one, preventing repo bloat from accumulating fetch operations
- **Partial clone (`filter`)**: `clone()` and `fetch()` accept `filter`, e.g. `'blob:none'`, so a repository's trees can be read without downloading its file contents. Requires the server to advertise the `filter` capability; throws `RemoteCapabilityError('filter', 'filter')` if it does not, rather than silently downloading everything.
- **`fetchObjects({ oids })`**: fetches specific objects by oid to backfill a partial clone. Sends one `want` per oid in a single request and touches neither refs, shallow state, nor `FETCH_HEAD`. Requires `allow-reachable-sha1-in-want` (or `allow-any-sha1-in-want`), because a filtered-out blob is never at a ref tip.

### Partial clone notes

A filtered fetch writes a `pack-<sha>.promisor` marker beside the pack and records
`extensions.partialclone=<remote>`, `remote.<remote>.promisor=true`,
`remote.<remote>.partialclonefilter=<spec>` and `core.repositoryformatversion=1`.
The `.promisor` file's *contents* are unspecified here — it is written empty and
only used as a marker; do not rely on canonical git's format for it.

There is **no automatic lazy fetch**. A missing blob throws `NotFoundError` exactly
as before, and callers decide whether to call `fetchObjects`. This is deliberate:
hooking the object reader would make genuine pack corruption and a filesystem
failure indistinguishable from an intentionally-absent blob, and would let
`checkout` and `push` silently re-download everything the filter omitted.

`push` from a partial clone works because `listObjects` reads blob oids out of tree
objects without reading the blobs, and thin-pack `skipObjects` subtracts everything
reachable from the remote. Where that subtraction yields nothing — the server sent
`no-thin`, `refs/remotes/<remote>/HEAD` did not resolve, or the branch is new on the
remote — push now fails with an explanatory `NotFoundError` instead of failing deep
inside pack serialization.

## Memory improvements

- Zero-copy pack slicing (`Buffer.subarray` instead of `Buffer.slice` in `GitPackIndex`)
- LRU eviction for pack index cache (max 5 entries, prevents unbounded growth)

## Unchanged

- `HttpClient` interface (`http` parameter accepted on all network commands)
- `FsClient` interface (`fs` parameter accepted on all commands)
- All storage modules (except LRU addition to `readPackIndex`)

## Modified

- `src/wire/writeUploadPackRequest.js` — emits the optional `filter` line
- `src/commands/fetch.js` — `filter` option, capability guard, promisor state
- `src/commands/push.js` — pre-pack presence check (see partial clone notes)
- Build system (Rollup producing ESM + CJS)
- `src/http/web/` and `src/http/node/` transports
