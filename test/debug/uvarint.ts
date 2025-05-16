function readUvarint(v: Uint8Array, pos = 0) {
  let u = 0n;
  for (let i = 0; ; i += 7) {
    const x = v[pos++];
    u |= BigInt(x & 127) << BigInt(i);
    if (x < 127) break;
  }
  return u;
}

console.log(readUvarint(Uint8Array.of(0x96, 0x01), 0));
