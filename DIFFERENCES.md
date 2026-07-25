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

## Memory improvements

- Zero-copy pack slicing (`Buffer.subarray` instead of `Buffer.slice` in `GitPackIndex`)
- LRU eviction for pack index cache (max 5 entries, prevents unbounded growth)

## Unchanged

- `HttpClient` interface (`http` parameter accepted on all network commands)
- `FsClient` interface (`fs` parameter accepted on all commands)
- All wire protocol modules
- All storage modules (except LRU addition to `readPackIndex`)
- Build system (Rollup producing ESM + CJS)
- `src/http/web/` and `src/http/node/` transports
