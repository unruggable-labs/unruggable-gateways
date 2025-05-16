// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

library Zlib {
    uint8 constant CM_DEFLATE = 8;

    function decompress(bytes memory src) external pure {
        // bits 0 to 3  CM     Compression method
        // bits 4 to 7  CINFO  Compression info
        if ((uint8(src[0]) & 15) != CM_DEFLATE) return;
        uint256 window = 1 << (uint256(uint8(src[0]) >> 4) + 8);

        // bits 0 to 4  FCHECK  (check bits for CMF and FLG)
        // bit  5       FDICT   (preset dictionary)
        // bits 6 to 7  FLEVEL  (compression level)
        if ((uint8(src[1]) & (1 << 5)) == 0) return; // FDICT unsupported
        if ((((uint256(uint8(src[0])) << 8) | (uint8(src[1]))) % 31) > 0)
            return; // FCHECK

        uint256 level = uint8(src[1]) >> 6; // bits 6 to 7  FLEVEL (compression level)
    }
}
