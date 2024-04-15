import { toDecimalUnit, getUnit } from "./api.js";

export function sortSchedule(a, b) {
  return Math.sign(a.start.toNumber() + a.period.toNumber() - (b.start.toNumber() + b.period.toNumber()));
}

export function displaySchedule(schedule, destination, relayBlockNumber) {
  if (schedule.periodCount > 1) {
    const unsupported = document.createElement("span");
    unsupported.innerHTML = "Unsupported per period value";
    return unsupported;
  }
  const template = document.querySelector("#schedule-template");
  const scheduleEl = template.content.cloneNode(true);
  scheduleEl.querySelector(".balanceResultTokens").innerHTML =
    toDecimalUnit(schedule.perPeriod.toString()) + " " + getUnit();
  const unlockRelayBlock = schedule.start.toNumber() + schedule.period.toNumber();
  scheduleEl.querySelector(".unlockRelayBlock").innerHTML = unlockRelayBlock.toLocaleString();
  console.log({ unlockRelayBlock, relayBlockNumber });
  const untilUnlock = (unlockRelayBlock - relayBlockNumber) * 6 * 1000;
  const unlockEstimate = new Date(Date.now() + untilUnlock);
  scheduleEl.querySelector(".estimatedUnlock").innerHTML = unlockEstimate.toLocaleString();

  if (destination) {
    scheduleEl.querySelector(".destination").innerHTML = destination;
  }

  return scheduleEl;
}
