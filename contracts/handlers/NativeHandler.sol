// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../interfaces/handlers/INativeHandler.sol";

abstract contract NativeHandler is INativeHandler {
    function depositNative(
        string calldata receiver_,
        string calldata network_,
        uint16 referralId_
    ) external payable override {
        require(msg.value > 0, "NativeHandler: zero value");

        emit DepositedNative(msg.value, receiver_, network_, referralId_);
    }

    function bridgeAndSwapNative(
        address destinationToken_,
        uint256 minDestinationAmount_,
        uint256 swapDeadline_,
        string calldata receiver_,
        string calldata network_,
        uint16 referralId_
    ) external payable override {
        require(msg.value > 0, "NativeHandler: zero value");
        require(destinationToken_ != address(0), "NativeHandler: zero destination token");
        require(minDestinationAmount_ > 0, "NativeHandler: min destination amount is zero");

        emit BridgeAndSwappedNative(
            msg.value,
            destinationToken_,
            minDestinationAmount_,
            swapDeadline_,
            receiver_,
            network_,
            referralId_
        );
    }

    receive() external payable {}

    function _withdrawNative(uint256 amount_, address receiver_) internal {
        require(amount_ > 0, "NativeHandler: amount is zero");
        require(receiver_ != address(0), "NativeHandler: receiver is zero");

        (bool sent_, ) = payable(receiver_).call{value: amount_}("");

        require(sent_, "NativeHandler: can't send eth");
    }

    function getNativeSignHash(
        uint256 amount_,
        address receiver_,
        bytes32 txHash_,
        uint256 txNonce_,
        uint256 chainId_
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(amount_, receiver_, txHash_, txNonce_, chainId_));
    }
}
