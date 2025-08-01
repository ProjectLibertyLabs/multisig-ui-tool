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
  await api.tx.balances.transferKeepAlive(multiAddress, 100_00000000).signAndSend(testAccounts.alice, { nonce });
});

test.afterAll(async () => {
  if (api) {
    await api.disconnect();
  }
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(polkadotExtensionMock);
});

test("should create time release schedules simple account and cross sign", async ({ page }) => {
  // First, navigate to time release UI and create a schedule
  await page.goto("/time-release-ui/");

  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Wait for connection to be established
  await expect(page.locator("#disconnectButton")).toBeVisible();

  // Select Alice as sender
  await page.locator("#sender").selectOption("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");

  // Enter Bob as recipient
  await page.fill("#recipient", testAccounts.bob.address);

  // Enter amount
  await page.fill("#amount", "1000000000");

  // Set unlock date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateString = tomorrow.toISOString().split("T")[0];
  await page.fill("#unlockDate", dateString);

  // Wait for the block number to be calculated
  await expect(page.locator("#actualBlock")).toHaveValue(/\d+/);

  // Create the transfer
  await page.pause();
  await page.click("#createTransferButton");

  // Wait for transaction to be sent
  await expect(page.locator("#log")).toContainText("finalized at block hash", { timeout: 10000 });

  await expect(page.locator("#log")).toContainText("Call Data: 0x", { timeout: 10000 });

  // Get the calldata
  const logText = await page.locator("#log").textContent();
  const callData = logText.match(/Call Data: 0x.*$/)[0].replace("Call Data: ", "");

  // Now check if this schedule appears in the Balance UI
  await page.goto("/balance-ui/");

  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Look up Bob's address
  await page.fill("#lookupAddress", testAccounts.bob.address);
  await page.click('#balanceForm button[type="submit"]');

  // Verify time release schedule is shown
  await expect(page.locator("#timeReleaseSchedule")).toContainText("Locked Until", { timeout: 10000 });
  await expect(page.locator("#timeReleaseSchedule")).toContainText("Relay Chain Block Number");

  // First, navigate to time release UI and create a schedule
  await page.goto("/time-release-ui/");

  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Wait for connection to be established
  await expect(page.locator("#disconnectButton")).toBeVisible();

  // Select Alice as sender
  await page.locator("#sender").selectOption("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");

  // Setup the multisig
  await page.locator("#multisigCheckbox").check();
  await page.fill("#multisigThreshold", "2");
  await page.fill(
    "#multisigSignatories",
    [testAccounts.alice.address, testAccounts.bob.address, testAccounts.charlie.address].join("\n"),
  );
  await expect(page.locator("#multisigBalance")).not.toContainText("...");

  // Enter Bob as recipient
  await page.fill("#recipient", testAccounts.bob.address);

  // Enter amount
  await page.fill("#amount", "1000000000");

  // Set unlock to far future
  await page.fill("#unlockDate", "2100-01-01");

  // Wait for the block number to be calculated
  await expect(page.locator("#actualBlock")).toHaveValue(/\d+/);

  // Create the transfer
  await page.pause();
  await page.click("#createTransferButton");

  // Wait for transaction to be sent
  await expect(page.locator("#log")).toContainText("finalized at block hash", { timeout: 10000 });

  // Now check if this schedule appears in the Balance UI
  await page.goto("/balance-ui/");

  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Look up Bob's address
  await page.fill("#lookupAddress", testAccounts.bob.address);
  await page.click('#balanceForm button[type="submit"]');

  // Verify time release schedule is shown
  await expect(page.locator("#timeReleaseSchedule")).toContainText("Locked Until", { timeout: 10000 });
  await expect(page.locator("#timeReleaseSchedule")).toContainText("Relay Chain Block Number");

  // Finally do the countersigning

  await page.goto("/multisig-ui/");
  // Connect to node
  await page.selectOption("#provider", "ws://127.0.0.1:9944");
  await page.click("#connectButton");

  // Configure multisig
  await page.fill("#multisigThreshold", "2");
  await page.fill(
    "#multisigSignatories",
    [testAccounts.alice.address, testAccounts.bob.address, testAccounts.charlie.address].join("\n"),
  );

  // Submit
  await page.click("#submitForm");
  await expect(page.locator("#multisigAddress")).toContainText(multisigAddress);

  // Wait for pending transactions to load
  const pendingLast = page.locator(".pending-multisig").first();
  await expect(pendingLast).toBeVisible();

  // Set calldata
  pendingLast.locator(".callData").fill(callData);

  // Find the countersign button (assuming Bob can sign)
  const countersignButton = pendingLast.locator(".countersignAuth:not([disabled])");

  // Click to countersign
  await countersignButton.click();

  // Wait for finalization
  await expect(pendingLast).toContainText("Finalized", { timeout: 20000 });
});
