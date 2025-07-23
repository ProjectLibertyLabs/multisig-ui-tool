import { test, expect } from "@playwright/test";
import { setupPolkadotExtensionMock } from "./mocks/polkadot-extension-mock";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";

// Global variables
const DOLLAR = 100_000_000n;

let api;
let alice;
let bob;
let polkadotExtensionMock;
let aliceMsaId;

// Initialize everything before any tests run
test.beforeAll(async () => {
  await cryptoWaitReady();
  console.log("Crypto initialized.");

  const keyring = new Keyring({ type: "sr25519" });
  alice = keyring.addFromUri("//Alice");
  bob = keyring.addFromUri("//Bob");

  const provider = new WsProvider("ws://127.0.0.1:9944");
  api = await ApiPromise.create({ provider });
  console.log("API connected.");

  console.log("Setting up extension mock...");
  polkadotExtensionMock = await setupPolkadotExtensionMock();
  console.log("Extension mock ready.");

  // Make Alice an MSA, if not already
  const maybeAliceMsaId = await api.query.msa.publicKeyToMsaId(alice.address);
  if (maybeAliceMsaId.isSome) {
    aliceMsaId = maybeAliceMsaId.unwrap().toString();
  } else {
    const nonce = (await api.rpc.system.accountNextIndex(alice.address)).toNumber();
    await api.tx.msa.create().signAndSend(alice, { nonce });
    await new Promise((r) => setTimeout(r, 2000));
    aliceMsaId = (await api.query.msa.publicKeyToMsaId(alice.address)).unwrap().toString();
  }

  // Make Alice a Provider, if not already
  const providerRegistry = await api.query.msa.providerToRegistryEntry(aliceMsaId);
  if (providerRegistry.isNone) {
    const nonce = (await api.rpc.system.accountNextIndex(alice.address)).toNumber();
    await api.tx.msa.createProvider("Alice").signAndSend(alice, { nonce });
    await new Promise((r) => setTimeout(r, 2000));
  }
});

// Clean up after all tests
test.afterAll(async () => {
  if (api) {
    await api.disconnect();
  }
});

// Setup for each test
test.beforeEach(async ({ page }) => {
  // Add the extension mock
  await page.addInitScript(polkadotExtensionMock);

  // Navigate to the balance UI
  await page.goto("/balance-ui/");
});

test("should show the stake button", async ({ page }) => {
  test.setTimeout(30_000);
  // Select the localhost network
  await page.selectOption("#provider", "ws://127.0.0.1:9944");

  // Click connect button
  await page.click("#connectButton");

  // Check that the connection was established
  await expect(page.locator("#disconnectButton")).toBeVisible();
  await expect(page.locator("#currentProvider")).toContainText("ws://127.0.0.1:9944");

  // Enter Bob's address
  await page.fill("#lookupAddress", bob.address);

  // Get balance
  await page.click('#balanceForm button[type="submit"]');

  // Stake button
  await expect(page.locator("#stakeButton")).toBeEnabled();
  await page.click("#stakeButton");

  await page.selectOption("#stakeType", "ProviderBoost");
  await page.fill("#staking-modal input[name='providerId']", aliceMsaId);
  await page.fill("#staking-modal input[name='amount']", (10n * DOLLAR).toString());
  await page.click("#doStakeButton");

  await expect(page.locator("#staking-modal")).toContainText("Finalized", { timeout: 12000 });

  // Close popover
  await page.keyboard.press("Escape");

  // Unstake
  await expect(page.locator(".unstakeButton")).toBeEnabled();
  await page.click(".unstakeButton");

  await expect(page.locator("#doUnstakeButton")).toBeVisible();
  await page.click("#doUnstakeButton");
  await expect(page.locator("#unstaking-modal")).toContainText("Finalized", { timeout: 18000 });
});
