# Introduction

Unruggable Gateways implements a complete solution for fetching proofs of data from rollup chains and verifying that data on Layer 1 Ethereum.

These gateways will be utilised as a middleware piece for fetching proven data from rollup chains. Initially these gateways will be operated in the context of cross chain reverse resolution. Later they will be used for forward resolution of ENS names as part of the [ENS v2](https://blog.ens.domains/post/ensv2) roadmap.

The scope of this security audit is the Virtual Machine (`GatewayVM.sol`) that interprets requests sent to our HTTP gateways, and the verifier contracts (that will be deployed on Layer 1 Ethereum) that verify proofs returned from the aforementioned gateway server in response to a ERC-3668 CCIP requests. 

The initial release will support Arbitrum, Base, Linea, Optimism, and Scroll so the scope will be constrained to the verifiers for those chains.

## 1. Repository Links

- [https://github.com/unruggable-labs/unruggable-gateways](https://github.com/unruggable-labs/unruggable-gateways/)

## 2. Branches

- unruggable-gateways: **main**

## 3. Contract Design

- The `*Verifier.sol` contracts are called from the ERC3668 callback function and verify the proof data returned from the gateway giving consideration to chain specific rollup architecture.
    - `*Verifier.sol` contracts inherit from `AbstractVerifier.sol` and implement the `IGatewayVerifier.sol` interface.
- The `*VerifierHooks.sol` contain the logic for the chain specific verification of both account state and storage state.
    - `*VerifierHooks.sol` contracts implement the `IVerifierHooks.sol` interface.

## File paths to INCLUDE

**unruggable-gateways**

```
[SLOC] FILE_NAME

[45] contracts/eth/EthVerifierHooks.sol
[296] contracts/eth/MerkleTrie.sol            # op code, ENS picked older commit
[65] contracts/eth/SecureMerkleTrie.sol      # op code

[14] contracts/linea/ILineaRollup.sol
[40] contracts/linea/LineaVerifier.sol
[109] contracts/linea/LineaVerifierHooks.sol
[878] contracts/linea/Mimc.sol                # linea code, only used for local
[267] contracts/linea/SparseMerkleProof.sol   # linea code, only used for local

[24] contracts/nitro/IRollupCore.sol
[91] contracts/nitro/NitroVerifier.sol

[106] contracts/op/OPFaultGameFinder.sol
[111] contracts/op/OPFaultVerifier.sol
[72] contracts/op/OPVerifier.sol

[45] contracts/scroll/ScrollVerifier.sol
[200] contracts/scroll/ScrollVerifierHooks.sol   # this was written to be debugged

[37] contracts/AbstractVerifier.sol
[68] contracts/GatewayFetchTarget.sol
[481] contracts/GatewayFetcher.sol
[89] contracts/GatewayRequest.sol          # just defs: constants + struct
[515] contracts/GatewayVM.sol
[9] contracts/IGatewayProtocol.sol
[14] contracts/IGatewayVerifier.sol
[18] contracts/IVerifierHooks.sol
[30] contracts/RLPReaderExt.sol
[12] contracts/ReadBytesAt.sol

[3636 inc supplementary files/2130]

Source code lines discerned using: https://ghloc.vercel.app/unruggable-labs/unruggable-gateways?branch=main&locsPath=%5B%22contracts%22%5D
```

## Priority files

The following files should receive extra attention:

- `contracts/GatewayVM.sol` is the virtual machine implementation that evaluates requests sent to the Gateway.

## Areas of concern

- Are there any oversights in the verifier contracts that allow for verification of an invalid proof and thus return of invalid data?
- Noting the inherent complexities of proof verification does the architecture of the solution appropriately balance code readability/extensibility/flexibility/optimisations?