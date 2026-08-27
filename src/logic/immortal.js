import { HEROES_BY_ID } from '../data/heroes.js';
import { createHeroInstance, neighborsOf } from '../state/gameState.js';
import { countHeroOnField } from './synthesis.js';

// ---- 공통 유틸 ----
function rollValue(v, integer = true) {
  if (!Array.isArray(v)) return v;
  const [min, max] = v;
  return integer ? Math.floor(min + Math.random() * (max - min + 1)) : min + Math.random() * (max - min);
}

function ensureTickState(instance, cond) {
  if (!instance.immortalTick) {
    instance.immortalTick = { elapsed: 0, nextTick: rollValue(cond.tickIntervalSec) };
  }
  return instance.immortalTick;
}

// 신화 등급 개체 전체 순회 헬퍼
function forEachMythicInstance(state, fn) {
  for (const slot of state.field) {
    for (const instance of slot.occupants) {
      const heroDef = HEROES_BY_ID[instance.heroId];
      if (heroDef?.tier === 'mythic' && heroDef.immortalCondition) {
        fn(slot, instance, heroDef.immortalCondition, heroDef);
      }
    }
  }
}

// ---- 시간 기반 자동 누적 (기술설계서 4장 tickImmortalProgress 의사코드) ----
function applyGenericTick(instance, cond, deltaSec) {
  if (!cond.tickIntervalSec || cond.incrementPerTick == null) return;
  const t = ensureTickState(instance, cond);
  t.elapsed += deltaSec;
  while (t.elapsed >= t.nextTick) {
    t.elapsed -= t.nextTick;
    instance.progress = (instance.progress ?? 0) + rollValue(cond.incrementPerTick);
    t.nextTick = rollValue(cond.tickIntervalSec);
  }
}

const ROBOT_IDS = ['h_electric_robot', 'r_shock_robot', 'l_warmachine'];

// 개체별 특수 자동 누적 로직(수동 tick을 완전히 대체). 나머지는 applyGenericTick으로 처리.
const tickOverrides = {
  // 닥터 펄스: 인접 로봇 계열 1기당 획득량 1.1배
  m_pulse_generator(state, slot, instance, cond, deltaSec) {
    const t = ensureTickState(instance, cond);
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      const robotCount = neighborsOf(state, slot).reduce(
        (sum, s) => sum + s.occupants.filter((o) => ROBOT_IDS.includes(o.heroId)).length,
        0,
      );
      const base = rollValue(cond.incrementPerTick);
      instance.progress = (instance.progress ?? 0) + base * cond.extra.adjacentRobotMultiplier ** robotCount;
      t.nextTick = rollValue(cond.tickIntervalSec);
    }
  },
  // 블롭단: 라운드가 오를수록 주기가 늘어남
  m_blob(state, slot, instance, cond, deltaSec) {
    if (!instance.immortalTick) {
      instance.immortalTick = { elapsed: 0, nextTick: Math.max(1, state.wave) };
    }
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      instance.progress = (instance.progress ?? 0) + cond.incrementPerTick;
      t.nextTick = Math.max(1, state.wave) + cond.extra.intervalIncreasePerRoundSec * Math.max(0, state.wave - 1);
    }
  },
  // 원시 밤바: 30 도달 전까지는 일반 누적, 이후엔 낮은 확률로 계속 판정만 수행(승급 여부는 checkImmortalPromotion)
  m_bamba(state, slot, instance, cond, deltaSec) {
    if ((instance.progress ?? 0) < cond.target) {
      applyGenericTick(instance, cond, deltaSec);
      return;
    }
    if (!instance.immortalTick) {
      instance.immortalTick = { elapsed: 0, nextTick: rollValue(cond.extra.postCapIntervalSec) };
    }
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      if (Math.random() < cond.extra.postCapChance) instance.immortalEligible = true;
      t.nextTick = rollValue(cond.extra.postCapIntervalSec);
    }
  },
  // 각성 헤일리: 별의 힘 10 도달 후에는 시간 기반으로 궁극기(15%) 성공 여부를 판정
  m_hailey(state, slot, instance, cond, deltaSec) {
    if ((instance.progress ?? 0) < cond.target || instance.ultimateSucceeded) return;
    if (!instance.immortalTick) {
      instance.immortalTick = { elapsed: 0, nextTick: rollValue(cond.extra.ultimateIntervalSec) };
    }
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      if (Math.random() < cond.extra.ultimateChance) instance.ultimateSucceeded = true;
      t.nextTick = rollValue(cond.extra.ultimateIntervalSec);
    }
  },
  // 용사 레이: 마나 게이지가 차면 "검 소환" 버튼을 누를 수 있는 상태로 표시
  m_ray(state, slot, instance, cond, deltaSec) {
    if (instance.progress >= cond.target) return; // 이미 전설 검 획득
    if (!instance.immortalTick) {
      instance.immortalTick = { elapsed: 0, nextTick: rollValue(cond.tickIntervalSec) };
    }
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      instance.manaReady = true;
      t.nextTick = rollValue(cond.tickIntervalSec);
    }
  },
  // 에이스 배트맨: 10강 이후 주기적으로 확률 판정
  m_batman(state, slot, instance, cond, deltaSec) {
    if ((instance.enhanceLevel ?? 0) < cond.extra.minEnhance) return;
    if (!instance.immortalTick) {
      instance.immortalTick = { elapsed: 0, nextTick: cond.tickIntervalSec };
    }
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      const chance =
        cond.extra.baseChance + cond.extra.perEnhanceBonus * (instance.enhanceLevel - cond.extra.minEnhance);
      if (Math.random() < chance) instance.progress = cond.target;
      t.nextTick = cond.tickIntervalSec;
    }
  },
  // 천룡 우치: 15초마다 10% 확률로 칼바람 발동, 성공 시 +50
  m_uchi(state, slot, instance, cond, deltaSec) {
    if (!instance.immortalTick) {
      instance.immortalTick = { elapsed: 0, nextTick: cond.tickIntervalSec };
    }
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      if (Math.random() < cond.extra.triggerChance) {
        instance.progress = (instance.progress ?? 0) + cond.incrementPerTick;
      }
      t.nextTick = cond.tickIntervalSec;
    }
  },
  // 만년 초나: 15초마다 나아무 자동 소환 카운트
  m_chona(state, slot, instance, cond, deltaSec) {
    applyGenericTick(instance, cond, deltaSec);
  },
  // 귀신 닌자: 30초마다 콤보 +1 (개체별)
  m_ninja(state, slot, instance, cond, deltaSec) {
    applyGenericTick(instance, cond, deltaSec);
  },
  // 마왕 드래곤: 드레인을 시간 기반으로 자동 생성(누적치로 표현)
  m_dragon(state, slot, instance, cond, deltaSec) {
    applyGenericTick(instance, cond, deltaSec);
  },
};

