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

    function transferSwapAndRoute(
        uint256 amountIn_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        bool isSourceTokenNative_,
        bool isDestinationTokenNative_
    ) external payable {
        uint256 destinationAmount_ = _transferAndSwap(
            amountIn_,
            swapParams_,
            isSourceTokenNative_,
            isDestinationTokenNative_
        );

        _routeDestination(
            destinationAmount_,
            swapParams_.path[swapParams_.path.length - 1],
            destinationDepositParams_,
            isDestinationTokenNative_
        );
    }

    function withdrawSwapAndRoute(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_,
        bool isDestinationTokenNative_
    ) external onlyRole(OPERATOR_ROLE) {
        (bool swapSuccess_, uint256 destinationAmount_) = _withdrawAndSwap(
            withdrawParams_,
            swapParams_,
            fallbackDepositParams_,
            isDestinationTokenNative_
        );

        if (!swapSuccess_) return;

        _routeDestination(
            destinationAmount_,
            swapParams_.path[swapParams_.path.length - 1],
            destinationDepositParams_,
            isDestinationTokenNative_
        );
    }

    function _routeDestination(
        uint256 destinationAmount_,
        address destinationToken_,
        DepositParams calldata destinationDepositParams_,
        bool isDestinationTokenNative_
    ) internal {
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

    function _transferAndSwap(
        uint256 amountIn_,
        SwapParams calldata swapParams_,
        bool isSourceTokenNative_,
        bool isDestinationTokenNative_
    ) internal returns (uint256) {
        require(swapParams_.path.length > 1, "Swapper: path length is less than 2");

        uint256[] memory amounts_;
        if (isSourceTokenNative_) {
            require(msg.value == amountIn_, "Swapper: msg.value does not match amountIn_");
            require(!isDestinationTokenNative_, "Swapper: native-to-native swap not supported");

            amounts_ = IUniswapV2Router(uniswapV2Router).swapExactETHForTokens{value: amountIn_}(
                swapParams_.minDestinationAmount,
                swapParams_.path,
                address(this),
                swapParams_.swapDeadline
            );
        } else {
            require(msg.value == 0, "Swapper: msg.value must be 0 for ERC20 source");

            address sourceToken_ = swapParams_.path[0];

            IERC20(sourceToken_).safeTransferFrom(msg.sender, address(this), amountIn_);

            _approveERC20(sourceToken_, uniswapV2Router, amountIn_);

            if (isDestinationTokenNative_) {
                amounts_ = IUniswapV2Router(uniswapV2Router).swapExactTokensForETH(
                    amountIn_,
                    swapParams_.minDestinationAmount,
                    swapParams_.path,
                    address(this),
                    swapParams_.swapDeadline
                );
            } else {
                amounts_ = IUniswapV2Router(uniswapV2Router).swapExactTokensForTokens(
                    amountIn_,
                    swapParams_.minDestinationAmount,
                    swapParams_.path,
                    address(this),
                    swapParams_.swapDeadline
                );
            }
        }

        return amounts_[amounts_.length - 1];
    }

    function _withdrawAndSwap(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata fallbackDepositParams_,
        bool isDestinationTokenNative_
    ) internal returns (bool, uint256) {
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
            _handleCrossChainDepositFallback(
                sourceToken_,
                withdrawParams_.amount,
                fallbackDepositParams_
            );

            return (false, 0);
        }

        uint256[] memory amounts_ = abi.decode(returndata_, (uint256[]));

        return (true, amounts_[amounts_.length - 1]);
    }

    function _handleLocalTransfer(
        string memory receiverStr_,
        address destinationToken_,
        uint256 amount_,
        bool isDestinationTokenNative_
    ) internal {
        address receiver_ = receiverStr_.parseAddress();

        if (isDestinationTokenNative_) {
            payable(receiver_).sendValue(amount_);

            emit LocalNativeTransferred(amount_, receiver_);
        } else {
            IERC20(destinationToken_).safeTransfer(receiver_, amount_);

            emit LocalERC20Transferred(amount_, receiver_, destinationToken_);
        }
    }

    function _handleCrossChainDeposit(
        DepositParams calldata params_,
        address destinationToken_,
        uint256 amount_,
        bool isDestinationTokenNative_
    ) internal {
        if (isDestinationTokenNative_) {
            bridge.depositNative{value: amount_}(
                params_.receiver,
                params_.network,
                params_.referralId
            );

            emit CrossChainNativeDeposited(
                amount_,
                params_.receiver,
                params_.network,
                params_.referralId
            );
        } else {
            _approveERC20(destinationToken_, address(bridge), amount_);
            bridge.depositERC20(
                destinationToken_,
                amount_,
                params_.receiver,
                params_.network,
                params_.isWrapped,
                params_.referralId
            );

            emit CrossChainERC20Deposited(
                destinationToken_,
                amount_,
                params_.receiver,
                params_.network,
                params_.isWrapped,
                params_.referralId
            );
        }
    }

    function _handleCrossChainDepositFallback(
        address sourceToken_,
        uint256 amount_,
        DepositParams calldata fallbackParams_
    ) internal {
        _approveERC20(sourceToken_, address(bridge), amount_);

        bridge.depositERC20(
            sourceToken_,
            amount_,
            fallbackParams_.receiver,
            fallbackParams_.network,
            fallbackParams_.isWrapped,
            fallbackParams_.referralId
        );

        emit CrossChainERC20FallbackDeposited(
            sourceToken_,
            amount_,
            fallbackParams_.receiver,
            fallbackParams_.network,
            fallbackParams_.isWrapped,
            fallbackParams_.referralId
        );
    }

    function _approveERC20(address tokenAddress_, address spender_, uint256 amount_) internal {
        IERC20 token_ = IERC20(tokenAddress_);
        token_.safeApprove(spender_, 0);
        token_.safeApprove(spender_, amount_);
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
