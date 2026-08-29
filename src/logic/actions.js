import { findInstance, findSlot } from '../state/gameState.js';
import { recordImmortalEvent } from './immortal.js';
import { INDY_DIG_DURATION_SEC } from './waveEvents.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { GLOBAL_ENHANCE_COST, GLOBAL_ENHANCE_MAX_LEVEL } from '../data/constants.js';

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

/**
 * 칸 간 이동(재배치). 선택 기준이 개체 하나가 아니라 "칸 자체"라서(사용자 지정 규칙),
 * 칸에 여러 마리가 쌓여 있으면 전부 한 번에 옮긴다 - 3마리를 옮기려고 3번 드래그할
 * 필요가 없다. 대상 칸이 비어 있으면 통째로 이동, 같은 영웅이 이미 있으면(신화/불멸
 * 제외 - 항상 단일 개체) 최대 3마리까지 합치고 넘치는 만큼은 원래 칸에 남으며,
 * 서로 다른 영웅이면 두 칸의 내용을 통째로 맞바꾼다(교차 이동).
 * 탑 베인의 궁극기 환산 카운트 등 이동 기반 불멸 조건은 실제로 옮겨진 개체마다 기록한다.
 */
export function moveHero(state, fromRow, fromCol, toRow, toCol) {
  const newState = structuredClone(state);
  const fromSlot = findSlot(newState, fromRow, fromCol);
  const toSlot = findSlot(newState, toRow, toCol);
  if (!fromSlot || !toSlot || fromSlot === toSlot || fromSlot.occupants.length === 0) {
    return { success: false, reason: 'invalid-move', newState: state };
  }

  const movedInstanceIds = fromSlot.occupants.map((o) => o.instanceId);
  const movingHeroId = fromSlot.occupants[0].heroId;
  const movingHeroDef = HEROES_BY_ID[movingHeroId];
  const singleSlot = movingHeroDef?.tier === 'mythic' || movingHeroDef?.tier === 'immortal';

  if (toSlot.occupants.length === 0) {
    toSlot.occupants = fromSlot.occupants;
    fromSlot.occupants = [];
  } else if (!singleSlot && toSlot.occupants[0].heroId === movingHeroId) {
    const combined = [...toSlot.occupants, ...fromSlot.occupants];
    toSlot.occupants = combined.slice(0, 3);
    fromSlot.occupants = combined.slice(3);
  } else {
    const swapped = toSlot.occupants;
    toSlot.occupants = fromSlot.occupants;
    fromSlot.occupants = swapped;
  }

  newState.counters.moveCount += 1;

  let result = newState;
  for (const instanceId of movedInstanceIds) {
    const afterEvent = recordImmortalEvent(result, instanceId, 'move');
    if (afterEvent.success) result = afterEvent.newState;
  }
  return { success: true, newState: result };
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
 * 누르는 즉시 결과가 나오는 게 아니라 INDY_DIG_DURATION_SEC(2초) 동안 발굴 중
 * 상태로 대기한다(사용자 지정) - 실제 등급 판정/지급은 waveEvents.js의
 * tickIndyDig()가 시간이 다 됐을 때 처리한다. 인디는 1개의 보물만 보유.
 */
export function digTreasure(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found || found.instance.heroId !== 'm_indy') {
    return { success: false, reason: 'not-indy', newState: state };
  }
  if (newState.indyTreasure.digging) {
    return { success: false, reason: 'already-digging', newState: state };
  }
  const treasureSlot = newState.indyTreasure.slot;
  if (!treasureSlot || treasureSlot.row !== found.slot.row || treasureSlot.col !== found.slot.col) {
    return { success: false, reason: 'wrong-position', newState: state };
  }

  newState.indyTreasure.digging = { instanceId, timer: INDY_DIG_DURATION_SEC };

  return { success: true, newState };
}

/**
 * 하단 "강화" 팝업의 전역 4트랙(일반~희귀/영웅/전설~불멸/소환 확률) 레벨업.
 * 특정 필드 개체가 아니라 계정 전체에 적용되는 별도 시스템 - 선택된 영웅의 강화는
 * enhanceHero()가 따로 담당한다.
 */
export function upgradeGlobalEnhance(state, track) {
  const cost = GLOBAL_ENHANCE_COST[track];
  if (!cost) return { success: false, reason: 'invalid-track', newState: state };
  const maxLevel = GLOBAL_ENHANCE_MAX_LEVEL[track];
  if (maxLevel != null && state.globalEnhance[track] + 1 >= maxLevel) {
    return { success: false, reason: 'max-level', newState: state };
  }
  const newState = structuredClone(state);
  if (cost.gold && newState.gold < cost.gold) return { success: false, reason: 'not-enough-gold', newState: state };
  if (cost.luckstone && newState.luckstone < cost.luckstone) return { success: false, reason: 'not-enough-luckstone', newState: state };

  if (cost.gold) newState.gold -= cost.gold;
  if (cost.luckstone) newState.luckstone -= cost.luckstone;
  newState.globalEnhance[track] += 1;
  // "강화 시작" 미션(강화 버튼 2회 사용)은 4트랙 중 아무 버튼이나 눌러도 진행돼야 한다
  // (사용자 지적 - enhanceHero()는 특정 영웅 전용이라 거의 안 눌려서 미션이 막혀 있었음).
  newState.counters.enhanceCount += 1;

  return { success: true, newState };
}
