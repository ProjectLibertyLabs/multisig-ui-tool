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

export async function getStakeTargets(api, account) {
  const targets = await api.query.capacity.stakingTargetLedger.entries(account);

  if (targets.length === 0) {
    return [];
  }

  return Promise.all(
    targets.map(async (target) => {
      const providerId = target[0].args[1].toBigInt();
      const stakeAmount = target[1].unwrap().amount.toBigInt();
      const providerRegistry = await api.query.msa.providerToRegistryEntry(providerId);
      return {
        providerName: providerRegistry
          .unwrapOr({ providerName: { toHuman: () => "Invalid Provider" } })
          .providerName.toHuman(),
        providerId,
        stakeAmount,
      };
    }),
  );
}

export function displayStaking(ledger, targets) {
  if (!ledger) {
    return "No active staking.";
  }

  const template = document.querySelector("#staking-template");
  const stakingEl = template.content.cloneNode(true);
  stakingEl.querySelector(".stakingTokens").innerHTML = toDecimalUnit(ledger.active) + " " + getUnit();

  stakingEl.querySelector(".stakingType").innerHTML = StakingType[ledger.type] || ledger.type;

  const stakeDetailsEl = stakingEl.querySelector(".stakeDetails");

  const detailsTemplate = document.querySelector("#staking-template-detail");
  for (const target of targets) {
    const detail = detailsTemplate.content.cloneNode(true);
    detail.querySelector(".stakeDetailsAmount").innerHTML = toDecimalUnit(target.stakeAmount) + " " + getUnit();
    detail.querySelector(".stakeDetailsProvider").innerHTML =
      `${target.providerName} (Id: ${target.providerId.toString()})`;
    const button = detail.querySelector(".unstakeButton");
    button.dataset.providerId = target.providerId.toString();
    button.dataset.stakeAmount = target.stakeAmount.toString();
    stakeDetailsEl.append(detail);
  }

  return stakingEl;
}

export function getStakingCall(api, stakeType, providerId, amount) {
  switch (stakeType) {
    case "ProviderBoost":
      return api.tx.capacity.providerBoost(providerId, amount);
    case "MaxCapacity":
      return api.tx.capacity.stake(providerId, amount);
    default:
      throw new Error(`Unknown staking type "${stakeType}"`);
  }
}
