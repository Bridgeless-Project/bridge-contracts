export type DeployConfig = {
  bridgeOwner: string;
  bridgeSigners: string[];
  signersThreshold: bigint;
  wrappedERC20Tokens: ERC20TokenConfig[];
  networkName: string;
  uniswapV2Router: string;
  swapperOperators: string[];
};

export type ERC20TokenConfig = {
  name: string;
  symbol: string;
  decimals: bigint;
};
