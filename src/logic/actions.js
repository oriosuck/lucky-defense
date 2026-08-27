import { findInstance, canPlaceInSlot, findSlot } from '../state/gameState.js';
import { recordImmortalEvent } from './immortal.js';

export const ENHANCE_GOLD_COST = 30;
export const ENHANCE_LUCKSTONE_COST = 1;

/** 필드 영웅 강화. 데미지 계산은 시뮬레이션 범위 밖 - 강화 단계만 증가. */
export function enhanceHero(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { success: false, reason: 'not-found', newState: state };
  if (newState.gold < ENHANCE_GOLD_COST || newState.luckstone < ENHANCE_LUCKSTONE_COST) {
    return { success: false, reason: 'not-enough-resource', newState: state };
  }

  newState.gold -= ENHANCE_GOLD_COST;
  newState.luckstone -= ENHANCE_LUCKSTONE_COST;
  found.instance.enhanceLevel += 1;
  newState.counters.enhanceCount += 1;

  const afterEvent = recordImmortalEvent(newState, instanceId, 'enhance');
  return { success: true, newState: afterEvent.success ? afterEvent.newState : newState };
}

/** 슬롯 간 이동(재배치). 탑 베인의 궁극기 환산 카운트 등 이동 기반 불멸 조건과 연동. */
export function moveHero(state, instanceId, toRow, toCol) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { success: false, reason: 'not-found', newState: state };
  const targetSlot = findSlot(newState, toRow, toCol);
  if (!targetSlot) return { success: false, reason: 'invalid-slot', newState: state };
  if (targetSlot === found.slot) return { success: false, reason: 'same-slot', newState: state };
  if (!canPlaceInSlot(newState, targetSlot, found.instance.heroId)) {
    return { success: false, reason: 'cannot-place', newState: state };
  }

  found.slot.occupants = found.slot.occupants.filter((o) => o.instanceId !== instanceId);
  targetSlot.occupants.push(found.instance);
  newState.counters.moveCount += 1;

  const afterEvent = recordImmortalEvent(newState, instanceId, 'move');
  return { success: true, newState: afterEvent.success ? afterEvent.newState : newState };
}

/** "돌파" 상태 On/Off - 현재는 마마 전용 */
export function toggleBreakthrough(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { success: false, reason: 'not-found', newState: state };
  if (found.instance.heroId !== 'm_mama') {
    return { success: false, reason: 'not-supported', newState: state };
  }
  found.instance.breakthrough = !found.instance.breakthrough;
  return { success: true, newState };
}
