import { toDecimalUnit, getUnit } from "./api.js";

export const StakingType = {
  ProviderBoost: "Provider Boosting",
  MaxCapacity: "Maximum Capacity",
};

export async function getLedger(api, account) {
  const maybeLedger = await api.query.capacity.stakingAccountLedger(account);

  if (maybeLedger.isNone) {
    return null;
  }

  const ledger = maybeLedger.unwrap();

  return {
    active: ledger.active.toBigInt(),
    type: ledger.stakingType.toString(),
  };
}

export function displayStaking(ledger) {
  if (!ledger) {
    return "No active staking.";
  }

  const template = document.querySelector("#staking-template");
  const stakingEl = template.content.cloneNode(true);
  stakingEl.querySelector(".stakingTokens").innerHTML = toDecimalUnit(ledger.active) + " " + getUnit();

  stakingEl.querySelector(".stakingType").innerHTML = StakingType[ledger.type] || ledger.type;

  return stakingEl;
}
