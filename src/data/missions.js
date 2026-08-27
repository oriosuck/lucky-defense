// 미션 마스터 데이터 (기획서 6-2, 필수 확정분 3개 + 확장 가능한 구조)
// checkType: gameState의 카운터 필드를 target과 비교하는 방식으로 진행도 판정
export const MISSIONS = [
  {
    id: 'mission_enhance_2',
    name: '강화 시작',
    description: '강화 버튼 2회 사용',
    checkType: 'counter',
    counterKey: 'enhanceCount',
    target: 2,
    reward: null, // 보상 미정
  },
  {
    id: 'mission_sell_5',
    name: '정리의 손길',
    description: '영웅 판매 5회',
    checkType: 'counter',
    counterKey: 'sellCount',
    target: 5,
    reward: null,
  },
  {
    id: 'mission_legendary_roulette_fail_5',
    name: '날아간 손모가지',
    description: '전설 룰렛에서 해골(실패) 표시 5회 발생',
    checkType: 'counter',
    counterKey: 'legendaryRouletteFailCount',
    target: 5,
    reward: null,
  },
];

export function createMissionProgress() {
  return MISSIONS.map((m) => ({ missionId: m.id, current: 0, completed: false }));
}
