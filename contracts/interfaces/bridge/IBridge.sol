// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../handlers/IERC20Handler.sol";
import "../handlers/IERC721Handler.sol";
import "../handlers/IERC1155Handler.sol";
import "../handlers/INativeHandler.sol";

/**
 * @notice The Bridge contract
 *
 * The Bridge contract acts as a permissioned way of transfering assets (ERC20, ERC721, ERC1155, Native) between
 * 2 different blockchains.
 *
 * In order to correctly use the Bridge, one has to deploy both instances of the contract on the base chain and the
 * destination chain, as well as setup a trusted backend that will act as a `signer`.
 *
 * Each Bridge contract can either give or take the user assets when they want to transfer tokens. Both liquidity pool
 * and mint-and-burn way of transferring assets are supported.
 *
 * IMPORTANT
 *
 * All of the signers' addresses must differ in they first (the most significant) 8 bits in order to pass a bloom filtering.
 */
interface IBridge is IERC20Handler, IERC721Handler, IERC1155Handler, INativeHandler {
    /**
     * @notice function for updating the set of authorized signers by adding or removing one address
     * @param signerToUpdate_ address to be added or removed from the signers set
     * @param startTime_ unix timestamp indicating when the signer update becomes active
     * @param deadline_ unix timestamp after which the signatures are no longer valid
     * @param txNonce_ nonce used to prevent replay of the same update request
     * @param isAdding_ true to add `signerToUpdate_`, false to remove it
     * @param signatures_ signatures from existing signers authorizing this update
     */
    function updateSigner(
        address signerToUpdate_,
        uint256 startTime_,
        uint256 deadline_,
        uint256 txNonce_,
        bool isAdding_,
        bytes[] calldata signatures_
    ) external;

    /**
     * @notice function for withdrawing erc20 tokens
     * @param token_ the address of withdrawn token
     * @param amount_ the amount of withdrawn tokens
     * @param receiver_ the address of withdraw receiver
     * @param txHash_ the hash of deposit transaction
     * @param txNonce_ the nonce of deposit transaction
     * @param isWrapped_ the boolean flag, if true - tokens will be minted, false - tokens will be transferred
     * @param signatures_ the array of signatures. Formed by signing a sign hash by each signer.
     */
    function withdrawERC20(
        address token_,
        uint256 amount_,
        address receiver_,
        bytes32 txHash_,
        uint256 txNonce_,
        bool isWrapped_,
        bytes[] calldata signatures_
    ) external;

    /**
     * @notice function for withdrawing erc20 tokens using merkle proof
     * @param token_ the address of withdrawn token
     * @param amount_ the amount of withdrawn tokens
     * @param receiver_ the address of withdraw receiver
     * @param txHash_ the hash of deposit transaction
     * @param txNonce_ the nonce of deposit transaction
     * @param isWrapped_ the boolean flag, if true - tokens will be minted, false - tokens will be transferred
     * @param merkleProof_ the array of merkle proof nodes
     * @param signatures_ the array of signatures. Formed by signing a sign hash by each signer.
     */
    function withdrawERC20Merkelized(
        address token_,
        uint256 amount_,
        address receiver_,
        bytes32 txHash_,
        uint256 txNonce_,
        bool isWrapped_,
        bytes32[] calldata merkleProof_,
        bytes[] calldata signatures_
    ) external;

    /**
     * @notice function for withdrawing erc721 tokens
     * @param token_ the address of withdrawn token
     * @param tokenId_ the id of withdrawn token
     * @param receiver_ the address of withdraw receiver
     * @param txHash_ the hash of deposit transaction
     * @param txNonce_ the nonce of deposit transaction
     * @param tokenURI_ the string URI to token metadata
     * @param isWrapped_ the boolean flag, if true - tokens will be minted, false - tokens will be transferred
     * @param signatures_ the array of signatures. Formed by signing a sign hash by each signer.
     */
    function withdrawERC721(
        address token_,
        uint256 tokenId_,
        address receiver_,
        bytes32 txHash_,
        uint256 txNonce_,
        string calldata tokenURI_,
        bool isWrapped_,
        bytes[] calldata signatures_
    ) external;

    /**
     * @notice function for withdrawing erc1155 tokens
     * @param token_ the address of withdrawn token
     * @param tokenId_ the id of withdrawn token
     * @param amount_ the amount of withdrawn tokens
     * @param receiver_ the address of withdraw receiver
     * @param txHash_ the hash of deposit transaction
     * @param txNonce_ the nonce of deposit transaction
     * @param tokenURI_ the string URI to token metadata
     * @param isWrapped_ the boolean flag, if true - tokens will be minted, false - tokens will be transferred
     * @param signatures_ the array of signatures. Formed by signing a sign hash by each signer.
     */
    function withdrawERC1155(
        address token_,
        uint256 tokenId_,
        uint256 amount_,
        address receiver_,
        bytes32 txHash_,
        uint256 txNonce_,
        string calldata tokenURI_,
        bool isWrapped_,
        bytes[] calldata signatures_
    ) external;

    /**
     * @notice function for withdrawing native currency
     * @param amount_ the amount of withdrawn native currency
     * @param receiver_ the address of withdraw receiver
     * @param txHash_ the hash of deposit transaction
     * @param txNonce_ the nonce of deposit transaction
     * @param signatures_ the array of signatures. Formed by signing a sign hash by each signer.
     */
    function withdrawNative(
        uint256 amount_,
        address receiver_,
        bytes32 txHash_,
        uint256 txNonce_,
        bytes[] calldata signatures_
    ) external;

    /**
     * @notice function for computing the sign hash used by signers to authorize signer updates
     * @param signerToUpdate_ address being added or removed
     * @param startTime_ unix timestamp indicating when the signer update becomes active
     * @param deadline_ unix timestamp after which the signatures are no longer valid
     * @param txNonce_ nonce included in the hash to prevent replay
     * @param isAdding_ indicates whether the operation is an add (true) or remove (false)
     * @return bytes32 the message hash that signers should sign
     */
    function getUpdateSignersSignHash(
        address signerToUpdate_,
        uint256 startTime_,
        uint256 deadline_,
        uint256 txNonce_,
        bool isAdding_
    ) external pure returns (bytes32);
}
