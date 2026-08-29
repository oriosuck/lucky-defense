import {
  HEROES,
  NORMAL_SUMMON_RATES,
  ROULETTE_SUCCESS_RATE,
  ROULETTE_COST,
  heroesByTier,
} from '../data/heroes.js';
import { NORMAL_SUMMON_COST_INCREMENT } from '../data/constants.js';
import {
  createHeroInstance,
  fieldOccupantCount,
  findAutoPlaceSlot,
  placeInstanceAtSlot,
} from '../state/gameState.js';

// 가중치 랜덤 뽑기 (기술설계서 4장 의사코드 그대로 구현)
export function weightedRandom(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let cumulative = 0;
  const roll = Math.random() * total;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry.item;
  }
  return entries[entries.length - 1].item; // 부동소수점 오차 대비
}

function pickRandomHeroOfTier(tier) {
  const pool = heroesByTier(tier);
  return pool[Math.floor(Math.random() * pool.length)];
}

// 일반~전설 등급 뽑기 확률표(기획서 6장 확정 수치, 항상 고정 - 강화 버튼의 확률 업그레이드는
// 연출용 모션만 있고 실제 수치에는 반영되지 않는다). 인디의 "보물 발굴"도 동일 확률표를 쓴다.
export function rollNormalTier() {
  const entries = Object.entries(NORMAL_SUMMON_RATES).map(([tier, rate]) => ({ item: tier, weight: rate }));
  return weightedRandom(entries);
}

// 대기열에 보관된 룰렛 결과를 필드에 자리가 날 때마다 자동 배치
function drainPendingQueue(state) {
  const remaining = [];
  for (const heroId of state.pendingPlacementQueue ?? []) {
    const slot = findAutoPlaceSlot(state, heroId);
    if (slot) {
      placeInstanceAtSlot(slot, createHeroInstance(heroId));
    } else {
      remaining.push(heroId);
    }
  }
  state.pendingPlacementQueue = remaining;
}

/**
 * 일반 소환. 필드가 가득 찬 경우 소환 자체를 막는다(설계서 5장 확정 사항).
 * @returns {{success:boolean, reason?:string, hero?:object, newState:object}}
 */
export function summonNormal(state) {
  const newState = structuredClone(state);
  drainPendingQueue(newState);

  if (newState.gold < newState.normalSummonCost) {
    return { success: false, reason: 'not-enough-gold', newState: state };
  }
  if (fieldOccupantCount(newState) >= newState.fieldMaxCapacity) {
    return { success: false, reason: 'field-full', newState: state };
  }

  newState.gold -= newState.normalSummonCost;
  newState.normalSummonCost += NORMAL_SUMMON_COST_INCREMENT; // 소환할수록 비용 증가(기획서 6장 확정 수치)

  const tier = rollNormalTier();
  const heroDef = pickRandomHeroOfTier(tier);
  if (tier === 'legendary') newState.counters.normalSummonLegendaryCount += 1; // "소환에서 전설 등급 등장" 미션용
  if (tier === 'hero') newState.counters.normalSummonHeroCount += 1; // "소환에서 영웅 등급 등장 3번" 미션용

  const slot = findAutoPlaceSlot(newState, heroDef.id);
  if (slot) {
    placeInstanceAtSlot(slot, createHeroInstance(heroDef.id));
  }

  return { success: true, hero: heroDef, newState };
}

const ROULETTE_TIER_ORDER = ['rare', 'hero', 'legendary'];

/**
 * 룰렛 소환. 실패 가능하며 실패 시 해골 표시만 하고 재화만 소모한다.
 * 성공 시 결과가 필드에 자리가 없으면 대기열에 보관 후 자동 배치.
 * @param {'rare'|'hero'|'legendary'} tier
 * @param {'left'|'right'} slotPosition 앞 2개(보석1) / 맨 오른쪽(보석2)
 */
export function summonRoulette(state, tier, slotPosition = 'left') {
  if (!ROULETTE_TIER_ORDER.includes(tier)) {
    throw new Error(`invalid roulette tier: ${tier}`);
  }
  const newState = structuredClone(state);
  drainPendingQueue(newState);

  // 필드가 꽉 찼으면 소환 자체를 막는다(일반 소환과 동일한 규칙) - 예전엔 자리가
  // 없어도 재화를 깎고 결과를 대기열(pendingPlacementQueue)에 넣기만 해서, 사용자
  // 입장에선 "필드 꽉 찬 채로 룰렛이 돌아가며 재화만 소모되는" 것처럼 보였다.
  if (fieldOccupantCount(newState) >= newState.fieldMaxCapacity) {
    return { success: false, reason: 'field-full', newState: state };
  }

  const cost = ROULETTE_COST[slotPosition] ?? ROULETTE_COST.left;
  if (newState.luckstone < cost) {
    return { success: false, reason: 'not-enough-luckstone', newState: state };
  }
  newState.luckstone -= cost;
  newState.counters.rouletteAttemptCount += 1; // "룰렛 소환 시도 20번" 미션용 - 등급/성공 여부와 무관하게 실제로 돈 시도만 센다

  const successRoll = Math.random() < ROULETTE_SUCCESS_RATE[tier];
  if (!successRoll) {
    newState.counters.rouletteFailCount += 1; // "룰렛 소환 실패 10번" 미션용 - 등급 무관 전체 실패 횟수
    if (tier === 'legendary') {
      newState.counters.legendaryRouletteFailCount += 1;
    }
    return { success: false, reason: 'roulette-fail', newState };
  }
  if (tier === 'legendary') newState.counters.legendaryRouletteSuccessCount += 1; // "전설 룰렛 소환 성공 3번" 미션용

  // 실패 시 하위 등급으로 드랍, 성공 시 해당 등급 그대로 드랍
  const heroDef = pickRandomHeroOfTier(tier);
  const slot = findAutoPlaceSlot(newState, heroDef.id);
  if (slot) {
    placeInstanceAtSlot(slot, createHeroInstance(heroDef.id));
  } else {
    newState.pendingPlacementQueue = [...(newState.pendingPlacementQueue ?? []), heroDef.id];
  }

  return { success: true, hero: heroDef, newState };
}

export function allHeroDefinitions() {
  return HEROES;
}
