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

// 사용자가 제공한 UI 버튼/배지/아이콘 아트 (public/ui/). 전부 사용자가 준 "이미지 매핑표
// (UI/배경)"의 파일 번호를 그대로 따른 것 - 번호 자체를 추측하지 말고 이 매핑표가 바뀌면
// 여기만 고치면 된다.
// resourceBar/topBadgeBg는 JS에서 안 쓰고 main.css에서 background-image로 직접 참조한다
// (alt 텍스트가 필요 없는 순수 배경이라 굳이 <img>로 만들 필요가 없었음) - 그래도 파일 목록
// 전체를 한 곳에서 확인할 수 있도록 이 객체에도 같이 남겨둔다.
// monsterCountBg(12번)는 원래 "커튼 프레임/구 룰렛 팝업 배경"으로 추정해서 미사용 처리했었는데,
// 사용자가 실제 게임 스크린샷으로 몬스터 카운트 바 배경이 이 이미지라고 직접 정정해줬다
// (모양이 위쪽에 탭이 튀어나온 명패 형태 - 목업 HTML의 몬스터 카운트 자리는 순수 CSS/이모지
// 플레이스홀더였을 뿐이라 실제 아트는 이 표를 따로 확인해야 했다. `.monster-row` 참고).
export const UI_IMAGES = {
  summonBtn: `${BASE}ui/summon_btn.png`, // 19
  mythicBtn: `${BASE}ui/mythic_btn.png`, // 21
  rouletteBtn: `${BASE}ui/roulette_btn.png`, // 20
  enhanceBtn: `${BASE}ui/enhance_btn.png`, // 18
  rouletteRare: `${BASE}ui/roulette_rare.png`, // 23
  rouletteHero: `${BASE}ui/roulette_hero.png`, // 24
  rouletteLegendary: `${BASE}ui/roulette_legendary.png`, // 22
  resourceBar: `${BASE}ui/resource_bar.png`, // 17
  topBadgeBg: `${BASE}ui/top_badge_bg.png`, // 14
  monsterCountBg: `${BASE}ui/monster_count_bg.png`, // 12, 몬스터 카운트 바 배경
  // 해골(13)은 룰렛 실패 표시 전용 - 몬스터 표시에는 절대 쓰지 않는다.
  skullIcon: `${BASE}ui/skull_icon.png`, // 13
  speedOn: `${BASE}ui/speed_on.png`, // 16
  speedOff: `${BASE}ui/speed_off.png`, // 15
  // 몬스터(4)와 임프(2)는 서로 다른 이미지다 - 헷갈려서 한 번 바꿔 넣었다가 정정함.
  monsterIcon: `${BASE}ui/monster.png`, // 4
  impIcon: `${BASE}ui/imp.png`, // 2, 마마 전용 소환체
  immobilizeIcon: `${BASE}ui/immobilize_icon.png`, // 3, 이동불능(즉시형) 표시
  goldIcon: `${BASE}ui/gold_icon.png`, // 6
  luckstoneIcon: `${BASE}ui/luckstone_icon.png`, // 5
  // 강화 팝업 4열(일반~희귀/영웅/전설~불멸/소환 확률) 아이콘. 전부 GameState.globalEnhance의
  // 실제 전역 트랙과 연결된 진짜 버튼이다(actions.js의 upgradeGlobalEnhance) - 데미지 계산이
  // 범위 밖이라 레벨을 올려도 실질 효과는 없지만(소환 확률도 항상 고정), 골드/보석을 실제로
  // 쓰고 레벨이 실제로 오르는 진행형 시스템으로 구현했다. 특정 선택 영웅과는 무관.
  enhanceCommon: `${BASE}ui/enhance_common.png`, // 10 (일반~희귀)
  enhanceHero: `${BASE}ui/enhance_epic.png`, // 9 (영웅)
  enhanceLegendary: `${BASE}ui/enhance_legend.png`, // 8 (전설~불멸)
  enhanceRate: `${BASE}ui/enhance_rate.png`, // 7 (소환 확률)
};
