import { DeployConfig } from "./types";

export const deployConfig: DeployConfig = {
  bridgeOwner: "0x69A18eb6829DC6c3896e46866A2e07027bA1F7cE",
  bridgeSigners: ["0xE5B686fdE8574f158bEe618E370B652C6C33f8c8"],
  signersThreshold: 1n,
  wrappedERC20Tokens: [
    {
      name: "BRIDGE",
      symbol: "BRIDGE",
      decimals: 18n,
    },
    {
      name: "ZANOX",
      symbol: "ZANOX",
      decimals: 12n,
    },
  ],
};
