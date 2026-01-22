import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { wei } from "@scripts";
import { getSignature, Reverter } from "@test-helpers";

import { ERC20MintableBurnable, Bridge, ERC721MintableBurnable, ERC1155MintableBurnable } from "@ethers-v6";

describe("Bridge", () => {
  const reverter = new Reverter();

  const baseBalance = wei("1000");
  const baseId = "5000";
  const tokenURI = "https://some.link";
  const txHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
  const txNonce = "1794147";
  const referralId = "123";

  const hash = ethers.keccak256(ethers.solidityPacked(["bytes32", "uint256"], [txHash, txNonce]));

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let THIRD: SignerWithAddress;
  let FOURTH: SignerWithAddress;

  let bridge: Bridge;
  let erc20: ERC20MintableBurnable;
  let erc721: ERC721MintableBurnable;
  let erc1155: ERC1155MintableBurnable;

  function hashNode(node1: string, node2: string): string {
    if (BigInt(node1) <= BigInt(node2)) {
      return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [node1, node2]);
    } else {
      return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [node2, node1]);
    }
  }

  before("setup", async () => {
    [OWNER, SECOND, THIRD, FOURTH] = await ethers.getSigners();

    const Bridge = await ethers.getContractFactory("Bridge");

    bridge = await Bridge.deploy();
    await bridge.__Bridge_init([OWNER.address], "1");

    const ERC20MB = await ethers.getContractFactory("ERC20MintableBurnable");
    const ERC721MB = await ethers.getContractFactory("ERC721MintableBurnable");
    const ERC1155MB = await ethers.getContractFactory("ERC1155MintableBurnable");

    erc20 = await ERC20MB.deploy("Mock", "MK", 18, OWNER.address);
    await erc20.mintTo(OWNER.address, baseBalance);
    await erc20.approve(await bridge.getAddress(), baseBalance);

    erc721 = await ERC721MB.deploy("Mock", "MK", OWNER.address, "");
    await erc721.mintTo(OWNER.address, baseId, tokenURI);
    await erc721.approve(await bridge.getAddress(), baseId);

    erc1155 = await ERC1155MB.deploy("Mock", "MK", "URI", OWNER.address);
    await erc1155.mintTo(OWNER.address, baseId, baseBalance, tokenURI);
    await erc1155.setApprovalForAll(await bridge.getAddress(), true);

    await erc20.transferOwnership(await bridge.getAddress());
    await erc721.transferOwnership(await bridge.getAddress());
    await erc1155.transferOwnership(await bridge.getAddress());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("should not initialize twice", async () => {
      await expect(bridge.__Bridge_init([OWNER.address], "1")).to.be.rejectedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("only owner should call these functions", async () => {
      await expect(erc20.mintTo(OWNER.address, 1)).to.be.rejectedWith("Ownable: caller is not the owner");
      await expect(erc721.mintTo(OWNER.address, 1, "")).to.be.rejectedWith("Ownable: caller is not the owner");
      await expect(erc1155.mintTo(OWNER.address, 1, 1, "")).to.be.rejectedWith("Ownable: caller is not the owner");

      await expect(erc20.burnFrom(OWNER.address, 1)).to.be.rejectedWith("Ownable: caller is not the owner");
      await expect(erc721.burnFrom(OWNER.address, 1)).to.be.rejectedWith("Ownable: caller is not the owner");
      await expect(erc1155.burnFrom(OWNER.address, 1, 1)).to.be.rejectedWith("Ownable: caller is not the owner");

      await expect(bridge.connect(SECOND).addHash(txHash, txNonce)).to.be.rejectedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("#updateSigner", () => {
    let initialSigners: string[];
    let currentTime: bigint;

    beforeEach("setup", async () => {
      initialSigners = [OWNER.address, SECOND.address, THIRD.address];
      await bridge.addSigners(initialSigners);
      await bridge.setSignaturesThreshold(2n);

      currentTime = BigInt(await time.latest());
    });

    it("should correctly add signer", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures);

      expect(await bridge.getSigners()).to.be.deep.eq([...initialSigners, FOURTH.address]);
    });

    it("should correctly remove signer", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(THIRD.address, startTime, deadline, 0n, false);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await bridge.updateSigner(THIRD, startTime, deadline, 0n, false, signatures);

      expect(await bridge.getSigners()).to.be.deep.eq([OWNER.address, SECOND.address]);
    });

    it("should get exception if try to update signer before the start time", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures)).to.be.rejectedWith(
        "Bridge: unable to update signer yet",
      );
    });

    it("should get exception if pass expired signature", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(deadline + 100n);

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures)).to.be.rejectedWith(
        "Bridge: update signer signature expired",
      );
    });

    it("should get exception if pass invalid signature", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(FOURTH, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures)).to.be.rejectedWith(
        "Signers: invalid signer",
      );
    });

    it("should get exception if the threshold is not met", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures)).to.be.rejectedWith(
        "Signers: threshold is not met",
      );
    });

    it("should get exception if try to add zero signer", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(ethers.ZeroAddress, startTime, deadline, 0n, true);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await expect(
        bridge.updateSigner(ethers.ZeroAddress, startTime, deadline, 0n, true, signatures),
      ).to.be.rejectedWith("Signers: zero signer");
    });

    it("should get exception if the signer already exists", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await bridge.addSigners([FOURTH]);

      await time.setNextBlockTimestamp(startTime + 1n);

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures)).to.be.rejectedWith(
        "Bridge: signer already exists",
      );
    });

    it("should get exception if try to remove not a signer", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, false);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, false, signatures)).to.be.rejectedWith(
        "Bridge: signer does not exist",
      );
    });

    it("should get exception if try to use signatures twice", async () => {
      const startTime = currentTime + 10n;
      const deadline = currentTime + 600n;
      const signHash = await bridge.getUpdateSignersSignHash(FOURTH.address, startTime, deadline, 0n, true);

      const signatures = [await getSignature(OWNER, signHash), await getSignature(SECOND, signHash)];

      await time.setNextBlockTimestamp(startTime + 1n);

      await bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures);

      await expect(bridge.updateSigner(FOURTH, startTime, deadline, 0n, true, signatures)).to.be.rejectedWith(
        "Hashes: the hash nonce is used",
      );
    });
  });

  describe("ERC20 flow", () => {
    it("should withdrawERC20", async () => {
      const expectedAmount = wei("100");
      const expectedIsWrapped = true;

      const signHash = await bridge.getERC20SignHash(
        await erc20.getAddress(),
        expectedAmount,
        OWNER,
        txHash,
        txNonce,
        (await ethers.provider.getNetwork()).chainId,
        expectedIsWrapped,
      );
      const signature = await getSignature(OWNER, signHash);

      await bridge.depositERC20(await erc20.getAddress(), expectedAmount, "receiver", "kovan", true, referralId);
      await bridge.withdrawERC20(await erc20.getAddress(), expectedAmount, OWNER, txHash, txNonce, expectedIsWrapped, [
        signature,
      ]);

      expect(await erc20.balanceOf(OWNER)).to.equal(baseBalance);
      expect(await erc20.balanceOf(await bridge.getAddress())).to.equal(0);

      expect(await bridge.usedHashes(hash)).to.be.true;
    });

    it("should withdrawERC20 using merkelized function", async () => {
      const expectedAmount = wei("100");
      const expectedIsWrapped = true;
      const startNonce = 0n;

      await bridge.depositERC20(await erc20.getAddress(), expectedAmount, "receiver", "kovan", true, referralId);
      await bridge.depositERC20(await erc20.getAddress(), expectedAmount * 2n, "receiver", "kovan", true, referralId);
      await bridge.depositERC20(await erc20.getAddress(), expectedAmount * 3n, "receiver", "kovan", true, referralId);

      const signHash1 = await bridge.getERC20SignHash(
        await erc20.getAddress(),
        expectedAmount,
        OWNER,
        txHash,
        startNonce,
        (await ethers.provider.getNetwork()).chainId,
        expectedIsWrapped,
      );
      const signHash2 = await bridge.getERC20SignHash(
        await erc20.getAddress(),
        expectedAmount * 2n,
        SECOND,
        txHash,
        startNonce + 1n,
        (await ethers.provider.getNetwork()).chainId,
        expectedIsWrapped,
      );
      const signHash3 = await bridge.getERC20SignHash(
        await erc20.getAddress(),
        expectedAmount * 3n,
        OWNER,
        txHash,
        startNonce + 2n,
        (await ethers.provider.getNetwork()).chainId,
        expectedIsWrapped,
      );

      const level1Hashes = [hashNode(signHash1, signHash2), hashNode(signHash3, signHash3)];
      const level2Hashes = [hashNode(level1Hashes[0], level1Hashes[1])];

      const signature = await getSignature(OWNER, level2Hashes[0]);

      let merkleProof = [signHash2, level1Hashes[1]];

      let tx = await bridge.withdrawERC20Merkelized(
        await erc20.getAddress(),
        expectedAmount,
        OWNER,
        txHash,
        startNonce,
        expectedIsWrapped,
        merkleProof,
        [signature],
      );

      await expect(tx).to.changeTokenBalance(erc20, OWNER, expectedAmount);

      merkleProof = [signHash1, level1Hashes[1]];

      tx = await bridge.withdrawERC20Merkelized(
        await erc20.getAddress(),
        expectedAmount * 2n,
        SECOND,
        txHash,
        startNonce + 1n,
        expectedIsWrapped,
        merkleProof,
        [signature],
      );

      await expect(tx).to.changeTokenBalance(erc20, SECOND, expectedAmount * 2n);

      merkleProof = [signHash3, level1Hashes[0]];

      tx = await bridge.withdrawERC20Merkelized(
        await erc20.getAddress(),
        expectedAmount * 3n,
        OWNER,
        txHash,
        startNonce + 2n,
        expectedIsWrapped,
        merkleProof,
        [signature],
      );

      await expect(tx).to.changeTokenBalance(erc20, OWNER, expectedAmount * 3n);
    });
  });

  describe("ERC721 flow", () => {
    it("should withdrawERC721", async () => {
      const expectedIsWrapped = true;

      const signHash = await bridge.getERC721SignHash(
        await erc721.getAddress(),
        baseId,
        OWNER,
        txHash,
        txNonce,
        (await ethers.provider.getNetwork()).chainId,
        tokenURI,
        expectedIsWrapped,
      );
      const signature = await getSignature(OWNER, signHash);

      await bridge.depositERC721(await erc721.getAddress(), baseId, "receiver", "kovan", expectedIsWrapped, referralId);
      await bridge.withdrawERC721(
        await erc721.getAddress(),
        baseId,
        OWNER,
        txHash,
        txNonce,
        tokenURI,
        expectedIsWrapped,
        [signature],
      );

      expect(await erc721.ownerOf(baseId)).to.equal(OWNER.address);
      expect(await erc721.tokenURI(baseId)).to.equal(tokenURI);
    });
  });

  describe("ERC1155 flow", () => {
    it("should withdrawERC1155", async () => {
      const expectedIsWrapped = true;

      const signHash = await bridge.getERC1155SignHash(
        await erc1155.getAddress(),
        baseId,
        baseBalance,
        OWNER,
        txHash,
        txNonce,
        (await ethers.provider.getNetwork()).chainId,
        tokenURI,
        expectedIsWrapped,
      );
      const signature = await getSignature(OWNER, signHash);

      await bridge.depositERC1155(
        await erc1155.getAddress(),
        baseId,
        baseBalance,
        "receiver",
        "kovan",
        expectedIsWrapped,
        referralId,
      );
      await bridge.withdrawERC1155(
        await erc1155.getAddress(),
        baseId,
        baseBalance,
        OWNER,
        txHash,
        txNonce,
        tokenURI,
        expectedIsWrapped,
        [signature],
      );

      expect(await erc1155.balanceOf(OWNER, baseId)).to.equal(baseBalance);
      expect(await bridge.usedHashes(hash)).to.be.true;
    });
  });

  describe("Native flow", () => {
    it("should withdrawNative", async () => {
      const signHash = await bridge.getNativeSignHash(
        baseBalance,
        OWNER,
        txHash,
        txNonce,
        (await ethers.provider.getNetwork()).chainId,
      );
      const signature = await getSignature(OWNER, signHash);

      await bridge.depositNative("receiver", "kovan", referralId, { value: baseBalance });
      await bridge.withdrawNative(baseBalance, OWNER, txHash, txNonce, [signature]);

      expect(await ethers.provider.getBalance(await bridge.getAddress())).to.equal(0);
      expect(await bridge.usedHashes(hash)).to.be.true;
    });
  });

  describe("add hash", () => {
    it("should add hash", async () => {
      expect(await bridge.usedHashes(hash)).to.be.false;

      await bridge.addHash(txHash, txNonce);

      expect(await bridge.usedHashes(hash)).to.be.true;
    });
  });
});
