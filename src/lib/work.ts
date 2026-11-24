import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cachedRead, persistWrite } from '@/lib/offline';
import { useBusinessProfile } from '@/lib/work-profile-context';

export type WorkKind = 'job' | 'payroll' | 'advance' | 'payment' | 'workplace' | 'equipment' | 'maintenance' | 'shopping' | 'job_template' | 'settings' | 'appointment' | 'inventory' | 'stock_movement' | 'attendance' | 'exchange_rate';
export type Payload = Record<string, string | number | boolean | null | undefined> & {seconds?: string | number | boolean | null | undefined; started_at?: string | number | boolean | null | undefined; business?: string | number | boolean | null | undefined; status?: string | number | boolean | null | undefined; date?: string | number | boolean | null | undefined; title?: string | number | boolean | null | undefined; customer_id?: string | number | boolean | null | undefined; address?: string | number | boolean | null | undefined; hourly_rate?: string | number | boolean | null | undefined; price?: string | number | boolean | null | undefined; billed?: string | number | boolean | null | undefined; notes?: string | number | boolean | null | undefined; material_cost?: string | number | boolean | null | undefined; vat_rate?: string | number | boolean | null | undefined; days?: string | number | boolean | null | undefined; rate?: string | number | boolean | null | undefined; multiplier?: string | number | boolean | null | undefined; amount?: string | number | boolean | null | undefined; site?: string | number | boolean | null | undefined; name?: string | number | boolean | null | undefined; borrower?: string | number | boolean | null | undefined; borrowed_on?: string | number | boolean | null | undefined; last_service_seconds?: string | number | boolean | null | undefined; maintenance_hours?: string | number | boolean | null | undefined; purchased?: string | number | boolean | null | undefined; years?: string | number | boolean | null | undefined; code?: string | number | boolean | null | undefined; equipment_id?: string | number | boolean | null | undefined; cost?: string | number | boolean | null | undefined; done?: string | number | boolean | null | undefined; target?: string | number | boolean | null | undefined; owner_id?: string | number | boolean | null | undefined; job_seconds?: string | number | boolean | null | undefined; time?: string | number | boolean | null | undefined; planned_hours?: string | number | boolean | null | undefined; no_machine?: string | number | boolean | null | undefined; machine_applied_seconds?: string | number | boolean | null | undefined; machine_applied_to?: string | number | boolean | null | undefined;};
export interface WorkRecord { id: string; owner_id: string; team_id: string; profile_id?: string | null; kind: WorkKind; payload: Payload; created_at: string; }
/** Randevular, mevcut "shopping" türünde (payload._t = 'appointment') saklanır; ek migration gerekmez. */
const shoppingSubtypes = ['appointment', 'inventory_item', 'stock_movement', 'attendance'] as const;
const subtypeOf = (kind: WorkKind) => kind === 'appointment' ? 'appointment' : kind === 'inventory' ? 'inventory_item' : kind === 'stock_movement' ? 'stock_movement' : kind === 'attendance' ? 'attendance' : null;
const dbKind = (k: WorkKind) => subtypeOf(k) ? 'shopping' : k;
export function useRecords(kind: WorkKind) {
  const profile = useBusinessProfile();
  const profileScoped = kind !== 'settings' && profile.isUsta;
  const scopeKey = profileScoped ? profile.activeProfileId : 'team';
  return useQuery({networkMode:'always',enabled:!profile.loading && (!profileScoped || Boolean(profile.activeProfileId)),queryKey:profileScoped?['work',kind,'profile',scopeKey]:['work',kind],queryFn:async () => {
    if (profileScoped && !profile.activeProfileId) return [];
    const rows = await cachedRead('work:'+dbKind(kind)+(profileScoped?':'+profile.activeProfileId:''), async () => {
      let query = supabase.from('work_records').select('*').eq('kind',dbKind(kind));
      if (profileScoped && profile.activeProfileId) query = query.eq('profile_id', profile.activeProfileId);
      const {data,error}=await query.order('created_at',{ascending:false});
      if(error) throw error; return data as unknown as WorkRecord[];
    });
    const subtype = subtypeOf(kind);
    if(subtype) return rows.filter((r)=>r.payload._t===subtype);
    if(kind==='shopping') return rows.filter((r)=>!shoppingSubtypes.includes(r.payload._t as typeof shoppingSubtypes[number]));
    return rows;
  }});
}
export function useSaveRecord(kind: WorkKind) {
 const qc=useQueryClient();
 const profile=useBusinessProfile();
 return useMutation({networkMode:'always',mutationFn: async (row:{id?:string | undefined;owner_id?:string | undefined;payload:Payload}) => {
   const {data}=await supabase.auth.getSession(); if(!data.session) throw new Error('Oturum gerekli');
   if (kind !== 'settings' && profile.isUsta && (!profile.activeProfileId || profile.activeProfile?.is_archived)) throw new Error('Kayıt eklemek için etkin bir usta profili seçin.');
   if (row.id && kind !== 'settings' && profile.isUsta) {
     const { data: existing, error } = await supabase.from('work_records').select('profile_id').eq('id', row.id).maybeSingle();
     if (error) throw error;
     if (existing && existing.profile_id !== profile.activeProfileId) throw new Error('Bu kayıt başka bir usta profiline ait. Profil değişikliğiyle kaydın kapsamı değiştirilemez.');
   }
   const id=row.id??crypto.randomUUID();
   const subtype = subtypeOf(kind);
   await persistWrite('work_records',row.id?'update':'insert',{...row,owner_id:row.owner_id??data.session.user.id,id,kind:dbKind(kind),...(kind !== 'settings' && profile.activeProfileId ? { profile_id: profile.activeProfileId } : {}),payload:subtype?{...row.payload,_t:subtype}:row.payload}); return id;
 },onSuccess:()=>{qc.invalidateQueries({queryKey:['work']});toast.success('Kaydedildi');},onError:(e:Error)=>toast.error(e.message)});
}
export function elapsedSeconds(p:Payload, now=Date.now()) {
 return Math.max(0,Number(p.seconds??0)+(p.started_at?Math.max(0,(now-Date.parse(String(p.started_at)))/1000):0));
}
/** Stable, explainable job queue score: urgency + customer importance + overdue age + planning effort. */
export function jobPriorityScore(p: Payload, today = new Date().toISOString().slice(0, 10)) {
 if (p.status === "Tamamlandı" || p.status === "İptal") return 0;
 const urgency = ({ normal: 0, urgent: 24, critical: 38 } as Record<string, number>)[String(p.urgency ?? "normal")] ?? 0;
 const importance = ({ normal: 0, important: 15, strategic: 25 } as Record<string, number>)[String(p.customer_importance ?? "normal")] ?? 0;
 const due = String(p.promised_date ?? "");
 const daysLate = due && due < today ? Math.min(30, Math.floor((Date.parse(`${today}T12:00:00`) - Date.parse(`${due}T12:00:00`)) / 86400000)) : 0;
 const planning = Math.min(12, Math.max(0, Number(p.planned_hours ?? 0)) * 1.5);
 return Math.round(urgency + importance + daysLate * 2 + planning);
}
export function hourlyCharge(seconds:number,rate:number) { return Math.round(seconds/3600*rate*100)/100; }
export function payrollAmount(days:number,rate:number,multiplier:number) {
 if(![1,.5,.25].includes(days)||![1,1.5,2].includes(multiplier)||rate<0) throw new Error('Geçersiz yevmiye');
 return Math.round(days*rate*multiplier*100)/100;
}
/** Computes a current payroll row while preserving the legacy multiplier format. */
export function payrollEntryAmount(p:Payload) {
 const days=Number(p.days??1), rate=Number(p.rate??0), standardHours=Math.max(1,Number(p.standard_hours??8));
 if(days===0 || p.status==='İzinli') return 0;
 const base=days*rate;
 const overtimeHours=Math.max(0,Number(p.overtime_hours??0));
 const hourly=Number(p.hourly_rate??(rate/standardHours));
 const overtime=p.overtime_enabled===true ? overtimeHours*hourly*Math.max(1,Number(p.overtime_multiplier??1.5)) : 0;
 // Existing rows applied multiplier to the whole daily amount. Keep their historic total.
 const legacyMultiplier=Number(p.multiplier??1);
 return Math.round((overtimeHours===0 && !p.overtime_enabled ? base*legacyMultiplier : base+overtime)*100)/100;
}
export function payrollBalance(earned:number,advances:number) {return Math.round((earned-advances)*100)/100;}
export function depreciation(price:number,years:number,purchased:string,now=new Date()) {
 const age=Math.max(0,(now.getTime()-new Date(purchased+'T00:00:00').getTime())/(365.25*86400000));
 return Math.round(Math.max(0,price*(1-age/Math.max(1,years)))*100)/100;
}
export function pageHead(title:string,description:string) {return {meta:[{title:title+' — Yevmiye & Finans'},{name:'description',content:description},{property:'og:title',content:title+' — Yevmiye & Finans'},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]};}
export type MaintLevel='ok'|'warn'|'over'|'none';
export const MAINT_WARN=0.8; // bakım aralığının %80'inde "yaklaşıyor", %100'de "geçti"
/** Makinenin toplam çalışma süresi (sn) = elle kronometre (+çalışıyorsa akan süre) + tamamlanan işlerden gelen süre. */
export function machineSeconds(p:Payload, now=Date.now()) {
 return elapsedSeconds(p,now)+Math.max(0,Number(p.job_seconds??0));
}
/** Bakım durumu: son bakımdan beri çalışılan saat / aralık. extraSeconds: henüz sayaca işlenmemiş ek süre (tahmin). */
export function maintenanceStatus(p:Payload, now=Date.now(), extraSeconds=0) {
 const interval=Number(p.maintenance_hours??0);
 const used=Math.max(0,(machineSeconds(p,now)+extraSeconds-Number(p.last_service_seconds??0))/3600);
 const ratio=interval>0?used/interval:0;
 const level:MaintLevel=interval<=0?'none':ratio>=1?'over':ratio>=MAINT_WARN?'warn':'ok';
 return {interval,used,remaining:interval-used,ratio,level};
}
const DAY=86400000;
/** İşin makineyi tuttuğu zaman aralığı [başlangıç, bitiş] (ms). Saat yoksa tüm gün; saat var süre yoksa 1 saat varsayılır. */
export function jobWindow(p:Payload, now=Date.now()):[number,number]|null {
 const date=String(p.date??''); if(!date) return null;
 const planned=Math.max(0,Number(p.planned_hours??0))*3600000;
 const started=p.started_at?Date.parse(String(p.started_at)):NaN;
 if(!Number.isNaN(started)) return [started,Math.max(now,started+planned)];
 if(p.time){const t=new Date(date+'T'+String(p.time)+':00').getTime(); if(!Number.isNaN(t)) return [t,t+(planned||3600000)];}
 const d0=new Date(date+'T00:00:00').getTime(); return Number.isNaN(d0)?null:[d0,d0+DAY];
}
/** Aynı makineyi aynı zaman aralığında kullanan (bitmemiş, ertelenmemiş) diğer işler. */
export function findMachineConflicts(jobs:WorkRecord[], cand:Payload, selfId?:string, now=Date.now()) {
 const eq=cand.equipment_id; if(!eq) return [];
 const w=jobWindow(cand,now); if(!w) return [];
 return jobs.filter((j)=>j.id!==selfId && j.payload.equipment_id===eq && !j.payload.billed && j.payload.status!=='Tamamlandı' && j.payload.status!=='Ertelendi')
  .filter((j)=>{const v=jobWindow(j.payload,now); return !!v && v[0]<w[1] && w[0]<v[1];});
}
export const machineChosen=(f:Payload)=>Boolean(f.equipment_id)||f.no_machine===true;
/** İş formu doğrulaması: makine seçimi zorunlu; bakım ve çakışma uyarı üretir (engellemez). */
export function validateJobForm(f:Payload, equipment:WorkRecord[], jobs:WorkRecord[], selfId?:string, now=Date.now()):{error?:string;warnings:string[]} {
 const warnings:string[]=[];
 if(!machineChosen(f)) return {error:'Önce kullanılacak makineyi seçin (makinesiz ise "Makinesiz iş").',warnings};
 if(f.equipment_id){
  const eq=equipment.find((e)=>e.id===f.equipment_id);
  if(!eq) return {error:'Seçilen makine bulunamadı. Lütfen yeniden seçin.',warnings};
  const m=maintenanceStatus(eq.payload,now);
  if(m.level==='over') warnings.push(`${String(eq.payload.name)}: bakım zamanı ${(-m.remaining).toFixed(1)} saat geçti.`);
  const c=findMachineConflicts(jobs,f,selfId,now);
  if(c.length) warnings.push(`${String(eq.payload.name)} aynı zaman aralığında ${c.length} başka işte kullanılıyor: ${c.map((j)=>String(j.payload.title)).join(', ')}.`);
 }
 return {warnings};
}
