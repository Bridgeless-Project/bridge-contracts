import { DeployConfig } from "./types";

export const deployConfig: DeployConfig = {
  bridgeOwner: "0x69A18eb6829DC6c3896e46866A2e07027bA1F7cE",
  bridgeSigners: ["0xE5B686fdE8574f158bEe618E370B652C6C33f8c8"],
  signersThreshold: 1n,
  wrappedERC20Tokens: [
    {
      name: "ETH",
      symbol: "ETH",
      decimals: 18n,
    },
    {
      name: "BTC",
      symbol: "BTC",
      decimals: 8n,
    },
    {
      name: "ZANO",
      symbol: "ZANO",
      decimals: 12n,
    },
    {
      name: "BNB",
      symbol: "BNB",
      decimals: 18n,
    },
    {
      name: "DAI",
      symbol: "DAI",
      decimals: 18n,
    },
    {
      name: "USDT",
      symbol: "USDT",
      decimals: 6n,
    },
  ],
  swapper: {
    networkName: "13441",
    uniswapV2Router: "0x0000000000000000000000000000000000000000",
    operators: [],
  },
};
