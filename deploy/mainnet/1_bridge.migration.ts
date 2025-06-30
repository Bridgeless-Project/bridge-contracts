import { Deployer } from "@solarity/hardhat-migrate";

import { Bridge__factory } from "@ethers-v6";

import { getConfig } from "../config/config";

export = async (deployer: Deployer) => {
  const config = await getConfig();

  const bridge = await deployer.deployERC1967Proxy(Bridge__factory, { name: "Bridge" });

  await bridge.__Bridge_init(config.bridgeSigners, config.signersThreshold);
  await bridge.transferOwnership(config.bridgeOwner);
};
