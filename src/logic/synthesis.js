import { HEROES_BY_ID, nextTierOf, heroesByTier } from '../data/heroes.js';
import {
  createHeroInstance,
  findSlot,
  findAutoPlaceSlot,
  placeInstanceAtSlot,
} from '../state/gameState.js';

// 판매 보상표(기획 확정: 일반 마리당 120코인, 희귀 1행운석, 영웅 2행운석, 전설 4행운석)
const SELL_GOLD_BY_TIER = { normal: 120 };
const SELL_LUCKSTONE_BY_TIER = { rare: 1, hero: 2, legendary: 4 };
// 일반~전설 판매 시 6% 확률로 행운석 1개 추가 지급(사용자 추가 - 등급 공통 시스템)
const SELL_BONUS_LUCKSTONE_CHANCE = 0.06;

// 판매 시 받을 보상 미리보기(칸 위 판매 버튼에 표시용) - 실제 지급은 sellHero()가 담당.
export function sellPreview(heroDef) {
  if (heroDef.tier === 'normal') return { gold: SELL_GOLD_BY_TIER.normal, luckstone: 0 };
  return { gold: 0, luckstone: SELL_LUCKSTONE_BY_TIER[heroDef.tier] ?? 0 };
}

/**
 * 같은 영웅이 여러 칸에 조각나 있을 때(예: 판매/재료 소모로 3마리 칸이 2마리로 줄고
 * 다른 칸에 1마리가 남아있는 경우) 한 칸으로 다시 모아준다. 신화/불멸(항상 칸당 1마리,
 * 스택 개념 없음)은 대상이 아니다. 개체 수가 가장 많은 칸을 우선 채워서 "적게 남은 쪽이
 * 많이 남은 쪽으로 합쳐지는" 방향으로 동작한다.
 */
export function consolidateHeroStacks(state, heroId) {
  const heroDef = HEROES_BY_ID[heroId];
  if (!heroDef || heroDef.tier === 'mythic' || heroDef.tier === 'immortal') return;
  const holders = state.field.filter((s) => s.occupants.some((o) => o.heroId === heroId));
  const totalCount = holders.reduce((sum, s) => sum + s.occupants.filter((o) => o.heroId === heroId).length, 0);
  // 이미 한 칸에 모여 있고(holders 1개) 3마리를 넘지도 않으면 할 일 없음 - "칸이
  // 1개"만 보고 넘어가면(예전 버그) 그 한 칸 자체가 4마리 이상으로 넘친 상태를
  // 못 잡아서 다음 렌더에서 stackOffsets(n)이 3자리 좌표만 반환해 4번째 개체를
  // 그리려다 그대로 터졌다("합성 누르면 튕긴다" 리포트의 원인 - synthesize()가
  // 이미 3마리 찬 칸에 결과물을 바로 push한 뒤 이 함수를 불러서 생긴 4마리 칸).
  if (holders.length <= 1 && totalCount <= 3) return;

  holders.sort((a, b) =>
    b.occupants.filter((o) => o.heroId === heroId).length - a.occupants.filter((o) => o.heroId === heroId).length,
  );
  const allInstances = [];
  for (const slot of holders) {
    allInstances.push(...slot.occupants.filter((o) => o.heroId === heroId));
    slot.occupants = slot.occupants.filter((o) => o.heroId !== heroId);
  }
  let idx = 0;
  for (const slot of holders) {
    while (slot.occupants.length < 3 && idx < allInstances.length) {
      slot.occupants.push(allInstances[idx]);
      idx += 1;
    }
  }
  // 기존 holder들을 3마리씩 다 채우고도 남으면(예: 4마리인데 holder가 1칸뿐이던 경우)
  // 빈 칸을 새로 끌어와 나머지를 옮긴다 - 안 그러면 남은 개체가 갈 곳이 없어
  // 유실되거나(더 나쁘게는) 원래 칸에 그대로 남아 다시 4마리 초과 상태가 된다.
  while (idx < allInstances.length) {
    const empty = state.field.find((s) => s.occupants.length === 0);
    if (!empty) break; // 필드가 꽉 찼으면 더 옮길 곳이 없다 - 호출부가 사전에 자리를 확인했어야 함
    while (empty.occupants.length < 3 && idx < allInstances.length) {
      empty.occupants.push(allInstances[idx]);
      idx += 1;
    }
  }
}
const CHAD_FEED_LUCKSTONE = 5;
const GIGA_CHAD_SELL_LUCKSTONE = 6;

/**
 * 동일 영웅 3마리 -> 상위 등급 랜덤 1마리. 전설 등급은 이 방식으로 합성 불가.
 * @returns {{success:boolean, reason?:string, resultHero?:object, newState:object}}
 */
