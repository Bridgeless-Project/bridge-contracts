// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "../utils/Strings.sol";

import "../interfaces/bridge/IBridge.sol";
import "../interfaces/bridge/ISwapper.sol";
import "../interfaces/uniswap-v2/periphery/IUniswapV2Router02.sol";

contract Swapper is ISwapper, AccessControlEnumerableUpgradeable, UUPSUpgradeable {
    using Address for address payable;
    using Strings for string;
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    string public network;
    IBridge public bridge;
    address public uniswapV2Router;

    function __Swapper_init(
        string calldata network_,
        address bridgeAddress_,
        address uniswapV2RouterAddress_
    ) external initializer {
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        network = network_;
        bridge = IBridge(bridgeAddress_);
        uniswapV2Router = uniswapV2RouterAddress_;
    }

    receive() external payable {}

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function executeSwapAndRoute(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_,
        bool isDestinationTokenNative_
    ) external onlyRole(OPERATOR_ROLE) {
        (bool swapSuccess_, uint256[] memory amounts_) = _withdrawAndSwap(
            withdrawParams_,
            swapParams_,
            fallbackDepositParams_,
            isDestinationTokenNative_
        );

        if (!swapSuccess_) {
            return;
        }

        address destinationToken_ = swapParams_.path[swapParams_.path.length - 1];
        uint256 destinationAmount_ = amounts_[amounts_.length - 1];

        if (isCurrentNetwork(destinationDepositParams_.network)) {
            _handleLocalTransfer(
                destinationDepositParams_.receiver,
                destinationToken_,
                destinationAmount_,
                isDestinationTokenNative_
            );
        } else {
            _handleCrossChainDeposit(
                destinationDepositParams_,
                destinationToken_,
                destinationAmount_,
                isDestinationTokenNative_
            );
        }
    }

    function _handleLocalTransfer(
        string calldata receiverStr_,
        address destinationToken_,
        uint256 amount_,
        bool isDestinationTokenNative_
    ) internal {
        address receiver_ = receiverStr_.parseAddress();

        if (isDestinationTokenNative_) {
            payable(receiver_).sendValue(amount_);
        } else {
            IERC20(destinationToken_).safeTransfer(receiver_, amount_);
        }
    }

    function _handleCrossChainDeposit(
        DepositParams calldata params_,
        address destinationToken_,
        uint256 amount_,
        bool isDestinationTokenNative_
    ) internal {
        if (isDestinationTokenNative_) {
            bridge.depositNative{value: amount_}(params_.receiver, params_.network, 0);
        } else {
            IERC20(destinationToken_).safeApprove(address(bridge), 0);
            IERC20(destinationToken_).safeApprove(address(bridge), amount_);
            bridge.depositERC20(
                destinationToken_,
                amount_,
                params_.receiver,
                params_.network,
                params_.isWrapped,
                0
            );
        }
    }

    function _withdrawAndSwap(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata fallbackDepositParams_,
        bool isDestinationTokenNative_
    ) internal returns (bool, uint256[] memory) {
        require(swapParams_.path.length > 1, "Swapper: path length is less than 2");

        address sourceToken_ = swapParams_.path[0];

        bridge.withdrawERC20(
            sourceToken_,
            withdrawParams_.amount,
            address(this),
            withdrawParams_.txHash,
            withdrawParams_.txNonce,
            withdrawParams_.isWrapped,
            withdrawParams_.signatures
        );

        IERC20(sourceToken_).safeApprove(uniswapV2Router, 0);
        IERC20(sourceToken_).safeApprove(uniswapV2Router, withdrawParams_.amount);

        bytes memory swapCallData = isDestinationTokenNative_
            ? abi.encodeWithSelector(
                IUniswapV2Router02(uniswapV2Router).swapExactTokensForETH.selector,
                withdrawParams_.amount,
                swapParams_.minDestinationAmount,
                swapParams_.path,
                address(this),
                swapParams_.swapDeadline
            )
            : abi.encodeWithSelector(
                IUniswapV2Router02(uniswapV2Router).swapExactTokensForTokens.selector,
                withdrawParams_.amount,
                swapParams_.minDestinationAmount,
                swapParams_.path,
                address(this),
                swapParams_.swapDeadline
            );

        (bool success_, bytes memory returndata_) = uniswapV2Router.call(swapCallData);

        if (!success_) {
            IERC20(sourceToken_).safeApprove(address(bridge), 0);
            IERC20(sourceToken_).safeApprove(address(bridge), withdrawParams_.amount);

            bridge.depositERC20(
                sourceToken_,
                withdrawParams_.amount,
                fallbackDepositParams_.receiver,
                fallbackDepositParams_.network,
                fallbackDepositParams_.isWrapped,
                0
            );

            emit WithdrewSwappedAndFallbackDeposited(
                sourceToken_,
                withdrawParams_.amount,
                swapParams_.path[swapParams_.path.length - 1],
                fallbackDepositParams_.receiver,
                fallbackDepositParams_.network,
                fallbackDepositParams_.isWrapped
            );

            return (false, new uint256[](0));
        }

        return (true, abi.decode(returndata_, (uint256[])));
    }

    function isCurrentNetwork(string calldata network_) public view returns (bool) {
        return keccak256(abi.encodePacked(network_)) == keccak256(abi.encodePacked(network));
    }
}
