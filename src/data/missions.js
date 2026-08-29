// 미션 마스터 데이터 (기획서 6-2). checkType별로 진행도 판정 방식이 다르다:
// - 'counter': gameState.counters[counterKey]를 target과 비교
// - 'resource': gameState[resourceKey](골드/행운석 등 보유량)를 target과 비교
// - 'tier-collect': 해당 등급의 모든 영웅을 필드에 동시에 1마리 이상씩 보유하는지
// - 'field-tier-count': 해당 등급 영웅이 필드에 총 몇 마리 있는지를 target과 비교
// 보상 수치는 사용자가 직접 지정한 확정값이다(PR #35 배포 후 지시).
export const MISSIONS = [
  {
    id: 'mission_enhance_2',
    name: '대장장이 미션',
    description: '강화 버튼 2회 사용',
    checkType: 'counter',
    counterKey: 'enhanceCount',
    target: 2,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_collect_normal',
    name: '일반 등급 컬렉터',
    description: '모든 일반 등급 영웅을 필드에 동시에 모으기',
    checkType: 'tier-collect',
    tier: 'normal',
    target: 5,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_collect_rare',
    name: '희귀 등급 컬렉터',
    description: '모든 희귀 등급 영웅을 필드에 동시에 모으기',
    checkType: 'tier-collect',
    tier: 'rare',
    target: 5,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_collect_hero',
    name: '영웅 등급 컬렉터',
    description: '모든 영웅 등급 영웅을 필드에 동시에 모으기',
    checkType: 'tier-collect',
    tier: 'hero',
    target: 5,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_collect_legendary',
    name: '전설 등급 컬렉터',
    description: '모든 전설 등급 영웅을 필드에 동시에 모으기',
    checkType: 'tier-collect',
    tier: 'legendary',
    target: 4,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_lucky_day',
    name: '운빨좋은날',
    // 정확한 발동 조건이 기획서에 명시돼 있지 않아, "룰렛 아닌 일반 소환으로 전설을
    // 뽑는" 흔치 않은 순간(고정 확률 2.2%)을 "운 좋은 날"로 해석했다 - 나중에
    // 사용자가 다른 조건을 의도했다고 하면 이 부분만 다시 정의하면 됨.
    description: '일반 소환으로 전설 등급 획득',
    checkType: 'counter',
    counterKey: 'normalSummonLegendaryCount',
    target: 1,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_luckstone_10',
    name: '행운석 수집가',
    description: '행운석 10개 보유',
    checkType: 'resource',
    resourceKey: 'luckstone',
    target: 10,
    reward: { gold: 50, luckstone: 3 },
  },
  {
    id: 'mission_sell_5',
    name: '영웅 판매',
    description: '영웅 판매 5회',
    checkType: 'counter',
    counterKey: 'sellCount',
    target: 5,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_legendary_roulette_fail_5',
    name: '날아간 손모가지',
    description: '전설 룰렛에서 해골(실패) 표시 5회 발생',
    checkType: 'counter',
    counterKey: 'legendaryRouletteFailCount',
    target: 5,
    reward: { luckstone: 4 },
  },
  {
    id: 'mission_field_legendary_3',
    name: '3전설',
    description: '필드에 전설 등급 영웅 3마리 동시 보유',
    checkType: 'field-tier-count',
    tier: 'legendary',
    target: 3,
    reward: { luckstone: 5 },
  },
];

export function createMissionProgress() {
  return MISSIONS.map((m) => ({ missionId: m.id, current: 0, completed: false }));
}
