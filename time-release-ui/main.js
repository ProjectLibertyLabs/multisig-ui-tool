import {
  checkAddress,
  encodeAddress,
  blake2AsHex,
  decodeAddress,
} from "https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@12.6.2/+esm";
import {
  web3Accounts,
  web3Enable,
  web3FromAddress,
} from "https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.46.9/+esm";
import {
  loadApi,
  initConnection,
  toDecimalUnit,
  getPrefix,
  getUnit,
  getIsConnected,
  getCurrentRelayChainBlockNumber,
  getProviderUrl,
  getPendingMultisigs,
} from "../api.js";
import {
  inProgress,
  copyToSpreadsheet,
  addLog,
  addLogData,
  updateLogData,
  clearLog,
  callHashToTxHash,
} from "../progress.js";
import { displaySchedule } from "../schedule.js";
import { getMultisigAddress, AddressError } from "../wallet.js";

// Sort addresses by hex.
const multisigSort = (a, b) => {
  const decodedA = decodeAddress(a);
  const decodedB = decodeAddress(b);
  for (let i = 0; i < decodedA.length; i++) {
    if (decodedA[i] < decodedB[i]) return -1;
    if (decodedA[i] > decodedB[i]) return 1;
  }
  return 0;
};

// Update the sender balance display
async function updateSenderBalance() {
  const balanceDisplay = document.getElementById("balance");
  balanceDisplay.innerHTML = "...";
  const sender = document.getElementById("sender").value;
  const api = await loadApi();
  if (!api || !sender) {
    return;
  }
  const resp = await api.query.system.account(sender);
  const balance = resp.data.free.toString();

  balanceDisplay.innerHTML = toDecimalUnit(balance);
}

// Update the multisig balance display
async function updateMultisigBalance(sender) {
  const balanceDisplay = document.getElementById("multisigBalance");
  balanceDisplay.innerHTML = "...";
  const api = await loadApi();
  if (!api || !sender) {
    return;
  }
  const resp = await api.query.system.account(sender);
  const balance = resp.data.free.toString();

  balanceDisplay.innerHTML = toDecimalUnit(balance);
}

async function pendingTransactionUpdate(tx, el) {
  const isApproved = tx.approvals.length >= Number(document.getElementById("multisigThreshold").value);

  const approvedAddresses = tx.approvals.map((a) => encodeAddress(a, getPrefix()));
  el.querySelector(".approvals").innerHTML =
    (isApproved ? "<b>Threshold Reached:</b> " : "") + approvedAddresses.join(", ");

  if (tx.hash) {
    el.querySelector(".callHash").innerHTML = tx.hash;
  }

  el.querySelector(".callData").value = tx.callData;

  const timeReleaseEl = el.querySelector(".multisig-time-release");
  timeReleaseEl.innerHTML = "";
  timeReleaseEl.append(
    displaySchedule(tx.schedule, encodeAddress(tx.dest.id, getPrefix()), await getCurrentRelayChainBlockNumber()),
  );
}

async function displayPendingMultisigTransaction(tx) {
  const template = document.querySelector("#multisig-template");
  const el = template.content.cloneNode(true);
  await pendingTransactionUpdate(tx, el);
  return el;
}

// Update the multisig pending tx display
async function updateMultisigPending() {
  const isMultisig = document.getElementById("multisigCheckbox").checked;
  if (isMultisig) {
    const pendingTransactions = document.getElementById("multisigPending");
    pendingTransactions.innerHTML = "...";
    const multisigAddress = document.getElementById("multisigAddress").value;
    const api = await loadApi();
    if (!api || !multisigAddress) {
      return;
    }
    const transactions = await getPendingMultisigs(multisigAddress);

    if (transactions.length > 0) {
      pendingTransactions.innerHTML = "";
      for (const tx of transactions) {
        pendingTransactions.append(await displayPendingMultisigTransaction(tx));
      }
    } else {
      pendingTransactions.innerHTML = "None Found";
    }
  }
}

