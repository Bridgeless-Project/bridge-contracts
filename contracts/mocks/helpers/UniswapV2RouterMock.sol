// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "../../interfaces/tokens/IERC20MintableBurnable.sol";

contract UniswapV2RouterMock {
    event SwapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] path,
        address to,
        uint256 deadline
    );
    event SwapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] path,
        address to,
        uint256 deadline
    );
    event SwapExactETHForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] path,
        address to,
        uint256 deadline
    );

    bool public willRevert;

    receive() external payable {}

    function setWillRevert(bool willRevert_) external {
        willRevert = willRevert_;
    }

    function swapExactTokensForTokens(
        uint256 amountIn_,
        uint256 amountOutMin_,
        address[] calldata path_,
        address to_,
        uint256 deadline_
    ) external returns (uint256[] memory amounts_) {
        if (willRevert) {
            revert("UniswapV2RouterMock: will revert");
        }

        IERC20MintableBurnable(path_[0]).transferFrom(msg.sender, address(this), amountIn_);
        IERC20MintableBurnable(path_[path_.length - 1]).mintTo(to_, amountOutMin_);

        amounts_ = new uint256[](path_.length);

        for (uint256 i = 0; i < path_.length - 1; i++) {
            amounts_[i] = i + 1;
        }

        amounts_[path_.length - 1] = amountOutMin_;

        emit SwapExactTokensForTokens(amountIn_, amountOutMin_, path_, to_, deadline_);
    }

    function swapExactTokensForETH(
        uint256 amountIn_,
        uint256 amountOutMin_,
        address[] calldata path_,
        address to_,
        uint256 deadline_
    ) external returns (uint256[] memory amounts_) {
        if (willRevert) {
            revert("UniswapV2RouterMock: will revert");
        }

        IERC20MintableBurnable(path_[0]).transferFrom(msg.sender, address(this), amountIn_);
        (bool success, ) = to_.call{value: amountOutMin_}(new bytes(0));
        require(success, "UniswapV2RouterMock: ETH transfer failed");

        amounts_ = new uint256[](path_.length);

        for (uint256 i = 0; i < path_.length - 1; i++) {
            amounts_[i] = i + 1;
        }

        amounts_[path_.length - 1] = amountOutMin_;

        emit SwapExactTokensForETH(amountIn_, amountOutMin_, path_, to_, deadline_);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin_,
        address[] calldata path_,
        address to_,
        uint256 deadline_
    ) external payable returns (uint256[] memory amounts_) {
        if (willRevert) {
            revert("UniswapV2RouterMock: will revert");
        }

        uint256 amountIn_ = msg.value;

        (bool success, ) = to_.call{value: amountIn_}(new bytes(0));
        require(success, "UniswapV2RouterMock: ETH transfer failed");

        IERC20MintableBurnable(path_[path_.length - 1]).mintTo(to_, amountOutMin_);

        amounts_ = new uint256[](path_.length);

        for (uint256 i = 0; i < path_.length - 1; i++) {
            amounts_[i] = i + 1;
        }

        amounts_[path_.length - 1] = amountOutMin_;

        emit SwapExactETHForTokens(amountIn_, amountOutMin_, path_, to_, deadline_);
    }
}
