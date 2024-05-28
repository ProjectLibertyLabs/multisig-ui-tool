import { toDecimalUnit, getUnit } from "./api.js";

export async function getSchedules(api, account) {
  const schedules = await api.query.timeRelease.releaseSchedules(account);

  if (schedules.length === 0) {
    return [];
  }

  return schedules.map((s) => ({
    periodCount: s.periodCount.toNumber(),
    start: s.start.toNumber(),
    period: s.period.toNumber(),
    perPeriod: s.perPeriod.toBigInt(),
  }));
}

export function sortSchedule(a, b) {
  return Math.sign(a.start + a.period - (b.start + b.period));
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
  const unlockRelayBlock = schedule.start + schedule.period;
  scheduleEl.querySelector(".unlockRelayBlock").innerHTML = unlockRelayBlock.toLocaleString();

  const untilUnlock = (unlockRelayBlock - relayBlockNumber) * 6 * 1000;
  const unlockEstimate = new Date(Date.now() + untilUnlock);
  scheduleEl.querySelector(".estimatedUnlock").innerHTML = unlockEstimate.toLocaleString();

  if (destination) {
    scheduleEl.querySelector(".destination").innerHTML = destination;
  }

  return scheduleEl;
}
