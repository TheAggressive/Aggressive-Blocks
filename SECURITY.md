# Security policy

## Supported versions

Security fixes land in the latest release; older releases are not patched. From 2.1, sites receive new releases through WordPress's own plugin updates (see [docs/updates.md](docs/updates.md)).

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request, or discussion for a security problem.

Include the affected version, the steps to reproduce, and the impact you observed. A proof of concept against a local WordPress install is ideal. Do not test against sites you do not own.

What to expect:

* An acknowledgement within 3 business days.
* An assessment of severity and scope within 10 business days.
* Coordinated disclosure: a fixed release is published first, then a GitHub security advisory credits you unless you ask not to be named.

This project has a single maintainer, so these are targets rather than guarantees.

## Scope

In scope: code in this repository, the release ZIPs published on its GitHub Releases page, and the CI/CD workflows that build them.

Out of scope: WordPress core, other plugins and themes (including Aggressive Apparel), and vulnerabilities that require an administrator account or file-system access the attacker already has.

## Verifying a release

Every release ZIP is published with a `.sha256` checksum and a signed build-provenance attestation. The attestation proves the ZIP was built by this repository's release workflow from the tagged commit, not uploaded by hand:

```bash
gh attestation verify aggressive-blocks-X.Y.Z.zip --repo TheAggressive/Aggressive-Blocks
sha256sum --check aggressive-blocks-X.Y.Z.zip.sha256
```

Releases before attestations were introduced carry only the checksum.