/**
 * 시간 기반 불멸 진행도 전체 갱신. 매 tick(초 단위 deltaSec)마다 호출.
 */
export function tickImmortalProgress(state, deltaSec) {
  const newState = structuredClone(state);
  forEachMythicInstance(newState, (slot, instance, cond) => {
    const handler = tickOverrides[instance.heroId];
    if (handler) {
      handler(newState, slot, instance, cond, deltaSec);
    } else {
      applyGenericTick(instance, cond, deltaSec);
    }
    if (isEligible(newState, slot, instance, cond)) {
      instance.immortalEligible = true;
    }
  });
  return newState;
}

function effectiveTarget(state, instance, cond) {
  if (instance.heroId === 'm_ato') {
    const allyCount = cond.extra.allyImmortalIds.reduce(
      (sum, id) => sum + countHeroOnField(state, id).count,
      0,
    );
    return Math.max(0, cond.target - allyCount * cond.extra.capReductionPerAlly);
  }
  return cond.target;
}

function isEligible(state, slot, instance, cond) {
  if (cond.target == null) return false; // 그랜드 마마 등: 별도 판정
  if (instance.heroId === 'm_hailey') return instance.ultimateSucceeded === true;
  if (instance.heroId === 'm_ray') return instance.progress >= cond.target;
  return (instance.progress ?? 0) >= effectiveTarget(state, instance, cond);
}

// ---- 실제 이벤트 기반 증가 (소환/룰렛/합성/판매/이동/강화 등 버튼 클릭 즉시 반영) ----
/**
 * @param {string} eventType 'enhance' | 'move' | 'sell' | ... (HeroDefinition.immortalCondition.eventType과 매칭)
 * @param {object} [payload]
 */
export function recordImmortalEvent(state, instanceId, eventType, payload = {}) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { success: false, reason: 'not-found', newState: state };
  const heroDef = HEROES_BY_ID[found.instance.heroId];
  const cond = heroDef?.immortalCondition;
  if (!cond || cond.eventType !== eventType) {
    return { success: false, reason: 'no-matching-condition', newState: state };
  }

  const amount = cond.incrementPerTick != null ? rollValue(cond.incrementPerTick) : (payload.amount ?? 1);
  found.instance.progress = (found.instance.progress ?? 0) + amount;
  return { success: true, newState };
}

function findInstance(state, instanceId) {
  for (const slot of state.field) {
    const instance = slot.occupants.find((o) => o.instanceId === instanceId);
    if (instance) return { slot, instance };
  }
  return null;
}

function promoteInstance(state, slot, instanceId, immortalId) {
  const idx = slot.occupants.findIndex((o) => o.instanceId === instanceId);
  if (idx < 0) return;
  slot.occupants[idx] = createHeroInstance(immortalId, { isImmortalPath: true, favorite: slot.occupants[idx].favorite });
}

