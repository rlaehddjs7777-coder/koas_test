# KOAS R&D 연구소 업무 관리

GitHub Pages에 배포할 파일은 `index.html`입니다. Firebase Authentication과 Firestore를 사용합니다.

## 개발 및 검증

```text
npm ci
npm run build
npm test
npm run test:rules
```

빌드에는 Python과 Node.js가 필요하고, 보안 규칙 테스트에는 Java 21이 필요합니다. 빌드 기준 원본은 저장소의 `0535e092a0ce334dc1355580b61e25f73e1241ac` 커밋에서 읽으므로 해당 이력을 포함해 clone해야 합니다.

- `ui/`: 화면, 입력값 처리, 공동 편집 모듈
- `tools/`: 단일 HTML 빌드 및 테스트 도구
- `firestore.rules`: 서버 접근 권한과 저장 버전 검증
- `tests/`: 공동 편집·입력 보안·서버 규칙 테스트

관리자 Custom Claim 설정 및 보안 규칙 배포 순서는 [운영 적용 안내](SECURITY-적용안내.md)를 참고하세요. 보안 규칙을 적용한 뒤에는 사용자가 새 화면으로 새로고침해야 합니다.
