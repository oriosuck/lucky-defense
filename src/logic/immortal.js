import { HEROES_BY_ID, SECOND_STAGE_IMMORTAL, IMP_HERO_ID } from '../data/heroes.js';
import { createHeroInstance, neighborsOf, findAutoPlaceSlot, placeInstanceAtSlot } from '../state/gameState.js';
import { countHeroOnField } from './synthesis.js';

// ---- 공통 유틸 ----
function rollValue(v, integer = true) {
  if (!Array.isArray(v)) return v;
  const [min, max] = v;
  return integer ? Math.floor(min + Math.random() * (max - min + 1)) : min + Math.random() * (max - min);
}

// 로카가 장전된 탄약을 소모하는 속도(사용자 지정 - "0.5초당 1발씩 없애").
const ROKA_FIRE_INTERVAL_SEC = 0.5;

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
  // 로카: 제네릭 시간기반 누적과 똑같이 승급용 progress는 그대로 쌓지만(10초마다
  // 1~5), 화면에 보여주는 건 그 값이 아니라 실제 "장전된 탄약 수"(instance.ammo) -
  // 장전되면 0.5초마다 1발씩 소모되고, 다 쓰면 다음 장전 틱까지 0으로 대기한다
  // (사용자 지정 - "장전이 되었으면 0.5초당 1발씩 없애. 그리고 다시 쿨타임 차면
  // 장전해"). 장전 틱은 기존 탄약에 새로 굴린 값을 더한다(누적 재장전).
  m_roka(state, slot, instance, cond, deltaSec) {
    const t = ensureTickState(instance, cond);
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick) {
      t.elapsed -= t.nextTick;
      const amount = rollValue(cond.incrementPerTick);
      instance.progress = (instance.progress ?? 0) + amount;
      instance.ammo = (instance.ammo ?? 0) + amount;
      t.nextTick = rollValue(cond.tickIntervalSec);
    }
    if ((instance.ammo ?? 0) > 0) {
      instance.fireElapsed = (instance.fireElapsed ?? 0) + deltaSec;
      while (instance.fireElapsed >= ROKA_FIRE_INTERVAL_SEC && instance.ammo > 0) {
        instance.fireElapsed -= ROKA_FIRE_INTERVAL_SEC;
        instance.ammo -= 1;
      }
    } else {
      instance.fireElapsed = 0; // 탄약 없으면 다음 장전 때 0.5초부터 다시 세도록 리셋
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
  const before = found.instance.progress ?? 0;
  found.instance.progress = before + amount;

  // 탑 베인은 이동 왕복 15~20회(매번 랜덤)마다 "궁극기 1회 사용"으로 환산된다
  // (사용자 재확인 사항). 실제 데미지 계산은 범위 밖이라, 그 순간을 넘길 때마다
  // 필드에서 잠깐 궁 이펙트를 보여주는 용도로만 타임스탬프를 남긴다. 고정 비율
  // 대신 "다음 임계치"를 개체에 저장해두고, 넘길 때마다 다시 랜덤으로 다음
  // 임계치를 뽑는다.
  if (found.instance.heroId === 'm_bane' && cond.extra?.ultimateThresholdMin) {
    const { ultimateThresholdMin: min, ultimateThresholdMax: max } = cond.extra;
    if (found.instance.nextUltimateAt == null) {
      // ultimateWindowStart는 "지금 채우는 중인 구간이 어디서부터 시작했는지"
      // 기록해둔다 - 화면에 궁 쿨타임 게이지를 보여줄 때
      // (progress-windowStart)/(nextUltimateAt-windowStart)로 진행률을 계산하는 데
      // 쓴다(사용자 요청 - "베인 궁 쿨타임 차는거 밑에 바로 보여주면 좋겠어").
      found.instance.ultimateWindowStart = before;
      found.instance.nextUltimateAt = before + min + Math.floor(Math.random() * (max - min + 1));
    }
    if (found.instance.progress >= found.instance.nextUltimateAt) {
      found.instance.ultimateFlashAt = Date.now();
      found.instance.ultimateWindowStart = found.instance.progress;
      found.instance.nextUltimateAt = found.instance.progress + min + Math.floor(Math.random() * (max - min + 1));
    }
  }

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
    // 임프 9마리(돌파 시 7마리)가 "동시에 필드에 존재"하면 승급 가능 - 소모가 아니라 존재
    // 판정이다. 마마가 몇 마리든(필드에 있는 마마 전부가 공유하는) **전역** 임프 수
    // 기준이다(사용자 지정 정정 - "필드에 몇마리가 있건 간에 임프 9마리가 있으면
    // 불멸 변신이 가능해"). 예전엔 마마 개체마다 자기가 만든 임프 수만 세는
    // instance.impStock을 썼는데, 이러면 마마가 2마리면 각자 9마리씩 만들어야
    // 해서 사실상 총 18마리(또는 관측된 대로 12마리 - 두 마마의 생성 속도 차이에
    // 따라 먼저 도달하는 시점이 달랐을 뿐)가 필요한 것처럼 동작하는 버그였다.
    // 이제 필드에 실존하는 임프 개수를 그때그때 실시간으로 세므로 별도 상태 필드가
    // 필요 없다(impStock 완전히 제거, tickMamaImps 참고).
    const target = instance.breakthrough ? cond.extra.breakthroughCost : cond.extra.normalCost;
    if (countHeroOnField(state, IMP_HERO_ID).count < target) return { ok: false, reason: 'not-enough-imps' };
    // 승급 시 필드의 임프는 전부 자동 소멸(수동 소모 없음, 기획서 확정 사항) - 이
    // 임프 풀을 모든 마마가 공유하므로, 한 마마가 승급하는 순간 다른 마마들은
    // 다시 0부터 채워야 한다(=필드에 불멸은 종류별로 최대 1마리라는 일반 규칙과
    // 자연히 맞물려서 "1마리만 불멸이 되고 나머지는 그대로 남는다"가 성립한다).
    for (const s of state.field) {
      s.occupants = s.occupants.filter((o) => o.heroId !== IMP_HERO_ID);
    }
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
  m_tar(state, slot, instance, cond) {
    if (cond.extra.requireStage3AtPromotion && (instance.tarStage ?? 1) < 3) {
      return { ok: false, reason: 'stage3-required' };
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
  // 불멸은 종류별로 필드에 최대 1마리(isImmortalPromotionReady와 동일한 규칙 - 거기서
  // 이미 막혔어야 정상이지만, UI를 거치지 않고 직접 호출되는 경로에 대비해 실제
  // 승급을 수행하는 이 함수에도 동일하게 최종 방어선을 둔다).
  if (newState.field.some((s) => s.occupants.some((o) => o.heroId === cond.id))) {
    return { eligible: false, promoted: false, reason: 'immortal-already-exists', newState: state };
  }

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

/**
 * checkImmortalPromotion을 실제로 실행하지 않고 "지금 승급 버튼을 눌러도 되는 상태인지"만
 * 읽기 전용으로 판정한다 - 왼쪽 즉시소환 아이콘 바에 "승급 가능한 불멸"을 신화보다 먼저
 * 보여주기 위해 필요하다(사용자 지정 - 승급은 칸 아래 버튼이 아니라 신화처럼 왼쪽
 * 아이콘으로 노출). promotionHandlers를 그대로 호출하면 부작용(재료 소모, 사신개구리
 * 승천 실패 시 소멸 등)이 실제로 일어나므로 절대 재사용하면 안 되고, 각 핸들러의
 * 조건 판정 부분만 순수하게 다시 구현했다 - 위 promotionHandlers를 고치면 여기도
 * 같이 봐야 한다.
 */
export function isImmortalPromotionReady(state, instanceId) {
  const found = findInstance(state, instanceId);
  if (!found) return false;
  const { slot, instance } = found;
  const heroDef = HEROES_BY_ID[instance.heroId];
  const cond = heroDef?.immortalCondition;
  if (!cond) return false;
  // 불멸은 종류별로 필드에 최대 1마리만 존재할 수 있다(사용자 지정 - "무조건 1마리씩만
  // 있어야 해... 1마리만 불멸 만들고 나머지는 일반으로 무조건 남는거야"). 같은 불멸
  // 개체가 이미 필드에 있으면 조건을 다 채웠어도 승급 후보에서 제외한다 - 예를 들어
  // 마마 2마리가 있을 때 하나가 먼저 승급하면(그랜드 마마), 나머지 마마는 임프
  // 조건과 무관하게 다시는 "승급 가능!"으로 안 뜬다.
  if (state.field.some((s) => s.occupants.some((o) => o.heroId === cond.id))) return false;

  const eligible = cond.target == null ? true : isEligible(state, slot, instance, cond) || instance.immortalEligible;
  if (!eligible) return false;

  switch (instance.heroId) {
    case 'm_mama': {
      const target = instance.breakthrough ? cond.extra.breakthroughCost : cond.extra.normalCost;
      return countHeroOnField(state, IMP_HERO_ID).count >= target;
    }
    case 'm_ninja':
      return countHeroOnField(state, 'm_ninja').instances.length >= cond.extra.consumeCount;
    case 'm_chona':
      return countHeroOnField(state, cond.extra.consumeHeroId).instances.length >= cond.extra.consumeCount;
    case 'm_gigi':
      return countHeroOnField(state, 'm_gigi').instances.length >= cond.extra.consumeCount;
    case 'm_tar':
      return !cond.extra.requireStage3AtPromotion || (instance.tarStage ?? 1) >= 3;
    case 'm_lancelot': {
      const { instances } = countHeroOnField(state, 'm_lancelot');
      const maxEnhanced = instances.filter((ref) => (ref.instance.enhanceLevel ?? 0) >= (cond.extra.maxEnhance ?? 10));
      return maxEnhanced.length >= cond.target;
    }
    default:
      // 핸들러가 없는(제네릭 폴백) 대부분의 조건과 사신개구리(m_frog_prince, 자원
      // 게이팅 없이 언제든 확률 시도 가능)는 eligible이면 그대로 준비된 것으로 본다.
      return true;
  }
}

/**
 * 불멸 등급에서 한 번 더 시도하는 "N차 변신"(5-3, 현재는 사신개구리 -> 사신개구리변신만
 * 해당). 수동 버튼으로 즉시 확률 판정 - 성공하면 새 불멸 개체로 교체, 실패하면 원본도
 * 함께 소멸한다.
 */
export function attemptSecondStageEvolution(state, instanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, instanceId);
  if (!found) return { success: false, reason: 'not-found', newState: state };
  const { slot, instance } = found;
  const def = SECOND_STAGE_IMMORTAL[instance.heroId];
  if (!def) return { success: false, reason: 'not-eligible', newState: state };

  if (Math.random() < def.successRate) {
    promoteInstance(newState, slot, instanceId, def.id);
    return { success: true, evolved: true, newState };
  }
  slot.occupants = slot.occupants.filter((o) => o.instanceId !== instanceId);
  return { success: true, evolved: false, newState };
}

/**
 * 군체 타르 전용 "동족포식": 필드의 다른 타르 중 가장 낮은 단계를 흡수해
 * 포식 횟수(progress)를 늘리고 자신의 단계(tarStage, 최대 3)를 올린다.
 */
export function cannibalizeTar(state, eaterInstanceId) {
  const newState = structuredClone(state);
  const found = findInstance(newState, eaterInstanceId);
  if (!found || found.instance.heroId !== 'm_tar') {
    return { success: false, reason: 'not-tar', newState: state };
  }
  const { instances } = countHeroOnField(newState, 'm_tar');
  const preyCandidates = instances.filter((ref) => ref.instance.instanceId !== eaterInstanceId);
  if (!preyCandidates.length) return { success: false, reason: 'no-prey', newState: state };

  preyCandidates.sort((a, b) => (a.instance.tarStage ?? 1) - (b.instance.tarStage ?? 1));
  const prey = preyCandidates[0];
  prey.slot.occupants = prey.slot.occupants.filter((o) => o.instanceId !== prey.instance.instanceId);

  found.instance.progress = (found.instance.progress ?? 0) + 1;
  found.instance.tarStage = Math.min(3, (found.instance.tarStage ?? 1) + 1);

  return { success: true, newState };
}

// ---- 마마 전용: 임프 생성/소모, 돌파 토글 ----
// 간격은 원래 돌파/라운드/강화 상태별로 따로 뒀었는데(3단계 고정값 + 전설강화
// 시 2배) "너무 빠르다"는 사용자 지적으로 전부 걷어내고 1~10초 랜덤 하나로
// 단순화했다(사용자 지정 - "마마 임프 생성 속도 1~10초 사이로 랜덤 적용하자").
const IMMORTAL_MAMA_STOP_ROUND = 10;
// 마마 승급에 필요한 최대 임프 수(돌파 안 한 경우 9마리) - 실제 필드 토큰으로 무한정
// 쌓이지 않도록 이 값에서 생성을 멈춘다(어차피 그 이상은 승급 조건에 필요 없음).
const MAX_IMP_STOCK = 9;

export function tickMamaImps(state, deltaSec) {
  const newState = structuredClone(state);
  if (newState.wave > IMMORTAL_MAMA_STOP_ROUND) return newState;
  // 임프는 필드에 있는 마마 전부가 공유하는 전역 자원이다(승급 판정도 이제 이
  // 전역 수를 기준으로 함 - promotionHandlers.m_mama 참고) - 필드에 실존하는
  // 임프 개수를 그때그때 세서 9마리를 넘지 않도록 생성을 멈춘다. 마마가 여러
  // 마리면 각자의 타이머가 독립적으로 이 공용 풀에 기여하므로 더 빨리 채워질
  // 뿐, 마마 마리수만큼 목표치가 늘어나지는 않는다.
  forEachMythicInstance(newState, (slot, instance, cond) => {
    if (instance.heroId !== 'm_mama') return;
    if (countHeroOnField(newState, IMP_HERO_ID).count >= MAX_IMP_STOCK) return;
    const intervalRange = cond.extra.impIntervalSec;
    if (!instance.immortalTick) instance.immortalTick = { elapsed: 0, nextTick: rollValue(intervalRange) };
    const t = instance.immortalTick;
    t.elapsed += deltaSec;
    while (t.elapsed >= t.nextTick && countHeroOnField(newState, IMP_HERO_ID).count < MAX_IMP_STOCK) {
      t.elapsed -= t.nextTick;
      // 임프도 캐릭터처럼 실제로 필드 칸에 꺼내진다(사용자 요청) - 빈 칸이 없으면
      // 이번 틱은 그냥 건너뛴다.
      const impSlot = findAutoPlaceSlot(newState, IMP_HERO_ID);
      if (!impSlot) break;
      placeInstanceAtSlot(impSlot, createHeroInstance(IMP_HERO_ID));
      t.nextTick = rollValue(intervalRange);
    }
  });
  return newState;
}
