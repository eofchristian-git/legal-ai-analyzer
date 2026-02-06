import { readFile } from "fs/promises";
import path from "path";

export type SkillName =
  | "contract-review"
  | "nda-triage"
  | "compliance"
  | "legal-risk-assessment"
  | "canned-responses"
  | "meeting-briefing";

const skillCache = new Map<string, string>();

export async function loadSkill(name: SkillName): Promise<string> {
  if (skillCache.has(name)) {
    return skillCache.get(name)!;
  }

  const filePath = path.join(process.cwd(), "skills", `${name}.md`);
  const content = await readFile(filePath, "utf-8");

  skillCache.set(name, content);
  return content;
}
