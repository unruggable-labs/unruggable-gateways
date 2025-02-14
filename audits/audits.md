# Audited Releases

| Audit Date | Release Link | NPM Package Link |
|------------|--------------|------------------|
| [December 2024 to February 2025](#december-2024-to-february-2025) | [v1.0.0](https://github.com/unruggable-labs/unruggable-gateways/releases/tag/v1.0.0) | [@unruggable/gateways@1.0.0](https://www.npmjs.com/package/@unruggable/gateways/v/1.0.0) |

# Audit Details

## December 2024 to February 2025

From **December 2024 to February 2025** the Unruggable Gateways codebase underwent a multipronged audit in collaboration with [CodeArena](https://code4rena.com/).

Please see [scoping.md](./supplementary/scoping.md) for information that was provided to CodeArena in advance of the audit.

### 1. Zenith Private Audit

Commit hash: [**v1.0.0-audit-2024-11-22-rc.1**](https://github.com/unruggable-labs/unruggable-gateways/releases/tag/v1.0.0-audit-2024-11-22-rc.1)

The Zenith audit was comprehensive and in-depth. 

**Two medium** severity issues were found in our Scroll verifier as well as **five low** severity issues.

The [discovered issues](https://github.com/zenith-security/2024-11-unruggable-zenith/issues) were mitigated and an an audit report was produced by CodeArena.

Please see [Zenith Audit Report - Unruggable.pdf](./supplementary/Zenith%20Audit%20Report%20-%20Unruggable.pdf) for an indepth look at the findings.

### 2. Invitational Competitive Audit

Commit hash: [**v1.0.0-invitational-audit-2024-12-06-rc.2**](https://github.com/unruggable-labs/unruggable-gateways/releases/tag/v1.0.0-invitational-audit-2024-12-06-rc.2)

The invitational audit involved five auditors selected by the CodeArena team. The selected wardens were provided with the following [code walkthrough](https://www.youtube.com/watch?v=x4DG2iumwck), and had direct contact with the Unruggable team through Discord, and the CodeArena invitational platform.

Two medium severity issues were found:

- The Scroll verifier was not respecting the max depth of their zkTrie.
- The verifier for OP Stack chains implementing fault proofs did not correctly respect the blacklist.

Both issues were mitigated, and these mitigations were [reviewed](https://gist.github.com/peakbolt/959c3b286f104ba2038fa082ad3d5388). 

A low severity issue was found pertaining to validations in the context of the **unfinalized** Arbitrum Nitro verifier. For strict correctness these additional validations were added but it is worth drawing the attention of users of this codebase to the fact that unfinalized verifiers are configured by users and their usage inherently involves relaxation of trust assumptions.

Changes implemented in response to the invitational audit can be found within the following [Pull Request](https://github.com/unruggable-labs/unruggable-gateways/pull/19).

### 3. Additional Zenith Review

Based on discussion with the CodeArena team and the judge for the invitational audit, it was decided that a member of the Zenth audit team (@peakbolt) would undertake a further coverage check to ensure that the codebase had received appropriate audit coverage.

This [additional review](https://gist.github.com/peakbolt/d09c5b3cd7e77d04af0d1a39755e715d) uncovered one further Medium risk issue:

- The OP stack verifier for chains **not implementing fault proofs** was not correctly considering `finalizationPeriodSeconds`.

This issue was mitigated using a GameFinder (binary search) approach to optimise finding appropriately finalised games from both the gateway and verifier code.

Additionally, two Low risk issues related to strict proof validation correctness were found. These issues were mitigated.