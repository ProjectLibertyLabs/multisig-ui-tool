import {
  blake2AsHex,
  decodeAddress,
  encodeAddress,
} from "https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@12.6.2/+esm";
import { web3Enable, web3FromAddress } from "https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.46.9/+esm";
import {
  loadApi,
  getIsConnected,
  initConnection,
  getBalance,
  getPrefix,
  getProviderUrl,
  getUnit,
  getCurrentRelayChainBlockNumber,
  hasSuccess,
} from "../api.js";
import { getParameterByName, setUrlParameter } from "../url.js";
import { inProgress } from "../progress.js";
import { displaySchedule } from "../schedule.js";
import { AddressError, getAccounts, getMultisigAddress } from "../wallet.js";

function multisigProcess(showError = false) {
  const element = document.getElementById("multisigSignatories");
  element.setCustomValidity("");
  try {
    return getMultisigAddress(getPrefix());
  } catch (e) {
    if (!showError) {
      console.error("Multisig Error", e);
    } else if (e instanceof AddressError) {
      element.setCustomValidity(e.message);
    } else {
      element.setCustomValidity(`Multisig setup is invalid. Wrong threshold or bad signatories: ${e.toString()}`);
    }
    return null;
  }
}

async function displayPendingMultisigTransaction(tx) {
  const template = document.querySelector("#multisig-template");
  const el = template.content.cloneNode(true);
  await pendingTransactionUpdate(tx, el);
  return el;
}