// Estimate the block number by date
async function updateBlockNumber(date) {
  const estimateDisplay = document.getElementById("actualBlock");
  estimateDisplay.value = null;
  const link = document.getElementById("subscanLink");
  link.style.display = "none";
  inProgress(true, "loader", null, "createTransferButton");

  if (!(date instanceof Date)) {
    date = new Date(Date.parse(document.getElementById("unlockDate").value));
  }

  // Reject old dates and bad dates
  if (!date || date < Date.now() || !getIsConnected()) {
    inProgress(false, "loader", null, "createTransferButton");
    return;
  }

  const currentBlockDate = new Date();
  const currentBlockNumber = await getCurrentRelayChainBlockNumber();

  // Get the timestamp for noon UTC on the given date
  const noonUTC = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12));

  // Calculate the estimated block number for noon UTC on the given date
  const relayChainBlockTime = 6; // 6s per relay block
  const actualBlockNumber =
    currentBlockNumber + Math.round((+noonUTC - +currentBlockDate) / 1000 / relayChainBlockTime);
  estimateDisplay.value = actualBlockNumber;

  const url = {
    // Polkadot
    90: "https://polkadot.subscan.io/block/",
    // Paseo
    42: "https://paseo.subscan.io/block/",
  };

  link.href = `${url[getPrefix()]}${actualBlockNumber}`;
  link.style.display = "block";
  inProgress(false, "loader", null, "createTransferButton");

  return actualBlockNumber;
}

// Input is in Planck, but we want to show the getUnit() amount as well
function updateUnitValues() {
  const amountInput = document.getElementById("amount");
  const amount = Number(amountInput.value);
  const unitDisplay = document.getElementById("unit");

  // Update getUnit() display
  unitDisplay.textContent = `${toDecimalUnit(amount)} ${getUnit()}`;
}

// Pasting into the Transaction label will get us a
function populateFromPaste(data) {
  // [label,recipient,amount,date]
  const [label, recipient, amount, date, ...multisigs] = data.map((x) => x.trim());

  // Populate the form fields
  const txLabel = document.getElementById("txLabel");
  txLabel.value = label;

  const recipientInput = document.getElementById("recipient");
  recipientInput.value = recipient;

  const amountInput = document.getElementById("amount");
  amountInput.value = amount;

  const unlockDate = document.getElementById("unlockDate");
  unlockDate.value = date;

  if (multisigs.length > 0) {
    document.getElementById("multisigCheckbox").checked = true;
    document.getElementById("multisigSignatories").value = multisigs.join("\n");
  }
  triggerUpdates();
}

function multisigProcess(doAlert = false) {
  document.getElementById("multisigAddress").value = "...";
  document.getElementById("multisigBalance").innerHTML = "...";

  if (!document.getElementById("multisigCheckbox").checked) return;

  try {
    const addresses = getMultisigAddress(getPrefix());
    const [multisigAddress] = addresses;
    document.getElementById("multisigAddress").value = multisigAddress;
    updateMultisigBalance(multisigAddress);
    updateMultisigPending();
    return addresses;
  } catch (e) {
    if (!doAlert) {
      console.error("Multisig Error", e);
    } else if (e instanceof AddressError) {
      alert(e.message);
    } else {
      alert(`Multisig setup is invalid. Wrong threshold or bad signatories: ${e.toString()}`);
    }
    return null;
  }
}

