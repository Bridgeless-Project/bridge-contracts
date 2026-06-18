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
     * @param token The token to withdraw
     * @param amount The amount of assets to withdraw
     * @param txHash The hash of the transaction that withdrew the assets
     * @param txNonce The nonce of the transaction that withdrew the assets
     * @param isWrapped Whether the assets are wrapped
     * @param merkleProof The merkle proof of the withdrawal
     * @param signatures The signatures of the signers that authorized the withdrawal
     */
    struct WithdrawParams {
        address token;
        uint256 amount;
        bytes32 txHash;
        uint256 txNonce;
        bool isWrapped;
        bytes32[] merkleProof;
        bytes[] signatures;
    }

    /**
     * @notice The parameters for swapping assets on the Uniswap V2 pool
     * @param amountIn The amount of assets to swap
     * @param minDestinationAmount The minimum amount of assets to receive after swapping
     * @param swapDeadline The deadline of the swap transaction
     * @param path The path of the swap
     * @param isDestinationTokenNative Whether the destination token is native
     */
    struct SwapParams {
        uint256 amountIn;
        uint256 minDestinationAmount;
        uint256 swapDeadline;
        address[] path;
        bool isDestinationTokenNative;
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
     * @notice Emitted when ERC20 assets are withdrawn from the Bridge using a merkle proof
     * @param token The token that was withdrawn
     * @param amount The amount of assets that were withdrawn
     * @param receiver The receiver of the assets
     * @param txHash The hash of the transaction that withdrew the assets
     * @param txNonce The nonce of the transaction that withdrew the assets
     * @param isWrapped Whether the assets are wrapped
     * @param merkleProof The merkle proof of the withdrawal
     * @param signatures The signatures of the signers that authorized the withdrawal
     */
    event ERC20MerkelizedWithdrawn(
        address token,
        uint256 amount,
        address receiver,
        bytes32 txHash,
        uint256 txNonce,
        bool isWrapped,
        bytes32[] merkleProof,
        bytes[] signatures
    );

    /**
     * @notice Emitted when ERC20 assets are withdrawn from the Bridge
     * @param token The token that was withdrawn
     * @param amount The amount of assets that were withdrawn
     * @param receiver The receiver of the assets
     * @param txHash The hash of the transaction that withdrew the assets
     * @param txNonce The nonce of the transaction that withdrew the assets
     * @param isWrapped Whether the assets are wrapped
     * @param signatures The signatures of the signers that authorized the withdrawal
     */
    event ERC20Withdrawn(
        address token,
        uint256 amount,
        address receiver,
        bytes32 txHash,
        uint256 txNonce,
        bool isWrapped,
        bytes[] signatures
    );

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
     * @param swapParams_ The parameters for swapping assets on the Uniswap V2 pool
     * @param destinationDepositParams_ The parameters for depositing destination assets
     */
    function swapAndRoute(
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_
    ) external;

    /**
     * @notice Accepts native assets from the msg.sender, swaps them on the Uniswap V2 pool, and routes them to the destination network
     * @param swapParams_ The parameters for swapping assets on the Uniswap V2 pool
     * @param destinationDepositParams_ The parameters for depositing destination assets
     */
    function swapETHAndRoute(
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_
    ) external payable;

    /**
     * @notice Withdraws assets from the Bridge, swaps them on the Uniswap V2 pool, and routes them to the destination network
     * @param withdrawParams_ The parameters for withdrawing assets from the Bridge
     * @param swapParams_ The parameters for swapping assets on the Uniswap V2 pool
     * @param destinationDepositParams_ The parameters for depositing destination assets
     * @param fallbackDepositParams_ The parameters for depositing assets back into the Bridge if the swap fails
     */
    function withdrawSwapAndRoute(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_
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
