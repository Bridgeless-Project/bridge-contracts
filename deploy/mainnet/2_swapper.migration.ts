import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { Bridge__factory, Swapper__factory, UniswapV2RouterMock__factory } from "@ethers-v6";

import { getConfig } from "../config/config";

export = async (deployer: Deployer) => {
  const config = await getConfig();

  const bridge = await deployer.deployed(Bridge__factory, "Bridge proxy");

  const swapperInitData = Swapper__factory.createInterface().encodeFunctionData("__Swapper_init", [
    config.networkName,
    await bridge.getAddress(),
    config.uniswapV2Router,
    config.swapperOperators,
  ]);

  const swapper = await deployer.deployERC1967Proxy(Swapper__factory, swapperInitData, { name: "Swapper" });

  Reporter.reportContracts(["Swapper", await swapper.getAddress()]);
};
