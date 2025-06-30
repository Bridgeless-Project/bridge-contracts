import { DeployConfig } from "./types";

export const deployConfig: DeployConfig = {
  bridgeOwner: "0x69A18eb6829DC6c3896e46866A2e07027bA1F7cE",
  bridgeSigners: ["0x25255A7170F7A66cE14Fe98626CA268A03315F65"],
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
