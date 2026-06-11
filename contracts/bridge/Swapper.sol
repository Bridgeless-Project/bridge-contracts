// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "../utils/Strings.sol";

import "../interfaces/bridge/IBridge.sol";
import "../interfaces/bridge/ISwapper.sol";
import "../interfaces/uniswap-v2/IUniswapV2Router.sol";

contract Swapper is
    ISwapper,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using Address for address payable;
    using Strings for string;
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    string public network;
    IBridge public bridge;
    address public uniswapV2Router;

    modifier validateSwapParams(SwapParams calldata swapParams_) {
        _validateSwapParams(swapParams_);
        _;
    }

    function __Swapper_init(
        string calldata network_,
        address bridgeAddress_,
        address uniswapV2RouterAddress_,
        address[] calldata operators_
    ) external initializer {
        __AccessControlEnumerable_init();
        __ReentrancyGuard_init();

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

    function swapAndRoute(
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_
    ) external nonReentrant validateSwapParams(swapParams_) {
        IERC20(swapParams_.path[0]).safeTransferFrom(
            msg.sender,
            address(this),
            swapParams_.amountIn
        );

        _swapAndRoute(swapParams_, destinationDepositParams_);

        emit SwappedAndRouted(swapParams_, destinationDepositParams_);
    }

    function swapETHAndRoute(
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_
    ) external payable nonReentrant validateSwapParams(swapParams_) {
        require(msg.value == swapParams_.amountIn, "Swapper: msg.value does not match amountIn");
        require(
            !swapParams_.isDestinationTokenNative,
            "Swapper: native-to-native swap not supported"
        );

        _swapAndRoute(swapParams_, destinationDepositParams_);

        emit SwappedETHAndRouted(swapParams_, destinationDepositParams_);
    }

    function withdrawSwapAndRoute(
        WithdrawParams calldata withdrawParams_,
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_
    ) external onlyRole(OPERATOR_ROLE) nonReentrant validateSwapParams(swapParams_) {
        require(
            withdrawParams_.token == swapParams_.path[0],
            "Swapper: withdraw token does not match swap path"
        );
        require(
            withdrawParams_.amount == swapParams_.amountIn,
            "Swapper: withdraw amount does not match swap amountIn"
        );

        _withdrawFromBridge(withdrawParams_);

        _swapWithFallbackAndRoute(swapParams_, destinationDepositParams_, fallbackDepositParams_);
    }

    function isCurrentNetwork(string calldata network_) public view returns (bool) {
        return keccak256(abi.encodePacked(network_)) == keccak256(abi.encodePacked(network));
    }

    function _swapAndRoute(
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_
    ) internal {
        uint256 destinationAmount_ = _swap(swapParams_);

        _routeDestination(
            destinationAmount_,
            swapParams_.path[swapParams_.path.length - 1],
            destinationDepositParams_,
            swapParams_.isDestinationTokenNative
        );
    }

    function _swapWithFallbackAndRoute(
        SwapParams calldata swapParams_,
        DepositParams calldata destinationDepositParams_,
        DepositParams calldata fallbackDepositParams_
    ) internal {
        (bool swapSuccess_, uint256 destinationAmount_) = _trySwap(swapParams_);

        if (swapSuccess_) {
            _routeDestination(
                destinationAmount_,
                swapParams_.path[swapParams_.path.length - 1],
                destinationDepositParams_,
                swapParams_.isDestinationTokenNative
            );
        } else {
            _handleCrossChainDepositFallback(
                swapParams_.path[0],
                swapParams_.amountIn,
                fallbackDepositParams_
            );
        }
    }

    function _swap(SwapParams calldata swapParams_) internal returns (uint256) {
        (bool swapSuccess_, uint256 destinationAmount_) = _trySwap(swapParams_);
        require(swapSuccess_, "Swapper: swap failed");

        return destinationAmount_;
    }

    function _trySwap(SwapParams calldata swapParams_) internal returns (bool, uint256) {
        if (!_isETHSwap()) {
            _safeApproveERC20(swapParams_.path[0], uniswapV2Router, swapParams_.amountIn);
        }

        bytes memory swapCallData_ = _buildSwapCallData(swapParams_);
        (bool success_, bytes memory returndata_) = uniswapV2Router.call{value: msg.value}(
            swapCallData_
        );

        if (!success_) {
            return (false, 0);
        }

        uint256[] memory amounts_ = abi.decode(returndata_, (uint256[]));

        return (true, amounts_[amounts_.length - 1]);
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
            _depositToBridge(destinationToken_, amount_, params_);

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
        _depositToBridge(sourceToken_, amount_, fallbackParams_);

        emit CrossChainERC20FallbackDeposited(
            sourceToken_,
            amount_,
            fallbackParams_.receiver,
            fallbackParams_.network,
            fallbackParams_.isWrapped,
            fallbackParams_.referralId
        );
    }

    function _safeApproveERC20(address tokenAddress_, address spender_, uint256 amount_) internal {
        IERC20 token_ = IERC20(tokenAddress_);
        token_.safeApprove(spender_, 0);
        token_.safeApprove(spender_, amount_);
    }

    function _withdrawFromBridge(WithdrawParams calldata withdrawParams_) internal {
        bridge.withdrawERC20(
            withdrawParams_.token,
            withdrawParams_.amount,
            address(this),
            withdrawParams_.txHash,
            withdrawParams_.txNonce,
            withdrawParams_.isWrapped,
            withdrawParams_.signatures
        );
    }

    function _depositToBridge(
        address token_,
        uint256 amount_,
        DepositParams calldata depositParams_
    ) internal {
        _safeApproveERC20(token_, address(bridge), amount_);

        bridge.depositERC20(
            token_,
            amount_,
            depositParams_.receiver,
            depositParams_.network,
            depositParams_.isWrapped,
            depositParams_.referralId
        );
    }

    function _isETHSwap() internal view returns (bool) {
        return msg.value > 0;
    }

    function _buildSwapCallData(
        SwapParams calldata swapParams_
    ) internal view returns (bytes memory) {
        if (_isETHSwap()) {
            return
                abi.encodeWithSelector(
                    IUniswapV2Router.swapExactETHForTokens.selector,
                    swapParams_.minDestinationAmount,
                    swapParams_.path,
                    address(this),
                    swapParams_.swapDeadline
                );
        }

        if (swapParams_.isDestinationTokenNative) {
            return
                abi.encodeWithSelector(
                    IUniswapV2Router.swapExactTokensForETH.selector,
                    swapParams_.amountIn,
                    swapParams_.minDestinationAmount,
                    swapParams_.path,
                    address(this),
                    swapParams_.swapDeadline
                );
        }

        return
            abi.encodeWithSelector(
                IUniswapV2Router.swapExactTokensForTokens.selector,
                swapParams_.amountIn,
                swapParams_.minDestinationAmount,
                swapParams_.path,
                address(this),
                swapParams_.swapDeadline
            );
    }

    function _validateSwapParams(SwapParams calldata swapParams_) internal pure {
        require(swapParams_.path.length > 1, "Swapper: path length is less than 2");
    }
}