// 소모/추가 판정이 필요한 승급을 위한 개체별 특수 핸들러.
// 반환: { ok:boolean, reason?:string } - ok=true면 checkImmortalPromotion이 promoteInstance를 호출한다.
const promotionHandlers = {
  m_frog_prince(state, slot, instance, cond) {
    // 승천 시도: 즉시 판정, 실패 시 개체 소멸
    if (Math.random() < cond.extra.successRate) return { ok: true };
    slot.occupants = slot.occupants.filter((o) => o.instanceId !== instance.instanceId);
    return { ok: false, reason: 'ascend-failed-destroyed' };
  },
  m_mama(state, slot, instance, cond) {
    const cost = instance.breakthrough ? cond.extra.breakthroughCost : cond.extra.normalCost;
    if ((instance.impStock ?? 0) < cost) return { ok: false, reason: 'not-enough-imps' };
    instance.impStock -= cost;
    return { ok: true };
  },
  m_ninja(state, slot, instance, cond) {
    if ((instance.progress ?? 0) < cond.target) return { ok: false, reason: 'combo-not-ready' };
    const { instances } = countHeroOnField(state, 'm_ninja');
    if (instances.length < cond.extra.consumeCount) return { ok: false, reason: 'not-enough-ninjas' };
    let toRemove = cond.extra.consumeCount;
    for (const ref of instances) {
      if (toRemove <= 0) break;
      if (ref.instance.instanceId === instance.instanceId) continue;
      ref.slot.occupants = ref.slot.occupants.filter((o) => o.instanceId !== ref.instance.instanceId);
      toRemove -= 1;
    }
    return { ok: true };
  },
  m_chona(state, slot, instance, cond) {
    const { instances } = countHeroOnField(state, cond.extra.consumeHeroId);
    if (instances.length < cond.extra.consumeCount) return { ok: false, reason: 'not-enough-trees' };
    let toRemove = cond.extra.consumeCount;
    for (const ref of instances) {
      if (toRemove <= 0) break;
      ref.slot.occupants = ref.slot.occupants.filter((o) => o.instanceId !== ref.instance.instanceId);
      toRemove -= 1;
    }
    return { ok: true };
  },
  m_gigi(state, slot, instance, cond) {
    const { instances } = countHeroOnField(state, 'm_gigi');
    if (instances.length < cond.extra.consumeCount) return { ok: false, reason: 'not-enough-gigi' };
    let toRemove = cond.extra.consumeCount;
    for (const ref of instances) {
      if (toRemove <= 0) break;
      if (ref.instance.instanceId === instance.instanceId) continue;
      ref.slot.occupants = ref.slot.occupants.filter((o) => o.instanceId !== ref.instance.instanceId);
      toRemove -= 1;
    }
    return { ok: true };
  },
  m_lancelot(state, slot, instance, cond) {
    const { instances } = countHeroOnField(state, 'm_lancelot');
    const maxEnhanced = instances.filter((ref) => (ref.instance.enhanceLevel ?? 0) >= (cond.extra.maxEnhance ?? 10));
    if (maxEnhanced.length < cond.target) return { ok: false, reason: 'not-enough-max-enhanced' };
    let toRemove = cond.target;
    for (const ref of maxEnhanced) {
      if (toRemove <= 0) break;
      ref.slot.occupants = ref.slot.occupants.filter((o) => o.instanceId !== ref.instance.instanceId);
      toRemove -= 1;
    }
    return { ok: true };
  },
};

/**
 * 진행도가 목표에 도달한 개체의 승급을 시도한다. 재료 소모가 필요한 경우 재료 부족 시 보류.
 */
export function checkImmortalPromotion(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { eligible: false, promoted: false, newState: state };
  const { slot, instance } = found;
  const heroDef = HEROES_BY_ID[instance.heroId];
  const cond = heroDef?.immortalCondition;
  if (!cond) return { eligible: false, promoted: false, newState: state };

  const eligible = cond.target == null ? true : isEligible(newState, slot, instance, cond) || instance.immortalEligible;
  if (!eligible) return { eligible: false, promoted: false, newState: state };

  const handler = promotionHandlers[instance.heroId];
  const result = handler ? handler(newState, slot, instance, cond) : { ok: true };
  if (!result.ok) {
    return { eligible: true, promoted: false, reason: result.reason, newState };
  }

  promoteInstance(newState, slot, instanceId, cond.id);
  return { eligible: true, promoted: true, newState };
}

// ---- 마마 전용: 임프 생성/소모, 돌파 토글 ----
const IMMORTAL_MAMA = { impIntervalSec: 3, breakthroughIntervalSec: 2, postRound8IntervalSec: 5, stopRound: 10 };

export function tickMamaImps(state, deltaSec) {
  const newState = structuredClone(state);
  if (newState.wave > IMMORTAL_MAMA.stopRound) return newState;
  forEachMythicInstance(newState, (slot, instance, cond) => {
    if (instance.heroId !== 'm_mama') return;
    const interval = instance.breakthrough
      ? IMMORTAL_MAMA.breakthroughIntervalSec
      : newState.wave > 8
        ? IMMORTAL_MAMA.postRound8IntervalSec
        : IMMORTAL_MAMA.impIntervalSec;
    if (!instance.immortalTick) instance.immortalTick = { elapsed: 0, nextTick: interval };
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= interval) {
      t.elapsed -= interval;
      instance.impStock = (instance.impStock ?? 0) + 1;
    }
  });
  return newState;
}
