// 게임 상수 (기획서_v4 6장 "확정 수치" / 기술설계서_v2 2장 Constants 기준)
// 모든 유물(금고/머니건/행운석/고기/지갑)은 항상 맥스(11레벨) 고정으로 적용되므로,
// 레벨별로 값이 달라지는 함수 대신 고정 상수를 그대로 사용한다. 유물 선택 UI 없음.

export const STARTING_GOLD = 250; // 지갑 유물 맥스 기준 시작 골드
export const FIRST_WAVE_SUBSIDY = 2284; // 0→1라운드 최초 지원금(고정값)
export const VAULT_BONUS_PERCENT = 0.1; // 금고 유물 맥스 기준 라운드 종료 보너스율
export const ROUND_END_FLAT_GOLD = 6010; // 라운드 종료 보상 중 고정분(6000+10)
export const ROUND_END_LUCKSTONE = 5; // 라운드 종료 시 지급 행운석
export const FIELD_MAX_CAPACITY = 30; // 고기 유물 맥스 기준 필드 최대 인원

export const MONSTER_MAX = 110; // 필드 누적 몬스터 최대치(고기 유물 맥스 기준), 도달 시 게임 실패
export const MONSTER_PER_ROUND = 40; // 매 라운드 신규 등장 몬스터 수
export const MONSTER_KILL_GOLD = 30; // 몬스터 처치 1마리당 골드

export const NORMAL_SUMMON_INITIAL_COST = 20; // 일반 소환 최초 비용
export const NORMAL_SUMMON_COST_INCREMENT = 2; // 소환할 때마다 증가하는 비용

// 하단 "강화" 팝업의 4개 전역 트랙(일반~희귀/영웅/전설~불멸/소환 확률). 특정 필드 개체가
// 아니라 계정 전체에 적용되는 별도 강화 시스템이다(선택된 영웅 강화는 actions.js의
// enhanceHero/instance.enhanceLevel로 별개 관리됨). 데미지 계산이 범위 밖이라 레벨을
// 올려도 실질 효과는 없다 - 소환 확률 트랙도 기획서 확정대로 항상 고정 확률을 쓴다.
// 레벨당 비용은 정식 밸런스 수치가 없어 참고 화면에 나온 1레벨 비용을 고정값으로 사용한다.
export const GLOBAL_ENHANCE_TRACKS = ['common', 'hero', 'legendary', 'rate'];
export const GLOBAL_ENHANCE_LABEL = {
  common: '일반~희귀',
  hero: '영웅',
  legendary: '전설~불멸',
  rate: '소환 확률',
};
// common/hero/rate 3트랙은 고정 비용. legendary(전설~불멸)는 고정값이 아니라
// "다음 레벨만큼" 행운석이 드는 가변 비용이라(사용자 지정 - "1→2는 2행운석,
// 7→8은 8행운석") actions.js의 nextGlobalEnhanceCost()가 매번 계산해서 쓴다 -
// 여기 남겨둔 값은 실제로 안 쓰이는 계산 편의용 자리표시일 뿐이다.
export const GLOBAL_ENHANCE_COST = {
  common: { gold: 30 },
  hero: { gold: 50 },
  legendary: { luckstone: 2 },
  rate: { gold: 100 },
};
// 소환 확률 트랙만 12레벨이 맥스(사용자 지정 - "12가 맥스였어") - 나머지 3트랙은
// 레벨 제한 없음.
export const GLOBAL_ENHANCE_MAX_LEVEL = { rate: 12 };