export function synthesize(state, row, col) {
  const newState = structuredClone(state);
  const slot = findSlot(newState, row, col);
  if (!slot || slot.occupants.length < 3) {
    return { success: false, reason: 'not-enough-materials', newState: state };
  }
  const heroId = slot.occupants[0].heroId;
  const heroDef = HEROES_BY_ID[heroId];
  const nextTier = nextTierOf(heroDef.tier);
  if (!nextTier || nextTier === 'mythic') {
    return { success: false, reason: 'not-synthesizable', newState: state };
  }

  const candidates = heroesByTier(nextTier);
  const resultDef = candidates[Math.floor(Math.random() * candidates.length)];

  slot.occupants = [];
  const newInstance = createHeroInstance(resultDef.id);
  // 조합 결과가 이미 다른 칸에 있던 영웅이면(예: 산적 1마리가 다른 칸에 남아있는 상태에서
  // 조합으로 산적이 또 나온 경우) 자동으로 한 칸에 모은다 - 방금 조합이 일어난 이
  // 칸(slot)이 아니라 "원래 있던 자리"(existingHolder)로 새로 만들어진 개체가
  // 옮겨가야 한다(사용자 지적 - "기존에 있던 캐릭터 자리로 가는 게 아니라 다른
  // 자리에 있던 애가 합성 자리로 오는거" - 방향이 반대로 동작하면 잘못된 것).
  // **주의**: 한때 이 순서를 반대로(새 개체를 방금 비운 slot에 먼저 넣고
  // consolidateHeroStacks에게 병합을 맡기는 방식) 바꿨던 적이 있는데, 그건 "합성
  // 누르면 팅긴다" 크래시(existingHolder가 이미 3마리 꽉 찬 상태에서 push로 4마리가
  // 되고 consolidateHeroStacks가 "holder 1개면 이미 정리된 것"으로 착각해 그대로
  // 넘어가버리던 버그)를 피하려던 것이었는데, 그 대신 "새 개체가 기존 자리로 안 가고
  // 기존 개체가 합성 자리로 오는" 이 리포트의 원인이 됐다 - 방향이 사용자 기대와
  // 반대였다. 크래시 자체는 `consolidateHeroStacks`(아래) 쪽을 "holder가 1개뿐이어도
  // 3마리를 넘으면 재분배"하도록 방어적으로 고쳐서 이미 해결했으므로, 여기서는 다시
  // "existingHolder에 직접 push" 방식으로 되돌려 방향을 바로잡는다 - 오버플로우가
  // 생겨도 consolidateHeroStacks가 안전하게 처리한다.
  const existingHolder = newState.field.find((s) => s !== slot && s.occupants.some((o) => o.heroId === resultDef.id));
  if (existingHolder) {
    existingHolder.occupants.push(newInstance);
    consolidateHeroStacks(newState, resultDef.id);
  } else {
    slot.occupants.push(newInstance);
  }

  return { success: true, resultHero: resultDef, newState };
}

function countHeroOnField(state, heroId) {
  let count = 0;
  const instances = [];
  for (const slot of state.field) {
    for (const occ of slot.occupants) {
      if (occ.heroId === heroId) {
        count += 1;
        instances.push({ slot, instance: occ });
      }
    }
  }
  return { count, instances };
}

/**
 * 신화 등급 전용 조합. 재료 부족 시 실패.
 */
export function craftMythic(state, mythicHeroId) {
  const newState = structuredClone(state);
  const heroDef = HEROES_BY_ID[mythicHeroId];
  if (!heroDef || heroDef.tier !== 'mythic' || !heroDef.synthMaterials) {
    return { success: false, reason: 'invalid-hero', newState: state };
  }

  for (const mat of heroDef.synthMaterials) {
    const { count } = countHeroOnField(newState, mat.heroId);
    if (count < mat.count) {
      return { success: false, reason: 'missing-materials', newState: state };
    }
  }

  // 재료를 먼저 소모하고(빈 칸이 새로 생길 수 있음 + 조각난 스택은 자동으로 한 칸에 모음),
  // 그 다음에 신화를 놓을 자리가 있는지 확인한다. 예전엔 순서가 반대라(자리부터 확인)
  // 필드가 꽉 찬 상태에서도 재료를 없애면 자리가 남는 경우인데 "필드 꽉 참"으로 잘못
  // 막혔다. 자리가 끝내 없으면 newState를 버리고 원본 state를 그대로 반환하므로
  // (아래 field-full 분기) 재료 소모도 함께 취소된다 - 실패 시 부작용이 없다.
  const materialHeroIds = new Set(heroDef.synthMaterials.map((m) => m.heroId));
  for (const mat of heroDef.synthMaterials) {
    let remaining = mat.count;
    for (const slot of newState.field) {
      if (remaining <= 0) break;
      slot.occupants = slot.occupants.filter((occ) => {
        if (occ.heroId === mat.heroId && remaining > 0) {
          remaining -= 1;
          return false;
        }
        return true;
      });
    }
  }
  for (const heroId of materialHeroIds) {
    consolidateHeroStacks(newState, heroId);
  }

  const targetSlot = findAutoPlaceSlot(newState, mythicHeroId);
  if (!targetSlot) {
    return { success: false, reason: 'field-full', newState: state };
  }

  placeInstanceAtSlot(targetSlot, createHeroInstance(mythicHeroId, { isImmortalPath: true }));

  return { success: true, resultHero: heroDef, newState };
}

