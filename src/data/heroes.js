// HeroDefinition 마스터 데이터 (기술설계서 2장 / 기획서 5장 기준)
// tier: 'normal' | 'rare' | 'hero' | 'legendary' | 'mythic' | 'immortal'

// public/heroes/<id>.<ext> 로 이미지를 배치했다. 대부분 webp, 일부만 png.
// import.meta.env.BASE_URL을 붙여서 서브 경로 배포(GitHub Pages 등)에서도 경로가 깨지지 않게 한다.
const IMAGE_EXT_OVERRIDE = { i_devil_monopoly: 'png', i_knight_lancelot: 'png', i_archmage_gigi: 'png' };
function imagePath(id) {
  return `${import.meta.env.BASE_URL}heroes/${id}.${IMAGE_EXT_OVERRIDE[id] ?? 'webp'}`;
}

export const TIERS = ['normal', 'rare', 'hero', 'legendary', 'mythic', 'immortal'];

export const TIER_LABEL = {
  normal: '일반',
  rare: '희귀',
  hero: '영웅',
  legendary: '전설',
  mythic: '신화',
  immortal: '불멸',
};

// 등급별 소환 확률(유물 1레벨 기준) - 일반 소환 버튼
export const NORMAL_SUMMON_RATES = {
  normal: 0.5,
  rare: 0.3,
  hero: 0.15,
  legendary: 0.05,
};

// 룰렛 성공 확률
export const ROULETTE_SUCCESS_RATE = {
  rare: 0.6,
  hero: 0.3,
  legendary: 0.15,
};

// 룰렛 1회 비용(행운석) - 앞 2개 슬롯 / 마지막 슬롯
export const ROULETTE_COST = { left: 1, right: 2 };

// ---- 일반~전설 (5-1) ----
const BASE_HEROES = [
  // 일반
  { id: 'n_archer', name: '궁수', tier: 'normal' },
  { id: 'n_thrower', name: '투척병', tier: 'normal' },
  { id: 'n_barbarian', name: '야만인', tier: 'normal' },
  { id: 'n_water_spirit', name: '물의정령', tier: 'normal' },
  { id: 'n_bandit', name: '산적', tier: 'normal' },
  // 희귀
  { id: 'r_ranger', name: '레인저', tier: 'rare' },
  { id: 'r_shock_robot', name: '충격로봇', tier: 'rare' },
  { id: 'r_paladin', name: '성기사', tier: 'rare' },
  { id: 'r_sandman', name: '샌드맨', tier: 'rare' },
  { id: 'r_demon_soldier', name: '악마병사', tier: 'rare' },
  // 영웅
  { id: 'h_electric_robot', name: '전기로봇', tier: 'hero' },
  { id: 'h_tree', name: '나무', tier: 'hero' },
  { id: 'h_hunter', name: '사냥꾼', tier: 'hero' },
  { id: 'h_eagle_general', name: '독수리장군', tier: 'hero' },
  { id: 'h_wolf_warrior', name: '늑대전사', tier: 'hero' },
  // 전설
  { id: 'l_warmachine', name: '워머신', tier: 'legendary' },
  { id: 'l_tiger_master', name: '호랑이사부', tier: 'legendary' },
  { id: 'l_storm_giant', name: '폭풍거인', tier: 'legendary' },
  { id: 'l_sheriff', name: '보안관', tier: 'legendary' },
].map((h) => ({
  ...h,
  summonSource:
    h.tier === 'legendary'
      ? ['legendaryRoulette']
      : h.tier === 'hero'
        ? ['normalSummon', 'legendaryRouletteFail', 'heroRouletteSuccess']
        : h.tier === 'rare'
          ? ['normalSummon', 'heroRouletteFail', 'rareRouletteSuccess']
          : ['normalSummon', 'rareRouletteFail'],
  synthMaterials: null,
  immortalCondition: null,
  baseHeroId: null,
  image: imagePath(h.id),
}));