// Do the actual transfer
async function createTransfer(event) {
  event.preventDefault();
  let sender = document.getElementById("sender").value;
  const txLabel = document.getElementById("txLabel").value;
  let recipient = document.getElementById("recipient").value;
  const amount = parseInt(document.getElementById("amount").value);
  const actualBlock = document.getElementById("actualBlock").value;
  const addressCheck = checkAddress(recipient, getPrefix());
  if (!addressCheck[0]) {
    alert(`Recipient address invalid: ${addressCheck[1] || "unknown"}`);
    return;
  }

  inProgress(true, "loader", null, "createTransferButton");

  const isMultisig = document.getElementById("multisigCheckbox").checked;

  recipient = encodeAddress(recipient, getPrefix());
  sender = encodeAddress(sender, getPrefix());

  const api = await loadApi();

  // Create the schedule
  const schedule = {
    start: actualBlock,
    period: 1, // Must be > 0, but we want to have just a one time thing.
    periodCount: 1, // Must be > 0, but we want to have just a one time thing.
    perPeriod: api.registry.createType("Balance", amount),
  };

  try {
    const transferCall = api.tx.timeRelease.transfer(recipient, schedule);
    const injector = await web3FromAddress(sender);

    const callData = transferCall.method.toHex();
    const callHash = blake2AsHex(callData);
    const logIt = [
      `<b>Parameters</b>: <code>Start: ${actualBlock}, Period: 1, Period Count: 1, Per Period: ${amount}</code>`,
      `<b>Call Hash</b>: <code>${callHash}</code>`,
      `<b>Call Data</b>: <code>${callData}</code>`,
    ];

    if (isMultisig) {
      const maxWeight = { refTime: 1_000_000_000, proofSize: 50_000 };

      const [multisigAddress, multisigThreshold, multisigSignatories] = multisigProcess(true);

      // We need to remove the sender and sort correctly before asMulti can be used.
      const sortedOthers = multisigSignatories.filter((x) => x != sender).sort(multisigSort);

      const tx = api.tx.multisig.asMulti(multisigThreshold, sortedOthers, null, transferCall, maxWeight);
      const sending = tx.signAndSend(sender, { signer: injector.signer }, postTransaction(txLabel, callHash));
      addLogData(callHash, {
        recipient,
        amount: amount.toLocaleString(),
        sender: multisigAddress,
        relayBlockUnlock: actualBlock,
        callHash,
        callData,
        status: "Sending",
        finalizedBlock: "unknown",
      });
      addLog(
        [
          `Sending time release`,
          `<b>Recipient</b>: <code>${recipient}</code>`,
          `<b>Amount</b>: <code>${amount.toLocaleString()}</code>`,
          `<b>From Multisig</b>: <code>${multisigAddress}</code>`,
          `<b>Sender</b>: <code>${sender}</code>`,
          ...logIt,
        ],
        txLabel,
      );
      await sending;
    } else {
      const sending = transferCall.signAndSend(sender, { signer: injector.signer }, postTransaction(txLabel, callHash));
      addLogData(callHash, {
        recipient,
        amount: amount.toLocaleString(),
        sender,
        relayBlockUnlock: actualBlock,
        callHash,
        callData,
        status: "Sending",
        finalizedBlock: "unknown",
      });
      addLog(
        [
          `Sending time release`,
          `<b>Recipient</b>: <code>${recipient}</code>`,
          `<b>Amount</b>: <code>${amount.toLocaleString()}</code>`,
          `<b>Sender</b>: <code>${sender}</code>`,
          ...logIt,
        ],
        txLabel,
      );
      await sending;
    }
  } catch (e) {
    addLog(e.toString(), `${txLabel} ERROR`);
    inProgress(false, "loader", null, "createTransferButton");
  }
}

const hasSuccess = (status) => {
  const events = status.events.map((x) => x.toHuman());
  const success = events.find((x) => x.event.method === "ExtrinsicSuccess");
  return !!success;
};

function printEventData(data) {
  let ret = "";
  for (const key in data) {
    const d = data[key];
    if (typeof d !== "object") {
      ret += "<li>" + key + " : " + d + "</li>";
    } else {
      ret += "<li>" + key + " : " + printEventData(d) + "</li>";
    }
  }
  return "<ul>" + ret + "</ul>";
}

function printEvents(status) {
  const events = status.events.map((x) => x.toHuman().event);
  let ret = "";
  for (const key in events) {
    const event = events[key];
    if (typeof event === "object" && event.method && event.data) {
      ret += "<li>" + event.method + " : " + printEventData(event.data) + "</li>";
    } else {
      ret += "<li>" + key + " : " + event + "</li>";
    }
  }
  return "<ul>" + ret + "</ul>";
}

