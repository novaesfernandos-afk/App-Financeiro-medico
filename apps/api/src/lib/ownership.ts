import type { PrismaClient } from '@prisma/client';
import { HttpError } from './http';

type OwnedModel =
  | 'institution' | 'company' | 'taxProfile' | 'contract' | 'shift' | 'shiftSeries' | 'income'
  | 'expenseCategory' | 'expense' | 'creditCard' | 'bankAccount' | 'goal' | 'shiftRate';

const LABEL: Record<OwnedModel, string> = {
  institution: 'Instituição', company: 'Empresa', taxProfile: 'Perfil tributário', contract: 'Vínculo',
  shift: 'Plantão', shiftSeries: 'Escala', income: 'Receita', expenseCategory: 'Categoria', expense: 'Despesa',
  creditCard: 'Cartão', bankAccount: 'Conta', goal: 'Meta', shiftRate: 'Valor de plantão',
};

/**
 * Garante que um id referenciado pertence ao usuário. Usado para TODA chave
 * estrangeira recebida do cliente — impede acesso cruzado entre usuários.
 */
export async function assertOwned(prisma: PrismaClient, model: OwnedModel, id: string | null | undefined, userId: string) {
  if (!id) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[model];
  const found = await delegate.findFirst({ where: { id, userId }, select: { id: true } });
  if (!found) throw new HttpError(404, `${LABEL[model]} não encontrado(a)`);
}