async function pendingTransactionUpdate(tx, el) {
  if (tx.callDataJson.method) {
    const { method, section } = tx.callDataJson;
    el.querySelector(".extrinsic").innerHTML = `${method}.${section}`;
  } else {
    el.querySelector(".extrinsic").innerHTML = "Unknown";
  }
  const isApproved = tx.approvals.length >= Number(document.getElementById("multisigThreshold").value);

  const approvedAddresses = tx.approvals.map((a) => encodeAddress(a, getPrefix()));
  el.querySelector(".approvals").innerHTML =
    (isApproved ? "<b>Threshold Reached:</b> " : "") + approvedAddresses.join(", ");

  const callDataInput = el.querySelector("input.callData");
  if (tx.hexCallData) {
    callDataInput.value = tx.hexCallData;
  }
  callDataInput.addEventListener(
    "focusout",
    async (input) => {
      const value = input.target.value;
      inProgress(true, ".connectionLoader", ".hideProcessing", "submitForm");
      const callData = value ? [processRawCallData(value)] : [];
      const newTx = await processMultisigEntry(callData)(tx.original);
      await pendingTransactionUpdate(newTx, input.target.closest(".pending-multisig"));
      updateUrlCallData();
      inProgress(false, ".connectionLoader", ".hideProcessing", "submitForm");
    },
    { once: true },
  );

  if (tx.hash) {
    el.querySelector(".callHash").innerHTML = tx.hash;
  }

  // This is a Time Release Transfer
  const timeReleaseEl = el.querySelector(".multisig-time-release");
  if (tx.callDataJson?.callIndex === "0x2801" && tx.callDataJson?.args?.schedule) {
    timeReleaseEl.innerHTML = "";
    timeReleaseEl.append(
      displaySchedule(
        tx.callDataJson.args.schedule,
        encodeAddress(tx.callDataJson.args.dest.id, getPrefix()),
        await getCurrentRelayChainBlockNumber(),
      ),
    );
  } else {
    timeReleaseEl.innerHTML = "Not a Time Release Transaction";
  }

  const signingSection = el.querySelector(".signingSection");
  const walletAddressNotFound = el.querySelector(".walletAddressNotFound");
  // Filter to just accounts in the wallet and ones that have not signed it
  const walletSigningAccounts = (await getAccounts(getPrefix(), true)).filter(
    (x) => isApproved || !approvedAddresses.includes(x.address),
  );

  if (walletSigningAccounts.length > 0) {
    const sender = walletSigningAccounts[0].address;
    const buttonExe = signingSection.querySelector(".countersignExe");
    if (tx.hexCallData) {
      buttonExe.dataset.sender = sender;
      buttonExe.dataset.txHash = tx.hash;
      buttonExe.dataset.callData = tx.hexCallData;
      buttonExe.dataset.when = JSON.stringify(tx.when);
      buttonExe.setAttribute("title", `With Account: ${sender}`);
      buttonExe.disabled = false;
    } else {
      buttonExe.disabled = true;
    }

    const buttonAuth = signingSection.querySelector(".countersignAuth");
    buttonAuth.dataset.sender = sender;
    buttonAuth.dataset.txHash = tx.hash;
    buttonAuth.dataset.when = JSON.stringify(tx.when);
    buttonAuth.setAttribute("title", `With Account: ${sender}`);
    buttonAuth.disabled = isApproved;
    buttonAuth.classList.remove("small");
    if (tx.hexCallData) buttonAuth.classList.add("small");

    signingSection.style.display = "block";
    walletAddressNotFound.style.display = "none";
  } else {
    signingSection.style.display = "none";

    // Get the account that deposited
    const depositor = (await getAccounts(getPrefix(), true)).find((x) => x.address === tx.depositor);

    const buttonCancel = walletAddressNotFound.querySelector(".countersignCancel");
    buttonCancel.dataset.txHash = tx.hash;
    buttonCancel.dataset.isCancel = true;
    buttonCancel.dataset.when = JSON.stringify(tx.when);
    // Only the depsitor can cancel
    if (!depositor) {
      buttonCancel.disabled = true;
      buttonCancel.setAttribute("title", `ONLY ${tx.depositor.toString()} can cancel this transaction.`);
    } else {
      buttonCancel.dataset.sender = depositor.address;
      buttonCancel.setAttribute("title", `With Account: ${depositor.address}`);
    }
    walletAddressNotFound.style.display = "block";
  }
}

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
const postTransaction = (section) => (status) => {
  const completed = (disabled) => {
    section.querySelector(".loader").style.display = "none";
    section.querySelectorAll("button").forEach((x) => (x.disabled = disabled));
  };

  let msg;

  if (typeof status === "string") {
    msg = status;
    completed(false);
  } else if (status.isInBlock) {
    msg = "In Block";
  } else if (status.isFinalized) {
    const finalizedBlock = status.status.asFinalized.toHuman();
    if (hasSuccess(status)) {
      msg = `Finalized: <a target="_blank" title="Block Details" href="https://polkadot.js.org/apps/?rpc=${getProviderUrl()}#/explorer/query/${finalizedBlock}">${finalizedBlock}</a>`;
      completed(true);
    } else {
      msg = `<span style="color: red; font-weight: bold;">POSSIBLE ERROR!!</span> Please check finalized block: <a target="_blank" title="Block Details" href="https://polkadot.js.org/apps/?rpc=${getProviderUrl()}#/explorer/query/${finalizedBlock}">${finalizedBlock}</a>`;
      msg += "<br />";
      msg += printEvents(status);
      completed(false);
    }
  } else if (status.isError) {
    msg = `<span style="color: red;">Error</span>: ${status.status.toHuman()}`;
    completed(false);
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
  section.append(p);
};

async function signTransaction(section, sender, txHash, timepoint, callData, isCancel = false) {
  const api = await loadApi();
  const multisigResult = multisigProcess(false);
  if (!multisigResult) {
    alert("Invalid Multisig Configuration");
    return;
  }
  section.querySelectorAll("button").forEach((x) => (x.disabled = true));
  section.querySelector(".loader").style.display = "block";

  const [_multisigAddress, multisigThreshold, multisigSignatories] = multisigResult;
  // We need to remove the sender and sort correctly before asMulti can be used.
  const senderEncoded = encodeAddress(sender, getPrefix());
  const sortedOthers = multisigSignatories.filter((x) => x !== senderEncoded).sort(multisigSort);
  const maxWeight = { refTime: 1_000_000_000, proofSize: 100_000 };

  const injector = await web3FromAddress(sender);

  let tx;
  if (isCancel) {
    tx = api.tx.multisig.cancelAsMulti(multisigThreshold, sortedOthers, timepoint, txHash);
  } else if (callData) {
    tx = api.tx.multisig.asMulti(multisigThreshold, sortedOthers, timepoint, callData, maxWeight);
  } else {
    tx = api.tx.multisig.approveAsMulti(multisigThreshold, sortedOthers, timepoint, txHash, maxWeight);
  }

  try {
    await tx.signAndSend(sender, { signer: injector.signer }, postTransaction(section));
  } catch (e) {
    postTransaction(section)(e.message);
  }
}

async function processSubmission() {
  inProgress(true, ".connectionLoader", ".hideProcessing", "submitForm");
  const pendingTransactions = document.getElementById("pendingTransactions");
  pendingTransactions.innerHTML = "Loading...";

  // Generate Multisig

  const multisigResult = multisigProcess(false);
  if (multisigResult === null) {
    pendingTransactions.innerHTML = "...";
    inProgress(false, ".connectionLoader", ".hideProcessing", "submitForm");
    return;
  }

  const [multisigAddress, _multisigThreshold, _multisigSignatories] = multisigResult;

  document.getElementById("multisigAddress").innerHTML = multisigAddress;

  const balanceData = await getBalance(multisigAddress);

  const transactions = await getPendingMultisigTransactions(multisigAddress);

  if (transactions) {
    pendingTransactions.innerHTML = "";
    for (const tx of transactions) {
      pendingTransactions.append(await displayPendingMultisigTransaction(tx));
    }
  } else {
    pendingTransactions.innerHTML = "None Found";
  }

  document.getElementById("resultBalanceTokens").innerHTML = balanceData.decimal + " " + getUnit();
  document.getElementById("resultBalancePlancks").innerHTML = balanceData.plancks;
  document.getElementById("resultReserved").innerHTML = balanceData.frozen;
  inProgress(false, ".connectionLoader", ".hideProcessing", "submitForm");
}

const processRawCallData = (cd) => ({
  callData: cd,
  callHash: blake2AsHex(cd),
});

const processMultisigEntry = (callDatas) => async (entry) => {
  const [address, callHash] = entry[0].toHuman();
  const multisigEntry = {
    ...entry[1].toJSON(),
    address,
    callHash,
    original: entry,
  };

  const record = callDatas.filter((r) => r.callHash === multisigEntry.callHash);
  if (!record || record.length === 0) {
    return { ...multisigEntry, callDataJson: {}, meta: {}, hash: multisigEntry.callHash };
  }
  try {
    const api = await loadApi();
    const callData = api.registry.createType("Call", record[0].callData);
    const { section, method } = api.registry.findMetaCall(callData.callIndex);
    const callDataJson = { ...callData.toJSON(), section, method };
    const hexCallData = callData.toHex();
    const meta = api?.tx[callDataJson?.section][callDataJson.method].meta.toJSON();

    return {
      ...multisigEntry,
      callDataJson,
      callData,
      meta,
      hash: multisigEntry.callHash,
      hexCallData,
      approveRecords: record[0].approveRecords,
    };
  } catch (_e) {
    return { ...multisigEntry, callDataJson: {}, meta: {}, hash: multisigEntry.callHash };
  }
};

async function getPendingMultisigTransactions(address) {
  const api = await loadApi();
  const multisigEntries = await api.query.multisig.multisigs.entries(address);
  const callDatas = getParameterByName("calldata", true).map(processRawCallData);

  const result = Promise.all(multisigEntries.map(processMultisigEntry(callDatas)));

  return result;
}

// Post node connection, connect to the wallet
async function postConnect() {
  await web3Enable("Multisig dApp");
  await getAccounts(getPrefix());
  setFromUrl();
}

function updateUrlCallData() {
  const callDatas = [...document.querySelectorAll("input.callData")].map((x) => x.value).filter((x) => !!x);
  setUrlParameter("calldata", callDatas);
}

function updateUrl() {
  if (!getIsConnected()) return;

  // get the multisig information
  const multisigThreshold = parseInt(document.getElementById("multisigThreshold").value);
  const multisigSignatories = document
    .getElementById("multisigSignatories")
    .value.split("\n")
    .map((x) => x.trim())
    .filter((x) => !!x);

  setUrlParameter("threshold", multisigThreshold);
  setUrlParameter("signatories", multisigSignatories);
}

function setFromUrl() {
  const multisigThreshold = getParameterByName("threshold");
  const multisigSignatories = getParameterByName("signatories", true);

  if (multisigThreshold) {
    document.getElementById("multisigThreshold").value = multisigThreshold;
  }

  if (multisigSignatories) {
    document.getElementById("multisigSignatories").value = multisigSignatories.join("\n");
  }

  const isAdmin = getParameterByName("admin") !== null;
  if (isAdmin) {
    document.getElementById("pendingTransactions").classList.add("isAdmin");
  }
}

// Start this up with event listeners
function init() {
  document.getElementById("multisigForm").addEventListener("submit", (e) => {
    e.preventDefault();
    updateUrl();
    processSubmission();
  });

  document.getElementById("multisigSignatories").addEventListener("blur", () => multisigProcess(true));

  document.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("countersign")) return;
    e.preventDefault();
    if (!e.target.dataset.sender) return;

    const { sender, txHash, callData, when, isCancel } = e.target.dataset;

    const section = e.target.closest(".pending-multisig");
    await signTransaction(section, sender, txHash, JSON.parse(when), callData, isCancel || false);
  });

  initConnection(postConnect);
}

init();
