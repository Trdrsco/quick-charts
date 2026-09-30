# Quick Charts

A guide and a rule set for agents working in this repository. The code is the source of truth;
the documents below point at it.

Quick Charts (`@trdrs/quickcharts` on npm) is a public, Apache-2.0 browser charting library. It
draws over the datafeed and storage a host supplies, and includes no market data, trading,
accounts, execution or hosting.

## Rules

- **Quick Charts is its own product.** Every change must make sense to a developer who has never
  seen any application that consumes it. Option names, types and documents use chart words: a
  symbol, a series, a mark, a scope, a layout. When a host needs something, add a generic seam
  named for the chart concept (a label, a mark painter, a filter, a callback) and let the host fill
  it. A host's own ideas (its accounts, its businesses, its order routing) stay in the host. Here,
  "venue" means the exchange a symbol lists on.
- **Nothing private.** No credential, internal host name, customer name or private package, in
  code, tests, documents or commit messages. `pnpm check:supply-chain` reads the tree and every
  line ever added to the history.
- **No em dashes** in code, comments, documents or strings. Use a comma, a colon, parentheses or a
  new sentence.
- **Comments and documents state the present contract.** No change history, dates or plan names.
  `pnpm check:docs` holds the documents to the documentation style.
- **One change per pull request.** A behavior change carries its test; a change to the public
  surface updates its documents and adds a `CHANGELOG.md` line in the same pull request.
- **Generated files are committed** and regenerated in the same commit as their source. When the
  packed bytes change on purpose, re-pin with `node scripts/pack-candidate.mjs --pin`.
- **Every string the chart shows** comes from its catalog under `src/i18n`.

## Branches and merging

Branch from `main`, push, and open a pull request against `main`. The `gate` check is required;
merge with a squash once it passes. Delete the branch after the merge.

```sh
pnpm install
pnpm gate --fast           # build, typecheck, tests, candidate pin, supply chain, notices, docs
pnpm gate                  # adds the clean room and the browser suite
```

CI (`.github/workflows/ci.yml`) runs the same steps as parallel jobs, and its `gate` job passes only
when all of them pass. `CONTRIBUTING.md` lists every command.

## Releasing

Follow [RELEASING.md](RELEASING.md). The points an agent gets wrong:

- The version follows semantic versioning: a new public option is a minor version, a fix is a
  patch.
- Tag `v<version>` only on the `main` commit that holds every change the release carries, after
  its CI passed. A tag publishes nothing, and a tag that was pushed is never moved.
- `release.yml` is dispatched on the tag with the candidate's SHA-256 and an HTTPS link to the
  first host's acceptance record. The record is committed as `release-acceptance-<version>.json`.
- The owner approves the `npm-publish` environment. An agent never publishes.

## Where to look

| Question | Go to |
|---|---|
| What does the public API promise? | [README.md](README.md) and the exports of `src/index.ts` |
| How do I contribute, and which commands exist? | [CONTRIBUTING.md](CONTRIBUTING.md) |
| How is a version released? | [RELEASING.md](RELEASING.md) |
| What shipped in each version? | [CHANGELOG.md](CHANGELOG.md) |
