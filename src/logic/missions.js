import { MISSIONS } from '../data/missions.js';

/** 카운터 기반 미션 진행 상태를 최신화한다. */
export function checkMissions(state) {
  const newState = structuredClone(state);
  newState.missions = MISSIONS.map((def) => {
    const current = Math.min(newState.counters[def.counterKey] ?? 0, def.target);
    return { missionId: def.id, current, completed: current >= def.target };
  });
  return newState;
}

export function missionDefinitions() {
  return MISSIONS;
}
