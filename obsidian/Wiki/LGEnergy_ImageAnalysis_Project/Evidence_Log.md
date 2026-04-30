---
type: evidence
created: 2026-04-21
updated: 2026-04-30
source: "public Slack evidence sweep (2024-04-21 to 2026-04-21)"
---

# Evidence Log

## 운영 원칙
- 이 문서는 원문 근거, 수치, 발췌, 제약 조건을 남기는 핵심 근거 로그입니다.
- 해석과 원문을 섞지 않고, 중요한 수치에는 출처 문서명과 날짜를 함께 남깁니다.
- 충돌 가능성이 보이면 즉시 [[Wiki/LGEnergy_ImageAnalysis_Project/Conflict_Register]]에 연결합니다.

## 활용 연결
- 참조 레지스터: [[Wiki/LGEnergy_ImageAnalysis_Project/Reference_Register]]
- 상태 레지스터: [[Wiki/LGEnergy_ImageAnalysis_Project/Status]]
- 실무 판단: [[Wiki/LGEnergy_ImageAnalysis_Project/Decisions]]
- 실행 항목: [[Wiki/LGEnergy_ImageAnalysis_Project/Action_Items]]
- 리스크: [[Wiki/LGEnergy_ImageAnalysis_Project/Risks]]

## 기존 정리 메모
## 2026-04-21 / Public Slack Evidence Sweep

### Evidence 01
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: XRM 샘플 이미지
- Type: 사실
- Original:
  > XRM의 경우 샘플 이미지가 있습니다. ... 참고하시어 측정 부분은 시작 부탁드립니다.
- Interpretation:
  - XRM 과제는 샘플 이미지 기반으로 실제 분석 착수가 가능한 상태다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Evidence_Log]]

### Evidence 02
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: 과제 범위
- Type: 결정
- Original:
  > 14~15시 : Li 석출 정량화 과제 논의
  > 15~16시 : XRM 분석과제 논의
- Interpretation:
  - 공개 증적상 최소 두 개의 분석 과제가 병렬로 논의된다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Decisions]]

### Evidence 03
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: 배포 및 인프라 요구사항
- Type: 리스크
- Original:
  > RTM 서버 혹은 AWS
  > LG엔솔 내부망에서 우리 AWS URL 접속 가능한지
  > AWS에 엔솔 이미지 업로드 허용되는지
  > Python 버전, Docker 지원 여부
  > Message Queue 설치/운영 가능 여부
- Interpretation:
  - 프로젝트 핵심 제약은 모델보다도 배포 및 인프라 조건일 수 있다.
- Linked Pages:
  - [[Risks]]
  - [[Conflict_Register]]

### Evidence 04
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: 자료 저장 경로 및 운영 방식
- Type: 사실
- Original:
  > 관련 자료 아래 경로에 넣어두었으며, 여기에 계속적으로 업데이트 하도록 하겠습니다.
  > VISION_NAS:\\00_프로젝트\\LG에너지솔루션_이미지분석
- Interpretation:
  - 자료 관리 경로가 이미 정해져 있고 계속 업데이트되는 운영 구조다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Action_Items]]

### Evidence 05
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: 성능 목표 초안
- Type: 수치
- Original:
  > Li 석출 정량화 : 면적비 측정 평균 절대 오차(MAE) 2% 이내
  > XRM 분석: Defect 검출, 물리량 측정 정확도 95% 이상
  > CT 이미지 분석: 물리량 측정 정확도 99.5% 이상
- Interpretation:
  - 계약/요구사항 협의용 성능 목표 초안이 이미 수치 형태로 제시됐다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Decisions]]

### Evidence 06
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: 계약 절차 상태
- Type: 사실
- Original:
  > 현재 계약 절차 진행 중입니다. 계약 완료 후 킥오프 진행하겠습니다.
- Interpretation:
  - 프로젝트는 단순 탐색 단계가 아니라 계약 진행 중인 준비 단계다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Change_Log]]

### Evidence 07
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 없음
- Topic: AWS 사용 제한
- Type: 리스크
- Original:
  > AWS 사용은 문제 없으나, 엔솔 이미지가 거기 올라가는 것은 불가합니다.
- Interpretation:
  - 클라우드 사용 가능 여부와 고객 데이터 반출 허용 여부는 별개 조건이다.
- Linked Pages:
  - [[Risks]]
  - [[Conflict_Register]]

### Evidence 08
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-07
- Thread: 없음
- Topic: 과제 수와 프로그램 범위
- Type: 결정
- Original:
  > 개발이 필요한 건은 총 3개의 세부 과제이며, 각 건에 대해 추론 프로그램이 필요
- Interpretation:
  - LG엔솔 프로젝트는 단일 분석기가 아니라 복수 과제를 병렬로 다루는 구조다.
- Linked Pages:
  - [[Project_Overview]]
  - [[Deployment_and_Constraints]]

### Evidence 09
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-07
- Thread: 있음
- Topic: 성능 목표 조정 의견
- Type: 변경
- Original:
  > 물리량 측정 오차율 5% 미만
  > CT 항목은 95%로 조정
- Interpretation:
  - 초기 성능 목표는 그대로 확정된 값이 아니라 문구와 수치가 조정되는 협의 대상이었다.
- Linked Pages:
  - [[Conflict_Register]]
  - [[Deployment_and_Constraints]]

### Evidence 10
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-20
- Thread: 있음
- Topic: 사내 서버 방향
- Type: 결정
- Original:
  > AWS 사용은 문제 없으나, 엔솔 이미지가 거기 올라가는 것은 불가
  > 사내 개발 서버를 활용하는 방향으로 진행
- Interpretation:
  - 배포 방향은 공개 클라우드보다 내부 서버 중심으로 기울었다.
- Linked Pages:
  - [[Deployment_and_Constraints]]
  - [[Decisions]]

### Evidence 11
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-20
- Thread: 없음
- Topic: 주간회의 운영
- Type: 액션
- Original:
  > 엔솔과 주간회의를 매주 목 오전 10시에 하자고 하는데
- Interpretation:
  - 고객과의 정기 실무 운영 리듬이 이미 설정되기 시작했다.
- Linked Pages:
  - [[Action_Items]]
  - [[Project_Overview]]

### Evidence 12
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-20
- Thread: 있음
- Topic: ppt/pdf 이미지 추출 요구 제외
- Type: 결정
- Original:
  > ppt나 pdf에서도 이미지를 추출해서 사용 가능하게 해주면 좋겠다
  > 이 기능은 그냥 안된다고 회신
- Interpretation:
  - 편의 기능 일부는 품질 및 원본 데이터 이슈 때문에 범위에서 제외하는 방향으로 정리됐다.
- Linked Pages:
  - [[Decisions]]
  - [[Deployment_and_Constraints]]

### Evidence 13
- Source: Slack Message
- Channel: #pjt_lg엔솔이미지분석
- Date: 2026-04-17
- Thread: 있음
- Topic: 세션/파일 운영 정책
- Type: 리스크
- Original:
  > 세션 유지 방식
  > 서버에 업로드된 파일 삭제 여부
- Interpretation:
  - 이 프로젝트는 모델 성능뿐 아니라 세션 지속성과 파일 보존 정책까지 설계해야 하는 운영형 과제다.
- Linked Pages:
  - [[Risks]]
  - [[Deployment_and_Constraints]]
