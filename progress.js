// Simple loading and button blocker
// Show while in progress: showQuery
// Hide while in progress: hideQuery
// Disable Button Id: buttonId
export function inProgress(isInProgress, showQuery, hideQuery = null, buttonId = null) {
  const show = document.querySelectorAll(showQuery);
  const button = document.getElementById(buttonId);
  if (isInProgress) {
    button && (button.disabled = true);
    show.forEach((x) => (x.style.display = "block"));
    hideQuery && document.querySelectorAll(hideQuery).forEach((e) => (e.style.display = "none"));
  } else {
    button && (button.disabled = false);
    show.forEach((x) => (x.style.display = "none"));
    hideQuery && document.querySelectorAll(hideQuery).forEach((e) => (e.style.display = "block"));
  }
}

// Simple place to dump log data that is then able to be sent to a clipboard
let loggedData = {};
// Key of what was most recently logged
let lastKeyInLoggedData = null;

export function clearLog() {
  document.getElementById("log").innerHTML = "";
  loggedData = {};
  lastKeyInLoggedData = null;
}

export function addLogData(key, data) {
  loggedData[key] = data;
  lastKeyInLoggedData = key;
}

export function updateLogData(key, status, finalizedBlock = null) {
  loggedData[key]["status"] = status;
  finalizedBlock && (loggedData[key]["finalizedBlock"] = finalizedBlock);
}

export function callHashToTxHash(callHash, txHash) {
  // Move it over to the txHash
  if (loggedData[callHash]) {
    loggedData[txHash] = loggedData[callHash];
    delete loggedData[callHash];
    lastKeyInLoggedData = txHash;
  }
}

export function getLastLoggedKey() {
  return lastKeyInLoggedData;
}

// Simple function to allow getting data out into a spreadsheet paste-able form
export const copyToSpreadsheet =
  (type = "all") =>
  () => {
    let first = true;
    let logData = [];
    let elId = "copyToSpreadsheet";
    if (type === "last") {
      first = false;
      logData = lastKeyInLoggedData && loggedData[lastKeyInLoggedData] ? [loggedData[lastKeyInLoggedData]] : [];
      elId = "copyToSpreadsheetLast";
    } else {
      logData = Object.values(loggedData);
    }
    const list = logData.flatMap((v) => {
      const row = Object.values(v);
      if (first) {
        first = false;
        const header = Object.keys(v);
        return [header, row];
      }
      return [row];
    });
    navigator.clipboard.writeText(list.map((x) => x.join("\t")).join("\n"));
    const label = document.getElementById(elId).innerHTML;
    document.getElementById(elId).innerHTML = "Copied!";
    setTimeout(() => {
      document.getElementById(elId).innerHTML = label;
    }, 2000);
  };

// Simple display of a new log
// Assumes element with id=log
export function addLog(msg, prefix) {
  prefix = prefix ? prefix + ": " : "";
  if (typeof msg === "string") {
    msg = [msg];
  }

  const li = document.createElement("li");
  const ul = document.createElement("ul");

  let head = msg.shift();
  li.innerHTML = `${new Date().toLocaleString()} - ${prefix}${head}`;

  while ((head = msg.shift())) {
    const liHead = document.createElement("li");
    liHead.innerHTML = head;
    ul.append(liHead);
  }

  li.append(ul);

  document.getElementById("log").prepend(li);
}
