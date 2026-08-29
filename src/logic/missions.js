import { MISSIONS } from '../data/missions.js';
import { heroesByTier } from '../data/heroes.js';

function fieldHeroCounts(state) {
  const counts = {};
  for (const slot of state.field) {
    for (const occ of slot.occupants) {
      counts[occ.heroId] = (counts[occ.heroId] ?? 0) + 1;
    }
  }
  return counts;
}

function missionValue(state, def, fieldCounts) {
  switch (def.checkType) {
    case 'counter':
      return state.counters[def.counterKey] ?? 0;
    case 'resource':
      return state[def.resourceKey] ?? 0;
    case 'tier-collect':
      return heroesByTier(def.tier).filter((h) => (fieldCounts[h.id] ?? 0) > 0).length;
    case 'field-tier-count':
      return heroesByTier(def.tier).reduce((sum, h) => sum + (fieldCounts[h.id] ?? 0), 0);
    default:
      return 0;
  }
}

/**
 * 카운터 기반 미션 진행 상태를 최신화한다. 완료로 "막 넘어가는" 순간에만 보상을
 * 지급한다(claimedMissionIds로 중복 지급 방지 - 이 함수가 매 틱마다 호출되므로
 * completed 여부만으로 판단하면 매번 다시 지급하게 된다). 미션은 1번씩만 완료
 * 가능하다(사용자 지정) - claimedMissionIds에 한 번 들어가면 이후 조건이 다시
 * 깨져도(예: 판매해서 필드에서 빠짐) completed는 계속 true로 남는다.
 */
export function checkMissions(state) {
  const newState = structuredClone(state);
  if (!newState.claimedMissionIds) newState.claimedMissionIds = [];
  const fieldCounts = fieldHeroCounts(newState);
  newState.missions = MISSIONS.map((def) => {
    const current = Math.min(missionValue(newState, def, fieldCounts), def.target);
    const alreadyClaimed = newState.claimedMissionIds.includes(def.id);
    if (!alreadyClaimed && current >= def.target) {
      newState.claimedMissionIds.push(def.id);
      if (def.reward?.gold) newState.gold += def.reward.gold;
      if (def.reward?.luckstone) newState.luckstone += def.reward.luckstone;
    }
    return { missionId: def.id, current, completed: newState.claimedMissionIds.includes(def.id) };
  });
  return newState;
}

export function missionDefinitions() {
  return MISSIONS;
}
