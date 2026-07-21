import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { Bridge__factory, Swapper__factory, UniswapV2RouterMock__factory } from "@ethers-v6";

import { getConfig } from "../config/config";

export = async (deployer: Deployer) => {
  const config = await getConfig();

  let bridgeAddress: string;
  if (config.swapper.bridgeAddress) {
    bridgeAddress = config.swapper.bridgeAddress;
  } else {
    const bridge = await deployer.deployed(Bridge__factory, "contracts/bridge/Bridge.sol:Bridge proxy");

    bridgeAddress = await bridge.getAddress();
  }

  const swapperInitData = Swapper__factory.createInterface().encodeFunctionData("__Swapper_init", [
    config.swapper.networkName,
    bridgeAddress,
    config.swapper.uniswapV2Router,
    config.swapper.operators,
  ]);

  const swapper = await deployer.deployERC1967Proxy(Swapper__factory, swapperInitData);

  Reporter.reportContracts(["Swapper", await swapper.getAddress()]);
};
