import type { BigNumberish, HexString, HexString32 } from './types.js';
import { isHexString } from 'ethers/utils';
import { sha256 } from 'ethers/crypto';
import { CachedValue } from './cached.js';
import { getBytes } from 'ethers/utils';

export async function fetchBeaconData(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw `HTTP ${res.status}`;
    const { data } = await res.json();
    if (!data) throw 'expected "data"';
    return data;
  } catch (err) {
    throw new Error(`${url}: ${err}`);
  }
}

export function beaconConfigCache(beaconAPI: string) {
  return Object.assign(
    new CachedValue(async () => {
      const [genesis, spec] = await Promise.all([
        fetchBeaconData(`${beaconAPI}/eth/v1/beacon/genesis`),
        fetchBeaconData(`${beaconAPI}/eth/v1/config/spec`),
      ]);
      const temp = {
        genesisTime: BigInt(genesis.genesis_time),
        secondsPerSlot: BigInt(spec.SECONDS_PER_SLOT),
        fetchSidecars(t: bigint) {
          return fetchSidecars(
            beaconAPI,
            (t - this.genesisTime) / this.secondsPerSlot
          );
        },
      };
      return temp;
    }, Infinity),
    { beaconAPI }
  );
}

export type BlobSidecar = {
  blob: HexString;
  kzg_commitment: HexString;
};

// https://ethereum.github.io/beacon-APIs/#/Beacon/getBlobSidecars
function isSidecar(sidecar: any): sidecar is BlobSidecar {
  return (
    sidecar instanceof Object &&
    'blob' in sidecar &&
    'kzg_commitment' in sidecar &&
    isHexString(sidecar.blob) &&
    sidecar.blob.length == 262146 &&
    isHexString(sidecar.kzg_commitment) &&
    sidecar.kzg_commitment.length == 98
  );
}

// https://github.com/ethereum/go-ethereum/blob/c1ff2d8ba973f9f7ebfbf45e3c36f8d3299846ba/crypto/kzg4844/kzg4844.go#L154
function blobVersionHashFromKzgCommitment(
  kzgCommitment: HexString
): HexString32 {
  return '0x01' + sha256(kzgCommitment).slice(4);
}

export async function fetchSidecars(beaconAPI: string, blockId: BigNumberish) {
  const sidecars = await fetchBeaconData(
    `${beaconAPI}/eth/v1/beacon/blob_sidecars/${blockId}`
  );
  if (!Array.isArray(sidecars))
    throw new Error(`expected blob sidecars: ${blockId}`);
  return Object.fromEntries(
    sidecars
      .filter(isSidecar)
      .map((x) => [blobVersionHashFromKzgCommitment(x.kzg_commitment), x])
  );
}
