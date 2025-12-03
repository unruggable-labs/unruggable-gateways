# Notes on Succinct

* 2025-12-02
    * [AnchorStateRegistry](https://sepolia.etherscan.io/address/0xD73BA8168A61F3E917F0930D5C0401aA47e269D6) was changed &rarr; reason: unknown
    * Encountered a successfully challenged game
        * Game [`1155`](https://sepolia.etherscan.io/address/0x68B24E467BBA4bEEEFe521f6909c82966979eE38)
        * Game [`1156`](https://sepolia.etherscan.io/address/0xD6aCF2FDB062E81Bcdc2B6f9682aaFceA55C63AE#readContract) &rarr; `ChallengedAndValidProofProvided`
        * Game Count: `1422`
        * Finder runs out of gas with some providers &rarr; reason: `_isChallenged()` is O(n^2)


