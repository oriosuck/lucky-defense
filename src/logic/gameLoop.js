import {
  tickWave,
  handleImmobilizeEvent,
  tickImmobilizeTimer,
  handleDeleteEvent,
  tickBossRaidWindow,
} from './waveEvents.js';
import { tickImmortalProgress, tickMamaImps } from './immortal.js';
import { checkMissions } from './missions.js';

/**
 * 게임 화면의 매초 tick. 기술설계서 4장 시퀀스를 그대로 구현.
 * @param {object} state
 * @param {number} deltaSec 실제 경과시간(배속/탭 비활성화 보정 포함)
 */
export function tick(state, deltaSec) {
  if (state.paused || state.result) return state;

  let next = tickWave(state, deltaSec);
  next = handleImmobilizeEvent(next);
  next = tickImmobilizeTimer(next, deltaSec);
  next = handleDeleteEvent(next);
  next = tickBossRaidWindow(next, deltaSec);
  next = tickImmortalProgress(next, deltaSec);
  next = tickMamaImps(next, deltaSec);
  next = checkMissions(next);

  return next;
}
