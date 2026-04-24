import hre from "hardhat";

import { DeployConfig } from "./types";

export async function getConfig(): Promise<DeployConfig> {
  if (hre.network.name == "localhost" || hre.network.name == "hardhat") {
    return validateConfig((await import("./localhost")).deployConfig);
  }

  if (hre.network.name == "sepolia") {
    return validateConfig((await import("./sepolia")).deployConfig);
  }

  if (hre.network.name == "bridgelessTest") {
    return validateConfig((await import("./bridgelessTest")).deployConfig);
  }

  if (hre.network.name == "bridgelessMainnet") {
    return validateConfig((await import("./bridgelessMainnet")).deployConfig);
  }

  if (hre.network.name == "eth_mainnet") {
    return validateConfig((await import("./eth_mainnet")).deployConfig);
  }

  if (hre.network.name == "bsc") {
    return validateConfig((await import("./bsc")).deployConfig);
  }

  throw new Error(`Config for network ${hre.network.name} is not specified`);
}

function validateConfig(config: DeployConfig): DeployConfig {
  if (config.signersThreshold == 0n) {
    throw new Error("Invalid signersThreshold value");
  }

  if (config.bridgeSigners.length == 0) {
    throw new Error("Invalid bridge signers addresses");
  }

  if (!config.swapper) {
    throw new Error("Invalid swapper config");
  }

  if (config.swapper.bridgeAddress && config.swapper.bridgeAddress == "0x0000000000000000000000000000000000000000") {
    throw new Error("Invalid bridge address");
  }

  if (config.swapper.networkName == "") {
    throw new Error("Invalid swapper network name");
  }

  if (config.swapper.operators.length == 0) {
    throw new Error("Invalid swapper operators addresses");
  }
  for (const operator of config.swapper.operators) {
    if (operator == "0x0000000000000000000000000000000000000000") {
      throw new Error("Invalid swapper operator address");
    }
  }

  return config;
}