/**
 * 판매. 일반~전설만 이 함수로 판매 가능. 신화/불멸은 sellMythicToChad 참고.
 */
export function sellHero(state, instanceId) {
  const newState = structuredClone(state);
  let found = null;
  for (const slot of newState.field) {
    const idx = slot.occupants.findIndex((o) => o.instanceId === instanceId);
    if (idx >= 0) {
      found = { slot, idx, instance: slot.occupants[idx] };
      break;
    }
  }
  if (!found) return { success: false, reason: 'not-found', newState: state };

  const heroDef = HEROES_BY_ID[found.instance.heroId];
  if (heroDef.tier === 'mythic' || heroDef.tier === 'immortal') {
    return { success: false, reason: 'use-chad-feed-instead', newState: state };
  }

  found.slot.occupants.splice(found.idx, 1);
  newState.counters.sellCount += 1;

  let reward = { gold: 0, luckstone: 0 };
  if (heroDef.tier === 'normal') {
    reward.gold = SELL_GOLD_BY_TIER.normal;
    newState.gold += reward.gold;
  } else {
    reward.luckstone = SELL_LUCKSTONE_BY_TIER[heroDef.tier] ?? 0;
    newState.luckstone += reward.luckstone;
  }

  // 일반~전설 판매 공통: 6% 확률로 행운석 1개 추가 지급(사용자 추가 사항).
  if (Math.random() < SELL_BONUS_LUCKSTONE_CHANCE) {
    reward.luckstone += 1;
    reward.bonus = true;
    newState.luckstone += 1;
  }

  // 판매로 스택이 조각났을 수 있으니(예: 3마리 칸이 2마리로 줄고 다른 칸에 1마리가
  // 남아있던 경우) 같은 영웅끼리 다시 한 칸으로 모아준다.
  consolidateHeroStacks(newState, found.instance.heroId);

  return { success: true, reward, newState };
}

/**
 * 채드에게 신화 등급 영웅을 먹여 행운석 획득. 채드의 불멸 진행도(기가채드 조건)에도 반영.
 */
export function feedMythicToChad(state, chadInstanceId, mythicInstanceId) {
  const newState = structuredClone(state);
  const chad = findInstanceRef(newState, chadInstanceId);
  const mythic = findInstanceRef(newState, mythicInstanceId);
  if (!chad || chad.instance.heroId !== 'm_chad') {
    return { success: false, reason: 'not-chad', newState: state };
  }
  const fedTier = HEROES_BY_ID[mythic?.instance.heroId]?.tier;
  if (!mythic || (fedTier !== 'mythic' && fedTier !== 'immortal')) {
    return { success: false, reason: 'not-mythic', newState: state };
  }

  mythic.slot.occupants = mythic.slot.occupants.filter((o) => o.instanceId !== mythicInstanceId);
  newState.luckstone += CHAD_FEED_LUCKSTONE;
  // 기가채드 조건은 "판매 5회 누적"이 아니라 능력치 %다(기획서 재확인) - 판매할
  // 때마다 확률적으로 2%p씩 오르고 총 10%를 채우면 승급 가능. 불멸 등급을 먹였을
  // 때는 진행도에 반영하지 않는다(행운석 보상만 지급, "신화 판매"로 못박은 조건 문구
  // 유지).
  let procced = false;
  if (fedTier === 'mythic') {
    const { extra } = HEROES_BY_ID.m_chad.immortalCondition;
    if (Math.random() < extra.procChance) {
      chad.instance.progress = Math.min(10, (chad.instance.progress ?? 0) + extra.procAmount);
      procced = true;
    }
  }

  return { success: true, reward: { luckstone: CHAD_FEED_LUCKSTONE }, procced, newState };
}

/**
 * 불멸 채드(기가채드) 판매 - 행운석 +6
 */
export function sellGigaChad(state, instanceId) {
  const newState = structuredClone(state);
  const ref = findInstanceRef(newState, instanceId);
  if (!ref || ref.instance.heroId !== 'i_giga_chad') {
    return { success: false, reason: 'not-giga-chad', newState: state };
  }
  ref.slot.occupants = ref.slot.occupants.filter((o) => o.instanceId !== instanceId);
  newState.luckstone += GIGA_CHAD_SELL_LUCKSTONE;
  return { success: true, reward: { luckstone: GIGA_CHAD_SELL_LUCKSTONE }, newState };
}

function findInstanceRef(state, instanceId) {
  for (const slot of state.field) {
    const instance = slot.occupants.find((o) => o.instanceId === instanceId);
    if (instance) return { slot, instance };
  }
  return null;
}

/**
 * 신화 버튼 배지 표시용: 현재 필드 재료만으로 바로 조합 가능한 신화 등급 영웅 수
 * (기획서: "배지에 현재 소환 가능한 영웅 개수 표시").
 */
export function craftableMythicCount(state) {
  return heroesByTier('mythic').filter((heroDef) =>
    (heroDef.synthMaterials ?? []).every((mat) => countHeroOnField(state, mat.heroId).count >= mat.count),
  ).length;
}

export { countHeroOnField };
