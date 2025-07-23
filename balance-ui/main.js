import { checkAddress, encodeAddress } from "https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@13.5.3/+esm";
import { web3Enable, web3FromAddress } from "https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.61.4/+esm";
import {
  loadApi,
  initConnection,
  getCurrentRelayChainBlockNumber,
  toDecimalUnit,
  getPrefix,
  getUnit,
  getBalance,
  hasSuccess,
  getProviderUrl,
  updateUnitValues,
} from "../api.js";
import { setUrlParameter, getParameterByName } from "../url.js";
import { displaySchedule, sortSchedule, getSchedules } from "../schedule.js";
import { getLedger, displayStaking, getStakingCall, getStakeTargets } from "../staking.js";
import { inProgress } from "../progress.js";

const DOLLAR = 100_000_000n;

async function updateData(lookupAddress) {
  document.getElementById("currentResults").style.display = "none";
  if (!lookupAddress) {
    return;
  }
  if (!validateAddress(lookupAddress)) return;
  const account = encodeAddress(lookupAddress, getPrefix());

  const api = await loadApi();
  const balanceData = await getBalance(account);
  const hasMoreThanOneTokenFree = balanceData.free > DOLLAR;

  const resultSchedule = document.getElementById("timeReleaseSchedule");

  document.getElementById("resultAddress").innerHTML = account;
  document.getElementById("resultBalanceTokens").innerHTML = balanceData.decimal + " " + getUnit();
  document.getElementById("resultBalancePlancks").innerHTML = balanceData.plancks;
  document.getElementById("resultFree").innerHTML = balanceData.free.toLocaleString();
  document.getElementById("resultReserved").innerHTML = balanceData.frozen.toLocaleString();

  // Look up the timeRelease Pallet information for the address
  const schedules = await getSchedules(api, account);

  if (schedules.length === 0) {
    resultSchedule.innerHTML = "None";
  } else {
    const relayBlockNumber = await getCurrentRelayChainBlockNumber();
    const ul = document.createElement("ul");
    resultSchedule.innerHTML = "";

    const isUnlocked = (s) => s.periodCount === 1 && s.start + s.period < relayBlockNumber;
    const unlockedSum = schedules.reduce((sum, s) => (isUnlocked(s) ? sum + s.perPeriod : sum), 0n);

    if (unlockedSum > 0n) {
      const unlockDiv = document.createElement("div");
      if (hasMoreThanOneTokenFree) {
        unlockDiv.innerHTML = `<button id="claimButton">Claim Unlocked Tokens Now</button>`;
      } else {
        unlockDiv.innerHTML = `<button disabled title="Not enough free tokens to claim from the same account" id="claimButton">Claim Unlocked Tokens Now</button>`;
      }
      unlockDiv.innerHTML += `<br /><b>Ready to Claim:</b> ${toDecimalUnit(unlockedSum)} ${getUnit()}`;
      resultSchedule.append(unlockDiv);
    }

    schedules
      .filter((s) => !isUnlocked(s))
      .sort(sortSchedule)
      .forEach((s) => {
        const li = document.createElement("li");
        li.append(displaySchedule(s, null, relayBlockNumber));
        ul.append(li);
      });
    resultSchedule.append(ul);
  }

  // Staking Status
  const ledger = await getLedger(api, account);
  // Staking Modals
  document.getElementById("stakeButton").disabled = !hasMoreThanOneTokenFree;

  if (ledger) {
    // Stake form max amount setup
    document.querySelector('#stakeForm input[name="amount"]').max = (balanceData.free - DOLLAR).toString();

    // Show the details
    const targets = await getStakeTargets(api, account);
    const stakingStatusEl = displayStaking(ledger, targets);
    const stakingStatus = document.getElementById("stakingStatus");
    stakingStatus.innerHTML = "";
    stakingStatus.append(stakingStatusEl);
  } else {
    document.getElementById("stakingStatus").innerHTML = "No stakes found";
  }

  document.getElementById("currentResults").style.display = "block";
}

// Check the address and add a error message if there is one
function validateAddress(address, element = null) {
  let addressEncoded = null;
  try {
    addressEncoded = encodeAddress(address, getPrefix());
  } catch (_e) {}
  const check = checkAddress(addressEncoded || address, getPrefix());
  const isValid = check[0];
  if (element) {
    if (isValid) element.setCustomValidity("");
    else element.setCustomValidity(`Invalid: ${check[1] || "unknown"}`);
  }
  return isValid;
}

function isBadAddress(address) {
  const addressCheck = checkAddress(address, getPrefix());
  if (!addressCheck[0]) {
    alert(`Address invalid: ${addressCheck[1] || "unknown"}`);
    // IS BAD
    return true;
  }
  return false;
}

// Do the actual stake
async function doStake(event, sender, stakeType, providerId, amount) {
  event.preventDefault();
  if (isBadAddress(sender)) return;

  inProgress(true, ".loader", null, event.target.id);

  const api = await loadApi();
  try {
    await web3Enable("Balance Check dApp");
    const stakeCall = getStakingCall(api, stakeType, providerId, amount);
    const injector = await web3FromAddress(sender);
    const nonce = await api.rpc.system.accountNextIndex(sender);

    const sending = stakeCall.signAndSend(
      sender,
      { signer: injector.signer, nonce },
      postTransaction(document.getElementById("staking-modal"), async () => {
        // Wait a bit before refreshing...
        await new Promise((r) => setTimeout(r, 2000));
        await updateData(sender);
        inProgress(false, ".loader", null, event.target.id);
      }),
    );
    await sending;
  } catch (e) {
    alert(`ERROR: ${e.toString()}`);
    inProgress(false, ".loader", null, event.target.id);
  }
}

