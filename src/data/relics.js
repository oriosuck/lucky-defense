// 유물 정의: 금고 / 머니건 / 행운석 / 고기 / 지갑, 레벨 1~11
export const RELIC_KEYS = ['vault', 'moneygun', 'luckstone', 'meat', 'wallet'];

export const RELIC_LABEL = {
  vault: '금고',
  moneygun: '머니건',
  luckstone: '행운석',
  meat: '고기',
  wallet: '지갑',
};

export const RELIC_LEVEL_MIN = 1;
export const RELIC_LEVEL_MAX = 11;

export function isValidRelicLevel(level) {
  return Number.isInteger(level) && level >= RELIC_LEVEL_MIN && level <= RELIC_LEVEL_MAX;
}

// 지갑 레벨에 따른 시작 골드: 1레벨 150, 레벨당 +10
export function startingGold(walletLevel) {
  return 150 + (walletLevel - 1) * 10;
}

// 고기 레벨에 따른 필드 최대 인원(예시 곡선, 상한 30) - 실제 밸런스 수치는 추후 조정
export function fieldMaxCapacity(meatLevel) {
  return Math.min(30, 10 + (meatLevel - 1) * 2);
}

export function defaultRelics() {
  return { vault: 1, moneygun: 1, luckstone: 1, meat: 1, wallet: 1 };
}

// 라운드 종료 골드 보너스 %: 금고 1레벨 5%, 레벨당 +0.5%p (기획서 6장 확정 수치)
export function roundClearGoldBonusPct(vaultLevel) {
  return 5 + (vaultLevel - 1) * 0.5;
}
