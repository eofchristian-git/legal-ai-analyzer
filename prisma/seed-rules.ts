import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Maps SQL category_group values to PlaybookGroup slugs
const GROUP_SLUG_MAP: Record<string, string> = {
  CORE_LEGAL: "core-legal",
  COMMERCIAL: "commercial",
  OPERATIONAL: "operational",
  LIFECYCLE: "contract-lifecycle",
  COMPLIANCE: "compliance",
  LEGAL_FRAMEWORK: "legal-framework",
  BOILERPLATE: "boilerplate",
};

// Risk weight mapping (SQL → PlaybookRule riskLevel)
// HIGH stays HIGH, MEDIUM stays MEDIUM, LOW stays LOW
// Mandatory clauses that are HIGH get bumped to CRITICAL
function mapRiskLevel(weight: string, isMandatory: boolean): string {
  if (isMandatory && weight === "HIGH") return "CRITICAL";
  return weight; // HIGH, MEDIUM, LOW all valid
}

interface ClauseCategory {
  code: string;
  name: string;
  description: string;
  riskWeight: string;
  categoryGroup: string;
  isMandatory: boolean;
  standardPosition: string;
  acceptableRange: string;
  escalationTrigger: string;
  negotiationGuidance: string;
}

// All 44 clause categories from the SQL script
const CLAUSE_CATEGORIES: ClauseCategory[] = [
  // Core Legal Clauses
  {
    code: "LIA-001",
    name: "Limitation of Liability",
    description: "Caps or limits on liability exposure",
    riskWeight: "HIGH",
    categoryGroup: "CORE_LEGAL",
    isMandatory: true,
    standardPosition: "Mutual liability cap; exclude indirect/consequential damages; carve-outs limited and explicit.",
    acceptableRange: "Cap between 1x–2x fees (or contract value); limited carve-outs (e.g., IP infringement) with defined sub-cap.",
    escalationTrigger: "Unlimited liability; broad carve-outs (privacy/security) without sub-cap; cap >2x fees or unclear damages scope.",
    negotiationGuidance: "Offer tiered caps (1x/2x); add exclusion for consequential damages; propose sub-caps for carve-outs and link cap to fees paid."
  },
  {
    code: "LIA-002",
    name: "Indemnification",
    description: "Indemnity and hold harmless provisions",
    riskWeight: "HIGH",
    categoryGroup: "CORE_LEGAL",
    isMandatory: true,
    standardPosition: "Mutual indemnities; each party covers third-party claims caused by its breach/negligence; clear procedures (notice/control).",
    acceptableRange: "One-way IP indemnity for customer; duty to defend acceptable with reasonable control & cooperation terms; exclusions for customer misuse.",
    escalationTrigger: "Indemnity for first-party losses; indemnifying counterparty’s own negligence; no control of defense; uncapped indemnity.",
    negotiationGuidance: "Keep indemnity limited to third-party claims; add defense-control + mitigation; include exclusions (mods, misuse, combinations)."
  },
  {
    code: "IP-001",
    name: "Intellectual Property",
    description: "IP ownership, assignment, and licensing",
    riskWeight: "HIGH",
    categoryGroup: "CORE_LEGAL",
    isMandatory: true,
    standardPosition: "Each party retains pre-existing IP; deliverables licensed (not assigned) unless paid-for work-for-hire explicitly agreed.",
    acceptableRange: "Assignment of bespoke deliverables acceptable if clearly scoped; retain background tools; grant back license for reusable components.",
    escalationTrigger: "Broad assignment of all IP (including background IP); restrictive license that blocks reuse; unclear definition of deliverables.",
    negotiationGuidance: "Split ‘Background IP’ vs ‘Project IP’; propose license + escrow of source only if needed; ensure reuse rights for tooling."
  },
  {
    code: "DPA-001",
    name: "Data Protection/GDPR",
    description: "Data processing and privacy compliance",
    riskWeight: "HIGH",
    categoryGroup: "CORE_LEGAL",
    isMandatory: true,
    standardPosition: "DPA in place; roles defined (controller/processor); SCCs where needed; security measures and breach notice defined.",
    acceptableRange: "Breach notice within 48–72 hours; subprocessors allowed with notice/objection; reasonable audit via reports/certs.",
    escalationTrigger: "Breach notice >72 hours; unlimited audits/on-site at any time; missing SCCs for cross-border transfers; vague security duties.",
    negotiationGuidance: "Use standard DPA template; offer SOC2/ISO reports instead of frequent audits; tighten definitions (personal data, incidents, timelines)."
  },
  {
    code: "NCP-001",
    name: "Non-Competition",
    description: "Non-compete restrictions and exclusivity",
    riskWeight: "HIGH",
    categoryGroup: "CORE_LEGAL",
    isMandatory: false,
    standardPosition: "No exclusivity; no broad non-compete; narrow non-solicit is preferred instead.",
    acceptableRange: "If required: narrow, time-limited (3–6 months) and scope-limited to specific customers/project and geography where lawful.",
    escalationTrigger: "Broad market-wide non-compete; long duration (>6–12 months); exclusivity without compensation; restriction likely unenforceable locally.",
    negotiationGuidance: "Swap non-compete for confidentiality + non-solicit; narrow to named accounts; require consideration/fee if exclusivity is requested."
  },
  {
    code: "PEN-001",
    name: "Financial Penalties",
    description: "Contractual penalties and liquidated damages",
    riskWeight: "HIGH",
    categoryGroup: "CORE_LEGAL",
    isMandatory: false,
    standardPosition: "No penalties; damages limited to proven direct losses; service credits (if any) are sole remedy.",
    acceptableRange: "Liquidated damages only if reasonable, capped, and tied to measurable delay; exclude penalties for minor breaches.",
    escalationTrigger: "Open-ended penalties; daily penalties without cap; penalties plus damages (‘double recovery’); penalties for subjective criteria.",
    negotiationGuidance: "Offer service credits; cap LDs (e.g., % of fees); add cure periods; ensure LDs are exclusive remedy for the relevant breach."
  },

  // Commercial Clauses
  {
    code: "PAY-001",
    name: "Payment Terms",
    description: "Payment timing, methods, and conditions",
    riskWeight: "MEDIUM",
    categoryGroup: "COMMERCIAL",
    isMandatory: true,
    standardPosition: "Net 30 payment; undisputed amounts paid on time; late fees reasonable; currency and method specified.",
    acceptableRange: "Net 45–60 for strategic deals; milestone-based payments acceptable with clear acceptance; reasonable withholding only for disputes.",
    escalationTrigger: "Net >60; broad set-off/withholding rights; pay-when-paid; customer unilateral payment hold without dispute process.",
    negotiationGuidance: "Trade extended terms for price/commitment; add dispute-only withholding; require partial payment of undisputed invoices."
  },
  {
    code: "PRI-001",
    name: "Pricing/Rates",
    description: "Fee structures, rates, and pricing models",
    riskWeight: "MEDIUM",
    categoryGroup: "COMMERCIAL",
    isMandatory: true,
    standardPosition: "Rates/fees fixed for term; changes via written amendment; clear currency/taxes; no retroactive discounts.",
    acceptableRange: "Annual uplift (CPI or capped %); volume discounts with thresholds; FX adjustments only if objective index-based.",
    escalationTrigger: "Unilateral price change by counterparty; most-favored-nation obligations; retroactive pricing; undefined tax responsibility.",
    negotiationGuidance: "Offer tiered pricing; define rate card + change control; add tax gross-up clarity; avoid MFN by limiting to specific products/period."
  },
  {
    code: "INV-001",
    name: "Invoicing Procedures",
    description: "Invoice submission and processing rules",
    riskWeight: "LOW",
    categoryGroup: "COMMERCIAL",
    isMandatory: false,
    standardPosition: "Monthly invoicing; required PO/reference fields; electronic delivery; dispute window defined.",
    acceptableRange: "Bi-weekly or milestone invoices; customer portal submission if reasonable; dispute window 15–30 days.",
    escalationTrigger: "Invoice acceptance at customer’s sole discretion; excessive documentation; dispute window >60 days delaying cashflow.",
    negotiationGuidance: "Standardize fields; agree on a single submission channel; add ‘deemed accepted if not disputed within X days’."
  },
  {
    code: "TRV-001",
    name: "Travel & Expenses",
    description: "Expense reimbursement and travel policies",
    riskWeight: "LOW",
    categoryGroup: "COMMERCIAL",
    isMandatory: false,
    standardPosition: "Pre-approved travel; reimbursement at cost with receipts; follow reasonable policy; no markup.",
    acceptableRange: "Per-diem caps; economy travel default; client-specific limits acceptable if disclosed upfront.",
    escalationTrigger: "No reimbursement for necessary travel; unrealistic caps; retroactive policy changes; unlimited audit/chargebacks.",
    negotiationGuidance: "Set pre-approval workflow; define caps per category; confirm billing cadence; include exceptions for emergencies."
  },

  // Operational Clauses
  {
    code: "SVC-001",
    name: "Service Description",
    description: "Scope and nature of services",
    riskWeight: "MEDIUM",
    categoryGroup: "OPERATIONAL",
    isMandatory: true,
    standardPosition: "Clear scope, deliverables, assumptions, and exclusions; change requests handled via change control.",
    acceptableRange: "Reasonable flexibility for minor scope tweaks; deliverable-based acceptance allowed with objective criteria.",
    escalationTrigger: "Open-ended ‘all necessary’ obligations; ambiguous deliverables; acceptance tied to subjective satisfaction only.",
    negotiationGuidance: "Use SOW with bullets; add assumptions; link changes to CR process; define what is out-of-scope explicitly."
  },
  {
    code: "WRK-001",
    name: "Working Hours",
    description: "Time commitments and scheduling",
    riskWeight: "LOW",
    categoryGroup: "OPERATIONAL",
    isMandatory: false,
    standardPosition: "Reasonable hours; scheduling by mutual agreement; no guaranteed availability outside business hours.",
    acceptableRange: "Core overlap hours; occasional on-call by prior agreement and paid rate; time zone expectations documented.",
    escalationTrigger: "24/7 availability without compensation; strict hours incompatible with role; punitive reporting requirements.",
    negotiationGuidance: "Offer overlap window; define on-call rates; document holidays/time zones; align expectations to the delivery plan."
  },
  {
    code: "WRK-002",
    name: "Workplace Location",
    description: "Location requirements and remote work",
    riskWeight: "LOW",
    categoryGroup: "OPERATIONAL",
    isMandatory: false,
    standardPosition: "Remote-first unless onsite is necessary; onsite only with notice and reimbursed travel.",
    acceptableRange: "Periodic onsite (e.g., quarterly); hybrid if within commute; secure-site access requirements reasonable.",
    escalationTrigger: "Permanent onsite without reimbursement; relocation requirement; broad access to restricted facilities without clear rules.",
    negotiationGuidance: "Set cadence for onsite; require advance notice; define security/access steps; tie onsite to project milestones."
  },
  {
    code: "TME-001",
    name: "Time Reporting",
    description: "Timesheet and reporting requirements",
    riskWeight: "LOW",
    categoryGroup: "OPERATIONAL",
    isMandatory: false,
    standardPosition: "Simple weekly/monthly timesheets; reasonable level of detail; approvals within a set timeframe.",
    acceptableRange: "Client tool usage; project-code tagging; daily logging if required for regulated projects.",
    escalationTrigger: "Excessive granularity (minute-by-minute); approval delays >14 days; timesheets used to dispute agreed fixed fees.",
    negotiationGuidance: "Agree template + SLA for approvals; limit detail to task-level; separate reporting from payment disputes."
  },
  {
    code: "CON-001",
    name: "Consultant Obligations",
    description: "Duties and responsibilities of consultant",
    riskWeight: "MEDIUM",
    categoryGroup: "OPERATIONAL",
    isMandatory: true,
    standardPosition: "Perform services professionally; comply with lawful policies; meet agreed milestones; maintain confidentiality.",
    acceptableRange: "Specific deliverable obligations; reasonable client policies (security); cooperation duties with defined scope.",
    escalationTrigger: "Guarantees of outcomes; unlimited compliance obligations; obligations to follow changing policies without notice.",
    negotiationGuidance: "Replace guarantees with ‘commercially reasonable efforts’; reference policies by version/date; add notice for policy updates."
  },
  {
    code: "CLI-001",
    name: "Client Obligations",
    description: "Duties and responsibilities of client",
    riskWeight: "MEDIUM",
    categoryGroup: "OPERATIONAL",
    isMandatory: false,
    standardPosition: "Client provides timely access, info, and approvals; delays extend timelines; client responsible for its systems/data.",
    acceptableRange: "Named client stakeholders; reasonable response SLAs; shared responsibilities for dependencies.",
    escalationTrigger: "Client has no duties; consultant bears all dependency risks; no timeline relief for client-caused delays.",
    negotiationGuidance: "Add dependency list; define response times; include timeline/fee adjustments for delay; clarify client-provided environments."
  },
  {
    code: "RPL-001",
    name: "Replacement/Substitution",
    description: "Consultant replacement procedures",
    riskWeight: "MEDIUM",
    categoryGroup: "OPERATIONAL",
    isMandatory: false,
    standardPosition: "Right to substitute with equivalent skills; reasonable notice; client may reject for objective reasons.",
    acceptableRange: "Approval not unreasonably withheld; transition period; knowledge transfer commitments.",
    escalationTrigger: "Client can reject at sole discretion; forced replacement without cause; penalties for substitution.",
    negotiationGuidance: "Define ‘equivalent’ criteria; set notice + handover; limit rejection to documented performance/security issues."
  },
  {
    code: "SUB-001",
    name: "Subcontracting",
    description: "Subcontracting permissions and restrictions",
    riskWeight: "MEDIUM",
    categoryGroup: "OPERATIONAL",
    isMandatory: false,
    standardPosition: "Subcontracting allowed with responsibility retained; use qualified subs; flow-down confidentiality/security terms.",
    acceptableRange: "Notice/consent for material subs; client can object on reasonable grounds; list key subs if needed.",
    escalationTrigger: "Absolute prohibition; client consent at sole discretion; client demands direct liability from subs.",
    negotiationGuidance: "Offer pre-approved sub list; keep prime responsible; flow-down obligations; limit consent to ‘not unreasonably withheld’."
  },

  // Contract Lifecycle
  {
    code: "TRM-001",
    name: "Termination Rights",
    description: "Termination conditions and procedures",
    riskWeight: "HIGH",
    categoryGroup: "LIFECYCLE",
    isMandatory: true,
    standardPosition: "Termination for cause with cure period; convenience termination only with notice and payment for work done/commitments.",
    acceptableRange: "Convenience termination with 30–60 days notice; early termination fees for committed resources; immediate termination for material breach.",
    escalationTrigger: "Immediate convenience termination without compensation; no cure period; broad ‘for any reason’ without notice.",
    negotiationGuidance: "Trade convenience termination for notice + fees; add cure; ensure payment for delivered work and non-cancellable costs."
  },
  {
    code: "TRM-002",
    name: "Notice Periods",
    description: "Required notice for various actions",
    riskWeight: "MEDIUM",
    categoryGroup: "LIFECYCLE",
    isMandatory: true,
    standardPosition: "Written notice; reasonable periods (e.g., 30 days for convenience, 10–30 days for breach cure).",
    acceptableRange: "Shorter notice for low-risk changes (10–15 days); email notice acceptable with receipt confirmation.",
    escalationTrigger: "Ultra-short notice (<7 days) for termination; notice only via hard copy; unclear notice addresses.",
    negotiationGuidance: "Allow email + portal; define deemed receipt; harmonize all notice timelines across the contract."
  },
  {
    code: "CHG-001",
    name: "Change Control",
    description: "Amendment and variation procedures",
    riskWeight: "MEDIUM",
    categoryGroup: "LIFECYCLE",
    isMandatory: false,
    standardPosition: "Changes via written change request; impacts on scope/time/fees documented and approved.",
    acceptableRange: "Fast-track for minor changes; predefined rate card for extras; governance meeting cadence.",
    escalationTrigger: "Client can unilaterally change scope; changes implied by emails without sign-off; no fee/timeline adjustment mechanism.",
    negotiationGuidance: "Use CR template; define authority levels; add ‘no work starts until approved’ for material changes."
  },
  {
    code: "AMD-001",
    name: "Amendment",
    description: "Contract modification provisions",
    riskWeight: "LOW",
    categoryGroup: "LIFECYCLE",
    isMandatory: false,
    standardPosition: "Amendments must be in writing and signed by authorized reps.",
    acceptableRange: "E-signatures accepted; order forms/SOWs can amend specific sections if explicitly stated.",
    escalationTrigger: "Amendment by conduct; unilateral amendments via website terms; unclear signature authority.",
    negotiationGuidance: "Add ‘order of precedence’; specify authorized signatories; allow e-sign to reduce friction."
  },
  {
    code: "ASN-001",
    name: "Assignment",
    description: "Assignment and transfer rights",
    riskWeight: "MEDIUM",
    categoryGroup: "LIFECYCLE",
    isMandatory: false,
    standardPosition: "No assignment without consent, except to affiliates/successor in M&A with notice.",
    acceptableRange: "Consent not unreasonably withheld; assignment in connection with reorg permitted.",
    escalationTrigger: "Counterparty can assign freely to competitors; consent at sole discretion; assignment triggers termination penalties.",
    negotiationGuidance: "Permit assignment for corporate transactions; require notice; restrict assignment to direct competitors."
  },

  // Compliance & Risk
  {
    code: "NDA-001",
    name: "Confidentiality",
    description: "Non-disclosure and secrecy obligations",
    riskWeight: "HIGH",
    categoryGroup: "COMPLIANCE",
    isMandatory: true,
    standardPosition: "Mutual confidentiality; standard exclusions; use only for contract purposes; reasonable security; injunctive relief allowed.",
    acceptableRange: "Term 3–5 years (or longer for trade secrets); broader definition acceptable if exclusions remain.",
    escalationTrigger: "Perpetual confidentiality for all info; missing exclusions; unlimited liability for confidentiality breach.",
    negotiationGuidance: "Keep standard exclusions; separate trade secrets; align remedies to liability cap (or define sub-cap)."
  },
  {
    code: "SOL-001",
    name: "Non-Solicitation",
    description: "Non-solicitation of employees/clients",
    riskWeight: "MEDIUM",
    categoryGroup: "COMPLIANCE",
    isMandatory: false,
    standardPosition: "Mutual non-solicit limited to direct project personnel; reasonable duration (6–12 months).",
    acceptableRange: "One-way non-solicit; carve-out for general ads and unsolicited applicants; duration up to 12 months.",
    escalationTrigger: "Broad non-solicit covering entire company; long duration (>12–24 months); restrictions on hiring via public postings.",
    negotiationGuidance: "Limit to ‘directly involved’ staff; add general solicitation carve-out; shorten term; remove penalties."
  },
  {
    code: "INS-001",
    name: "Insurance Requirements",
    description: "Insurance coverage requirements",
    riskWeight: "MEDIUM",
    categoryGroup: "COMPLIANCE",
    isMandatory: false,
    standardPosition: "Maintain commercially reasonable insurance; provide certificates on request.",
    acceptableRange: "Specific coverages (GL, professional liability, cyber) with reasonable limits aligned to deal size.",
    escalationTrigger: "Excessive limits; naming as additional insured for all policies; insurance mandated for non-applicable risks.",
    negotiationGuidance: "Align limits to project value; offer certificates; negotiate cyber limits via security controls and risk profile."
  },
  {
    code: "CMP-001",
    name: "Compliance",
    description: "Regulatory and legal compliance",
    riskWeight: "MEDIUM",
    categoryGroup: "COMPLIANCE",
    isMandatory: false,
    standardPosition: "Each party complies with applicable laws; no open-ended obligations to comply with unknown future policies without notice.",
    acceptableRange: "Specific compliance items (anti-bribery, sanctions, export) if clearly scoped; reasonable audit/reporting.",
    escalationTrigger: "One-sided compliance warranties; broad obligation to comply with counterparty policies; strict liability for minor breaches.",
    negotiationGuidance: "Scope to applicable laws; reference policies by version; add notice + reasonable cooperation; include materiality qualifiers."
  },
  {
    code: "SEC-001",
    name: "Security Requirements",
    description: "Security and access control",
    riskWeight: "MEDIUM",
    categoryGroup: "COMPLIANCE",
    isMandatory: false,
    standardPosition: "Baseline security controls; least-privilege access; incident response defined; align to industry standards where relevant.",
    acceptableRange: "Customer security addendum; periodic security attestations; reasonable pen-test reports instead of intrusive audits.",
    escalationTrigger: "Unrestricted on-site audits; customer can demand any controls unilaterally; strict SLAs with penalties for any incident.",
    negotiationGuidance: "Offer standard security addendum; provide SOC2/ISO evidence; define incident vs breach; keep remedies proportional."
  },
  {
    code: "BGC-001",
    name: "Background Checks",
    description: "Vetting and clearance requirements",
    riskWeight: "LOW",
    categoryGroup: "COMPLIANCE",
    isMandatory: false,
    standardPosition: "Background checks only if required for access; comply with local law; scope limited to role risk.",
    acceptableRange: "Basic checks for privileged access; customer-specific forms acceptable with privacy safeguards.",
    escalationTrigger: "Mandatory checks for all staff; intrusive checks not lawful locally; customer retains results without limits.",
    negotiationGuidance: "Limit to access roles; add privacy/retention terms; allow equivalent checks already performed."
  },
  {
    code: "AUD-001",
    name: "Audit Rights",
    description: "Audit and inspection provisions",
    riskWeight: "MEDIUM",
    categoryGroup: "COMPLIANCE",
    isMandatory: false,
    standardPosition: "Audits limited, scheduled, and confidentiality-protected; focus on compliance/security; reasonable frequency.",
    acceptableRange: "Annual audit; remote audit first; on-site only if material concern; third-party auditor under NDA.",
    escalationTrigger: "Unlimited audits; competitor auditors; no notice; access to unrelated systems or source code.",
    negotiationGuidance: "Offer reports/certifications; cap frequency; require notice + scope; allow on-site only upon defined triggers."
  },

  // Legal Framework
  {
    code: "GOV-001",
    name: "Governing Law",
    description: "Applicable law and jurisdiction",
    riskWeight: "HIGH",
    categoryGroup: "LEGAL_FRAMEWORK",
    isMandatory: true,
    standardPosition: "Preferred home jurisdiction/law; venue specified; exclude unfavorable/uncertain forums.",
    acceptableRange: "Neutral jurisdiction acceptable; arbitration seat in neutral location; split law/venue only if workable.",
    escalationTrigger: "High-risk jurisdiction; mandatory local courts with unfavorable enforcement; conflicting law/venue clauses.",
    negotiationGuidance: "Propose neutral law/venue; use arbitration with defined seat; keep injunctive relief carve-out for IP/confidentiality."
  },
  {
    code: "DSR-001",
    name: "Dispute Resolution",
    description: "Dispute resolution mechanisms",
    riskWeight: "HIGH",
    categoryGroup: "LEGAL_FRAMEWORK",
    isMandatory: true,
    standardPosition: "Escalation ladder (business → legal) then mediation/arbitration or courts; clear process and timelines.",
    acceptableRange: "Arbitration for commercial disputes; courts for injunctive relief; reasonable limitation on class actions (if lawful).",
    escalationTrigger: "One-sided forum selection; no interim relief; mandatory arbitration with unfair rules/costs; excessive attorney-fee shifting.",
    negotiationGuidance: "Add staged resolution; choose neutral rules (e.g., ICC/LCIA equivalent); allocate costs fairly; keep urgent relief option."
  },
  {
    code: "FM-001",
    name: "Force Majeure",
    description: "Force majeure and excusable delays",
    riskWeight: "MEDIUM",
    categoryGroup: "LEGAL_FRAMEWORK",
    isMandatory: false,
    standardPosition: "Excuse performance for events beyond control; notify and mitigate; terminate if prolonged.",
    acceptableRange: "Define list + catch-all; termination after 30–60 days; partial performance obligations where feasible.",
    escalationTrigger: "Force majeure excludes common events (epidemic, government actions); no termination right after prolonged FM.",
    negotiationGuidance: "Clarify notice/mitigation; add termination after prolonged event; ensure payment for delivered work remains due."
  },
  {
    code: "WAR-001",
    name: "Warranty",
    description: "Warranty provisions and disclaimers",
    riskWeight: "MEDIUM",
    categoryGroup: "LEGAL_FRAMEWORK",
    isMandatory: false,
    standardPosition: "Limited warranties (conforms to spec); disclaim implied warranties to extent allowed; defined remedies.",
    acceptableRange: "Short warranty window (30–90 days); cure/repair/re-perform remedy; carve-outs for misuse/third-party changes.",
    escalationTrigger: "Broad performance guarantees; warranties of uninterrupted/error-free service; consequential damages exposure via warranties.",
    negotiationGuidance: "Tie warranty to specs; limit remedies to re-perform; add exclusions; ensure warranty doesn’t override liability limits."
  },
  {
    code: "REP-001",
    name: "Representations & Warranties",
    description: "Party representations and warranties",
    riskWeight: "MEDIUM",
    categoryGroup: "LEGAL_FRAMEWORK",
    isMandatory: false,
    standardPosition: "Mutual authority/capacity reps; compliance with law reps scoped; no sweeping business outcome reps.",
    acceptableRange: "Limited non-infringement rep (qualified); compliance reps tied to performance of services.",
    escalationTrigger: "Absolute reps without qualifiers; reps about third parties; reps that survive indefinitely with uncapped liability.",
    negotiationGuidance: "Add knowledge/materiality qualifiers; limit survival period; ensure remedies align with indemnity/liability structure."
  },

  // Boilerplate
  {
    code: "DEF-001",
    name: "Definitions",
    description: "Defined terms and interpretations",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: true,
    standardPosition: "Clear defined terms; avoid circular/broad definitions; consistent use across documents.",
    acceptableRange: "Minor terminology differences; industry-standard definitions if they don’t expand obligations unexpectedly.",
    escalationTrigger: "Definitions that broaden scope (e.g., ‘Confidential Info’ includes everything); conflicting definitions across exhibits.",
    negotiationGuidance: "Normalize key terms; remove circularity; add precedence clause; keep definitions aligned with obligations."
  },
  {
    code: "NOT-001",
    name: "Notices",
    description: "Notice delivery requirements",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Notice by email + registered mail optional; addresses listed; deemed receipt rules included.",
    acceptableRange: "Portal notice acceptable; courier acceptable; short cure notices allowed if confirmed receipt.",
    escalationTrigger: "Notice only by physical mail; unclear addresses; no deemed receipt leading to disputes.",
    negotiationGuidance: "Allow email with confirmation; add deemed receipt; keep addresses updateable via written notice."
  },
  {
    code: "ENT-001",
    name: "Entire Agreement",
    description: "Integration and merger clauses",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Entire agreement with defined order of precedence; excludes external terms unless expressly incorporated.",
    acceptableRange: "Incorporate limited policies by reference if stable and versioned.",
    escalationTrigger: "Website terms incorporated automatically; conflicting precedence; broad reliance disclaimers harming legitimate reliance.",
    negotiationGuidance: "Add order of precedence; freeze referenced policies by version/date; exclude clickwrap terms unless signed."
  },
  {
    code: "SEV-001",
    name: "Severability",
    description: "Severability provisions",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Invalid term severed; rest remains; parties replace with valid term reflecting intent.",
    acceptableRange: "Court may reform; replacement language acceptable.",
    escalationTrigger: "Severability removes key protections (e.g., liability limits) without replacement; one-sided reformation rights.",
    negotiationGuidance: "Ensure replacement mechanism; protect core clauses via ‘essential terms’ language if needed."
  },
  {
    code: "WAI-001",
    name: "Waiver",
    description: "Waiver and forbearance",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Waiver must be written; single waiver not a continuing waiver.",
    acceptableRange: "Electronic waiver acceptable; authorized signatory requirement.",
    escalationTrigger: "Implied waiver by conduct; waiver by junior staff; continuing waiver language.",
    negotiationGuidance: "Keep written waiver; define authority; preserve rights despite delay in enforcement."
  },
  {
    code: "SUR-001",
    name: "Survival",
    description: "Survival of provisions",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Only necessary clauses survive (confidentiality, IP, payment, liability limits, dispute resolution).",
    acceptableRange: "Define survival durations (e.g., confidentiality 3–5 years) unless trade secrets.",
    escalationTrigger: "All clauses survive indefinitely; survival conflicts with termination; missing survival for critical protections.",
    negotiationGuidance: "Limit survival to essential clauses; add durations; align with confidentiality and limitation periods."
  },
  {
    code: "TAX-001",
    name: "Taxes",
    description: "Tax responsibilities and compliance",
    riskWeight: "MEDIUM",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Customer pays applicable taxes (except supplier income taxes); VAT/GST handled properly; invoices comply.",
    acceptableRange: "Withholding taxes handled via gross-up only if required and documented; provide tax certificates.",
    escalationTrigger: "Supplier bears all taxes; broad gross-up; unclear VAT responsibility; no documentation for withholding.",
    negotiationGuidance: "Clarify tax types; require certificates; limit gross-up to mandatory withholding; align invoicing to local VAT rules."
  },
  {
    code: "REL-001",
    name: "Relationship of Parties",
    description: "Independent contractor status",
    riskWeight: "LOW",
    categoryGroup: "BOILERPLATE",
    isMandatory: true,
    standardPosition: "Independent contractors; no partnership/agency; no authority to bind; each responsible for own staff.",
    acceptableRange: "Cooperation language acceptable; limited use of logos with permission.",
    escalationTrigger: "Agency/partnership language; authority to bind; employment-like control terms conflicting with contractor status.",
    negotiationGuidance: "Keep independent contractor framing; remove control language; align operational clauses with contractor model."
  },
  {
    code: "ACC-001",
    name: "Acceptance Criteria",
    description: "Deliverable acceptance standards",
    riskWeight: "MEDIUM",
    categoryGroup: "BOILERPLATE",
    isMandatory: false,
    standardPosition: "Objective acceptance tests; deemed acceptance if no rejection within X days; cure/retest cycle defined.",
    acceptableRange: "Longer review window (10–15 days); partial acceptance per milestone; minor defects don’t block acceptance.",
    escalationTrigger: "Subjective acceptance (‘to customer satisfaction’); no deemed acceptance; unlimited retesting without payment.",
    negotiationGuidance: "Define objective criteria; add deemed acceptance; classify defects (major/minor); limit retest cycles and align to payment milestones."
  },
];