// ---- 신화 (5-2) 조합 재료 ----
const MYTHIC_RAW = [
  ['m_gravity_bomb', '중력자탄', [['h_electric_robot', 1], ['r_shock_robot', 1], ['n_thrower', 2]]],
  ['m_ninja', '닌자', [['h_wolf_warrior', 1], ['r_paladin', 1], ['r_demon_soldier', 1]]],
  ['m_coldi', '콜디', [['l_storm_giant', 1], ['r_sandman', 1], ['n_water_spirit', 1]]],
  ['m_blob', '블롭', [['h_hunter', 1], ['h_eagle_general', 1], ['n_bandit', 1]]],
  ['m_dragon', '드래곤', [['h_eagle_general', 2], ['n_water_spirit', 1]]],
  ['m_tar', '타르', [['h_wolf_warrior', 1], ['h_hunter', 1], ['r_sandman', 1], ['n_barbarian', 1]]],
  ['m_gigi', '지지', [['l_sheriff', 1], ['h_electric_robot', 1], ['r_demon_soldier', 1], ['n_archer', 1]]],
  ['m_master_kun', '마스터쿤', [['l_tiger_master', 1], ['h_eagle_general', 1], ['r_paladin', 1]]],
  ['m_chona', '초나', [['l_sheriff', 1], ['h_tree', 1], ['r_demon_soldier', 1], ['n_barbarian', 1]]],
  ['m_penguin_musician', '펭귄악사', [['h_eagle_general', 1], ['h_wolf_warrior', 1], ['h_electric_robot', 1]]],
  ['m_gorazo', '골라조', [['l_tiger_master', 1], ['h_tree', 1], ['r_ranger', 1], ['n_bandit', 1]]],
  ['m_uchi', '우치', [['l_storm_giant', 1], ['r_ranger', 1], ['n_water_spirit', 1]]],
  ['m_orc_shaman', '오크주술사', [['h_hunter', 1], ['h_electric_robot', 1], ['r_demon_soldier', 1]]],
  ['m_lancelot', '랜슬롯', [['l_sheriff', 1], ['h_hunter', 1], ['r_paladin', 1]]],
  ['m_indy', '인디', [['l_sheriff', 1], ['h_wolf_warrior', 1], ['r_sandman', 1]]],
  ['m_watt', '와트', [['l_storm_giant', 1], ['h_electric_robot', 1], ['r_demon_soldier', 1]]],
  ['m_rocketchu', '로켓츄', [['l_warmachine', 1], ['r_shock_robot', 1], ['n_thrower', 1]]],
  ['m_pulse_generator', '펄스생성기', [['h_electric_robot', 1], ['h_tree', 1], ['n_archer', 2]]],
  ['m_cat_mage', '냥법사', [['h_eagle_general', 1], ['n_archer', 1], ['n_water_spirit', 2]]],
  ['m_bamba', '밤바', [['l_tiger_master', 1], ['h_wolf_warrior', 1], ['n_barbarian', 1]]],
  ['m_iron_meyaong', '아이언미야옹', [['l_warmachine', 1], ['n_bandit', 2]]],
  ['m_monopoly_man', '모노폴리맨', [['h_wolf_warrior', 1], ['h_tree', 1], ['r_demon_soldier', 1]]],
  ['m_mama', '마마', [['h_hunter', 1], ['h_tree', 1], ['h_electric_robot', 1]]],
  ['m_frog_prince', '개구리왕자', [['h_wolf_warrior', 1], ['h_tree', 1], ['n_thrower', 1], ['n_barbarian', 1]]],
  ['m_batman', '배트맨', [['l_tiger_master', 1], ['h_tree', 1], ['n_thrower', 2]]],
  ['m_bane', '베인', [['l_storm_giant', 1], ['h_hunter', 1], ['r_ranger', 1], ['n_archer', 1]]],
  ['m_hailey', '헤일리', [['l_sheriff', 1], ['h_hunter', 1], ['r_sandman', 1]]],
  ['m_ato', '아토', [['h_tree', 1], ['h_hunter', 1], ['r_demon_soldier', 1], ['n_barbarian', 1]]],
  ['m_roka', '로카', [['l_sheriff', 1], ['l_tiger_master', 1], ['h_eagle_general', 1], ['n_archer', 1]]],
  ['m_chad', '채드', [['l_warmachine', 1], ['r_paladin', 1], ['r_ranger', 1]]],
  ['m_ray', '레이', [['l_storm_giant', 1], ['h_wolf_warrior', 1], ['r_paladin', 2]]],
];

