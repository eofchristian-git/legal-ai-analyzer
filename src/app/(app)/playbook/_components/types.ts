export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PlaybookGroup {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  description: string | null;
}

export interface PlaybookRule {
  id: string;
  title: string;
  description: string;
  country: string | null;
  riskLevel: RiskLevel;
  standardPosition: string | null;
  acceptableRange: string | null;
  escalationTrigger: string | null;
  negotiationGuidance: string | null;
  groupId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface PlaybookData {
  id: string;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

export interface Snapshot {
  id: string;
  version: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  ruleCount: number;
}

export interface SnapshotDetail {
  id: string;
  version: number;
  createdByName: string;
  createdAt: string;
  rules: {
    id: string;
    title: string;
    description: string;
    country: string | null;
    riskLevel: RiskLevel;
    standardPosition: string | null;
    acceptableRange: string | null;
    escalationTrigger: string | null;
    negotiationGuidance: string | null;
    groupId: string | null;
    groupName: string | null;
  }[];
}

export const EMPTY_FORM = {
  title: "",
  description: "",
  country: "",
  riskLevel: "" as string,
  standardPosition: "",
  acceptableRange: "",
  escalationTrigger: "",
  negotiationGuidance: "",
};

export function generateTempId() {
  return `temp-${crypto.randomUUID()}`;
}
