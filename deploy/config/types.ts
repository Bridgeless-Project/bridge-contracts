import { BigNumberish } from "ethers";

export type DeployConfig = {
  bridgeOwner: string;
  bridgeSigners: string[];
  signersThreshold: bigint;
  wrappedERC20Tokens: ERC20TokenConfig[];
};

export type ERC20TokenConfig = {
  name: string;
  symbol: string;
  decimals: bigint;
};
