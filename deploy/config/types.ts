export type DeployConfig = {
  bridgeOwner: string;
  bridgeSigners: string[];
  signersThreshold: bigint;
  wrappedERC20Tokens: ERC20TokenConfig[];
  swapper: SwapperConfig;
};

export type SwapperConfig = {
  bridgeAddress?: string;
  networkName: string;
  uniswapV2Router: string;
  operators: string[];
};

export type ERC20TokenConfig = {
  name: string;
  symbol: string;
  decimals: bigint;
};
