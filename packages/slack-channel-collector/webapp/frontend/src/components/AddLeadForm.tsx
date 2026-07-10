import { useState } from "react";
import type { LeadPayload } from "../lib/api";

const EMPTY: LeadPayload = {
  email: "",
  name: "",
  company: "",
  title: "",
  department: "",
  phone: "",
  interest: "",
  tag: "",
  memo: "",
};

export function AddLeadForm({
  onSubmit,
}: {
  onSubmit: (lead: LeadPayload) => void;
}) {
  const [f, setF] = useState<LeadPayload>(EMPTY);
  const upd = (k: keyof LeadPayload) => (v: string) => setF({ ...f, [k]: v });

  const submit = () => {
    const email = (f.email || "").toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      onSubmit({ ...f, email: "" }); // signal invalid to parent via empty email
      return;
    }
    const now = new Date();
    const dt =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      " " +
      now.toTimeString().slice(0, 8);
    onSubmit({ ...f, email, occurred_at: dt });
  };

  return (
    <>
      <h2>리드 직접 추가</h2>
      <div className="sub">전시회·미팅에서 받은 명함, 소개받은 연락처 등을 등록하세요</div>
      <div className="editgrid" style={{ marginTop: 14 }}>
        <div>
          <label>이메일 *</label>
          <input value={f.email} placeholder="name@company.com" onChange={(e) => upd("email")(e.target.value)} />
        </div>
        <div>
          <label>이름</label>
          <input value={f.name} placeholder="홍길동" onChange={(e) => upd("name")(e.target.value)} />
        </div>
        <div>
          <label>회사명</label>
          <input value={f.company} placeholder="회사명" onChange={(e) => upd("company")(e.target.value)} />
        </div>
        <div>
          <label>직급</label>
          <input value={f.title} placeholder="예: 과장" onChange={(e) => upd("title")(e.target.value)} />
        </div>
        <div>
          <label>부서</label>
          <input value={f.department} placeholder="예: 생산기술팀" onChange={(e) => upd("department")(e.target.value)} />
        </div>
        <div>
          <label>휴대폰</label>
          <input value={f.phone} placeholder="010-0000-0000" onChange={(e) => upd("phone")(e.target.value)} />
        </div>
        <div>
          <label>관심 솔루션</label>
          <input value={f.interest} list="solutions" placeholder="Hubble, EHM…" onChange={(e) => upd("interest")(e.target.value)} />
        </div>
        <div>
          <label>유입 경로 태그</label>
          <input value={f.tag} placeholder="예: ○○전시회 2026, 명함" onChange={(e) => upd("tag")(e.target.value)} />
        </div>
        <div className="full">
          <label>메모</label>
          <textarea rows={2} value={f.memo} placeholder="상담 내용, 다음 액션…" onChange={(e) => upd("memo")(e.target.value)} />
        </div>
        <div className="full">
          <button className="btn primary" onClick={submit}>
            추가
          </button>
          <div className="hint" style={{ marginTop: 8 }}>
            명함 사진은 채팅으로 Claude에게 주면 자동 인식해서 등록해드립니다.
          </div>
        </div>
      </div>
    </>
  );
}
