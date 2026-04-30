# Wiki Core Bootstrap

이 디렉터리는 업무 위키와 개인 위키를 별도 저장소로 유지하면서도 같은 운영 골격을 빠르게 맞추기 위한 bootstrap 도구를 둔다.

## 목적

- sibling `wiki-core` 계약 저장소 생성
- sibling `obsidianwiki-personal` 개인 vault 스캐폴드 생성
- 두 위키가 같은 contract version을 pin 하도록 `wiki-core.lock.json` 기록

## 실행

```bash
node automation/wiki_core/bootstrap_twin_vaults.mjs --init-git
```

기본 생성 위치:

- core: `../wiki-core`
- personal: `../obsidianwiki-personal`

## 원칙

- 현재 저장소는 계속 업무 canonical repo다.
- 개인 vault는 현재 repo 내부 namespace가 아니라 sibling repo로 생성한다.
- 공통성은 콘텐츠가 아니라 contract/template/operating model에서만 유지한다.
- bootstrap은 one-way seed다. 필요하면 `--force`로 skeleton을 다시 맞춘다.
