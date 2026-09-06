# Releasing Quick Charts

This page is for maintainers. It states who can publish, what a release proves before it ships,
and what happens when access is lost.

## Roles

- **Owner.** Holds the npm package `quickcharts` and the `quick-charts` repository. Grants and
  revokes maintainer access, approves the first publication of every major, and holds the recovery
  codes. The owner confirms the repository organization and the homepage address named in
  `package.json` and this page, and that private vulnerability reporting is enabled on the
  repository, before it is public.
- **Maintainer.** Reviews and merges pull requests, cuts releases through the release workflow, and
  answers security reports. A maintainer never publishes from a workstation.
- **Contributor.** Everyone else. Contributors open pull requests and cannot merge or publish.

Every owner and maintainer account on npm and on the repository host has two-factor authentication
enabled with an authenticator app or a hardware key, not SMS. The npm package requires two-factor
authentication for publishing and for changing access. Access is reviewed when a maintainer leaves
and at least twice a year.

## Provenance

Every published version is built and published by the repository's release workflow with npm
provenance enabled (`publishConfig.provenance` in `package.json`). A version that lacks a
provenance attestation linking it to a commit on `main` and a workflow run in this repository is
not a release of this project, and the owner unpublishes it within the registry's window.

No token that can publish is stored on a workstation or in a workflow secret. The workflow
publishes with the registry's trusted-publishing grant for this repository and this workflow file.

## What a release proves

A release is cut from `main` and ships only when, on the candidate commit:

1. the package builds, and every generated file it commits (`THIRD-PARTY-NOTICES.md`,
   `dist/feature-manifest.json`, `dist/theme-manifest.json`, `dist/rest-openapi.json`) equals its
   rendering;
2. the tests, the type check, the boundary fixtures and the supply-chain scan pass;
3. a local tarball is inspected: its file list, its export map, its declarations, its dependency
   closure, its notices and its size match what the changelog describes;
4. the clean-room projects install the tarball and run;
5. the `Unreleased` section of `CHANGELOG.md` is moved under the new version with the date, and
   the version in `package.json` is bumped by the SemVer rule in `SUPPORT.md`;
6. the release commit is tagged `v<version>`.

The workflow publishes the tagged commit. A publication that is not a tagged `main` commit is
refused by the workflow.

## Name and registry

The package identifier is `quickcharts`. Registry ownership of the name is a release gate, not a
step a maintainer takes early: no incomplete artifact is published to reserve the name, no
placeholder version exists, and no alias is published under any other name. The first published
version is the first release the gates above pass.

## Recovery

- **A lost second factor.** The owner holds the recovery codes for the package and the
  organization. A maintainer who loses access asks the owner, who re-verifies the maintainer through
  a channel that was set up earlier and re-issues access.
- **A compromised account.** The owner revokes the account's access on npm and on the repository
  host, rotates any grant the account could reach, audits the versions published and the commits
  merged since the last known-good date, and unpublishes or deprecates any version the audit does
  not clear.
- **A bad release.** Publish a patch that reverts the change; do not unpublish a version consumers
  may have installed unless it carries a secret or malicious code. Deprecate the bad version on
  the registry with a message that names the patch.
- **A lost owner.** A second owner account is designated before the first release, so that the
  loss of one account never blocks a security fix.

## Before the repository is public

The owner completes these before changing the repository's visibility, in this order: the license
review and the license file, the security contact, the repository organization and homepage in
`package.json`, branch protection on `main`, the release workflow with trusted publishing, the
second owner, and the compatibility matrix in `SUPPORT.md`.
