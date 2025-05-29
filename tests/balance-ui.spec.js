import { test, expect } from "@playwright/test";
import { setupPolkadotExtensionMock } from "./mocks/polkadot-extension-mock";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";

// Global variables
let api;
let alice;
let bob;
let polkadotExtensionMock;

// Initialize everything before any tests run
test.beforeAll(async () => {
  await cryptoWaitReady();
  console.log("Crypto initialized.");

  const keyring = new Keyring({ type: "sr25519" });
  alice = keyring.addFromUri("//Alice");
  bob = keyring.addFromUri("//Bob");

  const provider = new WsProvider("ws://localhost:9944");
  api = await ApiPromise.create({ provider });
  console.log("API connected.");

  console.log("Setting up extension mock...");
  polkadotExtensionMock = await setupPolkadotExtensionMock();
  console.log("Extension mock ready.");
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

test("should connect to a node and display the interface", async ({ page }) => {
  // Select the localhost network
  await page.selectOption("#provider", "ws://localhost:9944");

  // Click connect button
  await page.click("#connectButton");

  // Check that the connection was established
  await expect(page.locator("#disconnectButton")).toBeVisible();
  await expect(page.locator("#currentProvider")).toContainText("ws://localhost:9944");

  // UI elements for balance check should be visible
  await expect(page.locator("#balanceForm")).toBeVisible();
  await expect(page.locator("#lookupAddress")).toBeVisible();
});

test("should display error for invalid address", async ({ page }) => {
  // Connect to node
  await page.selectOption("#provider", "ws://localhost:9944");
  await page.click("#connectButton");

  // Enter invalid address
  await page.fill("#lookupAddress", "invalid-address");

  // Try to submit
  await page.click('#balanceForm button[type="submit"]');

  // Should have an invalid lookup address
  await expect(page.locator("#lookupAddress:invalid")).toBeVisible();
});

test("should fetch and display account balance", async ({ page }) => {
  // Connect to node
  await page.selectOption("#provider", "ws://localhost:9944");
  await page.click("#connectButton");

  // Enter Alice's address
  await page.fill("#lookupAddress", alice.address);

  // Get balance
  await page.click('#balanceForm button[type="submit"]');

  // Wait for balance to be displayed
  await expect(page.locator("#resultAddress")).toContainText(alice.address);
  await expect(page.locator("#resultBalanceTokens")).not.toContainText("...");
  await expect(page.locator("#resultBalancePlancks")).not.toContainText("...");

  await expect(page.locator("#resultFree")).not.toContainText("...");
  await expect(page.locator("#resultReserved")).not.toContainText("...");
});

test("should disconnect from node", async ({ page }) => {
  // Connect to node
  await page.selectOption("#provider", "ws://localhost:9944");
  await page.click("#connectButton");

  // Disconnect
  await page.click("#disconnectButton");

  // Check that the connection form is displayed again
  await expect(page.locator("#connectButton")).toBeVisible();
  await expect(page.locator("#balanceForm")).not.toBeVisible();
});
