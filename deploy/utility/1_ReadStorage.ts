import { Deployer } from "@solarity/hardhat-migrate";

import { ethers } from "hardhat";

export = async (deployer: Deployer) => {
  const content = await ethers.provider.getStorage(
    "0xE5f565b9167710fa6717b71D56dD6a70561e3815", // Proxy contract
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", // Proxy Impl slot
  );

  console.log(content);
};

// npx hardhat --network bridgelessMainnet migrate --namespace utility --only 1
