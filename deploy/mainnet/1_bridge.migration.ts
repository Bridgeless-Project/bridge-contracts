import { Deployer } from "@solarity/hardhat-migrate";

import { Bridge__factory } from "@ethers-v6";

import { getConfig } from "../config/config";

export = async (deployer: Deployer) => {
  const config = await getConfig();

  const bridgeInitData = Bridge__factory.createInterface().encodeFunctionData("__Bridge_init(address[],uint256)", [
    config.bridgeSigners,
    config.signersThreshold,
  ]);

  const bridge = await deployer.deployProxy(
    Bridge__factory,
    "ERC1967Proxy",
    (implementationAddress: string): any[] => {
      return [implementationAddress, bridgeInitData];
    },
    { name: "Bridge" },
  );

  await bridge.transferOwnership(config.bridgeOwner);
};
