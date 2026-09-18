/**
 * Shared Mine / Engineer Match role vocabulary for company opportunities.
 * Values are stable matching codes; labels are only for the company UI.
 */
export const OPPORTUNITY_TARGET_ROLE_OPTIONS = [
  { value: 'role_frontend_engineer', label: 'フロントエンドエンジニア' },
  { value: 'role_backend_engineer', label: 'バックエンドエンジニア' },
  { value: 'role_mobile_engineer', label: 'モバイルアプリエンジニア' },
  { value: 'role_infrastructure_engineer', label: 'インフラエンジニア' },
  { value: 'role_data_engineer', label: 'データエンジニア' },
  { value: 'role_ai_engineer', label: 'AI・機械学習エンジニア' },
  { value: 'role_project_manager', label: 'プロジェクトマネージャー' },
] as const;

export type OpportunityTargetRoleCode = (typeof OPPORTUNITY_TARGET_ROLE_OPTIONS)[number]['value'];

export const OPPORTUNITY_MATCHING_LIMITS = {
  preferredSkillsMaximum: 10,
} as const;
