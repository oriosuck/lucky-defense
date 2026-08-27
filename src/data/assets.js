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
