import hre from "hardhat";

import { DeployConfig } from "./types";

export async function getConfig(): Promise<DeployConfig> {
  if (hre.network.name == "localhost" || hre.network.name == "hardhat") {
    return validateConfig((await import("./localhost")).deployConfig);
  }

  if (hre.network.name == "sepolia") {
    return validateConfig((await import("./sepolia")).deployConfig);
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

  return config;
}
