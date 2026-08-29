// 미션 마스터 데이터 (기획서 6-2). checkType별로 진행도 판정 방식이 다르다:
// - 'counter': gameState.counters[counterKey]를 target과 비교
// - 'resource': gameState[resourceKey](골드/행운석 등 보유량)를 target과 비교
// - 'tier-collect': 해당 등급의 모든 영웅을 필드에 동시에 1마리 이상씩 보유하는지
// - 'field-tier-count': 해당 등급 영웅이 필드에 총 몇 마리 있는지를 target과 비교
// 보상 수치는 사용자가 직접 지정한 확정값이다(PR #39 배포 후 13종 전체 재지정 -
// 모든 미션에 공통 기본 행운석 3개가 깔려 있고, 등급/자원 계열 미션은 여기에 골드
// 대신 행운석을 더 얹는 방식이라 순수 행운석 보상(luckstone만 있고 gold가 없는
// 항목)은 "3(공통) + N(미션별 추가)"로 계산된 값이다 - 예: 영웅 컬렉터는 행운석 1개
// 추가라 총 4, 3전설은 2개 추가라 총 5).
export const MISSIONS = [
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
    id: 'mission_summon_hero_3',
    name: '영웅 소환가',
    description: '소환에서 영웅 등급 등장 3번',
    checkType: 'counter',
    counterKey: 'normalSummonHeroCount',
    target: 3,
    reward: { gold: 50, luckstone: 3 },
  },
  {
    id: 'mission_summon_legendary',
    name: '천운의 소환',
    description: '소환에서 전설 등급 등장',
    checkType: 'counter',
    counterKey: 'normalSummonLegendaryCount',
    target: 1,
    reward: { gold: 100, luckstone: 3 },
  },
  {
    id: 'mission_roulette_attempt_20',
    name: '룰렛 애호가',
    description: '룰렛 소환 시도 20번',
    checkType: 'counter',
    counterKey: 'rouletteAttemptCount',
    target: 20,
    reward: { luckstone: 4 },
  },
  {
    id: 'mission_roulette_fail_10',
    name: '룰렛 불운아',
    description: '룰렛 소환 실패 10번',
    checkType: 'counter',
    counterKey: 'rouletteFailCount',
    target: 10,
    reward: { gold: 50, luckstone: 3 },
  },
  {
    id: 'mission_legendary_roulette_success_3',
    name: '전설의 손맛',
    description: '전설 룰렛 소환 성공 3번',
    checkType: 'counter',
    counterKey: 'legendaryRouletteSuccessCount',
    target: 3,
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
    id: 'mission_enhance_2',
    name: '대장장이 미션',
    description: '강화 버튼 2회 사용',
    checkType: 'counter',
    counterKey: 'enhanceCount',
    target: 2,
    reward: { gold: 100, luckstone: 3 },
  },
];

export function createMissionProgress() {
  return MISSIONS.map((m) => ({ missionId: m.id, current: 0, completed: false }));
}
