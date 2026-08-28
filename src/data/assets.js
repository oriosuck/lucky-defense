// 영웅 외 공용 이미지 에셋 (public/ 하위, 서브 경로 배포 대응을 위해 BASE_URL을 붙인다)
const BASE = import.meta.env.BASE_URL;
export const BOSS_IMAGE = `${BASE}bg/boss.png`;
export const BACKGROUND_IMAGE = `${BASE}bg/background.jpg`;

// background.jpg 원본 크기(688x1508)에서 실측한 좌표를 %로 변환한 값.
// 검은 테두리로 표시돼 있던 돌판 프레임은 가로세로 비율이 6x4 칸과 정확히
// 맞아떨어져서(512x278px) 전장 그리드 자리였다 - 보스는 그 위 빈 하늘 공간에 배치한다.
export const BACKGROUND_ASPECT_RATIO = '688 / 1508';
export const STAGE_LAYOUT = {
  field: { left: 12.5, top: 43.63, width: 74.42, height: 18.44 },
  boss: { left: 18, top: 9, width: 64, height: 36 },
  leftHole: { x: 14.97, y: 44.23 },
  rightHole: { x: 85.03, y: 44.3 },
};

// 군체 타르(m_tar)는 1~3단계 그래픽이 별도로 존재한다(3단계 도달이 불멸 승급 조건).
export const TAR_STAGE_IMAGES = {
  1: `${BASE}heroes/m_tar_stage1.webp`,
  2: `${BASE}heroes/m_tar_stage2.webp`,
  3: `${BASE}heroes/m_tar_stage3.webp`,
};

// 드래곤은 드레인(마왕 드래곤 승급 재료)으로 일시 변신한다. 승급 준비(드레인 확보)가
// 되면 이 이미지로 표시한다.
export const DRAGON_DRAIN_IMAGE = `${BASE}heroes/m_dragon_drain.webp`;

// 개구리왕자(신화)의 "변신 모습" 보조 썸네일. 사신 개구리(불멸)는 승급 이후 실제
// 개체가 바뀌므로 더 이상 별도 변신 썸네일이 필요 없다 - i_death_frog_evolved가
// 그 역할(2차 변신)을 실제 영웅 데이터로 대신한다(heroes.js의 SECOND_STAGE_IMMORTAL).
export const FROG_TRANSFORM_IMAGES = {
  m_frog_prince: `${BASE}heroes/m_frog_prince_transform.webp`,
};

// 로켓츄(신화)/아이언미야옹(신화)/에이스 배트맨(불멸)도 필드에서 별도 변신 모습을
// 보조 썸네일로 같이 보여준다. 아이언미야옹과 에이스 배트맨은 변신 모습이 2개씩 있다.
export const ROCKETCHU_TRANSFORM_IMAGE = `${BASE}heroes/m_rocketchu_transform.webp`;
export const IRON_MEYAONG_TRANSFORM_IMAGES = [
  `${BASE}heroes/m_iron_meyaong_transform1.webp`,
  `${BASE}heroes/m_iron_meyaong_transform2.webp`,
];
export const ACE_BATMAN_TRANSFORM_IMAGES = {
  pitcher: `${BASE}heroes/i_ace_batman_pitcher.webp`,
  batter: `${BASE}heroes/i_ace_batman_batter.webp`,
};

// 사용자가 제공한 UI 버튼/배지/아이콘 아트 (public/ui/).
// monsterBar/resourceBar/topBadgeBg는 JS에서 안 쓰고 main.css에서 background-image로 직접
// 참조한다(alt 텍스트가 필요 없는 순수 배경이라 굳이 <img>로 만들 필요가 없었음) - 그래도
// 파일 목록 전체를 한 곳에서 확인할 수 있도록 이 객체에도 같이 남겨둔다.
// popupTopBarBg(구 룰렛 팝업 커튼 프레임)는 새 목업이 하단 시트를 플랫 배경으로 바꾸면서
// 안 쓰게 됐다 - 나중에 다시 필요해지면 여기서 바로 꺼내 쓸 수 있게 매핑만 남겨둠.
export const UI_IMAGES = {
  summonBtn: `${BASE}ui/summon_btn.png`,
  mythicBtn: `${BASE}ui/mythic_btn.png`,
  rouletteBtn: `${BASE}ui/roulette_btn.png`,
  enhanceBtn: `${BASE}ui/enhance_btn.png`,
  rouletteRare: `${BASE}ui/roulette_rare.png`,
  rouletteHero: `${BASE}ui/roulette_hero.png`,
  rouletteLegendary: `${BASE}ui/roulette_legendary.png`,
  monsterBar: `${BASE}ui/monster_bar.png`,
  resourceBar: `${BASE}ui/resource_bar.png`,
  topBadgeBg: `${BASE}ui/top_badge_bg.png`,
  popupTopBarBg: `${BASE}ui/popup_topbar_bg.png`,
  skullIcon: `${BASE}ui/skull_icon.png`,
  speedOn: `${BASE}ui/speed_on.png`,
  speedOff: `${BASE}ui/speed_off.png`,
  monsterIcon: `${BASE}ui/monster.png`,
  immobilizeIcon: `${BASE}ui/immobilize_icon.png`, // 이동불능(즉시형) 표시 - 사슬
  impIcon: `${BASE}ui/imp.png`, // 마마의 임프
  goldIcon: `${BASE}ui/gold_icon.png`,
  luckstoneIcon: `${BASE}ui/luckstone_icon.png`,
  // 강화 팝업 아이콘 4종. 현재 시뮬레이터는 "일반 강화"(공용 강화 메커니즘) 하나만
  // 실제로 구현되어 있고, 확률 강화는 기획서 확정대로 항상 맥스라 표시만 한다.
  // epic/legend는 대응하는 실제 게임 상태가 없어 잠금(준비 중)으로만 노출한다.
  enhanceCommon: `${BASE}ui/enhance_common.png`,
  enhanceRate: `${BASE}ui/enhance_rate.png`,
  enhanceEpic: `${BASE}ui/enhance_epic.png`,
  enhanceLegend: `${BASE}ui/enhance_legend.png`,
};
