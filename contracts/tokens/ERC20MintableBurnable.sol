// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/tokens/IERC20MintableBurnable.sol";

contract ERC20MintableBurnable is IERC20MintableBurnable, Ownable, ERC20 {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address owner_
    ) ERC20(name_, symbol_) {
        transferOwnership(owner_);

        _decimals = decimals_;
    }

    function mintTo(address receiver_, uint256 amount_) external override onlyOwner {
        _mint(receiver_, amount_);
    }

    function burnFrom(address payer_, uint256 amount_) external override onlyOwner {
        _spendAllowance(payer_, msg.sender, amount_);
        _burn(payer_, amount_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
