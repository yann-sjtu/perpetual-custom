import { ethers } from 'hardhat';

export async function mineAvgBlock() {
  await ethers.provider.send('evm_increaseTime', [15]);
  await ethers.provider.send('evm_mine', []);
}

export async function fastForward(seconds: number) {
  await ethers.provider.send('evm_increaseTime', [seconds]);
  await ethers.provider.send('evm_mine', []);
}
