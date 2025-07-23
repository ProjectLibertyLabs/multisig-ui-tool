import { test, expect } from "@playwright/test";
import { setupPolkadotExtensionMock } from "./mocks/polkadot-extension-mock";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady, createKeyMulti } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";

let polkadotExtensionMock;
let api;
let testAccounts = {};
let multisigAddress;

test.beforeAll(async () => {
  await cryptoWaitReady();
  console.log("Crypto initialized.");
  polkadotExtensionMock = await setupPolkadotExtensionMock();

  // Connect to the local node
  const provider = new WsProvider("ws://127.0.0.1:9944");
  api = await ApiPromise.create({ provider });

  // Setup test accounts
  const keyring = new Keyring({ type: "sr25519" });
  testAccounts.alice = keyring.addFromUri("//Alice");
  testAccounts.bob = keyring.addFromUri("//Bob");
  testAccounts.charlie = keyring.addFromUri("//Charlie");

  // Create multisig address
  const addresses = [testAccounts.alice.address, testAccounts.bob.address, testAccounts.charlie.address].sort();

  const multiAddress = createKeyMulti(addresses, 2);
  multisigAddress = keyring.encodeAddress(multiAddress);
  console.log("Multisig address:", multisigAddress);
  const nonce = (await api.rpc.system.accountNextIndex(testAccounts.alice.address)).toNumber();
  await api.tx.balances.transferKeepAlive(multiAddress, 100_000_000).signAndSend(testAccounts.alice, { nonce });
});

test.afterAll(async () => {
  if (api) {
    await api.disconnect();
  }
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(polkadotExtensionMock);
  await page.goto("/multisig-ui/");
});

test("should connect to node and display the form", async ({ page }) => {
  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Check we're connected
  await expect(page.locator("#multisigForm")).toBeVisible();
});

test("should validate multisig configuration", async ({ page }) => {
  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Set invalid config (threshold > signatories)
  await page.fill("#multisigThreshold", "3");
  await page.fill("#multisigSignatories", testAccounts.alice.address);

  // Try to submit
  await page.click("#submitForm");

  // Should have validation error
  await expect(page.locator("#multisigSignatories:invalid")).toBeVisible();
});

test("should find multisig and display balance", async ({ page }) => {
  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Configure multisig to match our test multisig
  await page.fill("#multisigThreshold", "2");
  await page.fill(
    "#multisigSignatories",
    [testAccounts.alice.address, testAccounts.bob.address, testAccounts.charlie.address].join("\n"),
  );

  // Submit
  await page.click("#submitForm");

  // Check that multisig details are displayed
  await expect(page.locator("#multisigAddress")).toContainText(multisigAddress);
  await expect(page.locator("#resultBalanceTokens")).not.toContainText("...");
});
