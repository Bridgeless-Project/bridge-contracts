// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract Signers is OwnableUpgradeable {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public signaturesThreshold;

    EnumerableSet.AddressSet internal _signers;

    function __Signers_init(
        address[] calldata signers_,
        uint256 signaturesThreshold_
    ) public onlyInitializing {
        __Ownable_init();

        addSigners(signers_);
        setSignaturesThreshold(signaturesThreshold_);
    }

    function _checkCorrectSigners(address[] memory signers_) private view {
        uint256 bitMap;

        for (uint256 i = 0; i < signers_.length; i++) {
            require(_signers.contains(signers_[i]), "Signers: invalid signer");

            uint256 bitKey = 2 ** (uint256(uint160(signers_[i])) >> 152);

            require(bitMap & bitKey == 0, "Signers: duplicate signers");

            bitMap |= bitKey;
        }

        require(signers_.length >= signaturesThreshold, "Signers: threshold is not met");
    }

    function _checkSignatures(bytes32 signHash_, bytes[] calldata signatures_) internal view {
        address[] memory signers_ = new address[](signatures_.length);

        for (uint256 i = 0; i < signatures_.length; i++) {
            signers_[i] = signHash_.toEthSignedMessageHash().recover(signatures_[i]);
        }

        _checkCorrectSigners(signers_);
    }

    function setSignaturesThreshold(uint256 signaturesThreshold_) public onlyOwner {
        require(signaturesThreshold_ > 0, "Signers: invalid threshold");

        signaturesThreshold = signaturesThreshold_;
    }

    function addSigners(address[] calldata signers_) public onlyOwner {
        for (uint256 i = 0; i < signers_.length; i++) {
            _checkZeroSigner(signers_[i]);

            _signers.add(signers_[i]);
        }
    }

    function removeSigners(address[] calldata signers_) public onlyOwner {
        for (uint256 i = 0; i < signers_.length; i++) {
            _signers.remove(signers_[i]);
        }
    }

    function updateSigner(
        address signerToUpdate_,
        uint256 deadline_,
        bool isAdding_,
        bytes[] calldata signatures_
    ) external {
        require(deadline_ >= block.timestamp, "Signers: update signer signature expired");

        bytes32 signHash_ = getUpdateSignersSignHash(signerToUpdate_, deadline_, isAdding_);

        _checkSignatures(signHash_, signatures_);

        if (isAdding_) {
            _checkZeroSigner(signerToUpdate_);

            require(_signers.add(signerToUpdate_), "Signers: signer already exists");
        } else {
            require(_signers.remove(signerToUpdate_), "Signers: signer does not exist");
        }
    }

    function getSigners() external view returns (address[] memory) {
        return _signers.values();
    }

    function getUpdateSignersSignHash(
        address signerToUpdate_,
        uint256 deadline_,
        bool isAdding_
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(signerToUpdate_, deadline_, isAdding_));
    }

    function _checkZeroSigner(address signer_) internal pure {
        require(signer_ != address(0), "Signers: zero signer");
    }
}
