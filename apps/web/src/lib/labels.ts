export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  CLT: 'CLT', PJ: 'PJ', PF: 'PF (autônomo)', COOPERATIVA: 'Cooperativa', OUTRO: 'Outro', AVULSO: 'Avulso',
};
export const SHIFT_TYPE_LABEL: Record<string, string> = {
  DIURNO: 'Diurno', NOTURNO: 'Noturno', FIM_DE_SEMANA: 'Fim de semana', FERIADO: 'Feriado', SOBREAVISO: 'Sobreaviso',
};
export const SHIFT_STATUS_LABEL: Record<string, string> = {
  AGENDADO: 'Agendado', REALIZADO: 'Realizado', FATURADO: 'Faturado', A_RECEBER: 'A receber',
  RECEBIDO: 'Recebido', ATRASADO: 'Atrasado', CANCELADO: 'Cancelado',
};
export const SHIFT_STATUS_TONE: Record<string, 'neutral' | 'info' | 'positive' | 'warning' | 'negative' | 'primary'> = {
  AGENDADO: 'neutral', REALIZADO: 'info', FATURADO: 'primary', A_RECEBER: 'warning',
  RECEBIDO: 'positive', ATRASADO: 'negative', CANCELADO: 'neutral',
};
export const INCOME_CATEGORY_LABEL: Record<string, string> = {
  CONSULTA: 'Consultas particulares', PROCEDIMENTO: 'Procedimentos', CIRURGIA: 'Cirurgias', AULA_PRECEPTORIA: 'Aulas e preceptoria',
  PARECER: 'Pareceres', TELEMEDICINA: 'Telemedicina', BONIFICACAO: 'Bonificações', DISTRIBUICAO_LUCROS: 'Distribuição de lucros',
  PRO_LABORE: 'Pró-labore', RENDIMENTO: 'Rendimentos financeiros', OUTRA: 'Outras receitas', PLANTAO: 'Plantões', SALARIO: 'Salários/vínculos',
};
export const INSTITUTION_KIND_LABEL: Record<string, string> = {
  HOSPITAL: 'Hospital', CLINICA: 'Clínica', UNIVERSIDADE: 'Universidade', TELEMEDICINA: 'Telemedicina', OPERADORA: 'Operadora', OUTRO: 'Outro',
};
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX: 'Pix', DEBITO: 'Débito', BOLETO: 'Boleto', DINHEIRO: 'Dinheiro', TRANSFERENCIA: 'Transferência',
  CARTAO_CREDITO: 'Cartão de crédito', DEBITO_AUTOMATICO: 'Débito automático',
};
export const TAX_STATUS_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Imposto não configurado', ESTIMATED: 'Estimado', CONFIRMED: 'Confirmado',
};
export const CERTAINTY_LABEL: Record<string, string> = { REAL: 'Realizado', ESTIMATED: 'Estimado', PROJECTED: 'Projetado' };
export const TAX_REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real', NAO_INFORMADO: 'Não informado',
};
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Cores das categorias do calendário (legenda acessível: cor + rótulo + ícone de forma). */
export const CALENDAR_CATEGORY: Record<string, { label: string; color: string }> = {
  PLANTAO_AGENDADO: { label: 'Plantão agendado', color: '#64748b' },
  PLANTAO_REALIZADO: { label: 'Plantão realizado', color: '#0e7490' },
  RECEBIMENTO_PREVISTO: { label: 'Recebimento previsto', color: '#0d9488' },
  RECEBIMENTO_REALIZADO: { label: 'Recebido', color: '#059669' },
  RECEBIMENTO_ATRASADO: { label: 'Recebimento atrasado', color: '#dc2626' },
  SALARIO: { label: 'Salário / vínculo fixo', color: '#2563eb' },
  CONTA_A_PAGAR: { label: 'Conta a pagar', color: '#d97706' },
  CONTA_PAGA: { label: 'Conta paga', color: '#78716c' },
  IMPOSTO: { label: 'Imposto', color: '#be123c' },
  FATURA: { label: 'Fatura do cartão', color: '#7c3aed' },
  COMPRA_CARTAO: { label: 'Compra no cartão', color: '#a78bfa' },
};
