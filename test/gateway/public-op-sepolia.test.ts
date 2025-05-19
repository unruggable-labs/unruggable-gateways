import { Foundry } from '@adraffy/blocksmith';
import { providerURL } from '../providers.js';
import { CHAINS } from '../../src/chains.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';
import { runSlotDataTests } from './SlotDataTests.js';

describe.skipIf(!!process.env.IS_CI)('public: optimism-sepolia', async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(CHAINS.SEPOLIA),
    infoLog: false,
  });
  afterAll(foundry.shutdown);
  const contract = await foundry.deploy({
    file: 'SlotDataReader',
    args: [
      // OPFaultVerifier
      // https://gateway-docs.unruggable.com/verifiers/deployments?chain=op-sepolia
      // optimism-sepolia.verifier.unruggable.eth
      // https://optimism-sepolia.gateway.unruggable.com
      // https://sepolia.etherscan.io/address/0x5F1681D608e50458D96F43EbAb1137bA1d2A2E4D#readContract
      '0x5F1681D608e50458D96F43EbAb1137bA1d2A2E4D',
      // SlotDataContract (from op-sepolia.test.ts)
      // https://sepolia.etherscan.io/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#readContract
      '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
      // https://sepolia-optimism.etherscan.io/address/0x433F956Aa4E72DA4Da098416fD07e061b23fa73F#code
      '0x433F956Aa4E72DA4Da098416fD07e061b23fa73F',
      [],
    ],
  });
  runSlotDataTests(contract, { slotDataPointer: true });
});
