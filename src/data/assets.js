// 영웅 외 공용 이미지 에셋 (public/ 하위, 서브 경로 배포 대응을 위해 BASE_URL을 붙인다)
const BASE = import.meta.env.BASE_URL;
export const BOSS_IMAGE = `${BASE}bg/boss.png`;
export const BACKGROUND_IMAGE = `${BASE}bg/background.jpg`;

// 군체 타르(m_tar)는 1~3단계 그래픽이 별도로 존재한다(3단계 도달이 불멸 승급 조건).
export const TAR_STAGE_IMAGES = {
  1: `${BASE}heroes/m_tar.webp`,
  2: `${BASE}heroes/m_tar_stage2.webp`,
  3: `${BASE}heroes/m_tar_stage3.webp`,
};

// 드래곤은 드레인(마왕 드래곤 승급 재료)으로 일시 변신한다. 승급 준비(드레인 확보)가
// 되면 이 이미지로 표시한다.
export const DRAGON_DRAIN_IMAGE = `${BASE}heroes/m_dragon_drain.webp`;

// 개구리왕자/사신개구리(승급 전후 모두) 변신 모습.
export const FROG_TRANSFORM_IMAGES = {
  m_frog_prince: `${BASE}heroes/m_frog_prince_transform.webp`,
  i_death_frog: `${BASE}heroes/i_death_frog_transform.webp`,
};
