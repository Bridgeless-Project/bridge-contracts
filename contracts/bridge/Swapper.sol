// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "../utils/Strings.sol";

import "../interfaces/bridge/IBridge.sol";
import "../interfaces/bridge/ISwapper.sol";
import "../interfaces/uniswap-v2/IUniswapV2Router.sol";

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
        address uniswapV2RouterAddress_,
        address[] calldata operators_
    ) external initializer {
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        network = network_;
        bridge = IBridge(bridgeAddress_);
        uniswapV2Router = uniswapV2RouterAddress_;

        for (uint256 i = 0; i < operators_.length; i++) {
            _grantRole(OPERATOR_ROLE, operators_[i]);
        }
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
            _approveERC20(destinationToken_, address(bridge), amount_);
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

        _approveERC20(sourceToken_, uniswapV2Router, withdrawParams_.amount);

        bytes memory swapCallData_ = _buildSwapCallData(
            swapParams_.path,
            withdrawParams_.amount,
            swapParams_.minDestinationAmount,
            swapParams_.swapDeadline,
            isDestinationTokenNative_
        );

        (bool success_, bytes memory returndata_) = uniswapV2Router.call(swapCallData_);

        if (!success_) {
            _handleSwapFallback(
                sourceToken_,
                withdrawParams_.amount,
                swapParams_.path[swapParams_.path.length - 1],
                fallbackDepositParams_
            );

            return (false, new uint256[](0));
        }

        return (true, abi.decode(returndata_, (uint256[])));
    }

    function _approveERC20(address tokenAddress_, address spender_, uint256 amount_) internal {
        IERC20 token_ = IERC20(tokenAddress_);

        token_.safeApprove(spender_, 0);
        token_.safeApprove(spender_, amount_);
    }

    function _handleSwapFallback(
        address sourceToken_,
        uint256 amount_,
        address targetToken_,
        DepositParams calldata fallbackParams_
    ) internal {
        _approveERC20(sourceToken_, address(bridge), amount_);

        bridge.depositERC20(
            sourceToken_,
            amount_,
            fallbackParams_.receiver,
            fallbackParams_.network,
            fallbackParams_.isWrapped,
            0
        );

        emit WithdrewSwappedAndFallbackDeposited(
            sourceToken_,
            amount_,
            targetToken_,
            fallbackParams_.receiver,
            fallbackParams_.network,
            fallbackParams_.isWrapped
        );
    }

    function isCurrentNetwork(string calldata network_) public view returns (bool) {
        return keccak256(abi.encodePacked(network_)) == keccak256(abi.encodePacked(network));
    }

    function _buildSwapCallData(
        address[] calldata path_,
        uint256 amount_,
        uint256 minDestinationAmount_,
        uint256 swapDeadline_,
        bool isDestinationTokenNative_
    ) internal view returns (bytes memory) {
        return
            abi.encodeWithSelector(
                isDestinationTokenNative_
                    ? IUniswapV2Router(uniswapV2Router).swapExactTokensForETH.selector
                    : IUniswapV2Router(uniswapV2Router).swapExactTokensForTokens.selector,
                amount_,
                minDestinationAmount_,
                path_,
                address(this),
                swapDeadline_
            );
    }
}
