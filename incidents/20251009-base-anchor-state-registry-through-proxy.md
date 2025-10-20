# Base AnchorStateRegistry through proxy

Base updated the implementation for their [portal proxy contract](https://etherscan.io/address/0x49048044D57e1C92A77f79988d21Fa8fAF74E97e#readProxyContract) to point to [this implementation contract](https://etherscan.io/address/0x381e729ff983fa4bced820e7b922d79bf653b999#code) at block 23527741.

That upgraded `OptimismPortal2` contract added a getter function for the `anchorStateRegistry` which was set to [0x909f6cf47ed12f010A796527f562bFc26C7F4E72](https://etherscan.io/address/0x909f6cf47ed12f010A796527f562bFc26C7F4E72#readProxyContract), another proxy contract with it's implementation at [0xeb69cc681e8d4a557b30dffbad85affd47a2cf2e](https://etherscan.io/address/0xeb69cc681e8d4a557b30dffbad85affd47a2cf2e#code).

The definition of `respectedGameTypeUpdatedAt` was updated (in `OptimismPortal2`) to:

```
function respectedGameTypeUpdatedAt() external view returns (uint64) {
    return anchorStateRegistry.retirementTimestamp();
}
```

A value that is set in storage at the proxy level based on the block timestamp at deployment.

Noting this, no games will be returned by the `OPFaultGameFinder` contract as finalized until a full game cycle has completed.

Noting that the `respectedGameType` was **not** changed, ideally the contract initializers would have been designed to allow for the initialization of the proxy with the `retirementTimestamp` set to its previous value.