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
