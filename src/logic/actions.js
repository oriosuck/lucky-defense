import { findInstance, canPlaceInSlot, findSlot } from '../state/gameState.js';
import { recordImmortalEvent } from './immortal.js';

export const ENHANCE_GOLD_COST = 30;
export const ENHANCE_LUCKSTONE_COST = 1;

/**
 * 선택된 영웅 개체 1마리의 개별 강화(선택 패널 전용). 데미지 계산은 시뮬레이션
 * 범위 밖 - 강화 단계만 증가. 아이엠 미야옹/에이스 배트맨/기사 랜슬롯 불멸 승급
 * 조건이 이 개체별 강화 단계(enhanceLevel)를 참조한다.
 */
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

// 하단 "강화" 버튼(영웅 선택 여부와 무관하게 항상 열림)의 등급대별 전체 강화 4종.
// 실제 게임 화면 기준 Lv.1 비용만 확인됨 - 레벨별 상승폭은 확정 수치가 없어
// 레벨에 비례해 선형으로 증가하는 것으로 우선 처리(플레이스홀더).
export const GLOBAL_UPGRADE_TRACKS = {
  normalRare: { label: '일반~희귀', baseCost: 30, currency: 'gold' },
  hero: { label: '영웅', baseCost: 50, currency: 'gold' },
  legendaryImmortal: { label: '전설~불멸', baseCost: 2, currency: 'luckstone' },
  summonRate: { label: '소환 확률', baseCost: 100, currency: 'gold' },
};
export const GLOBAL_UPGRADE_MAX_LEVEL = 11; // 유물 레벨 범위(1~11)와 동일하게 우선 맞춤

export function globalUpgradeCost(trackKey, currentLevel) {
  return GLOBAL_UPGRADE_TRACKS[trackKey].baseCost * currentLevel;
}

/** 등급대별 전체 강화 레벨업. 소환 확률 트랙은 일반 소환 전설 확률에 1레벨당 1%p로 반영된다. */
export function upgradeGlobalTrack(state, trackKey) {
  const track = GLOBAL_UPGRADE_TRACKS[trackKey];
  if (!track) return { success: false, reason: 'invalid-track', newState: state };
  const newState = structuredClone(state);
  const level = newState.globalUpgrades[trackKey];
  if (level >= GLOBAL_UPGRADE_MAX_LEVEL) return { success: false, reason: 'max-level', newState: state };

  const cost = globalUpgradeCost(trackKey, level);
  if (track.currency === 'gold') {
    if (newState.gold < cost) return { success: false, reason: 'not-enough-gold', newState: state };
    newState.gold -= cost;
  } else {
    if (newState.luckstone < cost) return { success: false, reason: 'not-enough-luckstone', newState: state };
    newState.luckstone -= cost;
  }
  newState.globalUpgrades[trackKey] = level + 1;
  return { success: true, newState };
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
