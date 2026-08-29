import { findInstance, findSlot } from '../state/gameState.js';
import { recordImmortalEvent } from './immortal.js';
import { INDY_DIG_DURATION_SEC } from './waveEvents.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { GLOBAL_ENHANCE_COST, GLOBAL_ENHANCE_MAX_LEVEL } from '../data/constants.js';

// 필드 개체별 강화(enhanceHero)에 실제로 골드/행운석 비용이 있는 건 배트맨뿐이다
// (사용자 정정 - "다른 영웅들은 무슨 골드랑 행운석이야? 그런거 없는데"). 아이언
// 미야옹처럼 강화 "횟수"가 불멸 조건인 다른 영웅들은 그냥 무료로 눌러서 카운트만
// 올리면 된다 - 비용이 있던 예전 값(30G 1💎)은 이 기능을 처음 만들 때의 추측성
// 플레이스홀더였을 뿐 확정된 적이 없었다.
const BATMAN_ENHANCE_GOLD_BASE = 30;

// 배트맨 전용 강화 골드 비용 - 승급 확률이 10강부터 강화 레벨에 비례해서 계속
// 오르는 구조라(heroes.js IMMORTAL_CONDITIONS.m_batman), 승급 RNG가 안 터지는
// 동안 10강 이후로도 계속 강화를 밀어붙이는 경우가 흔하다 - 사용자가 지정한
// 구간별 고정값(1~5강 30, 6~10강 60, 11~15강 120)을 "5강마다 2배"로 일반화해서
// 명시되지 않은 그 이상 구간(16~20강 240...)에도 같은 패턴을 이어간다. 승급
// 후(i_ace_batman)에는 enhanceLevel이 0으로 리셋되고 더 강화할 이유(승급 조건은
// 이미 끝남, 데미지 계산도 범위 밖)가 없어서 강화 버튼 자체를 노출하지 않는다
// (GameScreen.js) - 이 비용표는 승급 전 m_batman에만 적용된다. 다른 영웅은 0(무료).
function nextEnhanceGoldCost(heroId, currentLevel) {
  if (heroId !== 'm_batman') return 0;
  const nextLevel = (currentLevel ?? 0) + 1;
  return BATMAN_ENHANCE_GOLD_BASE * 2 ** Math.floor((nextLevel - 1) / 5);
}
export { nextEnhanceGoldCost };

// 배트맨 강화는 행운석이 안 든다(사용자 지정 - "배트 강화 비용에 행운석은 안들어가").
// 다른 영웅도 애초에 강화 자체가 무료라 항상 0.
function nextEnhanceLuckstoneCost() {
  return 0;
}
export { nextEnhanceLuckstoneCost };

// 배트맨 강화 성공 확률(사용자 지정 수치) - 10강까지는 100%(무조건 성공), 11강부터
// 급격히 떨어진다. 11~15강 구간만 명시적으로 받았고(강화 비용 구간표의 마지막
// 구간과 정확히 일치), 그 이상(16강+)은 데이터가 없어 마지막 값(28%)을 그대로
// 유지하는 플레이스홀더로 둔다 - 나중에 더 높은 강화를 실제로 시도하는 유저가
// 나오면 사용자에게 재확인이 필요하다.
const BATMAN_ENHANCE_SUCCESS_RATE = { 11: 0.83, 12: 0.69, 13: 0.55, 14: 0.41, 15: 0.28 };
function batmanEnhanceSuccessRate(nextLevel) {
  if (nextLevel <= 10) return 1;
  if (nextLevel in BATMAN_ENHANCE_SUCCESS_RATE) return BATMAN_ENHANCE_SUCCESS_RATE[nextLevel];
  return BATMAN_ENHANCE_SUCCESS_RATE[15];
}

// UI에서 강화 버튼에 성공 확률을 같이 보여주기 위한 조회 헬퍼(배트맨 외에는
// 항상 100%라 버튼에서 굳이 안 보여줌 - GameScreen.js 참고).
export function nextEnhanceSuccessRate(heroId, currentLevel) {
  if (heroId !== 'm_batman') return 1;
  return batmanEnhanceSuccessRate((currentLevel ?? 0) + 1);
}

/**
 * 필드 영웅 강화. 데미지 계산은 시뮬레이션 범위 밖 - 강화 단계만 증가.
 * 배트맨만 골드를 쓰고 확률적으로 실패할 수 있다(실패해도 시도한 골드는 그대로
 * 소모됨 - 일반적인 강화 게임 관례를 따른 가정, 실패 시 레벨 하락/개체 소멸 같은
 * 페널티는 없음). 다른 영웅은 비용 없이 항상 성공(레벨 카운트만 올리면 되는
 * 용도라 실패 개념 자체가 없음).
 */
export function enhanceHero(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { success: false, reason: 'not-found', newState: state };
  const goldCost = nextEnhanceGoldCost(found.instance.heroId, found.instance.enhanceLevel);
  const luckstoneCost = nextEnhanceLuckstoneCost(found.instance.heroId);
  if (newState.gold < goldCost || newState.luckstone < luckstoneCost) {
    return { success: false, reason: 'not-enough-resource', newState: state };
  }

  newState.gold -= goldCost;
  newState.luckstone -= luckstoneCost;

  const nextLevel = (found.instance.enhanceLevel ?? 0) + 1;
  const successRate = found.instance.heroId === 'm_batman' ? batmanEnhanceSuccessRate(nextLevel) : 1;
  const leveledUp = Math.random() < successRate;
  if (!leveledUp) {
    return { success: true, leveledUp: false, newState };
  }

  found.instance.enhanceLevel = nextLevel;
  newState.counters.enhanceCount += 1;

  const afterEvent = recordImmortalEvent(newState, instanceId, 'enhance');
  return { success: true, leveledUp: true, newState: afterEvent.success ? afterEvent.newState : newState };
}

/**
 * 에이스 배트맨(불멸) 전용 "모드 변신" - 기본/투수모드/타자모드를 순환한다.
 * 데미지 계산 범위 밖이라 실질 효과는 없는 연출용 전환(다른 변신들과 같은 패턴).
 */
export function cycleBatmanMode(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found || found.instance.heroId !== 'i_ace_batman') {
    return { success: false, reason: 'not-ace-batman', newState: state };
  }
  const order = [null, 'pitcher', 'batter'];
  const currentIndex = order.indexOf(found.instance.batmanMode ?? null);
  found.instance.batmanMode = order[(currentIndex + 1) % order.length];
  return { success: true, newState };
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
