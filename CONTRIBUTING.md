# Contributing to Quick Charts

Quick Charts accepts bug reports, enhancement proposals and pull requests through the
`quick-charts` repository. This guide states what a useful report contains and what a pull request
must carry to merge.

## Report a bug

Search the open and closed issues first. A report that duplicates a closed issue is closed with a
link to it.

A bug report contains:

- the `quickcharts` version and the `lightweight-charts` version you installed;
- the browser or runtime, with its version;
- an isolated reproduction: the smallest page or test that shows the behavior, with an in-memory
  datafeed and no service of yours behind it;
- the behavior you expected and the behavior you saw;
- a title that names the behavior, so the next reporter finds it.

A report without a reproduction is answered with a request for one. Do not attach data, keys or
URLs from your product; the reproduction must run without them.

## Propose an enhancement

Open an issue that states the use case before you write code. A maintainer answers whether the
proposal fits the library's boundary: Quick Charts draws over the datafeed and storage you supply,
and does not include market data, trading, accounts, execution, community, news or hosting. Work
that starts before that answer can be declined for scope alone.

## Send a pull request

1. Fork the repository and branch from `main`.
2. Make one change per pull request. A refactor and a behavior change are two pull requests.
3. Add or update the tests that prove the change. A behavior change carries a unit or contract
   test. A rendering change carries a rendering check: a conformance case, a theme vector, or a
   browser check that reads the painted result.
4. Update the documentation that describes the changed contract in the same pull request, and add
   a line to the `Unreleased` section of `CHANGELOG.md` when the public surface changes.
5. Run the checks below and push only when they pass.
6. Open the pull request against `main` with a description that states what changed and why, and
   links the issue it resolves when one exists.

Continuous integration must pass before a maintainer reviews. A maintainer merges with a squash
when the review is complete; contributors do not merge. Keep the branch current by rebasing on
`main` when the maintainer asks; do not merge `main` into the branch.

## Commit messages

Write the subject as one sentence that states what the commit does to the reader of the history,
in the present tense. Reference the issue number in the body when one exists. A commit that
touches the public surface names the export or option it changes.

## Commands

The repository uses pnpm.

| Command | What it does |
|---|---|
| `pnpm install` | Installs dependencies. |
| `pnpm build` | Builds the package into `dist`, then generates the stylesheet, the feature manifest, the REST schema and the third-party notices. |
| `pnpm typecheck` | Type-checks the source, the tests and the guest. |
| `pnpm test` | Runs the unit, contract and boundary tests. |
| `pnpm build:theme` | Regenerates the stylesheet and theme manifest from the token schema. |
| `pnpm build:manifest` | Regenerates the feature manifest from the source. |
| `pnpm build:rest-openapi` | Regenerates `dist/rest-openapi.json` from the wire contract. |
| `pnpm build:notices` | Regenerates `THIRD-PARTY-NOTICES.md` from the installed packages. |

The generated files are committed. A pull request that changes a source of a generated file
regenerates it in the same commit; the tests compare the committed file with the rendering.

## Code and documentation style

- TypeScript, strict, with no unused locals or parameters.
- Every string the chart shows comes from its catalog under `src/i18n`; a literal in a component
  is a defect.
- Documentation follows the public documentation style: present tense, the integrator as `you`,
  the owner of every responsibility named, and no history.

## License of contributions

By opening a pull request you agree that your contribution is licensed under the license in
`LICENSE`.
