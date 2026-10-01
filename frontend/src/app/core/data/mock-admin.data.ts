import type { IconName } from '../../shared/components/icon/icon.component';
import type { PolicyDocument } from '../models/document.model';
import type { QuestionLog } from '../models/question-log.model';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** An ISO timestamp a number of days and hours before the app loads. */
function ago(days: number, hours = 0): string {
  return new Date(Date.now() - days * DAY - hours * HOUR).toISOString();
}

/** One headline number on the administrator dashboard. */
export interface AdminStat {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
}

/** A recent event shown on the administrator dashboard. */
export interface AdminActivity {
  id: string;
  summary: string;
  actor: string;
  createdAt: string;
}

/** Placeholder inventory shown while document management is unbuilt. */
export const MOCK_DOCUMENTS: PolicyDocument[] = [
  {
    id: 'doc-handbook',
    title: 'Employee Handbook 2026',
    category: 'Policies',
    status: 'indexed',
    sizeLabel: '2.4 MB',
    sectionCount: 18,
    updatedAt: ago(2, 3),
    updatedBy: 'Ama Mensah',
  },
  {
    id: 'doc-leave',
    title: 'Annual Leave & Time Off',
    category: 'People',
    status: 'indexed',
    sizeLabel: '860 KB',
    sectionCount: 9,
    updatedAt: ago(4),
    updatedBy: 'Kwame Osei',
  },
  {
    id: 'doc-remote',
    title: 'Remote Work Policy',
    category: 'People',
    status: 'processing',
    sizeLabel: '540 KB',
    sectionCount: 6,
    updatedAt: ago(0, 2),
    updatedBy: 'Ama Mensah',
  },
  {
    id: 'doc-it',
    title: 'IT Equipment & VPN Guide',
    category: 'Technology',
    status: 'indexed',
    sizeLabel: '1.1 MB',
    sectionCount: 12,
    updatedAt: ago(9),
    updatedBy: 'Yaw Boateng',
  },
  {
    id: 'doc-security',
    title: 'Security & Compliance Standards',
    category: 'Security',
    status: 'indexed',
    sizeLabel: '1.8 MB',
    sectionCount: 21,
    updatedAt: ago(14),
    updatedBy: 'Efua Danso',
  },
  {
    id: 'doc-payroll',
    title: 'Payroll & Compensation Policy',
    category: 'Finance',
    status: 'failed',
    sizeLabel: '720 KB',
    sectionCount: 0,
    updatedAt: ago(1, 5),
    updatedBy: 'Kwame Osei',
  },
  {
    id: 'doc-onboarding',
    title: 'Onboarding Checklist',
    category: 'People',
    status: 'indexed',
    sizeLabel: '310 KB',
    sectionCount: 5,
    updatedAt: ago(21),
    updatedBy: 'Ama Mensah',
  },
];

/** Placeholder question history shown while question logs are unbuilt. */
export const MOCK_QUESTION_LOGS: QuestionLog[] = [
  {
    id: 'q-1042',
    question: 'How many annual leave days do I get?',
    askedBy: 'Ama Mensah',
    askedByInitials: 'AM',
    createdAt: ago(0, 1),
    outcome: 'answered',
    sourceCount: 2,
    durationMs: 2400,
  },
  {
    id: 'q-1041',
    question: 'What is the VPN setup for a new laptop?',
    askedBy: 'Yaw Boateng',
    askedByInitials: 'YB',
    createdAt: ago(0, 4),
    outcome: 'answered',
    sourceCount: 1,
    durationMs: 1900,
  },
  {
    id: 'q-1040',
    question: 'Can you tell me my remaining leave balance?',
    askedBy: 'Efua Danso',
    askedByInitials: 'ED',
    createdAt: ago(1, 2),
    outcome: 'not-found',
    sourceCount: 0,
    durationMs: 40,
  },
  {
    id: 'q-1039',
    question: 'What is the expense claim limit?',
    askedBy: 'Kwame Osei',
    askedByInitials: 'KO',
    createdAt: ago(1, 6),
    outcome: 'not-found',
    sourceCount: 0,
    durationMs: 38,
  },
  {
    id: 'q-1038',
    question: 'When does the performance review cycle run?',
    askedBy: 'Ama Mensah',
    askedByInitials: 'AM',
    createdAt: ago(2, 1),
    outcome: 'answered',
    sourceCount: 3,
    durationMs: 3100,
  },
  {
    id: 'q-1037',
    question: 'How do I report a security incident?',
    askedBy: 'Yaw Boateng',
    askedByInitials: 'YB',
    createdAt: ago(3, 3),
    outcome: 'failed',
    sourceCount: 0,
    durationMs: 90000,
  },
];

/** Headline numbers for the administrator dashboard. */
export const MOCK_ADMIN_STATS: AdminStat[] = [
  {
    label: 'Documents',
    value: '7',
    detail: '6 indexed, 1 needs attention',
    icon: 'file-text',
  },
  {
    label: 'Questions this week',
    value: '128',
    detail: '92% answered from policy',
    icon: 'message-square-text',
  },
  {
    label: 'Unanswered',
    value: '10',
    detail: 'Flagged for a policy gap',
    icon: 'alert-triangle',
  },
  {
    label: 'Active people',
    value: '42',
    detail: 'Across 6 teams',
    icon: 'users',
  },
];

/** Recent events for the administrator dashboard. */
export const MOCK_ADMIN_ACTIVITY: AdminActivity[] = [
  {
    id: 'act-1',
    summary: 'uploaded Remote Work Policy',
    actor: 'Ama Mensah',
    createdAt: ago(0, 2),
  },
  {
    id: 'act-2',
    summary: 'reported a failed ingestion for Payroll & Compensation Policy',
    actor: 'Kwame Osei',
    createdAt: ago(1, 5),
  },
  {
    id: 'act-3',
    summary: 're-indexed Security & Compliance Standards',
    actor: 'Efua Danso',
    createdAt: ago(3, 1),
  },
  {
    id: 'act-4',
    summary: 'added IT Equipment & VPN Guide',
    actor: 'Yaw Boateng',
    createdAt: ago(9),
  },
];
