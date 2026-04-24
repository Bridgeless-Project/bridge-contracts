import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { Bridge__factory } from "@ethers-v6";

import { getConfig } from "../config/config";

export = async (deployer: Deployer) => {
  const config = await getConfig();

  const bridgeInitData = Bridge__factory.createInterface().encodeFunctionData("__Bridge_init", [
    config.bridgeSigners,
    config.signersThreshold,
  ]);

  const bridge = await deployer.deployERC1967Proxy(Bridge__factory, bridgeInitData, { name: "Bridge" });

  await bridge.transferOwnership(config.bridgeOwner);

  Reporter.reportContracts(["Bridge", await bridge.getAddress()]);
};
