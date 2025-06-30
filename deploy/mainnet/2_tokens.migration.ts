import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import { Bridge__factory, ERC20MintableBurnable__factory } from "@ethers-v6";

import { getConfig } from "../config/config";

export = async (deployer: Deployer) => {
  const config = await getConfig();

  const bridgeAddr = await (await deployer.deployed(Bridge__factory, "Bridge")).getAddress();

  const tokensInfo: [string, string][] = [];

  for (let i = 0; i < config.wrappedERC20Tokens.length; i++) {
    const currentConfig = config.wrappedERC20Tokens[i];
    const currentToken = await deployer.deploy(
      ERC20MintableBurnable__factory,
      [currentConfig.name, currentConfig.symbol, currentConfig.decimals, bridgeAddr],
      { name: currentConfig.name },
    );

    tokensInfo.push([`${currentConfig.name} ERC20`, await currentToken.getAddress()]);
  }

  Reporter.reportContracts(...tokensInfo);
};
