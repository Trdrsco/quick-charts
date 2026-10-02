# Releasing Quick Charts

Quick Charts releases are selected by the owner and published from the reviewed public repository.
The owner can approve their own release. The first host is the application that installs each
release candidate before it is published and records its acceptance.

## Roles

Only the existing project maintainers have repository write access. Contributors can propose
changes but cannot merge, create official releases or upgrade a consuming application. Main
requires the `gate` check and a pull request with resolved conversations. No approving review is
mandatory. Normal administrator operations follow these controls.

The npm owner secures the account with two-factor authentication and retains recovery access.
Registry publishing access is separate from repository access. Do not grant it to contributors.

## Candidate acceptance

1. Build and run `pnpm gate` from the exact release commit. This includes source and contract tests,
   clean consumers and browser conformance over the packed artifact.
2. Inspect the export map, declaration files, stylesheet, LICENSE, NOTICE and
   THIRD-PARTY-NOTICES.md. Check the generated dist/feature-manifest.json,
   dist/theme-manifest.json and dist/rest-openapi.json.
3. Run the first host against this same tarball and retain its exact source commit, the candidate
   digest and passing integration results. Record manual accessibility and advertised browser
   acceptance, or an explicit owner waiver. A waiver does not establish screen-reader or device
   support; automated conformance alone does not prove those results.
4. Run `pnpm rehearsal` from a clean checkout. Keep the complete dossier and its artifact hashes.
5. Write the acceptance record, `releases/<version>.json`, with every field
   [releases/README.md](releases/README.md) requires, and merge it through a pull request. The
   record is not packed, so the candidate bytes do not change.
6. Create `v<version>` on the main commit that holds the record. A tag alone publishes nothing.

## Publication

Dispatch `release.yml` on the exact release tag, supplying the SHA-256 of the candidate accepted
by the first host. The validation job refuses to continue unless the tagged commit holds
`releases/<version>.json`, the record is complete, its version is the package version, its
release commit is the tagged commit or an ancestor of it, and the dispatched SHA-256, the record
and the rehearsed tarball name the same bytes. It also verifies the tag, version and main ancestry.

The owner reads that evidence and approves the `npm-publish` environment. Self-approval is allowed.
The publishing job downloads the validated tarball, verifies its digest again and publishes that
file without rebuilding it or executing package scripts. Only this protected job receives OIDC
permission. Node 24.15.0 and npm 12.1.0 are pinned. `publishConfig.provenance` is enabled.

Configure npm trust for repository `Trdrsco/quick-charts`, workflow `release.yml` and environment
`npm-publish` before using this path. GitHub configuration alone does not establish npm trust.
The first package's registry bootstrap must be completed with the npm owner once the final
candidate is accepted; do not publish a placeholder to reserve the name or treat a 404 as ownership.
Keep publishing credentials out of this repository and its logs.

After publication, install the exact registry version in a fresh project, run its browser check,
and verify provenance. The first host adopts that exact version through its own checked dependency
change. Publication never deploys or automatically upgrades the first host.

Then record the publication facts: add the `publication` section to `releases/<version>.json`
with the release run, the registry integrity, the registry tarball SHA-256 and the provenance log
index, and merge it through a pull request. `node scripts/check-release-records.mjs` fails once a
version has been on the registry for seven days without them.

## Recovery

For a faulty release, publish a corrective patch and deprecate the faulty version with the
replacement named. Keep artifacts consumers already installed. For a compromised publishing
account, revoke its access, review affected versions and restore access through the owner's
independent recovery method. Repository administrators retain recovery powers to change controls;
record the reason for emergency configuration changes and restore the normal protections.

## First-publication bootstrap

A package must exist in the registry before npm can attach a trusted publisher. For the first
publication only, the npm owner authenticates through the web login flow and publishes the accepted
tarball interactively with package scripts disabled. Verify the tarball SHA-256 before publishing.
A workstation publish cannot produce GitHub OIDC provenance; record that bootstrap limitation and
use the protected workflow with provenance for subsequent versions. Do not edit or repack the
accepted tarball to change publishing configuration.

After the first version exists, configure trust with `npm trust github @trdrs/quickcharts --file
release.yml --repo Trdrsco/quick-charts --env npm-publish --allow-publish --yes`. Require 2FA and
disallow traditional publishing tokens. Verify the trust configuration and registry artifact,
then log out and remove the temporary workstation login configuration. The registry owner remains
the only publishing account unless the owner explicitly adds another maintainer.