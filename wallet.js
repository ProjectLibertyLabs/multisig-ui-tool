import {
  checkAddress,
  decodeAddress,
  encodeAddress,
  createKeyMulti,
} from "https://cdn.jsdelivr.net/npm/@polkadot/util-crypto@13.1.1/+esm";
import { web3Accounts } from "https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.53.1/+esm";

export class AddressError extends Error {}

let cachedAccounts = null;
let cachedAccountsMs = null;
export const getAccounts = async (prefix, multisigCheck = false) => {
  if (!cachedAccounts) cachedAccounts = await web3Accounts();

  if (!multisigCheck) return cachedAccounts;
  if (cachedAccountsMs) return cachedAccountsMs;

  try {
    const addresses = getMultisigAddress(prefix);

    if (!addresses || !addresses[2]) return [];

    const msSet = new Set(addresses[2].map((x) => encodeAddress(x, prefix)));
    return (cachedAccountsMs = cachedAccounts.filter((x) => msSet.has(encodeAddress(x.address, prefix))));
  } catch (e) {
    console.error("Error getting acounts", e);
    return [];
  }
};

export function getMultisigAddress(prefix) {
  const multisigThreshold = parseInt(document.getElementById("multisigThreshold")?.value || 1);
  const senderAddress = document.getElementById("sender")?.value;
  const multisigSignatories = document
    .getElementById("multisigSignatories")
    .value.split("\n")
    .map((x) => x.trim())
    .filter((x) => !!x)
    .filter((x) => x !== senderAddress);
  if (senderAddress) multisigSignatories.push(senderAddress);

  if (multisigThreshold > multisigSignatories.length) {
    throw new AddressError(`Multisig setup is invalid. Wrong threshold or bad signatories.`);
  }
  multisigSignatories.forEach((signatory) => {
    const check = checkAddress(signatory, prefix);
    if (!check[0]) {
      throw new AddressError(`Signatory address "${signatory}" is invalid: ${check[1] || "unknown"}`);
    }
  });

  const multisigAddress = encodeAddress(createKeyMulti(multisigSignatories, multisigThreshold), prefix);
  return [multisigAddress, multisigThreshold, multisigSignatories];
}

function arrayEquality(a, b) {
  if (a.length !== b.length) return false;

  for (const i in a) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function addressEquality(a, b) {
  return arrayEquality(decodeAddress(a), decodeAddress(b));
}
