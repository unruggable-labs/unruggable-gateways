import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.soneiumMinatoConfig, {
  // https://soneium-minato.blockscout.com/address/0xb3664493FB8414d3Dad1275aC0E8a12Ef859694d?tab=contract
  slotDataContract: '0xb3664493FB8414d3Dad1275aC0E8a12Ef859694d',
  // https://soneium-minato.blockscout.com/address/0x424Ea3fe5e105444d5a03Ae6DFe4423b5af3CE01?tab=contract
  slotDataPointer: '0x424Ea3fe5e105444d5a03Ae6DFe4423b5af3CE01',
  skipCI: true,
});
