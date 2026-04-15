import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { wei } from "@scripts";

import { Reverter } from "@test-helpers";

import { ERC20MintableBurnable, NativeHandlerMock } from "@ethers-v6";

describe("NativeHandler", () => {
  const reverter = new Reverter();

  const baseAmount = wei("10");
  const referralId = "123";

  let OWNER: SignerWithAddress;

  let destinationToken: ERC20MintableBurnable;
  let handler: NativeHandlerMock;

  before("setup", async () => {
    [OWNER] = await ethers.getSigners();

    const ERC20MB = await ethers.getContractFactory("ERC20MintableBurnable");
    destinationToken = await ERC20MB.deploy("DestinationMock", "DMK", 18, OWNER.address);

    const NativeHandlerMock = await ethers.getContractFactory("NativeHandlerMock");
    handler = await NativeHandlerMock.deploy();

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("depositNative", () => {
    it("should deposit native", async () => {
      await handler.depositNative("receiver", "kovan", referralId, {
        value: baseAmount,
      });

      expect(await ethers.provider.getBalance(await handler.getAddress())).to.equal(baseAmount);

      const depositEvent = (await handler.queryFilter(handler.filters.DepositedNative, -1))[0];

      expect(depositEvent.eventName).to.be.equal("DepositedNative");
      expect(depositEvent.args.amount).to.be.equal(baseAmount);
      expect(depositEvent.args.receiver).to.be.equal("receiver");
      expect(depositEvent.args.network).to.be.equal("kovan");
    });

    it("should emit event correctly", async () => {
      const tx = await handler.depositNative("receiver", "kovan", referralId, {
        value: baseAmount,
      });
      await expect(tx).to.emit(handler, "DepositedNative").withArgs(baseAmount, "receiver", "kovan", referralId);
    });

    it("should revert when try deposit 0 tokens", async () => {
      await expect(handler.depositNative("receiver", "kovan", referralId, { value: 0 })).to.be.revertedWith(
        "NativeHandler: zero value",
      );
    });
  });

  describe("depositNativeAndSwap", () => {
    const expectedDestinationAmount = wei("200");
    const swapDeadline = 1234567890;

    it("should deposit native", async () => {
      await handler.depositNativeAndSwap(
        destinationToken,
        expectedDestinationAmount,
        swapDeadline,
        "receiver",
        "kovan",
        referralId,
        {
          value: baseAmount,
        },
      );

      expect(await ethers.provider.getBalance(await handler.getAddress())).to.equal(baseAmount);

      const depositEvent = (await handler.queryFilter(handler.filters.BridgedNativeAndSwapped, -1))[0];

      expect(depositEvent.eventName).to.be.equal("BridgedNativeAndSwapped");
      expect(depositEvent.args.amount).to.be.equal(baseAmount);
      expect(depositEvent.args.destinationToken).to.be.equal(destinationToken);
      expect(depositEvent.args.minDestinationAmount).to.be.equal(expectedDestinationAmount);
      expect(depositEvent.args.swapDeadline).to.be.equal(swapDeadline);
      expect(depositEvent.args.receiver).to.be.equal("receiver");
      expect(depositEvent.args.network).to.be.equal("kovan");
    });

    it("should emit event correctly", async () => {
      const tx = await handler.depositNativeAndSwap(
        destinationToken,
        expectedDestinationAmount,
        swapDeadline,
        "receiver",
        "kovan",
        referralId,
        {
          value: baseAmount,
        },
      );
      await expect(tx)
        .to.emit(handler, "BridgedNativeAndSwapped")
        .withArgs(
          baseAmount,
          destinationToken,
          expectedDestinationAmount,
          swapDeadline,
          "receiver",
          "kovan",
          referralId,
        );
    });

    it("should revert when try deposit 0 tokens", async () => {
      await expect(
        handler.depositNativeAndSwap(
          destinationToken,
          expectedDestinationAmount,
          swapDeadline,
          "receiver",
          "kovan",
          referralId,
          {
            value: 0,
          },
        ),
      ).to.be.revertedWith("NativeHandler: zero value");
    });

    it("should not revert when destination token address is 0", async () => {
      await expect(
        handler.depositNativeAndSwap(
          ethers.ZeroAddress,
          expectedDestinationAmount,
          swapDeadline,
          "receiver",
          "kovan",
          referralId,
          {
            value: baseAmount,
          },
        ),
      ).to.not.be.reverted;
    });

    it("should revert when min destination amount is 0", async () => {
      await expect(
        handler.depositNativeAndSwap(destinationToken, wei("0"), swapDeadline, "receiver", "kovan", referralId, {
          value: baseAmount,
        }),
      ).to.be.revertedWith("NativeHandler: min destination amount is zero");
    });
  });

  describe("getNativeSignHash", () => {
    it("should encode args", async () => {
      let expectedTxHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
      let expectedNonce = "1794147";
      let expectedChainId = 31378;

      let signHash0 = await handler.getNativeSignHash(
        baseAmount,
        OWNER,
        expectedTxHash,
        expectedNonce,
        expectedChainId,
      );

      expect(signHash0).to.be.equal(
        ethers.keccak256(
          ethers.solidityPacked(
            ["uint256", "address", "bytes32", "uint256", "uint256"],
            [baseAmount, OWNER.address, expectedTxHash, expectedNonce, expectedChainId],
          ),
        ),
      );

      let signHash1 = await handler.getNativeSignHash(wei("1"), OWNER, expectedTxHash, expectedNonce, expectedChainId);

      expect(signHash1).to.be.equal(
        ethers.keccak256(
          ethers.solidityPacked(
            ["uint256", "address", "bytes32", "uint256", "uint256"],
            [wei("1"), OWNER.address, expectedTxHash, expectedNonce, expectedChainId],
          ),
        ),
      );

      expect(signHash0).to.not.be.equal(signHash1);
    });
  });

  describe("withdrawNative", () => {
    it("should withdraw native", async () => {
      await handler.depositNative("receiver", "kovan", referralId, { value: baseAmount });
      await handler.withdrawNative(baseAmount, OWNER);

      expect(await ethers.provider.getBalance(await handler.getAddress())).to.equal(0);
    });

    it("should revert when amount is 0", async () => {
      await expect(handler.withdrawNative(0, OWNER)).to.be.revertedWith("NativeHandler: amount is zero");
    });

    it("should revert when receiver address is 0", async () => {
      await expect(handler.withdrawNative(baseAmount, ethers.ZeroAddress)).to.be.revertedWith(
        "NativeHandler: receiver is zero",
      );
    });

    it("should revert when amount more than balance", async () => {
      await expect(handler.withdrawNative(wei("1000000"), OWNER)).to.be.revertedWith("NativeHandler: can't send eth");
    });
  });
});