// ---- 불멸 승급 조건 (5-3, 기술설계서 4장 의사코드 기준 구현용 파라미터) ----
// type: 'time-based' | 'real-event' | 'hybrid'
// consumeSelf: 승급 시 소모되는 동일 신화 개체 수(자기 자신 포함 여부는 extra.includeSelf)
// consumeMaterial: 승급 시 소모되는 타 영웅 재료 {heroId, count}
export const IMMORTAL_CONDITIONS = {
  m_chad: {
    id: 'i_giga_chad', name: '기가 채드', type: 'real-event', target: 5,
    eventType: 'feedMythicToChad', extra: { note: '채드 보유 중 신화 영웅 판매(먹이기) 5회 누적, 채드별 개별 집계' },
  },
  m_ray: {
    id: 'i_hero_ray', name: '용사 레이', type: 'hybrid', target: 1,
    tickIntervalSec: [1, 10], eventType: 'summonSword',
    extra: { rates: { normal: 0.4, rare: 0.3, hero: 0.2, legendary: 0.1 }, note: '마나 가득 시 검 소환 버튼 클릭 → 전설 등급 1회 획득 시 승급' },
  },
  m_monopoly_man: {
    id: 'i_devil_monopoly', name: '악마 모노폴리', type: 'time-based', target: 15,
    tickIntervalSec: [1, 10], incrementPerTick: 1,
  },
  m_hailey: {
    id: 'i_awakened_hailey', name: '각성 헤일리', type: 'hybrid', target: 10,
    eventType: 'normalSummonRoll', extra: { starPowerChance: 0.2, ultimateChance: 0.15, ultimateIntervalSec: [3, 8] },
  },
  m_frog_prince: {
    id: 'i_death_frog', name: '사신 개구리', type: 'real-event', target: 1,
    eventType: 'ascendAttempt', extra: { successRate: 0.35, failMeansDestroyed: true },
  },
  m_bamba: {
    id: 'i_primal_bamba', name: '원시 밤바', type: 'hybrid', target: 30,
    tickIntervalSec: [1, 5], incrementPerTick: 1,
    extra: { postCapChance: 0.001, postCapIntervalSec: [1, 5] },
  },
  m_ato: {
    id: 'i_spacetime_ato', name: '시공 아토', type: 'time-based', target: 100,
    tickIntervalSec: [1, 15], incrementPerTick: 1,
    extra: { capReductionPerAlly: 2, allyImmortalIds: ['m_bane', 'm_batman', 'm_roka', 'm_bamba'] },
  },
  m_pulse_generator: {
    id: 'i_dr_pulse', name: '닥터 펄스', type: 'time-based', target: 10000,
    tickIntervalSec: 3, incrementPerTick: [1, 100],
    extra: { adjacentRobotMultiplier: 1.1, robotIds: ['h_electric_robot', 'r_shock_robot', 'l_warmachine'] },
  },
  m_iron_meyaong: {
    id: 'i_im_meyaong', name: '아이엠 미야옹', type: 'real-event', target: 10, eventType: 'enhance',
  },
  m_cat_mage: {
    id: 'i_grand_cat_mage', name: '대냥법사', type: 'time-based', target: 2400,
    tickIntervalSec: 1, incrementPerTick: 60,
  },
  m_bane: {
    id: 'i_top_bane', name: '탑 베인', type: 'real-event', target: 132,
    eventType: 'move', extra: { moveToUltimateRatio: 11 },
  },
  m_roka: {
    id: 'i_captain_roka', name: '캡틴 로카', type: 'time-based', target: 160,
    tickIntervalSec: 10, incrementPerTick: [1, 5],
  },
  m_batman: {
    id: 'i_ace_batman', name: '에이스 배트맨', type: 'hybrid', target: 1,
    tickIntervalSec: 5, eventType: 'ultimateAttempt',
    extra: { minEnhance: 10, baseChance: 0.01, perEnhanceBonus: 0.025 },
  },
  m_mama: {
    id: 'i_grand_mama', name: '그랜드 마마', type: 'hybrid', target: null,
    eventType: 'consumeImp',
    extra: {
      impIntervalSec: 3, breakthroughIntervalSec: 2, postRound8IntervalSec: 5,
      stopRound: 10, normalCost: 9, breakthroughCost: 7,
    },
  },
  m_ninja: {
    id: 'i_ghost_ninja', name: '귀신 닌자', type: 'hybrid', target: 11,
    tickIntervalSec: 30, incrementPerTick: 1, eventType: 'consumeNinja',
    extra: { consumeCount: 5, requireComboReached: true },
  },
  m_dragon: {
    id: 'i_demon_lord_dragon', name: '마왕 드래곤', type: 'hybrid', target: 1,
    tickIntervalSec: [5, 15], incrementPerTick: 1, eventType: 'consumeDrainAndDragon',
    extra: { note: '드레인 1개(시간기반 자동생성) + 드래곤 1개 소모' },
  },
  m_gravity_bomb: {
    id: 'i_super_gravity_bomb', name: '슈퍼 중력자탄', type: 'real-event', target: 100,
    eventType: 'absorbGravityBomb', incrementPerTick: [15, 35],
  },
  m_penguin_musician: {
    id: 'i_noise_king_penguin', name: '소음킹 펭귄악사', type: 'real-event', target: 5, eventType: 'perform',
  },
  m_gorazo: {
    id: 'i_boss_gorazo', name: '보스 골라조', type: 'real-event', target: 100,
    eventType: 'drawCard',
    extra: { cardMin: 1, cardMax: 10, bustOver: 21, drawIntervalSec: 15, firstCostLuckstone: 5, costIncreasePerAttempt: 1 },
  },
  m_blob: {
    id: 'i_blob_gang', name: '블롭단', type: 'time-based', target: 600,
    tickIntervalSec: 1, incrementPerTick: 3,
    extra: { intervalIncreasePerRoundSec: 1 },
  },
  m_coldi: {
    id: 'i_queen_coldi', name: '여왕 콜디', type: 'time-based', target: 250,
    tickIntervalSec: 1, incrementPerTick: 1,
  },
  m_master_kun: {
    id: 'i_sage_kun', name: '선인 쿤', type: 'real-event', target: 90,
    eventType: 'angerControl', incrementPerTick: [1, 10],
  },
  m_uchi: {
    id: 'i_sky_dragon_uchi', name: '천룡 우치', type: 'hybrid', target: 2600,
    tickIntervalSec: 15, incrementPerTick: 50, eventType: 'consumeUchi',
    extra: { triggerChance: 0.1, consumeCount: 3 },
  },
  m_chona: {
    id: 'i_ancient_chona', name: '만년 초나', type: 'hybrid', target: 28,
    tickIntervalSec: 15, incrementPerTick: 1, eventType: 'consumeTreeHeroes',
    extra: { consumeHeroId: 'h_tree', consumeCount: 3 },
  },
  m_gigi: {
    id: 'i_archmage_gigi', name: '마도학자 지지', type: 'time-based', target: 300000,
    tickIntervalSec: 1, incrementPerTick: 1, eventType: 'consumeGigi',
    extra: { consumeCount: 2, note: '한 판 내 사실상 도달 불가하도록 의도된 수치' },
  },
  m_tar: {
    id: 'i_swarm_tar', name: '군체 타르', type: 'real-event', target: 8,
    eventType: 'cannibalize', extra: { requireStage3AtPromotion: true },
  },
  m_lancelot: {
    id: 'i_knight_lancelot', name: '기사 랜슬롯', type: 'real-event', target: 3,
    eventType: 'consumeMaxEnhancedLancelot',
  },
};

const MYTHIC_HEROES = MYTHIC_RAW.map(([id, name, mats]) => ({
  id,
  name,
  tier: 'mythic',
  summonSource: ['synthesis'],
  synthMaterials: mats.map(([heroId, count]) => ({ heroId, count })),
  immortalCondition: IMMORTAL_CONDITIONS[id] || null,
  baseHeroId: null,
  image: imagePath(id),
}));

const IMMORTAL_HEROES = Object.entries(IMMORTAL_CONDITIONS).map(([mythicId, cond]) => {
  const base = MYTHIC_HEROES.find((h) => h.id === mythicId);
  return {
    id: cond.id,
    name: cond.name,
    tier: 'immortal',
    summonSource: ['immortalPromotion'],
    synthMaterials: null,
    immortalCondition: null,
    baseHeroId: mythicId,
    baseHeroName: base?.name ?? null,
    image: imagePath(cond.id),
  };
});

export const HEROES = [...BASE_HEROES, ...MYTHIC_HEROES, ...IMMORTAL_HEROES];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));

export function heroesByTier(tier) {
  return HEROES.filter((h) => h.tier === tier);
}

export function nextTierOf(tier) {
  const idx = TIERS.indexOf(tier);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}
