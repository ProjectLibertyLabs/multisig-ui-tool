import { test as setup } from "@playwright/test";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";

setup("setup test environment", async () => {
  await cryptoWaitReady();
  // Connect to local node
  const provider = new WsProvider("ws://127.0.0.1:9944");
  const api = await ApiPromise.create({ provider });

  // Wait for crypto utilities to be ready
  await cryptoWaitReady();

  // Set up test accounts
  const keyring = new Keyring({ type: "sr25519" });
  const alice = keyring.addFromUri("//Alice");
  const bob = keyring.addFromUri("//Bob");
  const charlie = keyring.addFromUri("//Charlie");

  // Create multisig address for tests
  // ... (similar to what we have in the multisig test)

  // Optionally set up time release schedules or other test data
  // This would eliminate the need to create these in each test

  // Clean up
  await api.disconnect();
});
