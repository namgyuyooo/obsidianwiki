---
type: knowledge
created: 2026-04-30
updated: 2026-04-30
source: ""
---

# Evidence Log

## Update - 2026-04-30

- Source: 2023 기술 세미나 프레젠테이션 자료_유남규_허블 수정.pptx
- Extractor: `pptx_zip_xml`
- Heading Candidates: 1. RTM AI, Pattern, ㅣ, ㅣ, ㅣ
- Original:
  > 1. RTM AI
기술 세미나

Pattern
Recognition

ㅣ
Pattern Recognition
ㅣ
11
시계열
데이터를 관리하는 전통적인 기법
Time (
ms
)
Sensor
Value
Sensor #2
Time (
ms
)
Sensor
Value
UCL : +5%
LCL : -10%
Center Line
Statistical Process Control (SPC)
통계적 공정관리
생산 공정 자체를 지속적으로 감시하는 데 집중하며 제품을 모니터링하면서 각
공정별로
정한
Contol
범위 이상의
quality
를
찾아내는 생산 공정 모니터링
Centerline
을 중심으로
Lower Control Limit(LCL)&Upper Control Limit(UCL)
을 설정하고 결과 변수가
Limit
내에 있으면
'
In control',
벗어나면
'
Out of control＇
로 구분

ㅣ
Pattern Recognition
ㅣ
12
Sensor #2
기존 방식은 데이터
overlap
으로 정상/비정상 판별 불가능
특정 센서값의
이상치 감지
센서 허용
범위 정의
통계적
검증
로직
업데이트 결정
S P C 이상탐지
leak
normal
통계를 이용한 SPC
(Statistical Process Control)
방식
Statistical Process Control 문제점
공정
변수
허용
범위가
좁은
초정밀
공정에
적용
불가능
신규
이상
발생시
재분석
/
검증
시간
이
증가함
패턴이 존재하는 데이터는
SPC
방식이 유효할까
?
기존
통계기반
공정진단
모델의
한계로
인해
,
기존
통계기반보다
고도화된
진단기술이
필요한
상황

ㅣ
Pattern Recognition
ㅣ
13
시계열
데이터 분석을 위한
AI
도입
AI Model
공정 이상
Why :
원인불명
Sensor #1
Sensor #2
Sensor #N
.
.
.
.
.
.
BLACK
BOX
일반적인
ML
모델의 한계
복잡한 모델 작동 방식에 의해 작업자가 이해할 수 있는 명확한 해석 및 원인 파악 등의 어려움

ㅣ
Pattern Recognition
ㅣ
14
패턴을 인식하는 기술
:
Deep Learning
에 설명력을 부여하는 기술
Time (
ms
)
Sensor
Value
Sensor #2
Time (
ms
)
Sensor
Value
1
:
Steady
2:
Down
3 : Up
4 : Steady
5 : Up
6 : Down
7. Stead
