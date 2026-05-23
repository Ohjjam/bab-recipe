# Bab Recipe — 프로젝트 지침

## 배포 자동화 (사전 인가)

이 프로젝트는 GitHub Pages + PWA로 배포되며, `main` 브랜치에 push될 때
GitHub Actions가 자동으로 빌드/배포한다 ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

사용자(Ohjjam)는 주로 폰 크롬으로 사용하므로, 코드 변경이 폰에 반영되려면
반드시 main에 push되어야 한다. 매번 컨펌받는 게 번거롭다는 사용자 요청에 따라:

**변경 작업이 완료되면 별도 컨펌 없이 다음 단계까지 자동 진행한다:**

1. `npx tsc --noEmit`으로 타입 체크
2. 변경된 파일들을 **명시적으로** `git add <path1> <path2> ...` (`git add -A` / `git add .` 금지 — `.claude/` 같은 로컬 파일이 섞일 수 있음)
3. 의미 있는 한국어 커밋 메시지로 `git commit`
4. `git push origin main`
5. GitHub Actions 빌드 상태를 한 번 확인 (`gh run list --limit 1`)

이 흐름은 이 프로젝트(bab-recipe)에서만 사전 인가된다. 다른 프로젝트로
확장하지 않는다.

**예외 — 자동 진행하지 말 것:**
- `package.json` 의존성 추가/제거: 보안·번들 사이즈 영향 있으므로 사전 확인
- `.github/workflows/*` 변경: CI/CD 자체 변경
- `vite.config.ts`의 PWA 설정 중 데이터 손실 위험 있는 변경
  (예: `clientsClaim` 같은 SW 동작 변경은 OK, 캐시 무효화 정책 변경은 확인)
- 사용자가 명시적으로 "커밋만 하고 푸시는 하지 마" 같이 말한 경우
- 빌드/타입 체크 실패 시: Stop the Line, 푸시 금지

## 데이터 저장 구조 (절대 잃지 말 것)

사용자 데이터는 **IndexedDB**에 저장됨 ([src/db.ts](src/db.ts)):
- 재료 목록
- 식사 기록 (날짜별 + 칼로리/탄단지)
- 저장한 레시피
- 채팅 기록

PWA Service Worker 캐시(Cache Storage)와는 **완전히 다른 저장소**다.
SW unregister나 Cache Storage 비우기는 **데이터에 영향 없음**.
오직 "사이트 데이터 모두 삭제" 또는 `indexedDB.deleteDatabase()`만 데이터를 지운다.

이 점을 헷갈리지 말고, 사용자에게도 명확히 안내할 것.

## PWA 업데이트 동작

- `vite-plugin-pwa` + `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true`
- 새 배포 후 사용자가 앱을 열면 새 SW가 즉시 활성화되고, 새로고침 1회로 새 버전 적용
- 비상시: 설정 → "앱 강제 업데이트" 버튼 (SW + Cache만 청소, IndexedDB 보존)
