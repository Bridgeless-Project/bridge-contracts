import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { wei } from "@scripts";
import { getSignature, Reverter } from "@test-helpers";

import {
  ERC20MintableBurnable,
  Bridge,
  Swapper,
  UniswapV2RouterMock,
  ISwapper,
  Bridge__factory,
  Swapper__factory,
} from "@ethers-v6";

describe("Swapper", () => {
  const reverter = new Reverter();

  const network = "kovan";
  const baseBalance = wei("1000");
  const txHash = "0xc4f46c912cc2a1f30891552ac72871ab0f0e977886852bdd5dccd221a595647d";
  const txNonce = "1794147";
  const referralId = "0";

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let RECEIVER: SignerWithAddress;
  let FALLBACK_RECEIVER: SignerWithAddress;

  let bridge: Bridge;
  let swapper: Swapper;
  let uniswapV2Router: UniswapV2RouterMock;
  let erc20_1: ERC20MintableBurnable;
  let erc20_2: ERC20MintableBurnable;
  let erc20_3: ERC20MintableBurnable;

  function hashNode(node1: string, node2: string): string {
    if (BigInt(node1) <= BigInt(node2)) {
      return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [node1, node2]);
    } else {
      return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [node2, node1]);
    }
  }

  async function _getDefaultWithdrawParams(
    receiver = swapper,
    token = erc20_1,
    amount = wei(1),
    isWrapped = true,
  ): Promise<ISwapper.WithdrawParamsStruct> {
    const signHash = await bridge.getERC20SignHash(
      token,
      amount,
      receiver,
      txHash,
      txNonce,
      (await ethers.provider.getNetwork()).chainId,
      isWrapped,
    );
    const signature = await getSignature(OWNER, signHash);

    return {
      amount: amount,
      txHash: txHash,
      txNonce: txNonce,
      isWrapped: isWrapped,
      signatures: [signature],
    };
  }

  function _getDefaultSwapParams(): ISwapper.SwapParamsStruct {
    return {
      minDestinationAmount: 123,
      swapDeadline: 456,
      path: [erc20_1, erc20_2, erc20_3],
    };
  }

  function _getDefaultDepositParams(): ISwapper.DepositParamsStruct {
    return {
      receiver: RECEIVER.address,
      network: network,
      isWrapped: false,
    };
  }

  function _getDefaultFallbackDepositParams(): ISwapper.DepositParamsStruct {
    return {
      receiver: FALLBACK_RECEIVER.address,
      network: "fallback",
      isWrapped: false,
    };
  }

  before("setup", async () => {
    [OWNER, SECOND, RECEIVER, FALLBACK_RECEIVER] = await ethers.getSigners();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");

    const Bridge = await ethers.getContractFactory("Bridge");
    const bridgeImplementation = await Bridge.deploy();
    const bridgeProxy = await ERC1967Proxy.deploy(await bridgeImplementation.getAddress(), "0x");
    bridge = Bridge__factory.connect(await bridgeProxy.getAddress(), OWNER);
    await bridge.__Bridge_init([OWNER.address], "1");

    const ERC20MB = await ethers.getContractFactory("ERC20MintableBurnable");

    erc20_1 = await ERC20MB.deploy("Mock 1", "MK1", 18, OWNER.address);
    await erc20_1.mintTo(OWNER.address, baseBalance);
    await erc20_1.approve(await bridge.getAddress(), baseBalance);

    await erc20_1.transferOwnership(await bridge.getAddress());

    erc20_2 = await ERC20MB.deploy("Mock 2", "MK2", 18, OWNER.address);
    await erc20_2.mintTo(OWNER.address, baseBalance);
    await erc20_2.approve(await bridge.getAddress(), baseBalance);

    await erc20_2.transferOwnership(await bridge.getAddress());

    erc20_3 = await ERC20MB.deploy("Mock 3", "MK3", 18, OWNER.address);
    await erc20_3.mintTo(OWNER.address, baseBalance);
    await erc20_3.approve(await bridge.getAddress(), baseBalance);

    const UniswapV2RouterMock = await ethers.getContractFactory("UniswapV2RouterMock");
    uniswapV2Router = await UniswapV2RouterMock.deploy();
    await OWNER.sendTransaction({ to: await uniswapV2Router.getAddress(), value: ethers.parseEther("100") });

    await erc20_3.transferOwnership(await uniswapV2Router.getAddress());

    const Swapper = await ethers.getContractFactory("Swapper");
    const swapperImplementation = await Swapper.deploy();
    const swapperProxy = await ERC1967Proxy.deploy(await swapperImplementation.getAddress(), "0x");
    swapper = Swapper__factory.connect(await swapperProxy.getAddress(), OWNER);
    await swapper.__Swapper_init(network, await bridge.getAddress(), await uniswapV2Router.getAddress(), [OWNER]);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("access", () => {
    it("should not initialize twice", async () => {
      await expect(swapper.__Swapper_init(network, bridge, uniswapV2Router, [])).to.be.rejectedWith(
        "Initializable: contract is already initialized",
      );
    });

    it("only swap role should call these functions", async () => {
      await expect(
        swapper
          .connect(SECOND)
          .executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            _getDefaultDepositParams(),
            _getDefaultFallbackDepositParams(),
            true,
          ),
      ).to.be.rejectedWith(
        `AccessControl: account ${SECOND.address.toLowerCase()} is missing role ${await swapper.OPERATOR_ROLE()}`,
      );
    });

    it("should upgrade implementation", async () => {
      const Swapper = await ethers.getContractFactory("Swapper");
      const newSwapper = await Swapper.deploy();

      await swapper.upgradeTo(await newSwapper.getAddress());
      await expect(swapper.upgradeTo(await newSwapper.getAddress())).to.be.eventually.fulfilled;
    });

    it("should revert when call from non owner address", async () => {
      await expect(swapper.connect(SECOND).upgradeTo(ethers.ZeroAddress)).to.be.rejectedWith(
        `AccessControl: account ${SECOND.address.toLowerCase()} is missing role ${await swapper.DEFAULT_ADMIN_ROLE()}`,
      );
    });
  });

  describe("__Swapper_init", () => {
    it("should set the fields correctly", async () => {
      expect(await swapper.network()).to.equal(network);
      expect(await swapper.bridge()).to.equal(await bridge.getAddress());
      expect(await swapper.uniswapV2Router()).to.equal(await uniswapV2Router.getAddress());

      expect(await swapper.getRoleMember(await swapper.DEFAULT_ADMIN_ROLE(), 0)).to.equal(OWNER.address);
      expect(await swapper.getRoleMember(await swapper.OPERATOR_ROLE(), 0)).to.equal(OWNER.address);
    });
  });

  describe("isCurrentNetwork", () => {
    it("should return true if the network is the current network", async () => {
      expect(await swapper.isCurrentNetwork(network)).to.be.true;
    });

    it("should return false if the network is not the current network", async () => {
      expect(await swapper.isCurrentNetwork("mainnet")).to.be.false;
    });
  });

  describe("executeSwapAndRoute", () => {
    describe("isDestinationTokenNative_ == true", () => {
      const isDestinationTokenNative = true;

      describe("isCurrentNetwork == true", () => {
        it("should transfer native to receiver", async () => {
          const tx = await swapper.executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            _getDefaultDepositParams(),
            _getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx).to.changeEtherBalances(
            [uniswapV2Router, _getDefaultDepositParams().receiver],
            [-_getDefaultSwapParams().minDestinationAmount, _getDefaultSwapParams().minDestinationAmount],
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositNative", async () => {
          const tx = await swapper.executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            { ..._getDefaultDepositParams(), network: network },
            _getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx).to.emit(bridge, "DepositedNative").withArgs(
            _getDefaultSwapParams().minDestinationAmount,
            _getDefaultDepositParams().receiver,
            network,
            0n, // isWrapped == false
          );

          await expect(tx).to.changeEtherBalances(
            [uniswapV2Router, bridge],
            [-_getDefaultSwapParams().minDestinationAmount, _getDefaultSwapParams().minDestinationAmount],
          );
        });
      });

      it("should call uniswap swapExactTokensForETH", async () => {
        const tx = await swapper.executeSwapAndRoute(
          await _getDefaultWithdrawParams(),
          _getDefaultSwapParams(),
          _getDefaultDepositParams(),
          _getDefaultFallbackDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactTokensForETH")
          .withArgs(
            (await _getDefaultWithdrawParams()).amount,
            _getDefaultSwapParams().minDestinationAmount,
            _getDefaultSwapParams().path,
            await swapper.getAddress(),
            _getDefaultSwapParams().swapDeadline,
          );
      });

      it("should not revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            _getDefaultDepositParams(),
            _getDefaultFallbackDepositParams(),
            true,
          ),
        ).to.be.eventually.fulfilled;
      });

      it("should deposit fallback if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        const tx = await swapper.executeSwapAndRoute(
          await _getDefaultWithdrawParams(),
          _getDefaultSwapParams(),
          _getDefaultDepositParams(),
          _getDefaultFallbackDepositParams(),
          true,
        );

        await expect(tx)
          .to.emit(bridge, "DepositedERC20")
          .withArgs(
            await erc20_1.getAddress(),
            (await _getDefaultWithdrawParams()).amount,
            _getDefaultFallbackDepositParams().receiver,
            _getDefaultFallbackDepositParams().network,
            _getDefaultFallbackDepositParams().isWrapped,
            referralId,
          );

        await expect(tx)
          .to.emit(swapper, "WithdrewSwappedAndFallbackDeposited")
          .withArgs(
            await erc20_1.getAddress(),
            (await _getDefaultWithdrawParams()).amount,
            await erc20_3.getAddress(),
            _getDefaultFallbackDepositParams().receiver,
            _getDefaultFallbackDepositParams().network,
            _getDefaultFallbackDepositParams().isWrapped,
          );
      });
    });

    describe("isDestinationTokenNative_ == false", () => {
      const isDestinationTokenNative = false;

      describe("isCurrentNetwork == true", () => {
        it("should transfer ERC20 to receiver", async () => {
          const tx = await swapper.executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            _getDefaultDepositParams(),
            _getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx).to.changeTokenBalance(
            erc20_3,
            _getDefaultDepositParams().receiver,
            _getDefaultSwapParams().minDestinationAmount,
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositERC20", async () => {
          const tx = await swapper.executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            { ..._getDefaultDepositParams(), network: network },
            _getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(bridge, "DepositedERC20")
            .withArgs(
              await erc20_3.getAddress(),
              _getDefaultSwapParams().minDestinationAmount,
              _getDefaultDepositParams().receiver,
              network,
              _getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx).to.changeTokenBalance(erc20_3, bridge, _getDefaultSwapParams().minDestinationAmount);
        });
      });

      it("should call uniswap swapExactTokensForTokens", async () => {
        const tx = await swapper.executeSwapAndRoute(
          await _getDefaultWithdrawParams(),
          _getDefaultSwapParams(),
          _getDefaultDepositParams(),
          _getDefaultFallbackDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactTokensForTokens")
          .withArgs(
            (await _getDefaultWithdrawParams()).amount,
            _getDefaultSwapParams().minDestinationAmount,
            _getDefaultSwapParams().path,
            await swapper.getAddress(),
            _getDefaultSwapParams().swapDeadline,
          );
      });

      it("should not revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.executeSwapAndRoute(
            await _getDefaultWithdrawParams(),
            _getDefaultSwapParams(),
            _getDefaultDepositParams(),
            _getDefaultFallbackDepositParams(),
            true,
          ),
        ).to.be.eventually.fulfilled;
      });

      it("should deposit fallback if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        const tx = await swapper.executeSwapAndRoute(
          await _getDefaultWithdrawParams(),
          _getDefaultSwapParams(),
          _getDefaultDepositParams(),
          _getDefaultFallbackDepositParams(),
          true,
        );

        await expect(tx)
          .to.emit(bridge, "DepositedERC20")
          .withArgs(
            await erc20_1.getAddress(),
            (await _getDefaultWithdrawParams()).amount,
            _getDefaultFallbackDepositParams().receiver,
            _getDefaultFallbackDepositParams().network,
            _getDefaultDepositParams().isWrapped,
            referralId,
          );

        await expect(tx)
          .to.emit(swapper, "WithdrewSwappedAndFallbackDeposited")
          .withArgs(
            await erc20_1.getAddress(),
            (await _getDefaultWithdrawParams()).amount,
            await erc20_3.getAddress(),
            _getDefaultFallbackDepositParams().receiver,
            _getDefaultFallbackDepositParams().network,
            _getDefaultFallbackDepositParams().isWrapped,
          );
      });
    });

    it("should revert if the path length is less than 2", async () => {
      await expect(
        swapper.executeSwapAndRoute(
          await _getDefaultWithdrawParams(),
          { ..._getDefaultSwapParams(), path: [erc20_1] },
          _getDefaultDepositParams(),
          _getDefaultFallbackDepositParams(),
          true,
        ),
      ).to.be.rejectedWith("Swapper: path length is less than 2");
    });
  });
});
