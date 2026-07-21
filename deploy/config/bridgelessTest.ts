import { DeployConfig } from "./types";

export const deployConfig: DeployConfig = {
  bridgeOwner: "0x69A18eb6829DC6c3896e46866A2e07027bA1F7cE",
  bridgeSigners: ["0xB43B91E063BeB208f3bAdf884938f661B5759953"],
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
    networkName: "2607",
    bridgeAddress: "",
    uniswapV2Router: "",
    operators: [],
  },
};
