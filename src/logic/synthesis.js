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
  if (holders.length <= 1) return; // 이미 한 칸에 모여 있으면 할 일 없음

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
    if (idx >= allInstances.length) break;
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
  slot.occupants.push(createHeroInstance(resultDef.id));
  // 조합 결과가 이미 다른 칸에 있던 영웅이면(예: 산적 1마리가 다른 칸에 남아있는 상태에서
  // 조합으로 산적이 또 나온 경우) 자동으로 한 칸에 모은다 - 판매 때와 동일한 스택 정리.
  consolidateHeroStacks(newState, resultDef.id);

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

  // 즐겨찾기로 등록해둔 영웅이면, 조합 완료 시 좌측 즉시소환 버튼이 열린다(기획서 확정 사항)
  const isFavorite = newState.heroSettings.some((h) => h.heroId === mythicHeroId && h.favorite);
  if (isFavorite && !newState.unlockedInstantSummons.includes(mythicHeroId)) {
    newState.unlockedInstantSummons.push(mythicHeroId);
  }

  return { success: true, resultHero: heroDef, newState };
}

/**
 * 즐겨찾기 즉시소환: 최소 한 번 조합에 성공한 뒤에만 사용 가능. 왼쪽 최상단(0,0)에
 * 우선 배치를 시도하고, 안 되면 자동배치 규칙을 따른다. 비용 없음(이미 재료를 써서
 * 한 번 조합했으므로).
 */
export function instantSummonFavorite(state, heroId) {
  const newState = structuredClone(state);
  if (!newState.unlockedInstantSummons.includes(heroId)) {
    return { success: false, reason: 'not-unlocked', newState: state };
  }

  const topLeft = findSlot(newState, 0, 0);
  const targetSlot = topLeft && topLeft.occupants.length === 0 ? topLeft : findAutoPlaceSlot(newState, heroId);
  if (!targetSlot) {
    return { success: false, reason: 'field-full', newState: state };
  }

  placeInstanceAtSlot(targetSlot, createHeroInstance(heroId, { isImmortalPath: true }));
  return { success: true, newState };
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
  // 기가채드 조건 문구가 "신화 영웅 판매(먹이기) 5회"로 명시돼 있어 불멸 등급을
  // 먹였을 때는 진행도에 반영하지 않는다(행운석 보상만 지급).
  if (fedTier === 'mythic') {
    chad.instance.progress = (chad.instance.progress ?? 0) + 1;
  }

  return { success: true, reward: { luckstone: CHAD_FEED_LUCKSTONE }, newState };
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