// Do the actual stake
async function doUnstake(event, sender, providerId, amount) {
  event.preventDefault();
  if (isBadAddress(sender)) return;

  inProgress(true, ".loader", null, event.target.id);

  event.target;

  const api = await loadApi();
  try {
    await web3Enable("Balance Check dApp");
    const stakeCall = api.tx.capacity.unstake(providerId, amount);
    const injector = await web3FromAddress(sender);
    const nonce = await api.rpc.system.accountNextIndex(sender);

    const sending = stakeCall.signAndSend(
      sender,
      { signer: injector.signer, nonce },
      postTransaction(document.getElementById("unstaking-modal"), async () => {
        // Wait a bit before refreshing...
        await new Promise((r) => setTimeout(r, 6000));
        await updateData(sender);
        inProgress(false, ".loader", null, event.target.id);
      }),
    );
    await sending;
  } catch (e) {
    alert(`ERROR: ${e.toString()}`);
    inProgress(false, ".loader", null, event.target.id);
  }
}

// Do the actual claim
async function claim(event, sender) {
  event.preventDefault();
  if (isBadAddress(sender)) return;

  inProgress(true, ".loader", null, event.target.id);

  const api = await loadApi();
  try {
    await web3Enable("Balance Check dApp");
    const claimCall = api.tx.timeRelease.claim();
    const injector = await web3FromAddress(sender);
    const nonce = await api.rpc.system.accountNextIndex(sender);

    const sending = claimCall.signAndSend(
      sender,
      { signer: injector.signer, nonce },
      postTransaction(document.getElementById("timeReleaseSchedule"), async () => {
        // Wait a bit before refreshing...
        await new Promise((r) => setTimeout(r, 2000));
        await updateData(sender);
        inProgress(false, ".loader", null, event.target.id);
      }),
    );
    await sending;
  } catch (e) {
    alert(`ERROR: ${e.toString()}`);
    inProgress(false, ".loader", null, event.target.id);
  }
}

// Function for after the transaction has been submitted
const postTransaction = (section, completeFn) => async (status) => {
  let msg;

  if (typeof status === "string") {
    msg = status;
  } else if (status.isInBlock) {
    msg = "In Block";
  } else if (status.isFinalized) {
    const finalizedBlock = status.status.asFinalized.toHuman();
    if (hasSuccess(status)) {
      msg = `Finalized: <a target="_blank" title="Block Details" href="https://polkadot.js.org/apps/?rpc=${getProviderUrl()}#/explorer/query/${finalizedBlock}">${finalizedBlock}</a>`;
      await completeFn();
    } else {
      msg = `<span style="color: red; font-weight: bold;">POSSIBLE ERROR!!</span> Please check finalized block: <a target="_blank" title="Block Details" href="https://polkadot.js.org/apps/?rpc=${getProviderUrl()}#/explorer/query/${finalizedBlock}">${finalizedBlock}</a>`;
      msg += "<br />";
      msg += printEvents(status);
      await completeFn();
    }
  } else if (status.isError) {
    msg = `<span style="color: red;">Error</span>: ${status.status.toHuman()}`;
    await completeFn();
  } else if (status.status.isReady) {
    msg = "Sent";
  } else if (status.status.isBroadcast) {
    msg = "Broadcast";
  } else {
    msg =
      typeof status.status.toHuman() === "string" ? status.status.toHuman() : JSON.stringify(status.status.toHuman());
  }

  const p = document.createElement("p");
  p.innerHTML = new Date().toLocaleString() + ": " + msg;
  section.prepend(p);
};

// Post node connection, set the lookupAddress if there is one
function postConnect() {
  const address = getParameterByName("address");
  if (address) document.getElementById("lookupAddress").value = address;
}

// Start this up with event listeners
function init() {
  const lookupAddressEl = document.getElementById("lookupAddress");
  lookupAddressEl.addEventListener("input", () => {
    validateAddress(lookupAddressEl.value, lookupAddressEl);
  });
  // Watch for the claim button
  document.getElementById("timeReleaseSchedule").addEventListener("click", (e) => {
    if (e.target.id === "claimButton") claim(e, document.getElementById("resultAddress").innerHTML);
  });
  document.getElementById("balanceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    inProgress(true, ".loader", null, null);
    updateData(lookupAddressEl.value).finally(() => {
      inProgress(false, ".loader", null, null);
    });
    setUrlParameter("address", lookupAddressEl.value);
  });

  for (const el of document.querySelectorAll(".amountUnit")) {
    el.querySelector("input").addEventListener("input", () => updateUnitValues(el));
  }

  // Watch for the stake button
  document.getElementById("stakeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    doStake(e, lookupAddressEl.value, form.get("stakeType"), form.get("providerId"), form.get("amount"));
  });

  // Unstake Button
  document.getElementById("unstakeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    doUnstake(e, lookupAddressEl.value, form.get("providerId"), form.get("amount"));
  });

  // Unstake form fill
  document.getElementById("unstaking-modal").addEventListener("beforetoggle", (event) => {
    if (event.newState === "open" && document.activeElement) {
      const providerId = document.activeElement.dataset.providerId || "";
      const stakeAmount = document.activeElement.dataset.stakeAmount || "";
      event.target.querySelector('input[name="providerId"]').value = providerId;
      const amountInput = event.target.querySelector('input[name="amount"]');
      amountInput.value = stakeAmount;
      amountInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  initConnection(postConnect);
}

init();
