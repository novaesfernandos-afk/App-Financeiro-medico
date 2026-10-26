import { Settings2 } from 'lucide-react';

/** Exibida quando o servidor (Netlify Function) ainda não tem banco/segredos configurados. */
export function SetupPending({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-surface p-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">Configuração pendente</h1>
            <p className="text-sm text-muted">O MedFinance foi publicado, mas o servidor ainda não está pronto.</p>
          </div>
        </div>
        <div className="rounded-xl bg-surface-2 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4" /> Falta configurar no painel da Netlify:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
        <p className="text-xs text-muted">Depois de configurar, faça um novo deploy (Deploys → Trigger deploy) e recarregue esta página. Passo a passo em docs/11-deploy-netlify.md.</p>
      </div>
    </div>
  );
}
