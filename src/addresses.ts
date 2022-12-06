import fs from 'fs';

export type DeploymentsAddress = {
  [chainId: number]: { [contractName: string]: string };
};

export function saveDeploymentsAddress(
  deploymentsAddr: DeploymentsAddress,
  deploymentsDir: string
) {
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  fs.writeFileSync(
    deploymentsDir + '/deployments.json',
    JSON.stringify(deploymentsAddr)
  );
}

export const addressBook = {
  P1Orders: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
  PerpetualProxy: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  PerpetualV1: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  WETH9: '0x9A676e781A523b5d0C0e43731313A708CB607508',
  MockToken: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  P1FundingOracle: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  P1MakerOracle: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
};
