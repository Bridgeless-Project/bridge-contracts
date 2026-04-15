import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { Reverter } from "@test-helpers";

import { ERC1967Proxy, Swapper, Swapper__factory } from "@ethers-v6";

describe("SwapperUpgradeable", () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let BRIDGE: SignerWithAddress;
  let UNISWAP_V2_ROUTER: SignerWithAddress;

  let swapper: Swapper;
  let newSwapper: Swapper;

  let proxy: ERC1967Proxy;
  let proxySwapper: Swapper;

  before("setup", async () => {
    [OWNER, SECOND, BRIDGE, UNISWAP_V2_ROUTER] = await ethers.getSigners();

    const Swapper = await ethers.getContractFactory("Swapper");
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");

    swapper = await Swapper.deploy();
    newSwapper = await Swapper.deploy();

    proxy = await ERC1967Proxy.deploy(await swapper.getAddress(), "0x");
    proxySwapper = Swapper__factory.connect(await proxy.getAddress(), OWNER);

    await proxySwapper.__Swapper_init("kovan", await BRIDGE.getAddress(), await UNISWAP_V2_ROUTER.getAddress());

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  it("should upgrade implementation", async () => {
    await proxySwapper.upgradeTo(await newSwapper.getAddress());
    await expect(proxySwapper.upgradeTo(await newSwapper.getAddress())).to.be.eventually.fulfilled;
  });

  it("should revert when call from non owner address", async () => {
    await expect(proxySwapper.connect(SECOND).upgradeTo(await newSwapper.getAddress())).to.be.rejectedWith(
      `AccessControl: account ${SECOND.address.toLowerCase()} is missing role ${await proxySwapper.DEFAULT_ADMIN_ROLE()}`,
    );
  });
});
