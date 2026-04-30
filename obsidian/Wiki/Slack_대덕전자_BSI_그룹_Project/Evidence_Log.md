---
type: knowledge
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Evidence Log

<!-- slack-project:C01L5SA4Y4C:Slack_대덕전자_BSI_그룹_Project:1767784857.966639:1767784857.966639:1 -->
## Slack Evidence - 2026-04-30 - 대덕전자 (BSI 그룹)

### Message 01
- ts: `1767784857.966639` / `2026-01-07 20:20:57 KST`
- routing: bucket `project` / reason `project_keywords`
- Original:
  > 고객사 미팅 결과 보고 ■ 고객사: 대덕전자 (BSI 그룹)■ 미팅 일자: 2026-01-07 (수) 10:30 ■ 참석자: • *고객측:* 이성욱 프로 외 1인 (Bumping and Sawing Innovation Team) • *자사: <@U01C4A3GNQL>*, <@U019E51R1DM> , 유남규 *■ 미팅 핵심 요약:* • *최적 제어 값 도출 협의:* Bump Coining 공정의 선행 X 인자(SRO, SRT, RBH 등)와 결과 인자 간의 상관관계를 분석하여 최적의 Coining Pressure(Y) 산출을 목표로 함 • *데이터 확보 및 PoC 환경 조성:* 샘플 공정라인 선정 및 변수 최소화 데이터(CSV 형식, LOT당 8~20만 포인트 이상)를 차주 내 확보하기로 확약 • *PoC 추진 일정 합의:* 총 4주 기간의 PoC(공정 이해 2주 + 실제 분석 2주) 프로세스 안내 1. 고객 현황 및 과제 목표 • *공정 현황* ◦ *[단계 1] 기준면 및 표면 정의 (Cu T &amp; OSP)* ▪︎ *Cu T (Copper Trace)*: 모든 측정의 원점(Reference). 범프가 형성될 기준면으로 기능함. ▪︎ *OSP (Organic Solderability Preservative)*: 산화 방지 및 젖음성 확보를 위한 유기 보호막 형성. 형상 변화보다는 *표면 조건*을 결정하는 단계임. ◦ *[단계 2] 형상 틀 정의 (SPD: Solder Paste Defined)* ▪︎ *핵심 인자*: *SRO(Hole 폭), SRT(Hole 깊이)* ▪︎ *내용*: 레지스트 패턴을 통해 범프가 자랄 수 있는 수직/수평적 **'틀(Mold)'**을 결정함. 실질적인 범프 생성 전 기하학적 한계치를 정의하는 단계임. ◦ *[단계 3] 범프 생성 (MBM: Maskless Bumping Technology)* ▪︎ *핵심 인자*: *RBH (Raw Bump Height)* ▪︎ *내용*: Hole 내부에 Solder를 채우고 Reflow하여 돔(Dome) 형상의 초기 범프를 형성함. Coining 공정의 직전 입력값(Input)이 됨. ◦ *[단계 4] 최종 형상 조정 (Coining)* ▪︎ *제어 변수*: *Pressure (압력)* ▪︎ *결과 인자*: *FBH (최종 높이), FBD (최종 폭)* ▪︎ *내용*: 압력을 가해 RBH를 낮추고(↓) 폭을 넓혀(↑) Spec-in 형상으로 성형함. FBH, FBD 는 bump 별 실측을 진행하고 있음 • *현황 및 문제점:* ◦ 현재 Cu T(동박) 상에 범프를 형성하고 Coining 공정을 통해 최종 형상을 맞추고 있으나, 최종 스펙인 FBH(높이) 및 FBD(폭)의 Spec-in 비율을 극대화하기 위한 정밀한 압력 제어 로직이 요구됨 ◦ 공정 전반(OSP → SPD/MBM → Coining)에서 발생하는 다양한 치수 데이터(X 인자)가 최종 품질에 미치는 영향도가 정량적으로 관리될 필요가 있음 • *고객 목표:* ◦ 최종 범프 형상(FBH, FBD)의 상/하한 기준에 맞추기위한 Coining Pressure를 산출하는 제어 레시피 산출 2. 주요 논의 내용 • *당사 제안 내용:* ◦ *최적 제어에 앞서 상관관계 분석:* SRO(Hole…

<!-- slack-project:C01L5SA4Y4C:Slack_대덕전자_BSI_그룹_Project:1767784857.966639:1767784857.966639:1:files1:analysis0 -->
## Slack Evidence - 2026-04-30 - 대덕전자 (BSI 그룹)

### Message 01
- ts: `1767784857.966639` / `2026-01-07 20:20:57 KST`
- routing: bucket `project` / reason `project_keywords`
- Original:
  > 고객사 미팅 결과 보고 ■ 고객사: 대덕전자 (BSI 그룹)■ 미팅 일자: 2026-01-07 (수) 10:30 ■ 참석자: • *고객측:* 이성욱 프로 외 1인 (Bumping and Sawing Innovation Team) • *자사: <@U01C4A3GNQL>*, <@U019E51R1DM> , 유남규 *■ 미팅 핵심 요약:* • *최적 제어 값 도출 협의:* Bump Coining 공정의 선행 X 인자(SRO, SRT, RBH 등)와 결과 인자 간의 상관관계를 분석하여 최적의 Coining Pressure(Y) 산출을 목표로 함 • *데이터 확보 및 PoC 환경 조성:* 샘플 공정라인 선정 및 변수 최소화 데이터(CSV 형식, LOT당 8~20만 포인트 이상)를 차주 내 확보하기로 확약 • *PoC 추진 일정 합의:* 총 4주 기간의 PoC(공정 이해 2주 + 실제 분석 2주) 프로세스 안내 1. 고객 현황 및 과제 목표 • *공정 현황* ◦ *[단계 1] 기준면 및 표면 정의 (Cu T &amp; OSP)* ▪︎ *Cu T (Copper Trace)*: 모든 측정의 원점(Reference). 범프가 형성될 기준면으로 기능함. ▪︎ *OSP (Organic Solderability Preservative)*: 산화 방지 및 젖음성 확보를 위한 유기 보호막 형성. 형상 변화보다는 *표면 조건*을 결정하는 단계임. ◦ *[단계 2] 형상 틀 정의 (SPD: Solder Paste Defined)* ▪︎ *핵심 인자*: *SRO(Hole 폭), SRT(Hole 깊이)* ▪︎ *내용*: 레지스트 패턴을 통해 범프가 자랄 수 있는 수직/수평적 **'틀(Mold)'**을 결정함. 실질적인 범프 생성 전 기하학적 한계치를 정의하는 단계임. ◦ *[단계 3] 범프 생성 (MBM: Maskless Bumping Technology)* ▪︎ *핵심 인자*: *RBH (Raw Bump Height)* ▪︎ *내용*: Hole 내부에 Solder를 채우고 Reflow하여 돔(Dome) 형상의 초기 범프를 형성함. Coining 공정의 직전 입력값(Input)이 됨. ◦ *[단계 4] 최종 형상 조정 (Coining)* ▪︎ *제어 변수*: *Pressure (압력)* ▪︎ *결과 인자*: *FBH (최종 높이), FBD (최종 폭)* ▪︎ *내용*: 압력을 가해 RBH를 낮추고(↓) 폭을 넓혀(↑) Spec-in 형상으로 성형함. FBH, FBD 는 bump 별 실측을 진행하고 있음 • *현황 및 문제점:* ◦ 현재 Cu T(동박) 상에 범프를 형성하고 Coining 공정을 통해 최종 형상을 맞추고 있으나, 최종 스펙인 FBH(높이) 및 FBD(폭)의 Spec-in 비율을 극대화하기 위한 정밀한 압력 제어 로직이 요구됨 ◦ 공정 전반(OSP → SPD/MBM → Coining)에서 발생하는 다양한 치수 데이터(X 인자)가 최종 품질에 미치는 영향도가 정량적으로 관리될 필요가 있음 • *고객 목표:* ◦ 최종 범프 형상(FBH, FBD)의 상/하한 기준에 맞추기위한 Coining Pressure를 산출하는 제어 레시피 산출 2. 주요 논의 내용 • *당사 제안 내용:* ◦ *최적 제어에 앞서 상관관계 분석:* SRO(Hole…

  - attachment: `image.png`
  - attachment_download: `downloaded` / `obsidian/raw/exports/slack_files/2026-04-30/tf_cross_team_sales_C01L5SA4Y4C_2026-04-30T13-59-18Z/C01L5SA4Y4C/1767784857_966639/F0A6U30KL5V_image.png`
  - attachment_analysis: `preserved_only` / extractor `-`
