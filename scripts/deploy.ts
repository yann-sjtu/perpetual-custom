import { deploy } from './helpers';

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy(true).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
