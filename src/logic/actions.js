import { findInstance, canPlaceInSlot, findSlot } from '../state/gameState.js';
import { recordImmortalEvent } from './immortal.js';
import { rollNormalTier } from './summon.js';
import { TIERS } from '../data/heroes.js';

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

/**
 * 인디 전용 "보물 발굴"(5-4): 인디가 현재 보물이 등장한 칸에 있을 때만 발굴 가능.
 * 등급은 일반 소환과 동일한 고정 확률표를 사용하고, 기존 보유 보물보다 낮은 등급이면
 * 교체하지 않는다. 인디는 1개의 보물만 보유.
 */
export function digTreasure(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found || found.instance.heroId !== 'm_indy') {
    return { success: false, reason: 'not-indy', newState: state };
  }
  const treasureSlot = newState.indyTreasure.slot;
  if (!treasureSlot || treasureSlot.row !== found.slot.row || treasureSlot.col !== found.slot.col) {
    return { success: false, reason: 'wrong-position', newState: state };
  }

  const rolledTier = rollNormalTier();
  const current = found.instance.indyTreasureTier;
  const upgraded = !current || TIERS.indexOf(rolledTier) > TIERS.indexOf(current);
  if (upgraded) found.instance.indyTreasureTier = rolledTier;

  return { success: true, tier: rolledTier, upgraded, newState };
}