// Generates rule field content from a clause category
function buildRuleFields(cat: ClauseCategory) {
  const riskLevel = mapRiskLevel(cat.riskWeight, cat.isMandatory);

  return {
    title: cat.name,
    description: cat.description,
    riskLevel,
    standardPosition: cat.standardPosition,
    acceptableRange: cat.acceptableRange,
    escalationTrigger: cat.escalationTrigger,
    negotiationGuidance: cat.negotiationGuidance,
    country: null as string | null,
  };
}

export async function seedRules() {
  console.log("\nSeeding playbook rules (44 clause categories)...");

  // Get or create the singleton playbook
  let playbook = await prisma.playbook.findFirst();
  if (!playbook) {
    playbook = await prisma.playbook.create({ data: {} });
    console.log("  Created singleton playbook");
  }

  // Load all groups by slug
  const groups = await prisma.playbookGroup.findMany();
  const slugToId = Object.fromEntries(groups.map((g: any) => [g.slug, g.id]));

  if (groups.length === 0) {
    console.error("  ERROR: No playbook groups found. Run the groups seed first.");
    return;
  }

  // Get or create a system user for seeded rules
  let systemUser = await prisma.user.findFirst({
    where: { email: "system@legal-ai.internal" },
  });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: "system@legal-ai.internal",
        name: "System",
        password: "---", // Not a real login
        role: "admin",
      },
    });
    console.log("  Created system user for seeded rules");
  }

  // Clear existing rules to start fresh
  const deleted = await prisma.playbookRule.deleteMany({
    where: { playbookId: playbook.id },
  });
  if (deleted.count > 0) {
    console.log(`  Cleared ${deleted.count} existing rule(s)`);
  }

  // Create all 44 rules
  let created = 0;
  for (const cat of CLAUSE_CATEGORIES) {
    const groupSlug = GROUP_SLUG_MAP[cat.categoryGroup];
    const groupId = groupSlug ? slugToId[groupSlug] : null;

    if (!groupId) {
      console.warn(`  WARNING: No group found for ${cat.categoryGroup} (slug: ${groupSlug}). Skipping ${cat.code}.`);
      continue;
    }

    const fields = buildRuleFields(cat);

    await prisma.playbookRule.create({
      data: {
        playbookId: playbook.id,
        groupId,
        title: fields.title,
        description: fields.description,
        country: fields.country,
        riskLevel: fields.riskLevel,
        standardPosition: fields.standardPosition,
        acceptableRange: fields.acceptableRange,
        escalationTrigger: fields.escalationTrigger,
        negotiationGuidance: fields.negotiationGuidance,
        createdBy: systemUser.id,
        updatedBy: systemUser.id,
      },
    });
    created++;
  }

  // Bump playbook version and create initial snapshot
  const newVersion = playbook.version + 1;
  await prisma.playbook.update({
    where: { id: playbook.id },
    data: { version: newVersion, updatedBy: systemUser.id },
  });

  const activeRules = await prisma.playbookRule.findMany({
    where: { playbookId: playbook.id, deleted: false },
    orderBy: { createdAt: "asc" },
  });

  const groupNameMap = Object.fromEntries(groups.map((g: any) => [g.id, g.name]));

  const snapshot = await prisma.playbookSnapshot.create({
    data: {
      playbookId: playbook.id,
      version: newVersion,
      createdBy: systemUser.id,
    },
  });

  await prisma.playbookSnapshotRule.createMany({
    data: activeRules.map((rule: any) => ({
      snapshotId: snapshot.id,
      title: rule.title,
      description: rule.description,
      country: rule.country,
      riskLevel: rule.riskLevel,
      groupId: rule.groupId,
      groupName: rule.groupId ? groupNameMap[rule.groupId] || null : null,
      standardPosition: rule.standardPosition,
      acceptableRange: rule.acceptableRange,
      escalationTrigger: rule.escalationTrigger,
      negotiationGuidance: rule.negotiationGuidance,
      originalRuleId: rule.id,
      createdBy: rule.createdBy,
      originalCreatedAt: rule.createdAt,
    })),
  });

  console.log(`  Created ${created} rules across ${groups.length} groups`);
  console.log(`  Saved as playbook v${newVersion} with snapshot`);

  // Summary by group
  for (const g of groups) {
    const count = activeRules.filter((r: any) => r.groupId === g.id).length;
    if (count > 0) {
      console.log(`    ${g.name}: ${count} rules`);
    }
  }
}

// Allow running standalone: npx tsx prisma/seed-rules.ts
if (require.main === module) {
  seedRules()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
