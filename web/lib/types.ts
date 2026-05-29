export interface ResumeOut { id: number; filename: string; section_count: number; chunk_count: number; }
export interface JobOut { id: number; title: string; company: string; fit_score?: number; }
export interface FitOut {
  resume_id: number; job_id: number; fit_score: number;
  sub_scores: { required_coverage: number; nice_to_have_coverage: number; seniority_match: number };
  matched_skills: string[]; missing_skills: string[]; summary: string;
  interview_questions: { question: string; tag: string }[];
}
