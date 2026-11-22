import { useEffect, useMemo, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCustomers, useExpenses, useTransactions } from "@/lib/data";
import { EXPENSE_LABELS, formatDate, formatTL } from "@/lib/finance";
import { useNavigate } from "@tanstack/react-router";
import { useRecords } from "@/lib/work";

export function GlobalSearch({ open, initialQuery = "", onOpenChange, onPick }: { open: boolean; initialQuery?: string; onOpenChange: (open: boolean) => void; onPick: (customerId: string) => void }) {
  const customers = useCustomers(); const txs = useTransactions(); const expenses = useExpenses();
  const jobs = useRecords("job"); const equipment = useRecords("equipment"); const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => { if (open) setQuery(initialQuery); }, [open, initialQuery]);
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const nameOf = (id: string) => customers.data?.find((customer) => customer.id === id)?.name ?? "";
  const operator = /^(müşteri|musteri|durum|tutar|tarih|iş|is|ekipman):/i.exec(needle)?.[1]?.toLocaleLowerCase("tr-TR");
  const value = operator ? needle.slice(needle.indexOf(":") + 1).trim() : needle;
  const matches = (text: unknown) => String(text ?? "").toLocaleLowerCase("tr-TR").includes(value);
  const amountPredicate = (amount: number) => {
    const m = /^(>=|<=|>|<|=)?\s*(\d+(?:[.,]\d+)?)$/.exec(value);
    if (!m) return matches(amount);
    const n = Number(m[2]?.replace(",", "."));
    return m[1] === ">" ? amount > n : m[1] === ">=" ? amount >= n : m[1] === "<" ? amount < n : m[1] === "<=" ? amount <= n : m[1] === "=" ? amount === n : amount === n;
  };
  const datePredicate = (date: string) => {
    if (value === "bugün" || value === "bugun") return date.slice(0, 10) === new Date().toLocaleDateString("sv-SE");
    if (["bu-hafta", "hafta"].includes(value)) { const today = new Date(); const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); return date.slice(0, 10) >= monday.toLocaleDateString("sv-SE") && date.slice(0, 10) <= today.toLocaleDateString("sv-SE"); }
    return matches(date);
  };
  const filteredCustomers = useMemo(() => (customers.data ?? []).filter((customer) => {
    const text = `${customer.name} ${customer.phone ?? ""} ${customer.address ?? ""}`;
    return operator === "müşteri" || operator === "musteri" ? matches(text) : !operator && matches(text);
  }), [customers.data, operator, value]);
  const filteredJobs = (jobs.data ?? []).filter((job) => {
    if (operator === "durum") return String(job.payload.status ?? "Bekliyor").toLocaleLowerCase("tr-TR").includes(value) || (value === "bekliyor" && (job.payload.status === "Bekliyor" || !job.payload.status));
    if (operator === "tarih") return datePredicate(String(job.payload.date ?? ""));
    if (operator === "iş" || operator === "is") return matches(`${job.payload.title} ${job.payload.notes}`);
    if (operator) return false;
    return matches(`${job.payload.title} ${job.payload.notes} ${job.payload.date} ${nameOf(String(job.payload.customer_id ?? ""))}`);
  });
  const filteredEquipment = (equipment.data ?? []).filter((row) => (operator === "ekipman" || !operator) && matches(`${row.payload.name} ${row.payload.code}`));
  const filteredTxs = (txs.data ?? []).filter((transaction) => {
    if (operator === "tutar") return amountPredicate(transaction.amount);
    if (operator === "tarih") return datePredicate(transaction.occurred_on);
    if (operator) return false;
    return matches(`${nameOf(transaction.customer_id)} ${transaction.description ?? ""} ${transaction.amount} ${transaction.occurred_on}`);
  });
  const filteredExpenses = (expenses.data ?? []).filter((expense) => {
    if (operator === "tutar") return amountPredicate(expense.amount);
    if (operator === "tarih") return datePredicate(expense.occurred_on);
    if (operator) return false;
    return matches(`${EXPENSE_LABELS[expense.category]} ${expense.description ?? ""} ${expense.amount} ${expense.occurred_on}`);
  });

  const pick = (id: string) => { onOpenChange(false); onPick(id); };
  return <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
    <CommandInput placeholder="Ara…  müşteri:Ahmet · tutar:>1000 · tarih:bu-hafta · durum:bekliyor" value={query} onValueChange={setQuery}/>
    <CommandList><CommandEmpty>Sonuç yok</CommandEmpty>
      {query.trim() === "?" && <p className="px-4 py-3 text-xs leading-6 text-muted-foreground">Operatörler: müşteri:Ahmet · tutar:&gt;1000 · tarih:bugün / bu-hafta · durum:bekliyor · iş:montaj · ekipman:tırpan</p>}
      {filteredJobs.length > 0 && <CommandGroup heading="İşler">{filteredJobs.map((job) => <CommandItem key={job.id} value={job.id} onSelect={() => { onOpenChange(false); void navigate({ to: "/isler" }); }}>{job.payload.title} <span className="ml-auto text-xs text-muted-foreground">{String(job.payload.status ?? "Bekliyor")} · {String(job.payload.date ?? "")}</span></CommandItem>)}</CommandGroup>}
      {filteredEquipment.length > 0 && <CommandGroup heading="Ekipman">{filteredEquipment.map((row) => <CommandItem key={row.id} value={row.id} onSelect={() => { onOpenChange(false); void navigate({ to: "/ekipman" }); }}>{String(row.payload.name)} <span className="ml-auto text-xs text-muted-foreground">{String(row.payload.code ?? "")}</span></CommandItem>)}</CommandGroup>}
      {filteredCustomers.length > 0 && <CommandGroup heading="Müşteriler">{filteredCustomers.map((customer) => <CommandItem key={customer.id} value={customer.id} onSelect={() => pick(customer.id)}>{customer.name}<span className="ml-auto text-xs text-muted-foreground">{customer.phone}</span></CommandItem>)}</CommandGroup>}
      {filteredTxs.length > 0 && <CommandGroup heading="İşlemler">{filteredTxs.slice(0, 200).map((transaction) => <CommandItem key={transaction.id} value={transaction.id} onSelect={() => transaction.customer_id ? pick(transaction.customer_id) : void navigate({ to: "/borc" })}>{nameOf(transaction.customer_id)} · {transaction.description || (transaction.kind === "debt" ? "Borç" : "Tahsilat")}<span className="num ml-auto text-xs">{formatTL(transaction.amount)}</span></CommandItem>)}</CommandGroup>}
      {filteredExpenses.length > 0 && <CommandGroup heading="Giderler">{filteredExpenses.slice(0, 200).map((expense) => <CommandItem key={expense.id} value={expense.id} onSelect={() => { onOpenChange(false); void navigate({ to: "/giderler" }); }}>{EXPENSE_LABELS[expense.category]} · {expense.description || formatDate(expense.occurred_on)}<span className="num ml-auto text-xs">{formatTL(expense.amount)}</span></CommandItem>)}</CommandGroup>}
    </CommandList>
  </CommandDialog>;
}
