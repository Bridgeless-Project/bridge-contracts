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

  async function getDefaultWithdrawParams(
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
      token: await token.getAddress(),
      amount: amount,
      txHash: txHash,
      txNonce: txNonce,
      isWrapped: isWrapped,
      signatures: [signature],
    };
  }

  function getDefaultSwapParams(amount = wei(1)): ISwapper.SwapParamsStruct {
    return {
      amountIn: amount,
      minDestinationAmount: 123,
      swapDeadline: 456,
      path: [erc20_1, erc20_2, erc20_3],
    };
  }

  function getDefaultDepositParams(): ISwapper.DepositParamsStruct {
    return {
      receiver: RECEIVER.address,
      network: network,
      isWrapped: false,
      referralId: referralId,
    };
  }

  function getDefaultFallbackDepositParams(): ISwapper.DepositParamsStruct {
    return {
      receiver: FALLBACK_RECEIVER.address,
      network: "fallback",
      isWrapped: false,
      referralId: "1",
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

    it("only operator role should call these functions", async () => {
      await expect(
        swapper
          .connect(SECOND)
          .withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            getDefaultFallbackDepositParams(),
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

  describe("swapAndRoute", () => {
    describe("isDestinationTokenNative_ == true", () => {
      const isDestinationTokenNative = true;

      beforeEach(async () => {
        await erc20_1.approve(swapper, getDefaultSwapParams().amountIn);
      });

      describe("isCurrentNetwork == true", () => {
        it("should transfer native to receiver", async () => {
          const tx = await swapper.swapAndRoute(
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(swapper, "LocalNativeTransferred")
            .withArgs(getDefaultSwapParams().minDestinationAmount, getDefaultDepositParams().receiver);

          await expect(tx).to.changeEtherBalances(
            [uniswapV2Router, getDefaultDepositParams().receiver],
            [-getDefaultSwapParams().minDestinationAmount, getDefaultSwapParams().minDestinationAmount],
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositNative", async () => {
          const tx = await swapper.swapAndRoute(
            getDefaultSwapParams(),
            { ...getDefaultDepositParams(), network: network },
            isDestinationTokenNative,
          );

          await expect(tx).to.emit(bridge, "DepositedNative").withArgs(
            getDefaultSwapParams().minDestinationAmount,
            getDefaultDepositParams().receiver,
            network,
            0n, // isWrapped == false
          );

          await expect(tx)
            .to.emit(swapper, "CrossChainNativeDeposited")
            .withArgs(
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              referralId,
            );

          await expect(tx).to.changeEtherBalances(
            [uniswapV2Router, bridge],
            [-getDefaultSwapParams().minDestinationAmount, getDefaultSwapParams().minDestinationAmount],
          );
        });
      });

      it("should transfer ERC20 from msg.sender to swapper", async () => {
        const tx = await swapper.swapAndRoute(
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(erc20_1, "Transfer")
          .withArgs(OWNER.address, await swapper.getAddress(), getDefaultSwapParams().amountIn);
      });

      it("should call uniswap swapExactTokensForETH", async () => {
        const tx = await swapper.swapAndRoute(
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactTokensForETH")
          .withArgs(
            getDefaultSwapParams().amountIn,
            getDefaultSwapParams().minDestinationAmount,
            getDefaultSwapParams().path,
            await swapper.getAddress(),
            getDefaultSwapParams().swapDeadline,
          );
      });

      it("should revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.swapAndRoute(getDefaultSwapParams(), getDefaultDepositParams(), isDestinationTokenNative),
        ).to.be.rejectedWith("Swapper: swap failed");
      });
    });

    describe("isDestinationTokenNative_ == false", () => {
      const isDestinationTokenNative = false;

      beforeEach(async () => {
        await erc20_1.approve(swapper, getDefaultSwapParams().amountIn);
      });

      describe("isCurrentNetwork == true", () => {
        it("should transfer ERC20 to receiver", async () => {
          const tx = await swapper.swapAndRoute(
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(swapper, "LocalERC20Transferred")
            .withArgs(
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              await erc20_3.getAddress(),
            );

          await expect(tx).to.changeTokenBalance(
            erc20_3,
            getDefaultDepositParams().receiver,
            getDefaultSwapParams().minDestinationAmount,
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositERC20", async () => {
          const tx = await swapper.swapAndRoute(
            getDefaultSwapParams(),
            { ...getDefaultDepositParams(), network: network },
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(bridge, "DepositedERC20")
            .withArgs(
              await erc20_3.getAddress(),
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx)
            .to.emit(swapper, "CrossChainERC20Deposited")
            .withArgs(
              await erc20_3.getAddress(),
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx).to.changeTokenBalance(erc20_3, bridge, getDefaultSwapParams().minDestinationAmount);
        });
      });

      it("should transfer ERC20 from msg.sender to swapper", async () => {
        const tx = await swapper.swapAndRoute(
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(erc20_1, "Transfer")
          .withArgs(OWNER.address, await swapper.getAddress(), getDefaultSwapParams().amountIn);
      });

      it("should call uniswap swapExactTokensForTokens", async () => {
        const tx = await swapper.swapAndRoute(
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactTokensForTokens")
          .withArgs(
            getDefaultSwapParams().amountIn,
            getDefaultSwapParams().minDestinationAmount,
            getDefaultSwapParams().path,
            await swapper.getAddress(),
            getDefaultSwapParams().swapDeadline,
          );
      });

      it("should revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.swapAndRoute(getDefaultSwapParams(), getDefaultDepositParams(), isDestinationTokenNative),
        ).to.be.rejectedWith("Swapper: swap failed");
      });
    });

    it("should revert if the path length is less than 2", async () => {
      const isDestinationTokenNative = false;

      await expect(
        swapper.swapAndRoute(
          { ...getDefaultSwapParams(), path: [erc20_1] },
          getDefaultDepositParams(),
          isDestinationTokenNative,
        ),
      ).to.be.rejectedWith("Swapper: path length is less than 2");
    });

    it("should block reentrancy", async () => {
      const isDestinationTokenNative = true;

      const ReentrantMock = await ethers.getContractFactory("ReentrantMock");
      const reentrantMock = await ReentrantMock.deploy(
        await swapper.getAddress(),
        swapper.interface.encodeFunctionData("swapAndRoute", [
          { ...getDefaultSwapParams(), path: [] },
          getDefaultDepositParams(),
          isDestinationTokenNative,
        ]),
      );

      await expect(
        swapper.swapAndRoute(
          { ...getDefaultSwapParams(), path: [await reentrantMock.getAddress(), await erc20_1.getAddress()] },
          getDefaultDepositParams(),
          isDestinationTokenNative,
        ),
      ).to.be.rejectedWith("ReentrantMock: reentry call failed");
    });
  });

  describe("swapETHAndRoute", () => {
    describe("isDestinationTokenNative_ == true", () => {
      const isDestinationTokenNative = true;

      it("should revert if the msg.value does not match amountIn", async () => {
        await expect(
          swapper.swapETHAndRoute(getDefaultSwapParams(), getDefaultDepositParams(), isDestinationTokenNative, {
            value: 1,
          }),
        ).to.be.rejectedWith("Swapper: msg.value does not match amountIn");
      });

      it("should revert if the destination token is native", async () => {
        await expect(
          swapper.swapETHAndRoute(getDefaultSwapParams(), getDefaultDepositParams(), isDestinationTokenNative, {
            value: getDefaultSwapParams().amountIn,
          }),
        ).to.be.rejectedWith("Swapper: native-to-native swap not supported");
      });
    });

    describe("isDestinationTokenNative_ == false", () => {
      const isDestinationTokenNative = false;

      describe("isCurrentNetwork == true", () => {
        it("should transfer ERC20 to receiver", async () => {
          const tx = await swapper.swapETHAndRoute(
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            isDestinationTokenNative,
            { value: getDefaultSwapParams().amountIn },
          );

          await expect(tx)
            .to.emit(swapper, "LocalERC20Transferred")
            .withArgs(
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              await erc20_3.getAddress(),
            );

          await expect(tx).to.changeTokenBalance(
            erc20_3,
            getDefaultDepositParams().receiver,
            getDefaultSwapParams().minDestinationAmount,
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositERC20", async () => {
          const tx = await swapper.swapETHAndRoute(
            getDefaultSwapParams(),
            { ...getDefaultDepositParams(), network: network },
            isDestinationTokenNative,
            { value: getDefaultSwapParams().amountIn },
          );

          await expect(tx)
            .to.emit(bridge, "DepositedERC20")
            .withArgs(
              await erc20_3.getAddress(),
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx)
            .to.emit(swapper, "CrossChainERC20Deposited")
            .withArgs(
              await erc20_3.getAddress(),
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx).to.changeTokenBalance(erc20_3, bridge, getDefaultSwapParams().minDestinationAmount);
        });
      });

      it("should revert if the msg.value does not match amountIn", async () => {
        await expect(
          swapper.swapETHAndRoute(getDefaultSwapParams(), getDefaultDepositParams(), isDestinationTokenNative, {
            value: 1,
          }),
        ).to.be.rejectedWith("Swapper: msg.value does not match amountIn");
      });

      it("should transfer native from msg.sender", async () => {
        const tx = await swapper.swapETHAndRoute(
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          isDestinationTokenNative,
          { value: getDefaultSwapParams().amountIn },
        );

        await expect(tx).to.changeEtherBalance(OWNER.address, -getDefaultSwapParams().amountIn);
      });

      it("should call uniswap swapExactETHForTokens", async () => {
        const tx = await swapper.swapETHAndRoute(
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          isDestinationTokenNative,
          { value: getDefaultSwapParams().amountIn },
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactETHForTokens")
          .withArgs(
            getDefaultSwapParams().amountIn,
            getDefaultSwapParams().minDestinationAmount,
            getDefaultSwapParams().path,
            await swapper.getAddress(),
            getDefaultSwapParams().swapDeadline,
          );

        await expect(tx).to.changeEtherBalance(await swapper.getAddress(), getDefaultSwapParams().amountIn);
      });

      it("should revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.swapETHAndRoute(getDefaultSwapParams(), getDefaultDepositParams(), isDestinationTokenNative, {
            value: getDefaultSwapParams().amountIn,
          }),
        ).to.be.rejectedWith("Swapper: swap failed");
      });
    });

    it("should revert if the path length is less than 2", async () => {
      const isDestinationTokenNative = false;

      await expect(
        swapper.swapETHAndRoute(
          { ...getDefaultSwapParams(), path: [erc20_1] },
          getDefaultDepositParams(),
          isDestinationTokenNative,
        ),
      ).to.be.rejectedWith("Swapper: path length is less than 2");
    });

    it("should block reentrancy", async () => {
      const isSourceTokenNative = false;
      const isDestinationTokenNative = true;

      const ReentrantMock = await ethers.getContractFactory("ReentrantMock");
      const reentrantMock = await ReentrantMock.deploy(
        await swapper.getAddress(),
        swapper.interface.encodeFunctionData("swapETHAndRoute", [
          { ...getDefaultSwapParams(), path: [] },
          getDefaultDepositParams(),
          isDestinationTokenNative,
        ]),
      );

      await expect(
        swapper.swapAndRoute(
          { ...getDefaultSwapParams(), path: [await reentrantMock.getAddress(), await erc20_1.getAddress()] },
          getDefaultDepositParams(),
          isDestinationTokenNative,
        ),
      ).to.be.rejectedWith("ReentrantMock: reentry call failed");
    });
  });

  describe("withdrawSwapAndRoute", () => {
    describe("isDestinationTokenNative_ == true", () => {
      const isDestinationTokenNative = true;

      describe("isCurrentNetwork == true", () => {
        it("should transfer native to receiver", async () => {
          const tx = await swapper.withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(swapper, "LocalNativeTransferred")
            .withArgs(getDefaultSwapParams().minDestinationAmount, getDefaultDepositParams().receiver);

          await expect(tx).to.changeEtherBalances(
            [uniswapV2Router, getDefaultDepositParams().receiver],
            [-getDefaultSwapParams().minDestinationAmount, getDefaultSwapParams().minDestinationAmount],
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositNative", async () => {
          const tx = await swapper.withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            { ...getDefaultDepositParams(), network: network },
            getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx).to.emit(bridge, "DepositedNative").withArgs(
            getDefaultSwapParams().minDestinationAmount,
            getDefaultDepositParams().receiver,
            network,
            0n, // isWrapped == false
          );

          await expect(tx)
            .to.emit(swapper, "CrossChainNativeDeposited")
            .withArgs(
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              referralId,
            );

          await expect(tx).to.changeEtherBalances(
            [uniswapV2Router, bridge],
            [-getDefaultSwapParams().minDestinationAmount, getDefaultSwapParams().minDestinationAmount],
          );
        });
      });

      it("should call uniswap swapExactTokensForETH", async () => {
        const tx = await swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactTokensForETH")
          .withArgs(
            (await getDefaultWithdrawParams()).amount,
            getDefaultSwapParams().minDestinationAmount,
            getDefaultSwapParams().path,
            await swapper.getAddress(),
            getDefaultSwapParams().swapDeadline,
          );
      });

      it("should not revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            getDefaultFallbackDepositParams(),
            true,
          ),
        ).to.be.eventually.fulfilled;
      });

      it("should deposit fallback if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        const tx = await swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          true,
        );

        await expect(tx)
          .to.emit(bridge, "DepositedERC20")
          .withArgs(
            await erc20_1.getAddress(),
            (await getDefaultWithdrawParams()).amount,
            getDefaultFallbackDepositParams().receiver,
            getDefaultFallbackDepositParams().network,
            getDefaultFallbackDepositParams().isWrapped,
            getDefaultFallbackDepositParams().referralId,
          );

        await expect(tx)
          .to.emit(swapper, "CrossChainERC20FallbackDeposited")
          .withArgs(
            await erc20_1.getAddress(),
            (await getDefaultWithdrawParams()).amount,
            getDefaultFallbackDepositParams().receiver,
            getDefaultFallbackDepositParams().network,
            getDefaultFallbackDepositParams().isWrapped,
            getDefaultFallbackDepositParams().referralId,
          );
      });
    });

    describe("isDestinationTokenNative_ == false", () => {
      const isDestinationTokenNative = false;

      describe("isCurrentNetwork == true", () => {
        it("should transfer ERC20 to receiver", async () => {
          const tx = await swapper.withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(swapper, "LocalERC20Transferred")
            .withArgs(
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              await erc20_3.getAddress(),
            );

          await expect(tx).to.changeTokenBalance(
            erc20_3,
            getDefaultDepositParams().receiver,
            getDefaultSwapParams().minDestinationAmount,
          );
        });
      });

      describe("isCurrentNetwork == false", () => {
        const network = "mainnet";

        it("should call bridge.depositERC20", async () => {
          const tx = await swapper.withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            { ...getDefaultDepositParams(), network: network },
            getDefaultFallbackDepositParams(),
            isDestinationTokenNative,
          );

          await expect(tx)
            .to.emit(bridge, "DepositedERC20")
            .withArgs(
              await erc20_3.getAddress(),
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx)
            .to.emit(swapper, "CrossChainERC20Deposited")
            .withArgs(
              await erc20_3.getAddress(),
              getDefaultSwapParams().minDestinationAmount,
              getDefaultDepositParams().receiver,
              network,
              getDefaultDepositParams().isWrapped,
              referralId,
            );

          await expect(tx).to.changeTokenBalance(erc20_3, bridge, getDefaultSwapParams().minDestinationAmount);
        });
      });

      it("should call uniswap swapExactTokensForTokens", async () => {
        const tx = await swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          isDestinationTokenNative,
        );

        await expect(tx)
          .to.emit(uniswapV2Router, "SwapExactTokensForTokens")
          .withArgs(
            (await getDefaultWithdrawParams()).amount,
            getDefaultSwapParams().minDestinationAmount,
            getDefaultSwapParams().path,
            await swapper.getAddress(),
            getDefaultSwapParams().swapDeadline,
          );
      });

      it("should not revert if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        await expect(
          swapper.withdrawSwapAndRoute(
            await getDefaultWithdrawParams(),
            getDefaultSwapParams(),
            getDefaultDepositParams(),
            getDefaultFallbackDepositParams(),
            true,
          ),
        ).to.be.eventually.fulfilled;
      });

      it("should deposit fallback if the swap fails", async () => {
        await uniswapV2Router.setWillRevert(true);

        const tx = await swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          getDefaultSwapParams(),
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          true,
        );

        await expect(tx)
          .to.emit(bridge, "DepositedERC20")
          .withArgs(
            await erc20_1.getAddress(),
            (await getDefaultWithdrawParams()).amount,
            getDefaultFallbackDepositParams().receiver,
            getDefaultFallbackDepositParams().network,
            getDefaultFallbackDepositParams().isWrapped,
            getDefaultFallbackDepositParams().referralId,
          );

        await expect(tx)
          .to.emit(swapper, "CrossChainERC20FallbackDeposited")
          .withArgs(
            await erc20_1.getAddress(),
            (await getDefaultWithdrawParams()).amount,
            getDefaultFallbackDepositParams().receiver,
            getDefaultFallbackDepositParams().network,
            getDefaultFallbackDepositParams().isWrapped,
            getDefaultFallbackDepositParams().referralId,
          );
      });
    });

    it("should revert if the path length is less than 2", async () => {
      await expect(
        swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          { ...getDefaultSwapParams(), path: [erc20_1] },
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          true,
        ),
      ).to.be.rejectedWith("Swapper: path length is less than 2");
    });

    it("should revert if the withdraw token does not match swap path", async () => {
      await expect(
        swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          { ...getDefaultSwapParams(), path: [erc20_2, erc20_1] },
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          true,
        ),
      ).to.be.rejectedWith("Swapper: withdraw token does not match swap path");
    });

    it("should revert if the withdraw amount does not match swap amountIn", async () => {
      await expect(
        swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(),
          { ...getDefaultSwapParams(), amountIn: wei(2) },
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          true,
        ),
      ).to.be.rejectedWith("Swapper: withdraw amount does not match swap amountIn");
    });

    it("should block reentrancy", async () => {
      const ReentrantMock = await ethers.getContractFactory("ReentrantMock");
      const reentrantMock = await ReentrantMock.deploy(
        await swapper.getAddress(),
        swapper.interface.encodeFunctionData("withdrawSwapAndRoute", [
          await getDefaultWithdrawParams(),
          { ...getDefaultSwapParams(), path: [] },
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          false,
        ]),
      );

      await swapper.grantRole(await swapper.OPERATOR_ROLE(), reentrantMock);

      await expect(
        swapper.withdrawSwapAndRoute(
          await getDefaultWithdrawParams(swapper, reentrantMock as any),
          {
            ...getDefaultSwapParams(),
            path: [await reentrantMock.getAddress(), await erc20_1.getAddress()],
          },
          getDefaultDepositParams(),
          getDefaultFallbackDepositParams(),
          false,
        ),
      ).to.be.rejectedWith("ReentrantMock: reentry call failed");
    });
  });
});
