import { DeployConfig } from "./types";

export const deployConfig: DeployConfig = {
  bridgeOwner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  bridgeSigners: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
  signersThreshold: 1n,
  wrappedERC20Tokens: [
    {
      name: "ETHX",
      symbol: "ETHX",
      decimals: 18n,
    },
    {
      name: "BTCX",
      symbol: "BTCX",
      decimals: 8n,
    },
  ],
};
