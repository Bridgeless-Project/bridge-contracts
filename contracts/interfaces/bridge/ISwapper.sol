// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
     */
    struct DepositParams {
        string receiver;
        string network;
        bool isWrapped;
    }

    event WithdrewSwappedAndFallbackDeposited(
        address initialToken,
        uint256 initialAmount,
        address destinationToken,
        string receiver,
        string network,
        bool isWrapped
    );

    /**
     * @notice Withdraws assets from the Bridge, swaps them on the Uniswap V2 pool, and routes them to the destination network
     * @param withdrawParams_ The parameters for withdrawing assets from the Bridge
     * @param swapParams_ The parameters for swapping assets on the Uniswap V2 pool
     * @param destinationDepositParams_ The parameters for depositing destination assets
     * @param fallbackDepositParams_ The parameters for depositing assets back into the Bridge if the swap fails
     * @param isDestinationTokenNative_ Whether the destination token is native
     */
    function executeSwapAndRoute(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_,
        bool isDestinationTokenNative_
    ) external;
}
