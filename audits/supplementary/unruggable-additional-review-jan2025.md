

**NOTE:** The canonical source of this file is [here](https://gist.github.com/peakbolt/d09c5b3cd7e77d04af0d1a39755e715d). This is included here for posterity.

---

# [M-01] `OPVerifier` incorrectly verify state with unfinalized nodes when `minAgeSec == 0`

### Context

- [OPVerifier.sol#L30-L42](https://github.com/unruggable-labs/unruggable-gateways/blob/4cf1879b6b97b8ca36c07002137ae062a90582a0/contracts/op/OPVerifier.sol#L30-L42)
- [OPVerifier.sol#L59-L64](https://github.com/unruggable-labs/unruggable-gateways/blob/4cf1879b6b97b8ca36c07002137ae062a90582a0/contracts/op/OPVerifier.sol#L59-L64)

### Description:

Verifiers with `minAgeSec == 0` (finalized mode) will perform the state verification based on finalized nodes/blocks.

However, `OPVerifier`'s finalized mode incorrectly uses the latest proposed nodes, which are not finalized yet.

That is because OP (pre-FaultProof version) has a `finalizationPeriodSeconds` field that defines the *"Number of seconds that a proposal must be available to challenge before it is considered finalized by the OptimismPortal contract."* as stated in the [docs](https://docs.optimism.io/builders/chain-operators/configuration/rollup#finalizationperiodseconds).

This is exposed as a getter `isOutputFinalized()` in [`OptimismPortal.sol#L421-L428`](https://github.com/ethereum-optimism/optimism/blob/v1.2.0/packages/contracts-bedrock/src/L1/OptimismPortal.sol#L421-L428), and is also utilized when [finalizing withdrawals](https://github.com/ethereum-optimism/optimism/blob/v1.2.0/packages/contracts-bedrock/src/L1/OptimismPortal.sol#L309-L316).


In the code below, we can see that `getLatestContext()` uses the latest proposed output node from `latestOutputIndex()` when `minAgeSec == 0`. As OP block time is 2 seconds, the latest output node is unfinalized as it would not have passed the finalization period (typically 7 days).

```solidity
    function getLatestContext() external view returns (bytes memory) {
        uint256 i = _oracle.latestOutputIndex();
        //@audit when `_minAgeSec == 0` it uses the the latest proposed output node, which is unfinalized
        uint256 t = block.timestamp - _minAgeSec;
        while (true) {
            Types.OutputProposal memory output = _oracle.getL2Output(i);
            if (output.timestamp <= t) {
                return abi.encode(i);
            }
            if (i == 0) break;
            --i;
        }
		revert('OP: no output');
    }
```

In addition, `getStorageValues()` does not ensure that the output node given by the gateway is finalized, when `p.outputIndex != outputIndex1`.

```solidity
    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 outputIndex1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        Types.OutputProposal memory output = _oracle.getL2Output(p.outputIndex);
        if (p.outputIndex != outputIndex1) {
            //@audit missing check to ensure that the output node is finalized when `minAgeSec == 0`
            Types.OutputProposal memory output1 = _oracle.getL2Output(
                outputIndex1
            );
            _checkWindow(output1.timestamp, output.timestamp);
        }
```

### Recommendation:

Update `OPVerifier` to perform the following when `minAgeSec == 0`,
1. `getLatestContext()` should look for the latest node that is finalized by checking against [`isOutputFinalized()`](https://github.com/ethereum-optimism/optimism/blob/v1.2.0/packages/contracts-bedrock/src/L1/OptimismPortal.sol#L421-L428).
2. `getStorageValue()` should check that the node provided by gateway is finalized when `p.outputIndex != outputIndex1`.


### Client:
Fixed in https://github.com/unruggable-labs/unruggable-gateways/tree/daf1325791356512940511a2bdc54e28d32bba37

[M-01] has been resolved utilising a 'Game Finder' approach (OPOutputFinder) similar to that used in the OPFaultVerifier. This facilitates an efficient search of submitted outputs giving consideration to both finalised and unfinalised Gateway/Verifier operation. It also minimises the need for excessive RPC calls within the Javascript implementation.


### Zenith:
Resolved with a new `OPOutputFinder` for `OPVerifier`, which will search for the latest node with `timestamp <= minAgeSec`. For `minAgeSec == 0`, it uses `oracle.finalizationPeriodSeconds()`, which is essentially searching for the latest finalized node.

Note that for finalized mode, `OPVerifier.getStorageValues()` does not need an explicit check to check the gateway provided node is finalized, as it relies on `_checkWindow()` to reject unfinalized nodes. `_checkWindow()` will reject nodes after latest finalized node, which are by definition unfinalized. In addition, in OP (pre-FaultGame), rejected nodes are deleted so nodes older than the latest finalized node are always finalized. 





# [L-01] `MerkleTrie` should reject un-used proofs

### Context
- [MerkleTrie.sol#L185-L188](https://github.com/unruggable-labs/unruggable-gateways/blob/4cf1879b6b97b8ca36c07002137ae062a90582a0/contracts/eth/MerkleTrie.sol#L185-L188)


### Description:


In `MerkleTrie`, the function `_walkNodePath()` retrieves the value node by walking through the proof array with the key and verify its inclusion in the proof.

When `currentKeyIndex == key.length`, it terminates the loop and returns, as it has reached the end of the key and found the value node for the key (as show below).

However, it fails to check that there are no more un-used proof elements in the proof array before terminating in that situation. That is because the proof is considered invalid if it contains more proof elements than what is required to verify the key and value node.

This differs from a recent version of OP's [MerkleTrie.sol#L111-L112](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/libraries/trie/MerkleTrie.sol#L111-L112), where it will check that it has reached the end of the proof array when the value node is found.

```Solidity
    function _walkNodePath(
        TrieNode[] memory _proof,
        bytes memory _key,
        bytes32 _root
    )
    ...
            if (currentNode.decoded.length == BRANCH_NODE_LENGTH) {
                if (currentKeyIndex == key.length) {
                    // We've hit the end of the key
                    // meaning the value should be within this branch node.
                    break;
                } else {
```







### Recommendation:
Consider adding the `i == proof.length - 1` check in `_walkNodePath()`.

```diff
    function _walkNodePath(
        TrieNode[] memory _proof,
        bytes memory _key,
        bytes32 _root
    )
    ...
            if (currentNode.decoded.length == BRANCH_NODE_LENGTH) {
                if (currentKeyIndex == key.length) {
                    // We've hit the end of the key
                    // meaning the value should be within this branch node.

+                   // Extra proof elements are not allowed.
+                   require(i == proof.length - 1, "MerkleTrie: value node must be last node in proof (branch)");

                    break;
                } else {
```

### Client:
Fixed in https://github.com/unruggable-labs/unruggable-gateways/tree/daf1325791356512940511a2bdc54e28d32bba37

### Zenith:
Resolved as per recommendations.


# [L-02] `ScrollVerifierHooks` should ensure there are no un-used proofs

### Context
- [ScrollVerifierHooks.sol#L118-L141](https://github.com/unruggable-labs/unruggable-gateways/blob/4cf1879b6b97b8ca36c07002137ae062a90582a0/contracts/scroll/ScrollVerifierHooks.sol#L118-L141)

### Description:

The function `walkTree()` in `ScrollVerifierHooks` will walk down the `proof[]` array to search for the leaf node and retrieve the value for the specific key. It also performs the inclusion proving while iterating through the proofs.

When `nodeType == NODE_LEAF`, it means that it has reached the leaf node, which means that it could be (1) the node that has the value for the key or (2) the node of the longest existing prefix of the key for proving the absence of the key.

However, it does not check that there are no more extra un-used proof in `proof[]`, which would technically make it an invalid proof as a whole, even though a subset of it was valid. This check is performed in Scroll's [ZkTrieVerifier](https://github.com/scroll-tech/scroll-contracts/blob/main/src/libraries/verifier/ZkTrieVerifier.sol#L264-L270).

```solidity
    function walkTree(
            ...

            } else if (nodeType == NODE_LEAF) {
                if (v.length != leafSize) revert InvalidProof();
                // NOTE: leafSize is >= 33
                if (uint8(v[leafSize - 33]) != 32) revert InvalidProof(); // InvalidKeyPreimageLength
                bytes32 temp;
                assembly {
                    temp := mload(add(v, 33))
                }
                if (temp == keyHash) {
                    assembly {
                        temp := mload(add(v, leafSize))
                    }
                    if (temp != key) revert InvalidProof(); // InvalidKeyPreimage
                    exists = true;
                } else {
                    // If the trie does not contain a value for key, the returned proof contains all
                    // nodes of the longest existing prefix of the key (at least the root node), ending
                    // with the node that proves the absence of the key.
                    bytes32 p = bytes32((1 << i) - 1); // prefix mask
                    if ((temp & p) != (keyHash & p)) revert InvalidProof();
                    // this is a proof for a different value that traverses to the same place
                    keyHash = temp;
                }
                break;
            }
```
### Recommendation:

Update `walkTree()` to reject the proof if there are un-used proof elements after the leaf node and magic bytes.

```diff
    function walkTree(
            ...

            } else if (nodeType == NODE_LEAF) {
                if (v.length != leafSize) revert InvalidProof();
                // NOTE: leafSize is >= 33
                if (uint8(v[leafSize - 33]) != 32) revert InvalidProof(); // InvalidKeyPreimageLength

+               // Proof is invalid if there are un-used proof elements after this leaf node and magic bytes              
+               if (keccak256(proof[i + 1]) != keccak256("THIS IS SOME MAGIC BYTES FOR SMT m1rRXgP2xpDI")) revert InvalidProof();
+               if (proof.length - 1 != i + 1) revert InvalidProof();

                bytes32 temp;
                assembly {
                    temp := mload(add(v, 33))
                }
                if (temp == keyHash) {
                    assembly {
                        temp := mload(add(v, leafSize))
                    }
                    if (temp != key) revert InvalidProof(); // InvalidKeyPreimage
                    exists = true;
                } else {
                    // If the trie does not contain a value for key, the returned proof contains all
                    // nodes of the longest existing prefix of the key (at least the root node), ending
                    // with the node that proves the absence of the key.
                    bytes32 p = bytes32((1 << i) - 1); // prefix mask
                    if ((temp & p) != (keyHash & p)) revert InvalidProof();
                    // this is a proof for a different value that traverses to the same place
                    keyHash = temp;
                }
                break;
            }
```


### Client:
Fixed in https://github.com/unruggable-labs/unruggable-gateways/tree/daf1325791356512940511a2bdc54e28d32bba37

### Zenith:
Resolved as per recommendations.