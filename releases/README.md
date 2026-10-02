# Release records

Each file here is the acceptance record of one Quick Charts version, named `<version>.json`. It
states which exact candidate was accepted for publication, what proved it, and, once the version
is published, what the registry received.

`release.yml` refuses to publish a version unless the tagged commit holds `releases/<version>.json`,
the record passes the rules below, its version is the package version, the dispatched SHA-256 and
the rehearsed tarball equal its `tarballSha256`, the rehearsed tar stream equals its
`tarStreamSha256`, and the tag is its `releaseCommit` or descends from it. The record is not in the
package `files`, so adding it changes no published byte. [RELEASING.md](../RELEASING.md) gives the
order of the steps.

## The acceptance record

`scripts/release-policy.mjs` holds the rules. Every field below is required, other fields are
kept as written, and the record carries either `manualAcceptance` or `ownerWaiver`.

```json
{
  "date": "2026-10-03",
  "packageName": "@trdrs/quickcharts",
  "version": "2.1.0",
  "releaseCommit": "0123456789abcdef0123456789abcdef01234567",
  "tarballSha256": "0000000000000000000000000000000000000000000000000000000000000001",
  "tarStreamSha256": "0000000000000000000000000000000000000000000000000000000000000002",
  "producer": {
    "ciRun": "https://github.com/Trdrsco/quick-charts/actions/runs/1",
    "rehearsal": {
      "result": "pass",
      "summarySha256": "0000000000000000000000000000000000000000000000000000000000000003",
      "dossierHashesSha256": "0000000000000000000000000000000000000000000000000000000000000004"
    }
  },
  "inspection": {
    "exportMap": "inspected",
    "declarations": "inspected",
    "stylesheet": "inspected",
    "licenseAndNotices": "inspected",
    "generatedManifests": "inspected"
  },
  "firstHost": {
    "repository": "example/first-host",
    "testedCommit": "89abcdef0123456789abcdef0123456789abcdef",
    "ciRun": "https://github.com/example/first-host/actions/runs/2",
    "result": "pass"
  },
  "ownerWaiver": {
    "owner": "The owner's name",
    "statement": "The owner's words, quoted exactly",
    "recordedAt": "2026-10-03T12:00:00Z"
  }
}
```

| Field | What it holds |
|---|---|
| `releaseCommit` | The full commit the candidate was built from. |
| `tarballSha256`, `tarStreamSha256` | The candidate tarball and its uncompressed tar stream, from `.candidate/manifest.json`. |
| `producer.ciRun` | The CI run of the release commit. |
| `producer.rehearsal` | `pass`, and the SHA-256 of the dossier's `SUMMARY.md` and `hashes.json`. |
| `inspection` | `inspected` for the export map, the declarations, the stylesheet, the license and notices, and the generated feature, theme and REST manifests. |
| `firstHost` | The repository, the full commit that installed this tarball, its CI run and `pass`. |
| `manualAcceptance` | `accessibility` and `browsersAndDevices` both `pass`, `performedBy` and `recordedAt`. |
| `ownerWaiver` | The `owner` who waived manual acceptance, their exact `statement`, and `recordedAt`. A waiver does not establish screen-reader or device support. |

Times are ISO 8601 with a zone, commits are full 40-character hashes, and links are HTTPS without
credentials.

## The publication facts

The registry facts exist only after publishing, so they arrive in a follow-up pull request that
adds a `publication` section to the same record:

```json
"publication": {
  "releaseRun": "https://github.com/Trdrsco/quick-charts/actions/runs/3",
  "registryIntegrity": "sha512-...",
  "registryTarballSha256": "the tarballSha256 above",
  "provenanceLogIndex": "the transparency-log index of the SLSA provenance attestation"
}
```

`registryIntegrity` is the registry's `dist.integrity`. `provenanceLogIndex` is the `logIndex` of
the provenance attestation the registry serves at `dist.attestations.url`.

## The coverage check

`node scripts/check-release-records.mjs` runs in the gate and in CI. It fails when a version on the
registry or a `v<version>` tag has no record, when a registry tarball differs from the candidate
its record accepts, or when a version has been on the registry for seven days without its
publication facts.
Tag `v1.0.2` has no record: its release run was cancelled and the version was never published.

## Records that predate the rules

Versions 1.0.0, 1.0.1, 1.1.0, 1.2.0, 1.3.0 and 2.0.0 were published before the record was required
and keep the shapes they were written in. They are held only to their package, version and
candidate SHA-256, and to the registry tarball matching it. Version 1.2.0 was recorded by its first
host and is kept here as that host wrote it. Versions 1.2.0, 1.3.0 and 2.0.0 name their release run
and registry tarball digest, 1.0.0 records its interactive first publication, and 1.0.1 and 1.1.0
carry no publication facts. None carries the registry integrity or the provenance log index; the
coverage check proves each one against the registry tarball instead. The 2.0.0 workstation
rehearsal dossier is not retained; its record says so and cites the release run's own rehearsal.
