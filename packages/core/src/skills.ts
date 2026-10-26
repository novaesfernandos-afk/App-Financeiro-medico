/**
 * Registro das skills do MedFinance AI. Cada skill tem contrato documentado em
 * docs/06-skills.md. Skills determinísticas vivem neste pacote e são as únicas
 * autorizadas a produzir números — os agentes de IA (Fase 4) apenas as invocam.
 */
export type SkillStatus = 'implemented' | 'partial' | 'planned';

export interface SkillDescriptor {
  id: string;
  title: string;
  status: SkillStatus;
  phase: number;
  modules: string[];
}

export const SKILLS: SkillDescriptor[] = [
  { id: 'medical-income-tracker', title: 'Controle de receitas médicas', status: 'implemented', phase: 2, modules: ['salary', 'ledger'] },
  { id: 'shift-calculator', title: 'Cálculo de plantões e horas', status: 'implemented', phase: 2, modules: ['shifts', 'recurrence'] },
  { id: 'tax-engine-br', title: 'Motor tributário configurável e versionado', status: 'implemented', phase: 2, modules: ['tax'] },
  { id: 'financial-calendar', title: 'Calendário financeiro', status: 'implemented', phase: 2, modules: ['calendar'] },
  { id: 'cashflow-forecast', title: 'Projeção de fluxo de caixa', status: 'partial', phase: 2, modules: ['dashboard'] },
  { id: 'expense-classifier', title: 'Categorização de despesas', status: 'partial', phase: 2, modules: ['expenses'] },
  { id: 'report-generator', title: 'Relatórios', status: 'partial', phase: 3, modules: ['dashboard'] },
  { id: 'payment-reconciliation', title: 'Conciliação de recebimentos', status: 'planned', phase: 3, modules: [] },
  { id: 'financial-data-import', title: 'Importação CSV/OFX/planilhas', status: 'planned', phase: 3, modules: [] },
  { id: 'investment-analyzer', title: 'Análise de investimentos', status: 'planned', phase: 3, modules: [] },
  { id: 'portfolio-tracker', title: 'Acompanhamento patrimonial', status: 'planned', phase: 3, modules: [] },
  { id: 'anomaly-detector', title: 'Detecção de anomalias', status: 'planned', phase: 4, modules: [] },
  { id: 'financial-goals', title: 'Metas financeiras', status: 'planned', phase: 3, modules: [] },
  { id: 'scenario-simulator', title: 'Simulações de cenários', status: 'planned', phase: 4, modules: [] },
  { id: 'privacy-guardian', title: 'Controle de privacidade', status: 'partial', phase: 2, modules: ['api:privacy'] },
  { id: 'notification-manager', title: 'Notificações e alertas', status: 'planned', phase: 3, modules: [] },
];
