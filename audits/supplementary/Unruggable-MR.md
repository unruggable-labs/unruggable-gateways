**NOTE:** The canonical source of this file is [here](https://gist.github.com/peakbolt/959c3b286f104ba2038fa082ad3d5388). This is included here for posterity.

---


# Fix for Finding F9
- https://code4rena.com/evaluate/2024-12-unruggable-invitational/findings/F-9

Confirmed issue is resolved with the added `MAX_TRIE_DEPTH (248)` check that ensures provided proof does not exceed the max depth of 248.


# Fix for Finding F10
- https://code4rena.com/evaluate/2024-12-unruggable-invitational/findings/F-10

The fix for F10 does not fully address the issue as `stakerCount` could also include zombies (stakers that lost in a challenge). 

That is because when stakers lost a challenge, they are `turned into` zombies and not removed from stakerCount immediately. That means it is possible for rejected nodes to have `stakerCount > 0`.

In Nitro's code, the definition of no stakers refers to no zombie stakers. This is evident from [RollupUserLogic.sol](https://github.com/OffchainLabs/nitro-contracts/blob/v2.1.0/src/rollup/RollupUserLogic.sol#L108-L111) where the `rejectNextNode()` checks for zero non-zombies (active stakers) to proceed with the node rejection.

```solidity
    function rejectNextNode(address stakerAddress) external onlyValidator whenNotPaused {
             ..
            // Verify that no staker is staked on this node
            require(
                firstUnresolvedNode_.stakerCount == countStakedZombies(firstUnresolvedNodeNum),
                "HAS_STAKERS"
            );
```

## Recommendations
However, my recommendation is not to use `stakerCount` but instead rely on `firstUnresolvedNode()` and `latestConfirmedNode()` to skip rejected nodes in the following manner:

1. Trasverse backward from the `latestNodeCreated()` to find the node that satistify `_minBlocks`.
2. If the next iteration goes past the `firstUnresolvedNode()`, it should then continue the traversing using `latestConfirmedNode()` and traverse using `node.prevNum` to transfer through the confirmed nodes (just like finalized mode).

Doing so will allow us to skip the rejected nodes (below) in an efficient manner.

If we look at this [diagram](https://docs.arbitrum.io/assets/images/rollup-malicious-validator-1f29ab788995494d9d8fb6f617d6185d.svg) from Arbitrum we can see two scenarios of rejected nodes.

1. Rejected nodes (104, 105) that are after `latestConfirmedNode()` - It will skip these by jumping from `firstUnresolvedNode()` to `latestConfirmedNode()`, as it will skip the nodes that had been resolved and rejected by the protocol.

2. Rejected nodes (101) that are before `latestConfirmedNode()` - These are skipped simply by trasversing confirmed nodes like finalized mode, and not using descending node number. We need to consider this case as it is possible to select a node that is older than the `latestConfirmed()` node.


Note that unresolved node 111 will eventually be rejected by the protocol, as it is a child of rejected node 104. That means we could either treat it as unresolved and allow it to be selected by `getLatestContext()` or try to anticipate the rejection and not allow it to be selected. 

My  recommended solution treats node 111 as unresolved and allow it to be selected due to simplicity and respecting the protocol's state. But there is nothing wrong to reject node 111, though it is more complex as there are no direct way to check if the parent/ancestor node is rejected. Furthermore, there are also such pending rejection scenarios, such as deadline and rejection of child/decedent nodes, so its not easy to address them all.


### Client:
Fixed in https://github.com/unruggable-labs/unruggable-gateways/commit/daf1325791356512940511a2bdc54e28d32bba37

### Zenith:
Resolved with a new `_isNodeUsable()` that checks specified node is not rejected with the check `node.stakerCount > _rollup.countStakedZombies(index)`. When `node.stakerCount == _rollup.countStakedZombies(index)`, it means that the node has zero active stakers, which by definition is a rejected or pending rejection node. 

# Fix for Finding F13
- https://code4rena.com/evaluate/2024-12-unruggable-invitational/findings/F-13

The fix addresses the reported issue by rejecting any DisputeGame that is blacklisted by the Guardian when the game is resolved incorrectly.

However, the fix fails to account for the `DISPUTE_GAME_FINALITY_DELAY_SECONDS` in [OptimismPortal2.sol#L67](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L1/OptimismPortal2.sol#L67). This is known as the [Air-gap period](https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html#air-gap), where a game is only considered finalized when it is resolved for at least `DISPUTE_GAME_FINALITY_DELAY_SECONDS`. The purpose of it is to provide sufficient time for the Guardian to blacklist any incorrectly resolved games.

Furthermore, this air-gap period check extends beyond withdrawal finalization as it is used in [AnchorStateRegisty#L203-L248](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/AnchorStateRegistry.sol#L203-L248), to determine if the game claim is finalized in a generic manner.

```Solidity
    /// @notice Returns whether a game is finalized.
    /// @param _game The game to check.
    /// @return Whether the game is finalized.
    function isGameFinalized(IDisputeGame _game) public view returns (bool) {
        // Game must be resolved.
        if (!isGameResolved(_game)) {
            return false;
        }

        // Game must be beyond the airgap period.
        if (!isGameAirgapped(_game)) {
            return false;
        }
        return true;
    }

    /// @notice Returns whether a game's root claim is valid.
    /// @param _game The game to check.
    /// @return Whether the game's root claim is valid.
    function isGameClaimValid(IDisputeGame _game) public view returns (bool) {
        // Game must be a proper game.
        bool properGame = isGameProper(_game);
        if (!properGame) {
            return false;
        }

        // Must be respected.
        bool respected = isGameRespected(_game);
        if (!respected) {
            return false;
        }

        // Game must be finalized.
        bool finalized = isGameFinalized(_game);
        if (!finalized) {
            return false;
        }

        // Game must be resolved in favor of the defender.
        if (_game.status() != GameStatus.DEFENDER_WINS) {
            return false;
        }

        return true;
    }
```

## Recommendations (Previous)
It is recommended to use [`AnchorStateRegistry.isGameClaimValid()`](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/AnchorStateRegistry.sol#L203-L248) for finalized mode and also adapt it for unfinalized mode (to check game is proper, respected and not rejected). This will ensure that the verifier mirrors the OP's game verification.


## Recommendations (Latest as of 31 Jan 2025)

As the previous recommendations above are based on new contracts that are not yet deployed, it will be better to mirror the current OP's game verification based on their withdrawal for the deployed [OptimismPortal](https://github.com/ethereum-optimism/optimism/blob/v1.8.0/packages/contracts-bedrock/src/L1/OptimismPortal2.sol#L505-L518).

Specifically, the new recommendation is to add the following checks for finalized mode (`minAgeSec == 0`),
- Check game was not created before `portal.respectedGameTypeUpdatedAt`
- Ensure that the game has been resolved for at least `DISPUTE_GAME_FINALITY_DELAY_SECONDS` (passed airgapped period)

These checks currently exists in `checkWithdrawal()` in [OptimismPortal2.sol#L505-L518](https://github.com/ethereum-optimism/optimism/blob/v1.8.0/packages/contracts-bedrock/src/L1/OptimismPortal2.sol#L505-L518)
```solidity
       // The game must have been created after `respectedGameTypeUpdatedAt`. This is to prevent users from creating
        // invalid disputes against a deployed game type while the off-chain challenge agents are not watching.
        require(
            createdAt >= respectedGameTypeUpdatedAt,
            "OptimismPortal: dispute game created before respected game type was updated"
        );

        // Before a withdrawal can be finalized, the dispute game it was proven against must have been
        // resolved for at least `DISPUTE_GAME_FINALITY_DELAY_SECONDS`. This is to allow for manual
        // intervention in the event that a dispute game is resolved incorrectly.
        require(
            block.timestamp - disputeGameProxy.resolvedAt().raw() > DISPUTE_GAME_FINALITY_DELAY_SECONDS,
            "OptimismPortal: output proposal in air-gap"
        );
```

### Client:
Fixed in https://github.com/unruggable-labs/unruggable-gateways/commit/92c9fbb36dee3a11e0cff1096ce4958ac1491ae6

### Zenith:
Resolved by adding finalized mode validation to check that the selected game is finalized as follows,
```
(created > respectedGameTypeUpdatedAt && 
status == DEFENDER_WINS && 
block.timestamp - gameProxy.resolvedAt()) > DISPUTE_GAME_FINALITY_DELAY_SECONDS)
```

Note that in finalized mode, only games with respected game type is considered valid (`gameTypeBitMask == 0`). Also, it only consider games with `createdAt > respectedGameTypeUpdatedAt` as games with `createdAt <= respectedGameTypeUpdatedAt` are considered retired in OP now.