import { checkAddress, encodeAddress } from "https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@12.6.2/+esm";
import { web3Enable, web3FromAddress } from "https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.46.9/+esm";
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
} from "../api.js";
import { setUrlParameter, getParameterByName } from "../url.js";
import { displaySchedule, sortSchedule, getSchedules } from "../schedule.js";
import { inProgress } from "../progress.js";

async function updateData(lookupAddress) {
  document.getElementById("currentResults").style.display = "none";
  if (!lookupAddress) {
    return;
  }
  if (!validateAddress(lookupAddress)) return;
  const account = encodeAddress(lookupAddress, getPrefix());

  const api = await loadApi();
  const balanceData = await getBalance(account);
  const hasMoreThanOneTokenFree = BigInt(balanceData.free.replaceAll(",", "")) > 100_000_000n;

  const resultSchedule = document.getElementById("timeReleaseSchedule");
  resultSchedule.innerHTML = "Loading...";

  document.getElementById("resultAddress").innerHTML = account;
  document.getElementById("resultBalanceTokens").innerHTML = balanceData.decimal + " " + getUnit();
  document.getElementById("resultBalancePlancks").innerHTML = balanceData.plancks;
  document.getElementById("resultFree").innerHTML = balanceData.free;
  document.getElementById("resultReserved").innerHTML = balanceData.frozen;

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

// Do the actual claim
async function claim(event, sender) {
  event.preventDefault();
  const addressCheck = checkAddress(sender, getPrefix());
  if (!addressCheck[0]) {
    alert(`Address invalid: ${addressCheck[1] || "unknown"}`);
    return;
  }

  inProgress(true, ".loader", null, event.target.id);

  const api = await loadApi();
  try {
    await web3Enable("Balance Check dApp");
    const claimCall = api.tx.timeRelease.claim();
    const injector = await web3FromAddress(sender);

    const sending = claimCall.signAndSend(
      sender,
      { signer: injector.signer },
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
    updateData(lookupAddressEl.value);
    setUrlParameter("address", lookupAddressEl.value);
  });

  initConnection(postConnect);
}

init();
