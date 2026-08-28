import { MISSIONS } from '../data/missions.js';

/**
 * 카운터 기반 미션 진행 상태를 최신화한다. 완료로 "막 넘어가는" 순간에만 보상을
 * 지급한다(claimedMissionIds로 중복 지급 방지 - 이 함수가 매 틱마다 호출되므로
 * completed 여부만으로 판단하면 매번 다시 지급하게 된다).
 */
export function checkMissions(state) {
  const newState = structuredClone(state);
  if (!newState.claimedMissionIds) newState.claimedMissionIds = [];
  newState.missions = MISSIONS.map((def) => {
    const current = Math.min(newState.counters[def.counterKey] ?? 0, def.target);
    const completed = current >= def.target;
    if (completed && !newState.claimedMissionIds.includes(def.id)) {
      newState.claimedMissionIds.push(def.id);
      if (def.reward?.luckstone) newState.luckstone += def.reward.luckstone;
    }
    return { missionId: def.id, current, completed };
  });
  return newState;
}

export function missionDefinitions() {
  return MISSIONS;
}
