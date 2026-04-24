// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract ReentrantMock {
    address public target;
    bytes public reentryCallData;

    constructor(address target_, bytes memory reentryCallData_) {
        target = target_;
        reentryCallData = reentryCallData_;
    }

    receive() external payable {}

    fallback() external payable {
        (bool success, ) = target.call(reentryCallData);
        require(success, "ReentrantMock: reentry call failed");
    }
}