// Function for after the transaction has been submitted
const postTransaction = (prefix, callHash) => (status) => {
  const txHash = status.txHash.toHex();
  callHashToTxHash(callHash, txHash);
  // Log the transaction status
  if (status.isInBlock) {
    addLog(
      `Transaction <code>${txHash}</code> included at block hash <code>${status.status.asInBlock.toHuman()}</code>`,
      prefix,
    );
    updateLogData(txHash, "In Block");
  } else if (status.isFinalized) {
    const finalizedBlock = status.status.asFinalized.toHuman();
    updateLogData(txHash, "Finalized", finalizedBlock);
    const finalizedBlockMsg = `<a target="_blank" title="Block Details" href="https://polkadot.js.org/apps/?rpc=${getProviderUrl()}#/explorer/query/${finalizedBlock}"><code>${finalizedBlock}</code></a>`;
    if (hasSuccess(status)) {
      addLog(`Transaction <code>${txHash}</code> <b>finalized</b> at block hash ${finalizedBlockMsg}`, prefix);
    } else {
      const eventPrint = printEvents(status);
      addLog(
        `<span style="color: red; font-weight: bold;">POSSIBLE ERROR!!</span> Transaction <code>${txHash}</code> <b>finalized</b> at block hash ${finalizedBlockMsg}${eventPrint}`,
        prefix,
      );
    }
    inProgress(false, "loader", null, "createTransferButton");
  } else if (status.isError) {
    addLog(`Transaction error: ${status.status.toHuman()}`, prefix);
    updateLogData(txHash, `Error: ${status.status.toHuman()}`);
    inProgress(false, "loader", null, "createTransferButton");
  } else if (status.status.isReady) {
    updateLogData(txHash, "Sent");
  } else if (status.status.isBroadcast) {
    updateLogData(txHash, "Broadcast");
  } else {
    const msg =
      typeof status.status.toHuman() === "string" ? status.status.toHuman() : JSON.stringify(status.status.toHuman());
    updateLogData(txHash, msg);
    addLog(`Transaction status: ${msg}`, prefix);
  }
};

// Post node connection, connect to the wallet
async function postConnect() {
  await web3Enable("Time Release Transfer Helper");
  const accounts = await web3Accounts();

  const senderSelect = document.getElementById("sender");
  // Clear existing options
  senderSelect.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.text = "Select One";
  senderSelect.add(emptyOption);

  // Add options for each account
  for (const account of accounts) {
    const option = document.createElement("option");
    const address = encodeAddress(account.address, getPrefix());
    option.value = address;
    option.text = `${account.meta.name} (${address})` || address;
    senderSelect.add(option);
  }
  triggerUpdates();
}

// Update the various derived values from fields
function triggerUpdates() {
  updateBlockNumber();
  updateUnitValues();
  updateSenderBalance();
  updateMultisigPending();
  multisigProcess(false);
}

// Start this up with event listeners
function init() {
  document.getElementById("amount").addEventListener("input", updateUnitValues);
  document.getElementById("transferForm").addEventListener("submit", createTransfer);
  document.getElementById("copyTemplate").addEventListener("click", (e) => {
    e.preventDefault();
    const template = [
      "Label",
      "Recipient",
      "Amount",
      "Date",
      "Multisig Participant 1",
      "Multisig Participant 2",
      "Multisig Participant 3",
    ];
    navigator.clipboard.writeText(template.join("\t"));
    document.getElementById("copyTemplate").innerHTML = "Copied!";
    setTimeout(() => {
      document.getElementById("copyTemplate").innerHTML = "Copy Template";
    }, 2000);
  });
  document.getElementById("unlockDate").addEventListener("input", updateBlockNumber);
  document.getElementById("sender").addEventListener("change", () => {
    updateSenderBalance();
    multisigProcess(false);
  });
  document.getElementById("txLabel").addEventListener("paste", async (e) => {
    // Get the clipboard data as plain text
    const text = (e.clipboardData || (await navigator.clipboard.readText())).getData("text/plain");

    const values = text.split("\t");
    if (values.length >= 4) {
      e.preventDefault();
      // Populate the form fields from the clipboard data
      populateFromPaste(values);
    }
  });
  document.getElementById("multisigSignatories").addEventListener("input", () => multisigProcess(false));
  document.getElementById("multisigThreshold").addEventListener("input", () => multisigProcess(false));
  document.getElementById("copyToSpreadsheet").addEventListener("click", copyToSpreadsheet("all"));
  document.getElementById("copyToSpreadsheetLast").addEventListener("click", copyToSpreadsheet("last"));
  document.getElementById("clearLog").addEventListener("click", clearLog);
  initConnection(postConnect);
}

init();
