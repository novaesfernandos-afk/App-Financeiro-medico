import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import ptBr from '@fullcalendar/core/locales/pt-br';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ShiftForm } from '@/components/forms/ShiftForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CertaintyDot, PageHeader, Spinner } from '@/components/ui/misc';
import { api, qs } from '@/lib/api';
import { fmtBRL, fmtDate, todayISO } from '@/lib/format';
import { CALENDAR_CATEGORY, CERTAINTY_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

const localISO = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

const addDay = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
};

export default function CalendarPage() {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState(todayISO());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [newShift, setNewShift] = useState(false);

  const events = useQuery({
    queryKey: ['calendar', range],
    queryFn: () => api.get(`/calendar${qs(range!)}`),
    enabled: Boolean(range),
  });
  const day = useQuery({ queryKey: ['calendar-day', selected], queryFn: () => api.get(`/calendar/day?date=${selected}`) });

  const fcEvents: EventInput[] = useMemo(() => (events.data?.events ?? [])
    .filter((e: any) => !hidden.has(e.category))
    .map((e: any) => {
      const cat = CALENDAR_CATEGORY[e.category]!;
      const timed = e.direction === 'WORK' && e.startTime && e.endTime;
      const overnight = timed && e.endTime <= e.startTime;
      const amount = e.amount ? ` · ${fmtBRL(e.amount, { compact: true })}` : '';
      return {
        id: e.id,
        title: `${e.title}${e.institutionId && events.data.names.institutions[e.institutionId] ? ` — ${events.data.names.institutions[e.institutionId].name}` : ''}${amount}`,
        start: timed ? `${e.date}T${e.startTime}` : e.date,
        end: timed ? `${overnight ? addDay(e.date) : e.date}T${e.endTime}` : undefined,
        allDay: !timed,
        backgroundColor: cat.color,
        borderColor: cat.color,
        textColor: '#fff',
        extendedProps: e,
      };
    }), [events.data, hidden]);

  const toggle = (c: string) => setHidden((h) => {
    const n = new Set(h);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  const d = day.data;
  return (
    <div>
      <PageHeader title="Calendário financeiro"
        subtitle="Plantões na data em que foram trabalhados; dinheiro na data em que entra ou sai."
        actions={<Button onClick={() => setNewShift(true)}><Plus className="h-4 w-4" /> Plantão em {fmtDate(selected, { day: '2-digit', month: '2-digit' })}</Button>} />

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Legenda e filtros de categorias">
        {Object.entries(CALENDAR_CATEGORY).map(([key, c]) => {
          const off = hidden.has(key);
          return (
            <button key={key} type="button" aria-pressed={!off} onClick={() => toggle(key)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-opacity', off && 'opacity-40 line-through')}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} aria-hidden /> {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="p-2 sm:p-4">
          <div className="relative">
            {events.isFetching && <div className="absolute right-2 top-2 z-10"><Spinner className="h-4 w-4" /></div>}
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, multiMonthPlugin, listPlugin, interactionPlugin]}
              locale={ptBr}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,multiMonthYear,listMonth' }}
              buttonText={{ day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano', list: 'Lista', today: 'Hoje' }}
              height="auto"
              dayMaxEvents={3}
              events={fcEvents}
              datesSet={(arg: DatesSetArg) => {
                const from = arg.startStr.slice(0, 10);
                const end = localISO(new Date(arg.end.getTime() - 86_400_000));
                setRange((r) => (r?.from === from && r?.to === end ? r : { from, to: end }));
              }}
              dateClick={(a: DateClickArg) => setSelected(a.dateStr.slice(0, 10))}
              eventClick={(a: EventClickArg) => setSelected((a.event.extendedProps as any).date)}
              dayCellClassNames={(a) => (localISO(a.date) === selected ? ['fc-day-selected'] : [])}
              nowIndicator
              slotMinTime="00:00:00"
              scrollTime="06:00:00"
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              multiMonthMaxColumns={3}
            />
          </div>
        </Card>

        <Card className="h-fit xl:sticky xl:top-6" data-testid="day-panel">
          <CardHeader title={<span className="capitalize">{fmtDate(selected, { weekday: 'long', day: '2-digit', month: 'long' })}</span>} subtitle="Resumo do dia (regime de caixa)" />
          {!d ? <Spinner /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[11px] text-muted">Receita bruta</p><p className="font-semibold tabular">{fmtBRL(d.grossIn)}</p></div>
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[11px] text-muted">Receita líquida</p><p className="font-semibold tabular text-positive">{fmtBRL(d.netIn)}</p></div>
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[11px] text-muted">Despesas</p><p className="font-semibold tabular">{fmtBRL(d.expenses)}</p></div>
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-[11px] text-muted">Saldo previsto</p><p className="font-semibold tabular">{d.projectedBalance === null ? '—' : fmtBRL(d.projectedBalance)}</p></div>
              </div>
              <p className="text-xs text-muted">{d.shiftsDone} plantão(ões) realizado(s) · {d.shiftsScheduled} agendado(s)</p>
              {d.events.length === 0 ? <p className="text-sm text-muted">Nenhum evento neste dia.</p> : (
                <ul className="divide-y">
                  {d.events.map((e: any) => (
                    <li key={e.id} className="flex items-start gap-3 py-2.5">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CALENDAR_CATEGORY[e.category]?.color }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{e.title}</p>
                        <p className="flex items-center gap-1.5 text-[11px] text-muted">
                          {CALENDAR_CATEGORY[e.category]?.label}
                          {e.startTime && <> · {e.startTime}–{e.endTime}</>}
                          {e.institutionId && d.names.institutions[e.institutionId] && <> · {d.names.institutions[e.institutionId].name}</>}
                        </p>
                      </div>
                      {e.amount && (
                        <div className="text-right">
                          <p className={cn('text-sm font-medium tabular', e.direction === 'IN' && 'text-positive')}>{e.direction === 'OUT' ? '−' : ''}{fmtBRL(e.amount)}</p>
                          <p className="flex items-center justify-end gap-1 text-[10px] text-muted"><CertaintyDot certainty={e.certainty} />{CERTAINTY_LABEL[e.certainty]}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
      {newShift && <ShiftForm open defaultDate={selected} onOpenChange={setNewShift} />}
    </div>
  );
}
