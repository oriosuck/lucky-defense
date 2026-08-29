// HeroDefinition 마스터 데이터 (기술설계서 2장 / 기획서 5장 기준)
// tier: 'normal' | 'rare' | 'hero' | 'legendary' | 'mythic' | 'immortal'

// public/heroes/<id>.<ext> 로 이미지를 배치했다. 대부분 webp, 일부만 png.
// import.meta.env.BASE_URL을 붙여서 서브 경로 배포(GitHub Pages 등)에서도 경로가 깨지지 않게 한다.
const IMAGE_EXT_OVERRIDE = {
  i_devil_monopoly: 'png',
  i_knight_lancelot: 'png',
  i_archmage_gigi: 'png',
  i_orc_leader: 'png',
};
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

// 등급별 소환 확률 - 일반 소환 버튼. 강화 버튼에 확률 업그레이드 연출은 있지만
// 실제 수치는 항상 이 값으로 고정(항상 풀업된 상태를 전제로 한 최종 확정 수치, 기획서 6장).
export const NORMAL_SUMMON_RATES = {
  normal: 0.5357,
  rare: 0.3324,
  hero: 0.1098,
  legendary: 0.022,
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
    // target은 "5회 누적"이 아니라 능력치 %다 - 판매(먹이기)할 때마다 확률적으로
    // 2%p씩 오르고 총 10%를 채우면 승급 가능(기획서 재확인 사항). 확률 수치 자체는
    // 확정 안 돼서 procChance는 플레이스홀더.
    id: 'i_giga_chad', name: '기가 채드', type: 'real-event', target: 10,
    eventType: 'feedMythicToChad',
    extra: {
      procChance: 0.5, procAmount: 2,
      note: '채드 보유 중 신화/불멸 판매(먹이기) 시 확률적으로 능력치 2%p 상승, 총 10% 도달 시 승급(채드별 개별 집계, 확률 수치는 미확정 플레이스홀더)',
    },
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
    // target: null -> 누적 없이 언제든 "승천 시도" 가능(즉시 확률 판정)
    id: 'i_death_frog', name: '사신 개구리', type: 'real-event', target: null,
    eventType: 'ascendAttempt', extra: { successRate: 0.35, failMeansDestroyed: true },
  },
  m_bamba: {
    id: 'i_primal_bamba', name: '원시 밤바', type: 'hybrid', target: 30,
    // 스택(30) 쌓이는 속도가 너무 빠르다는 사용자 지적(원래 1~5초 랜덤 간격) -
    // 5~15초 랜덤으로 늦췄다(사용자 지정 수치).
    tickIntervalSec: [5, 15], incrementPerTick: 1,
    // 30 도달 이후 판정 주기 - 사용자 지정: "초마다 3번씩 기본공격 한다 치고
    // 기본 공격마다 0.1% 확률로 소환 가능"(공격 1회 = 1/3초 간격, 매번 0.1%).
    extra: { postCapChance: 0.001, postCapIntervalSec: 1 / 3 },
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
    // 3단계 진행(사용자 지정 - 기획서_v4.md에는 이 비용이 안 적혀 있어서 별도로
    // 확인받은 수치): 1차 변신(5행운석) → 2차 변신(10행운석) → 기술 강화(1행운석/회,
    // 10% 확률로만 성공, 성공할 때마다 진행도 +1, 10 도달 시 승급). actions.js의
    // advanceIronMeyaong()이 instance.meyaongTransformStage(0~2)를 보고 이 세
    // 단계 중 지금 해야 할 걸 처리한다 - 실패해도 소모한 행운석은 돌려주지 않음
    // (배트맨 강화 실패와 같은 관례).
    id: 'i_im_meyaong', name: '아이엠 미야옹', type: 'real-event', target: 10, eventType: 'ironMeyaongEnhance',
    extra: {
      transform1LuckstoneCost: 5, transform2LuckstoneCost: 10,
      enhanceLuckstoneCost: 1, enhanceSuccessRate: 0.1,
    },
  },
  m_cat_mage: {
    id: 'i_grand_cat_mage', name: '대냥법사', type: 'time-based', target: 2400,
    tickIntervalSec: 1, incrementPerTick: 60,
  },
  m_bane: {
    // 불멸 조건은 "이동 132회"가 아니라 "필살기(궁극기) 12번 사용"이다(사용자 지정
    // - "베인 불멸 기준은 필살기 12번 사용하는거야"). 궁극기 자체는 여전히 이동
    // 왕복 15~20회(매번 랜덤)마다 한 번씩 터진다(사용자 재확인 사항) - target(12)은
    // 그 "궁극기 사용 횟수"를 센 값이고, 원본 이동 누적치는 별도로
    // instance.moveProgress에 보관한다(immortal.js recordImmortalEvent 참고).
    id: 'i_top_bane', name: '탑 베인', type: 'real-event', target: 12,
    eventType: 'move', extra: { ultimateThresholdMin: 15, ultimateThresholdMax: 20 },
  },
  m_roka: {
    id: 'i_captain_roka', name: '캡틴 로카', type: 'time-based', target: 160,
    tickIntervalSec: 10, incrementPerTick: [1, 5],
  },
  m_batman: {
    id: 'i_ace_batman', name: '에이스 배트맨', type: 'hybrid', target: 1,
    // "궁극기 사용 시" 판정인데 실제 궁극기 발동 이벤트가 없어서 주기적 판정으로
    // 근사한다 - 처음 5초는 너무 잦다는 지적으로 10초로 늦췄다가, 다시 20초로
    // 한 번 더 늦춰달라는 사용자 지정을 반영했다.
    tickIntervalSec: 20, eventType: 'ultimateAttempt',
    extra: { minEnhance: 10, baseChance: 0.01, perEnhanceBonus: 0.025 },
  },
  m_mama: {
    id: 'i_grand_mama', name: '그랜드 마마', type: 'hybrid', target: null,
    eventType: 'consumeImp',
    // 임프 생성 간격은 원래 상태(돌파/라운드/강화)별로 따로 뒀었는데 "너무 빠르다"는
    // 사용자 지적으로 전부 걷어내고 1~10초 랜덤 하나로 단순화했다(사용자 지정).
    extra: { impIntervalSec: [1, 10], stopRound: 9, normalCost: 9, breakthroughCost: 7 },
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
  m_orc_shaman: {
    id: 'i_orc_leader', name: '오크 지도자', type: 'time-based', target: 100,
    tickIntervalSec: 7, incrementPerTick: 1,
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

// 불멸 등급에서 한 번 더 변신하는 특수 케이스(5-3: "N차 변신"). 신화->불멸을 처리하는
// IMMORTAL_CONDITIONS 제네릭 엔진과 달리 수동 시도 1회로 성공/실패(원본도 함께 소멸)가
// 갈리는 방식이라 별도 테이블로 관리한다 (src/logic/immortal.js의 attemptSecondStageEvolution 참고).
export const SECOND_STAGE_IMMORTAL = {
  i_death_frog: { id: 'i_death_frog_evolved', name: '사신개구리변신', successRate: 0.5 },
};

const SECOND_STAGE_IMMORTAL_HEROES = Object.entries(SECOND_STAGE_IMMORTAL).map(([baseImmortalId, def]) => {
  const base = IMMORTAL_HEROES.find((h) => h.id === baseImmortalId);
  return {
    id: def.id,
    name: def.name,
    tier: 'immortal',
    summonSource: ['immortalPromotion'],
    synthMaterials: null,
    immortalCondition: null,
    baseHeroId: baseImmortalId,
    baseHeroName: base?.name ?? null,
    image: imagePath(def.id),
  };
});

export const HEROES = [...BASE_HEROES, ...MYTHIC_HEROES, ...IMMORTAL_HEROES, ...SECOND_STAGE_IMMORTAL_HEROES];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// 그랜드 마마(m_mama)가 주기적으로 만들어내는 임프. 소환/선택 화면에 노출되면 안 되므로
// HEROES 배열엔 넣지 않고 HEROES_BY_ID에만 직접 등록한다(필드 렌더링은 대부분
// HEROES_BY_ID[occ.heroId] 조회로 동작해서 이렇게만 해도 기존 렌더링 경로를 그대로 탄다).
// tier를 'imp'로 둬서 판매/신화·불멸 전용 로직(모두 'mythic'/'immortal' 등급만 특별
// 취급)에 걸리지 않게 했다 - canPlaceInSlot 등 일반 로직에서는 "mythic/immortal이
// 아니면 스택 가능"으로 처리돼서 자동으로 한 칸에 3마리씩 쌓인다. 이미지는
// heroVisual.js의 resolveHeroImage()에서 UI_IMAGES.impIcon으로 특수 처리한다.
export const IMP_HERO_ID = 'x_imp';
HEROES_BY_ID[IMP_HERO_ID] = { id: IMP_HERO_ID, name: '임프', tier: 'imp', image: null };

export function heroesByTier(tier) {
  return HEROES.filter((h) => h.tier === tier);
}

export function nextTierOf(tier) {
  const idx = TIERS.indexOf(tier);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}
