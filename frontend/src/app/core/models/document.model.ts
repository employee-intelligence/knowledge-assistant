/** Where a policy document sits in the ingestion pipeline. */
export type DocumentStatus = 'indexed' | 'processing' | 'failed';

/** A policy document the knowledge base can answer from. */
export interface PolicyDocument {
  id: string;
  title: string;
  category: string;
  status: DocumentStatus;
  sizeLabel: string;
  sectionCount: number;
  updatedAt: string;
  updatedBy: string;
}

/** Human-readable labels for each ingestion state. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  indexed: 'Indexed',
  processing: 'Processing',
  failed: 'Failed',
};
