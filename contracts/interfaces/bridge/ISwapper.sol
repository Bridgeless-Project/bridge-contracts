// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IBridge.sol";

/**
 * @notice The Swapper contract
 *
 * The Swapper contract is responsible for withdrawing assets from the Bridge, swapping them on the Uniswap V2 pool,
 * and routing them to the destination network.
 *
 * Only authorized accounts can use this contract.
 */
interface ISwapper {
    /**
     * @notice The parameters for withdrawing assets from the Bridge
     * @param amount The amount of assets to withdraw
     * @param txHash The hash of the transaction that withdrew the assets
     * @param txNonce The nonce of the transaction that withdrew the assets
     * @param isWrapped Whether the assets are wrapped
     * @param signatures The signatures of the signers that authorized the withdrawal
     */
    struct WithdrawParams {
        uint256 amount;
        bytes32 txHash;
        uint256 txNonce;
        bool isWrapped;
        bytes[] signatures;
    }

    /**
     * @notice The parameters for swapping assets on the Uniswap V2 pool
     * @param minDestinationAmount The minimum amount of assets to receive after swapping
     * @param swapDeadline The deadline of the swap transaction
     * @param path The path of the swap
     */
    struct SwapParams {
        uint256 minDestinationAmount;
        uint256 swapDeadline;
        address[] path;
    }

    /**
     * @notice The parameters for depositing assets back into the Bridge
     * @param receiver The receiver of the assets
     * @param network The network of the assets
     * @param isWrapped Whether the assets are wrapped
     * @param referralId The referral id
     */
    struct DepositParams {
        string receiver;
        string network;
        bool isWrapped;
        uint16 referralId;
    }

    /**
     * @notice Emitted when ERC20 assets are deposited back into the Bridge after a swap fails
     * @param token The token that was deposited
     * @param amount The amount of tokens that were deposited
     * @param receiver The receiver of the tokens
     * @param network The destination network of the tokens
     * @param isWrapped Whether the tokens are wrapped
     * @param referralId The referral id
     */
    event CrossChainERC20FallbackDeposited(
        address token,
        uint256 amount,
        string receiver,
        string network,
        bool isWrapped,
        uint16 referralId
    );

    /**
     * @notice Emitted when native assets are transferred locally
     * @param amount The amount of assets that were transferred
     * @param receiver The receiver of the assets
     */
    event LocalNativeTransferred(uint256 amount, address receiver);

    /**
     * @notice Emitted when ERC20 assets are transferred locally
     * @param amount The amount of assets that were transferred
     * @param receiver The receiver of the assets
     * @param token The token that was transferred
     */
    event LocalERC20Transferred(uint256 amount, address receiver, address token);

    /**
     * @notice Emitted when native assets are deposited into the Bridge
     * @param amount The amount of assets that were deposited
     * @param receiver The receiver of the assets
     * @param network The destination network of the assets
     * @param referralId The referral id
     */
    event CrossChainNativeDeposited(
        uint256 amount,
        string receiver,
        string network,
        uint16 referralId
    );

    /**
     * @notice Emitted when ERC20 assets are deposited into the Bridge
     * @param token The token that was deposited
     * @param amount The amount of tokens that were deposited
     * @param receiver The receiver of the tokens
     * @param network The destination network of the tokens
     * @param isWrapped Whether the tokens are wrapped
     * @param referralId The referral id
     */
    event CrossChainERC20Deposited(
        address token,
        uint256 amount,
        string receiver,
        string network,
        bool isWrapped,
        uint16 referralId
    );

    /**
     * @notice Transfers assets from the msg.sender, swaps them on the Uniswap V2 pool, and routes them to the destination network
     * @param amountIn_ The amount of assets to transfer
     * @param swapParams_ The parameters for swapping assets on the Uniswap V2 pool
     * @param destinationDepositParams_ The parameters for depositing destination assets
     * @param isSourceTokenNative_ Whether the source token is native
     * @param isDestinationTokenNative_ Whether the destination token is native
     */
    function transferSwapAndRoute(
        uint256 amountIn_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        bool isSourceTokenNative_,
        bool isDestinationTokenNative_
    ) external payable;

    /**
     * @notice Withdraws assets from the Bridge, swaps them on the Uniswap V2 pool, and routes them to the destination network
     * @param withdrawParams_ The parameters for withdrawing assets from the Bridge
     * @param swapParams_ The parameters for swapping assets on the Uniswap V2 pool
     * @param destinationDepositParams_ The parameters for depositing destination assets
     * @param fallbackDepositParams_ The parameters for depositing assets back into the Bridge if the swap fails
     * @param isDestinationTokenNative_ Whether the destination token is native
     */
    function withdrawSwapAndRoute(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_,
        bool isDestinationTokenNative_
    ) external;

    /**
     * @notice Returns whether the given network is the current network
     * @param network_ The network to check
     * @return True if the given network is the current network, false otherwise
     */
    function isCurrentNetwork(string calldata network_) external view returns (bool);

    /**
     * @notice Returns the current network
     * @return The current network
     */
    function network() external view returns (string memory);

    /**
     * @notice Returns the bridge contract
     * @return The bridge contract
     */
    function bridge() external view returns (IBridge);

    /**
     * @notice Returns the Uniswap V2 router contract
     * @return The Uniswap V2 router contract
     */
    function uniswapV2Router() external view returns (address);
}
