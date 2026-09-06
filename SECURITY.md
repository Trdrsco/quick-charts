# Security policy

Quick Charts runs in your page with the data and the ports you supply. It makes no network request
of its own, stores nothing outside the storage port you give it, and carries no credential. A
security report is about the library's own code: the way it handles the data a datafeed returns,
the documents a save/load adapter returns, the assets a user pastes or picks, and the DOM it
renders into.

## Report a vulnerability

Report privately. Do not open a public issue for a vulnerability.

Send the report to [security contact, set by the owner before the repository is public]. Include
the affected version, the steps to reproduce, and the impact you observed. You receive an
acknowledgement within three business days.

## Disclosure

The maintainers confirm the report, prepare a fix, and publish a patched version. The public
advisory follows the patch. The maintainers publish within 90 days of the report, or earlier when
the fix ships earlier; a report that cannot be fixed within 90 days is disclosed with the
mitigation that exists at that date. You are credited in the advisory unless you ask not to be.

## Supported versions

Security fixes ship for the latest minor version of the latest major. A fix for an earlier major is
considered when the vulnerability is reachable from the documented API and the major is less than
twelve months past its successor's first release.

## Out of scope

- Reports against your datafeed, your storage service or your page, which the library does not
  control.
- Reports that require a malicious datafeed or adapter you chose to install. The library treats
  what those ports return as data and does not evaluate it; a port that returns hostile content
  is your integration's trust boundary.
- Reports against `lightweight-charts`, which has its own security policy.
