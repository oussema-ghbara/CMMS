'use client';

import { useState, useRef, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Priority = 'CRITIQUE' | 'HAUTE' | 'NORMALE' | 'BASSE';
type WOStatus = 'EN COURS' | 'OUVERT' | 'TERMINÉ' | 'ANNULÉ' | 'EN ATTENTE';
type WOType   = 'CORRECTIF' | 'PRÉVENTIF' | 'AMÉLIORATION';

interface WorkOrder {
  id: string; asset: string; zone: string;
  priority: Priority; status: WOStatus; type: WOType;
  assignee: string; elapsed: string;
  created_at: string; description: string; overdue?: boolean;
}

type Role = 'SUPERVISEUR' | 'STOREKEEPER' | 'TECHNICIEN' | 'VALIDATEUR';

interface User {
  id: string; name: string; email?: string; roles: Role[]; activeRole: Role;
}

interface Tab {
  id: string; title: string; orderId?: string; content?: React.ReactNode; roleContext?: Role;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — shifted to clean white/neutral (away from cream/brown)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:           '#F8F9FA',
  surface:      '#F1F2F4',
  hover:        '#E8EAED',
  rail:         '#181613',
  border:       '#DDE0E5',
  borderStrong: '#B8BCC4',
  textPrimary:  '#18161A',
  textSecondary:'#6B6863',
  textTertiary: '#9E9A95',
  textOnRail:   '#E8E5E0',
  textDimRail:  '#7A7771',
  accent:       '#C49820',
  sActive: '#B08B10', sActiveBg: '#FDF6DC',
  sOpen:   '#4A7A9C', sOpenBg:   '#EDF4F9',
  sDone:   '#2E7A4E', sDoneBg:   '#EAF5EF',
  sWait:   '#7A6020', sWaitBg:   '#FDF8E8',
  sCancel: '#8A8680', sCancelBg: '#F0EEEB',
  pCrit: '#B53525', pCritBg: '#FDF0EE',
  pHigh: '#A06020', pHighBg: '#FDF5E8',
  pNorm: '#3A6A8C', pNormBg: '#EDF3F8',
  pLow:  '#8A8680', pLowBg:  '#F0EEEB',
} as const;

const PC: Record<Priority, string> = { CRITIQUE:C.pCrit, HAUTE:C.pHigh, NORMALE:C.pNorm, BASSE:C.pLow };
const SC: Record<WOStatus, string> = { 'EN COURS':C.sActive, 'OUVERT':C.sOpen, 'TERMINÉ':C.sDone, 'ANNULÉ':C.sCancel, 'EN ATTENTE':C.sWait };
const SB: Record<WOStatus, string> = { 'EN COURS':C.sActiveBg,'OUVERT':C.sOpenBg,'TERMINÉ':C.sDoneBg,'ANNULÉ':C.sCancelBg,'EN ATTENTE':C.sWaitBg };
const TC: Record<WOType, string>   = { CORRECTIF:C.pCrit, PRÉVENTIF:C.pNorm, AMÉLIORATION:C.pLow };

const ROLE_COLORS: Record<Role, { color: string; bg: string }> = {
  SUPERVISEUR: { color: '#5A3FA0', bg: '#F0ECFC' },
  STOREKEEPER: { color: '#1A6B55', bg: '#E6F5F0' },
  TECHNICIEN:  { color: '#3A6A8C', bg: '#EDF3F8' },
  VALIDATEUR:  { color: '#A06020', bg: '#FDF5E8' },
};

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPERVISEUR: ['Voir tous les OT', 'Assigner des techniciens', 'Valider les interventions', 'Accéder aux rapports', 'Gérer les équipements'],
  STOREKEEPER: ['Voir les demandes de pièces', 'Gérer le stock', 'Émettre des bons de sortie', 'Mettre à jour l\'inventaire'],
  TECHNICIEN:  ['Voir les OT assignés', 'Mettre à jour le statut', 'Saisir le temps passé', 'Rédiger les rapports d\'intervention'],
  VALIDATEUR:  ['Voir les OT en attente de validation', 'Approuver ou rejeter', 'Émettre des rapports de conformité'],
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const ORDERS: WorkOrder[] = [
  { id:'OT-2401', asset:'Compresseur C-12',        zone:'ZONE A', priority:'CRITIQUE', status:'EN COURS',   type:'CORRECTIF',    assignee:'M. Benali',  elapsed:'2h 14m', created_at:'06/05 · 11:48', overdue:true,  description:'Fuite de pression sur le joint principal. Arrêt partiel de la ligne en attente de pièce de rechange.' },
  { id:'OT-2398', asset:'Pompe hydraulique P-07',  zone:'ZONE B', priority:'HAUTE',    status:'OUVERT',     type:'CORRECTIF',    assignee:'—',          elapsed:'48m',    created_at:'06/05 · 13:14', description:"Bruit anormal au démarrage. Inspection du circuit hydraulique et des clapets requise." },
  { id:'OT-2395', asset:'Convoyeur CB-03',         zone:'ZONE A', priority:'HAUTE',    status:'EN COURS',   type:'PRÉVENTIF',    assignee:'K. Driss',   elapsed:'5h 02m', created_at:'06/05 · 09:00', description:'Remplacement préventif courroie selon programme hebdomadaire. Démontage en cours.' },
  { id:'OT-2390', asset:'Groupe électrogène GE-01',zone:'ZONE C', priority:'NORMALE',  status:'OUVERT',     type:'PRÉVENTIF',    assignee:'—',          elapsed:'1h 30m', created_at:'06/05 · 12:32', description:"Maintenance mensuelle : niveaux d'huile, filtres, courroies d'alternateur." },
  { id:'OT-2387', asset:'Ventilateur VT-09',       zone:'ZONE B', priority:'BASSE',    status:'TERMINÉ',    type:'PRÉVENTIF',    assignee:'A. Khelifi', elapsed:'3h 45m', created_at:'06/05 · 10:15', description:'Nettoyage et équilibrage des pales effectués. Vibrations dans les normes.' },
  { id:'OT-2384', asset:'Moteur électrique ME-22', zone:'ZONE D', priority:'CRITIQUE', status:'OUVERT',     type:'CORRECTIF',    assignee:'—',          elapsed:'12m',    created_at:'06/05 · 14:10', description:'Surchauffe T > 85°C détectée par capteur. Arrêt immédiat déclenché. Technicien HT requis.' },
  { id:'OT-2381', asset:'Chaudière CH-05',         zone:'ZONE A', priority:'NORMALE',  status:'TERMINÉ',    type:'PRÉVENTIF',    assignee:'M. Benali',  elapsed:'7h 18m', created_at:'05/05 · 06:44', description:'Vérification annuelle réglementaire complète. Rapport de conformité émis et archivé.' },
  { id:'OT-2378', asset:'Filtre presse FP-11',     zone:'ZONE C', priority:'HAUTE',    status:'EN COURS',   type:'CORRECTIF',    assignee:'K. Driss',   elapsed:'1h 55m', created_at:'06/05 · 12:07', description:'Remplacement toiles filtrantes. Nettoyage plateaux en cours. Production maintenue à 60%.' },
  { id:'OT-2371', asset:'Turbine T-03',            zone:'ZONE B', priority:'CRITIQUE', status:'EN ATTENTE', type:'CORRECTIF',    assignee:'S. Lamine',  elapsed:'4h 30m', created_at:'06/05 · 07:30', description:'En attente pièce DN50 flange (commande en cours). Technicien sur site.' },
  { id:'OT-2361', asset:'Échangeur EC-04',         zone:'ZONE A', priority:'NORMALE',  status:'OUVERT',     type:'AMÉLIORATION', assignee:'—',          elapsed:'6h 05m', created_at:'03/05 · 14:00', overdue:true, description:'Amélioration isolation thermique sur circuit secondaire. Planification requise.' },
];

const MTTR_DATA   = [{m:'Juin',v:4.8},{m:'Juil',v:5.2},{m:'Août',v:4.1},{m:'Sep',v:3.9},{m:'Oct',v:4.4},{m:'Nov',v:3.7},{m:'Déc',v:3.5},{m:'Jan',v:4.2},{m:'Fév',v:3.8},{m:'Mar',v:3.3},{m:'Avr',v:3.1},{m:'Mai',v:3.2}];
const CLOSURE_DATA= [{m:'Juin',v:8},{m:'Juil',v:6},{m:'Août',v:9},{m:'Sep',v:12},{m:'Oct',v:10},{m:'Nov',v:14},{m:'Déc',v:7},{m:'Jan',v:11},{m:'Fév',v:13},{m:'Mar',v:16},{m:'Avr',v:15},{m:'Mai',v:18}];
const STATUS_DIST = [{name:'Terminé',v:52,color:C.sDone},{name:'En cours',v:14,color:C.sActive},{name:'Ouvert',v:7,color:C.sOpen},{name:'En attente',v:5,color:C.sWait},{name:'Annulé',v:3,color:C.sCancel}];
const PRIORITY_DIST=[{name:'Critique',v:8,color:C.pCrit},{name:'Haute',v:24,color:C.pHigh},{name:'Normale',v:35,color:C.pNorm},{name:'Basse',v:14,color:C.pLow}];
const ASSET_SCATTER=[
  {name:'Compresseur C-12',x:8,y:2.8,z:120},{name:'Pompe P-07',x:5,y:1.4,z:60},
  {name:'Convoyeur CB-03', x:3,y:3.2,z:80}, {name:'Moteur ME-22',x:6,y:2.1,z:45},
  {name:'Turbine T-03',    x:2,y:5.4,z:200},{name:'Chaudière CH-05',x:1,y:7.2,z:90},
  {name:'Filtre FP-11',    x:4,y:1.8,z:30}, {name:'Ventilateur VT-09',x:2,y:0.9,z:20},
  {name:'Échangeur EC-04', x:3,y:2.6,z:55},{name:'Réducteur R-07',x:1,y:1.1,z:15},
];
const RADAR_DATA=[
  {s:'Clôtures', MB:88,KD:75,AK:92},
  {s:'1er pass', MB:88,KD:80,AK:92},
  {s:'Réponse',  MB:78,KD:85,AK:70},
  {s:'MTTR',     MB:85,KD:72,AK:90},
  {s:'Critiques',MB:70,KD:90,AK:65},
];
const HEATMAP_DATA=[[2,1,3,1,2,0,0],[4,3,2,5,3,1,0],[3,4,3,2,4,0,0],[1,0,1,0,1,0,0]];
const TIMELINE_DATA=[
  {id:'OT-2381',asset:'Chaudière CH-05',  mins:438,priority:'NORMALE' as Priority,status:'TERMINÉ'   as WOStatus},
  {id:'OT-2395',asset:'Convoyeur CB-03',  mins:302,priority:'HAUTE'   as Priority,status:'EN COURS'  as WOStatus},
  {id:'OT-2371',asset:'Turbine T-03',     mins:270,priority:'CRITIQUE'as Priority,status:'EN ATTENTE'as WOStatus},
  {id:'OT-2387',asset:'Ventilateur VT-09',mins:225,priority:'BASSE'   as Priority,status:'TERMINÉ'   as WOStatus},
  {id:'OT-2401',asset:'Compresseur C-12', mins:134,priority:'CRITIQUE'as Priority,status:'EN COURS'  as WOStatus},
  {id:'OT-2378',asset:'Filtre FP-11',     mins:115,priority:'HAUTE'   as Priority,status:'EN COURS'  as WOStatus},
];

const SECTIONS = [
  {id:'nav',       num:'01', label:'Navigation'},
  {id:'data',      num:'02', label:'Données'},
  {id:'analytics', num:'03', label:'Analytique'},
  {id:'forms',     num:'04', label:'Formulaires'},
  {id:'states',    num:'05', label:'États & Retours'},
  {id:'roles',     num:'06', label:'Rôles & Session'},
  {id:'auth',      num:'07', label:'Authentification'},
];

// ─────────────────────────────────────────────────────────────────────────────
// ATOM COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Mono({ children, size=9, color=C.textTertiary, weight=500, tracking='0.13em', block=false, style:s }: {
  children:React.ReactNode; size?:number; color?:string; weight?:number;
  tracking?:string; block?:boolean; style?:React.CSSProperties;
}) {
  return <span style={{ fontFamily:'ui-monospace,"SF Mono",Menlo,Consolas,monospace', fontSize:size, color, letterSpacing:tracking, textTransform:'uppercase' as const, fontWeight:weight, display:block?'block':undefined, ...s }}>{children}</span>;
}

function StatusPill({ status }: { status: WOStatus }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:SB[status], border:`1px solid ${SC[status]}28`, borderRadius:2, padding:'2px 7px 2px 5px' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:SC[status], display:'inline-block', flexShrink:0 }} />
      <Mono size={9} color={SC[status]}>{status}</Mono>
    </span>
  );
}

function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span style={{ display:'inline-block', background:`${PC[priority]}11`, borderLeft:`2px solid ${PC[priority]}`, padding:'2px 7px 2px 6px', borderRadius:'0 2px 2px 0' }}>
      <Mono size={8} color={PC[priority]}>{priority}</Mono>
    </span>
  );
}

function TypeBadge({ type }: { type: WOType }) {
  return (
    <span style={{ display:'inline-block', border:`1px solid ${TC[type]}44`, padding:'1px 6px', borderRadius:2 }}>
      <Mono size={8} color={TC[type]} tracking='0.08em'>{type}</Mono>
    </span>
  );
}

function RoleBadge({ role, active=false }: { role: Role; active?: boolean }) {
  const rc = ROLE_COLORS[role];
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      background: active ? rc.bg : C.surface,
      border:`1px solid ${active ? rc.color+'55' : C.border}`,
      borderRadius:2, padding:'2px 8px',
    }}>
      {active && <span style={{ width:5, height:5, borderRadius:'50%', background:rc.color, display:'inline-block' }} />}
      <Mono size={8} color={active ? rc.color : C.textTertiary} weight={active?700:500}>{role}</Mono>
    </span>
  );
}

function SectionHeader({ num, title, desc }: { num:string; title:string; desc:string }) {
  return (
    <div style={{ marginBottom:28, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
      <Mono size={9} color={C.textTertiary} block style={{ marginBottom:5 }}>{num} · {title}</Mono>
      <div style={{ fontSize:17, fontWeight:700, color:C.textPrimary, letterSpacing:'-0.01em', marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:13, color:C.textSecondary, lineHeight:1.6, maxWidth:640 }}>{desc}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

const AXIS_STYLE = { fontFamily:'ui-monospace,monospace', fontSize:10, fill:C.textTertiary } as const;

function ChartTooltip({ active, payload, label }: { active?:boolean; payload?:any[]; label?:string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:C.rail, border:'1px solid #2A2825', padding:'8px 12px' }}>
      {label && <Mono size={9} color={C.textDimRail} block style={{ marginBottom:4 }}>{label}</Mono>}
      {payload.map((p:any,i:number) => (
        <div key={i} style={{ display:'flex', gap:8, alignItems:'baseline' }}>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:13, fontWeight:700, color:p.color??C.accent }}>
            {typeof p.value === 'number' && p.value%1!==0 ? p.value.toFixed(1) : p.value}
          </span>
          <Mono size={8} color={C.textDimRail}>{p.name}</Mono>
        </div>
      ))}
    </div>
  );
}

function ChartBox({ title, children, cols=1 }: { title:string; children:React.ReactNode; cols?:number }) {
  return (
    <div style={{ border:`1px solid ${C.border}`, background:C.bg, gridColumn: cols>1?`span ${cols}`:undefined }}>
      <div style={{ height:34, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 16px' }}>
        <Mono size={9} color={C.textSecondary} tracking='0.12em'>{title}</Mono>
      </div>
      <div style={{ padding:'12px 8px 12px 0' }}>{children}</div>
    </div>
  );
}

function GaugeRing({ value, max=100, color, size=88, unit='' }: { value:number; max?:number; color:string; size?:number; unit?:string }) {
  const r = size/2 - 8;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(value/max, 1) * circ;
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)', display:'block' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${filled} ${circ-filled}`} strokeLinecap="butt" />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'ui-monospace,monospace', fontSize:15, fontWeight:800, color, lineHeight:1 }}>
          {Math.round(value)}{unit}
        </span>
      </div>
    </div>
  );
}

function FailureHeatmap() {
  const days    = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const periods = ['Matin','Midi','Après-m.','Soir'];
  const maxV    = 5;
  const heat = (v:number) => {
    if (v === 0) return C.surface;
    const t = v / maxV;
    const r = Math.round(58  + (181-58)*t);
    const g = Math.round(106 + (53-106)*t);
    const b = Math.round(140 + (37-140)*t);
    return `rgb(${r},${g},${b})`;
  };
  return (
    <div style={{ padding:'12px 16px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'56px repeat(7,1fr)', gap:2, marginBottom:3 }}>
        <div />
        {days.map(d => <div key={d} style={{ textAlign:'center' }}><Mono size={8} color={C.textTertiary}>{d}</Mono></div>)}
      </div>
      {HEATMAP_DATA.map((row,ri) => (
        <div key={ri} style={{ display:'grid', gridTemplateColumns:'56px repeat(7,1fr)', gap:2, marginBottom:2 }}>
          <div style={{ display:'flex', alignItems:'center' }}><Mono size={8} color={C.textTertiary}>{periods[ri]}</Mono></div>
          {row.map((v,ci) => (
            <div key={ci} style={{
              height:22, background:heat(v),
              border:`1px solid ${v>0?heat(v):C.border}`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              {v>0 && <Mono size={8} color={v>3?'#fff':C.textSecondary} weight={700}>{v}</Mono>}
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:6 }}>
        <Mono size={8} color={C.textTertiary}>Densité :</Mono>
        {[0,1,2,3,4,5].map(v=>(
          <span key={v} style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span style={{ width:12, height:12, background:v===0?C.surface:heat(v), border:`1px solid ${C.border}`, display:'inline-block' }} />
            {(v===0||v===5)&&<Mono size={7} color={C.textTertiary}>{v===0?'0':'5+'}</Mono>}
          </span>
        ))}
      </div>
    </div>
  );
}

function DurationTimeline() {
  const maxMins = Math.max(...TIMELINE_DATA.map(i=>i.mins));
  return (
    <div style={{ padding:'12px 16px' }}>
      {TIMELINE_DATA.map(item => (
        <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <div style={{ width:76, flexShrink:0 }}>
            <Mono size={9} color={C.textPrimary} tracking='0.04em'>{item.id}</Mono>
          </div>
          <div style={{ flex:1, position:'relative', height:14, background:C.surface }}>
            <div style={{
              position:'absolute', top:0, left:0, height:'100%',
              width:`${(item.mins/maxMins)*100}%`,
              background:SC[item.status],
              opacity: item.status==='TERMINÉ' ? 0.55 : 1,
            }} />
          </div>
          <div style={{ width:52, flexShrink:0, textAlign:'right' }}>
            <Mono size={9} color={C.textTertiary} tracking='0.04em'>
              {Math.floor(item.mins/60)}h {String(item.mins%60).padStart(2,'0')}m
            </Mono>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE DROPDOWN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function ProfileDropdown({
  user, onSwitchRole, onLogout,
}: { user: User; onSwitchRole: (r: Role) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const rc = ROLE_COLORS[user.activeRole];

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', gap:6,
          background: open ? '#2A2825' : 'transparent',
          border:`1px solid ${open?'#3A3835':'transparent'}`,
          padding:'3px 8px 3px 4px', cursor:'pointer',
        }}
      >
        {/* Avatar */}
        <span style={{
          width:22, height:22, background:rc.color,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:9, fontWeight:800, color:'#fff', letterSpacing:'0.04em' }}>{initials}</span>
        </span>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1 }}>
          <Mono size={8} color={C.textOnRail} weight={600} tracking='0.04em'>{user.name}</Mono>
          <Mono size={7} color={C.textDimRail} tracking='0.08em'>{user.activeRole}</Mono>
        </div>
        <Mono size={8} color={C.textDimRail} style={{ marginLeft:2 }}>{open?'▲':'▾'}</Mono>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', right:0, width:280,
          background:C.bg, border:`1px solid ${C.border}`,
          zIndex:10002, boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
        }}>
          {/* User info header */}
          <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <span style={{
                width:36, height:36, background:rc.color,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                <span style={{ fontFamily:'ui-monospace,monospace', fontSize:13, fontWeight:800, color:'#fff' }}>{initials}</span>
              </span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.textPrimary, marginBottom:1 }}>{user.name}</div>
                <div style={{ fontSize:11, color:C.textTertiary, fontFamily:'ui-monospace,monospace' }}>{user.email}</div>
              </div>
            </div>
            {/* All assigned roles */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {user.roles.map(r => (
                <RoleBadge key={r} role={r} active={r === user.activeRole} />
              ))}
            </div>
          </div>

          {/* Role switcher (if multiple roles) */}
          {user.roles.length > 1 && (
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}` }}>
              <Mono size={8} color={C.textTertiary} block style={{ marginBottom:8 }}>Basculer vers</Mono>
              {user.roles.filter(r => r !== user.activeRole).map(r => {
                const rrc = ROLE_COLORS[r];
                return (
                  <button key={r} onClick={() => { onSwitchRole(r); setOpen(false); }} style={{
                    display:'flex', alignItems:'center', gap:8, width:'100%',
                    background:'transparent', border:`1px solid ${C.border}`,
                    padding:'7px 10px', marginBottom:4, cursor:'pointer',
                    textAlign:'left',
                  }}
                    onMouseEnter={e=>(e.currentTarget.style.background=C.hover)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                  >
                    <span style={{ width:8, height:8, borderRadius:'50%', background:rrc.color, flexShrink:0 }} />
                    <Mono size={9} color={rrc.color} weight={600}>{r}</Mono>
                    <span style={{ marginLeft:'auto', fontSize:10, color:C.textTertiary }}>Activer →</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Profile actions */}
          <div style={{ padding:'6px 8px' }}>
            {[
              { label:'Mon profil', sub:'Informations personnelles' },
              { label:'Préférences', sub:'Interface et notifications' },
              { label:'Journal d\'activité', sub:'Historique des actions' },
            ].map(item => (
              <button key={item.label} style={{
                display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1,
                width:'100%', background:'transparent', border:'none',
                padding:'8px 8px', cursor:'pointer', borderRadius:2, textAlign:'left',
              }}
                onMouseEnter={e=>(e.currentTarget.style.background=C.hover)}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
              >
                <span style={{ fontSize:12, color:C.textPrimary, fontWeight:500 }}>{item.label}</span>
                <span style={{ fontSize:10, color:C.textTertiary }}>{item.sub}</span>
              </button>
            ))}
          </div>

          {/* Logout */}
          <div style={{ padding:'6px 8px', borderTop:`1px solid ${C.border}` }}>
            <button onClick={() => { onLogout(); setOpen(false); }} style={{
              display:'flex', alignItems:'center', gap:8, width:'100%',
              background:'transparent', border:'none', padding:'8px 8px',
              cursor:'pointer', borderRadius:2,
            }}
              onMouseEnter={e=>(e.currentTarget.style.background=C.pCritBg)}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
            >
              <span style={{ fontSize:12, color:C.pCrit, fontWeight:500 }}>Déconnexion</span>
              <Mono size={8} color={C.textTertiary} style={{ marginLeft:'auto' }}>↗</Mono>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 01 — NAVIGATION MODEL
// ─────────────────────────────────────────────────────────────────────────────

function NavSection() {
  const items = [
    {label:'Tableau de bord',  icon:'□', alert:0},
    {label:'Ordres de travail',icon:'≡', alert:0},
    {label:'Validation',       icon:'✓', alert:2},
    {label:'Équipements',      icon:'◈', alert:0},
    {label:'Analytique',       icon:'↗', alert:0},
  ];
  const [activeNav, setActiveNav] = useState(1);

  return (
    <div>
      <SectionHeader num="01" title="Navigation"
        desc="Le sidebar rétractable est fonctionnel mais générique. La proposition replace ce modèle par une barre de navigation horizontale à deux niveaux : le rail d'ancrage (identité système) et la barre de module (contexte et sections). Les alertes sont co-localisées avec leur section, pas dans une cloche globale." />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, marginBottom:32 }}>
        {/* OLD: sidebar */}
        <div>
          <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:6, height:6, background:C.pCrit, borderRadius:'50%' }} />
            <Mono size={9} color={C.textTertiary}>Pattern actuel — sidebar rétractable</Mono>
          </div>
          <div style={{ border:`1px solid ${C.border}`, display:'flex', height:280, overflow:'hidden', opacity:0.7 }}>
            <div style={{ width:200, background:C.rail, borderRight:'1px solid #2A2825', display:'flex', flexDirection:'column' }}>
              <div style={{ height:44, borderBottom:'1px solid #2A2825', display:'flex', alignItems:'center', padding:'0 14px', gap:8 }}>
                <span style={{ width:22, height:22, background:'#2A2825', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Mono size={8} color={C.accent} weight={700}>G</Mono>
                </span>
                <Mono size={9} color={C.textOnRail} tracking='0.08em' weight={700}>GMAO</Mono>
              </div>
              <div style={{ padding:'10px 14px 4px' }}><Mono size={7} color={C.textDimRail} tracking='0.14em'>SUPERVISEUR</Mono></div>
              {items.map((item,i) => (
                <div key={i} style={{ height:34, display:'flex', alignItems:'center', padding:'0 14px', gap:8, borderLeft:`2px solid ${i===activeNav?C.accent:'transparent'}`, background:i===activeNav?'#2A2825':'transparent' }}>
                  <span style={{ fontSize:10, color:i===activeNav?C.accent:C.textDimRail, width:12 }}>{item.icon}</span>
                  <Mono size={8} color={i===activeNav?C.textOnRail:C.textDimRail} tracking='0.05em' weight={i===activeNav?600:400}>{item.label}</Mono>
                  {item.alert>0 && <span style={{ marginLeft:'auto', background:C.pCrit, borderRadius:'50%', width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center' }}><Mono size={7} color='#fff' weight={700}>{item.alert}</Mono></span>}
                </div>
              ))}
            </div>
            <div style={{ flex:1, background:C.bg, padding:14 }}>
              <div style={{ height:10, width:'40%', background:C.border, marginBottom:8 }} />
              <div style={{ height:8, width:'60%', background:C.surface }} />
            </div>
          </div>
          <div style={{ marginTop:8 }}>
            <Mono size={8} color={C.textTertiary}>↑ Prend 200-280px de largeur permanente. Identité générique SaaS.</Mono>
          </div>
        </div>

        {/* NEW: horizontal nav */}
        <div>
          <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:6, height:6, background:C.sDone, borderRadius:'50%' }} />
            <Mono size={9} color={C.textTertiary}>Proposition — barre horizontale à double niveau</Mono>
          </div>
          <div style={{ border:`1px solid ${C.border}`, overflow:'hidden' }}>
            <div style={{ height:34, background:C.rail, display:'flex', alignItems:'center', padding:'0 16px', gap:16 }}>
              <Mono size={10} color={C.textOnRail} tracking='0.10em' weight={700}>GMAO</Mono>
              <div style={{ flex:1, height:1, background:'#2E2C28' }} />
              <Mono size={9} color={C.textDimRail}>14:22:07</Mono>
              <span style={{ display:'flex', alignItems:'center', gap:4, border:'1px solid #2E2C28', padding:'2px 7px', cursor:'pointer' }}>
                <Mono size={8} color={C.textDimRail} tracking='0.10em'>ALERTES</Mono>
                <span style={{ background:C.pCrit, padding:'0 4px', minWidth:14, height:14, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Mono size={7} color='#fff' weight={700}>2</Mono>
                </span>
              </span>
              {/* Profile avatar stub */}
              <span style={{ width:22, height:22, background:ROLE_COLORS['SUPERVISEUR'].color, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <Mono size={8} color='#fff' weight={800}>SH</Mono>
              </span>
            </div>
            <div style={{ height:40, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'stretch' }}>
              <div style={{ display:'flex', alignItems:'center', padding:'0 16px', borderRight:`1px solid ${C.border}`, gap:6, cursor:'pointer' }}>
                <Mono size={9} color={C.textPrimary} weight={700} tracking='0.08em'>SUPERVISEUR</Mono>
                <Mono size={8} color={C.textTertiary}>▾</Mono>
              </div>
              {items.map((item,i) => (
                <button key={i} onClick={()=>setActiveNav(i)} style={{
                  display:'flex', alignItems:'center', gap:6, padding:'0 16px',
                  borderRight:`1px solid ${C.border}`,
                  borderBottom:`2px solid ${i===activeNav?C.textPrimary:'transparent'}`,
                  borderLeft:'none', borderTop:'none',
                  background: i===activeNav ? C.bg : 'transparent',
                  cursor:'pointer', outline:'none',
                }}>
                  <Mono size={9} color={i===activeNav?C.textPrimary:C.textSecondary} weight={i===activeNav?600:400} tracking='0.06em'>{item.label}</Mono>
                  {item.alert>0 && (
                    <span style={{ background:C.pCrit, padding:'0 4px', height:13, display:'flex', alignItems:'center' }}>
                      <Mono size={7} color='#fff' weight={700}>{item.alert}</Mono>
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ height:202, background:C.bg, padding:14 }}>
              <div style={{ height:10, width:'40%', background:C.border, marginBottom:8 }} />
              <div style={{ height:8, width:'60%', background:C.surface }} />
            </div>
          </div>
          <div style={{ marginTop:8 }}>
            <Mono size={8} color={C.sDone}>↑ Navigation complète dans 74px. Alertes co-localisées. Contenu pleine largeur.</Mono>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:C.border }}>
        {[
          ['Contexte permanent', 'Module actif toujours visible. Aucun menu caché ou état ambigu.'],
          ['Alertes co-localisées', "Le compteur d'alerte est sur la section concernée, pas dans une cloche globale décontextualisée."],
          ['Notification système', 'Le rail sombre porte uniquement les alertes critiques système (pas les événements métier).'],
          ['Pleine largeur', 'Le contenu utilise 100% de la largeur disponible. Aucun espace perdu par la navigation.'],
          ['Commutation de rôle', 'Le sélecteur de module permet de basculer entre rôles pour les utilisateurs multi-rôles.'],
          ['Identité distincte', "Ce pattern n'est pas un sidebar, pas un mega-menu. C'est un rail de contexte métier."],
        ].map(([t,d]) => (
          <div key={t as string} style={{ background:C.bg, padding:'14px 16px' }}>
            <Mono size={9} color={C.textSecondary} block style={{ marginBottom:5 }}>{t as string}</Mono>
            <div style={{ fontSize:12, color:C.textTertiary, lineHeight:1.5 }}>{d as string}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 02 — DATA VIEW — MASTER-DETAIL SPLIT
// ─────────────────────────────────────────────────────────────────────────────

const ROW_H = 52;

function DataSection({ activeRole }: { activeRole?: Role }) {
  const [filter, setFilter] = useState<WOStatus|'TOUS'>('TOUS');
  const [page, setPage]     = useState(1);
  const [selected, setSelected] = useState<string|null>(null);
  const [actionView, setActionView] = useState<string|null>(null);

  const filtered = filter==='TOUS' ? ORDERS : ORDERS.filter(o=>o.status===filter);
  const totalPages = Math.ceil(filtered.length / 6);
  const visible = filtered.slice((page-1)*6, page*6);

  const handleSelect = (id: string) => {
    if (selected === id) { setSelected(null); setActionView(null); }
    else { setSelected(id); setActionView(null); }
  };

  const handleFilter = (f: WOStatus|'TOUS') => { setFilter(f); setPage(1); setSelected(null); setActionView(null); };

  // Action definitions per role context
  const getActions = (order: WorkOrder) => {
    const actions: { key: string; label: string; color: string; content: React.ReactNode }[] = [];

    if (activeRole === 'SUPERVISEUR' || activeRole === 'TECHNICIEN') {
      actions.push({
        key: 'assign',
        label: 'Prendre en charge',
        color: C.sActive,
        content: (
          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:12, color:C.textSecondary, marginBottom:12 }}>Assigner cet ordre à un technicien disponible.</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {['M. Benali','K. Driss','A. Khelifi','S. Lamine'].map(t => (
                <span key={t} style={{ padding:'5px 12px', border:`1px solid ${C.border}`, fontSize:12, color:C.textPrimary, cursor:'pointer', background:C.surface }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        ),
      });
    }

    if (activeRole === 'VALIDATEUR' || activeRole === 'SUPERVISEUR') {
      actions.push({
        key: 'validate',
        label: 'Valider',
        color: C.sDone,
        content: (
          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:12, color:C.textSecondary, marginBottom:12 }}>Examiner et approuver cette intervention.</div>
            <div style={{ display:'flex', gap:8 }}>
              <span style={{ padding:'6px 14px', background:C.sDoneBg, border:`1px solid ${C.sDone}55`, fontSize:12, color:C.sDone, cursor:'pointer', fontWeight:600 }}>✓ Approuver</span>
              <span style={{ padding:'6px 14px', background:C.pCritBg, border:`1px solid ${C.pCrit}55`, fontSize:12, color:C.pCrit, cursor:'pointer', fontWeight:600 }}>✕ Rejeter</span>
            </div>
          </div>
        ),
      });
    }

    if (activeRole === 'STOREKEEPER' || activeRole === 'SUPERVISEUR') {
      actions.push({
        key: 'parts',
        label: 'Pièces',
        color: C.pNorm,
        content: (
          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:12, color:C.textSecondary, marginBottom:12 }}>Gérer les sorties de stock pour cette intervention.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {[['Joint torique DN25','Réf. JT-225','×2'],['Filtre hydraulique','Réf. FH-07','×1']].map(([n,r,q]) => (
                <div key={n} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:C.surface, border:`1px solid ${C.border}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:C.textPrimary, fontWeight:500 }}>{n}</div>
                    <Mono size={8} color={C.textTertiary}>{r}</Mono>
                  </div>
                  <Mono size={9} color={C.pNorm} weight={700}>{q}</Mono>
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }

    return actions;
  };

  const selectedOrder = selected ? ORDERS.find(o => o.id === selected) ?? null : null;
  const detailActions = selectedOrder ? getActions(selectedOrder) : [];

  return (
    <div>
      <SectionHeader num="02" title="Données"
        desc="Sélectionner une ligne révèle un panneau de détail latéral ancré à droite. La liste reste visible et navigable — l'utilisateur peut comparer les entrées sans perdre le contexte. Les actions contextuelles s'exécutent dans le panneau, sans fragmenter la vue." />

      {/* Role context indicator */}
      <div style={{ marginBottom:12, padding:'8px 14px', background:C.surface, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10 }}>
        <Mono size={8} color={C.textTertiary}>Actions visibles pour le rôle :</Mono>
        <RoleBadge role={activeRole ?? 'SUPERVISEUR'} active />
        <Mono size={8} color={C.textTertiary} style={{ marginLeft:8 }}>· Les boutons d'action changent selon le rôle actif — vérifiable en commutant de rôle via le profil</Mono>
      </div>

      {/* Controls */}
      <div style={{ height:44, background:C.surface, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 16px', gap:8 }}>
        <Mono size={9} color={C.textTertiary}>Ordres de travail</Mono>
        <div style={{ width:1, height:14, background:C.border, margin:'0 4px' }} />
        {(['TOUS','EN COURS','OUVERT','TERMINÉ'] as const).map(f => (
          <button key={f} onClick={()=>handleFilter(f)} style={{
            fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em',
            textTransform:'uppercase', cursor:'pointer', borderRadius:2, padding:'3px 9px',
            color: filter===f ? C.textPrimary : C.textTertiary,
            background: filter===f ? C.bg : 'transparent',
            border: `1px solid ${filter===f ? C.borderStrong : 'transparent'}`,
            fontWeight: filter===f ? 600 : 400,
          }}>{f}</button>
        ))}
        <div style={{ flex:1 }} />
        <button style={{ fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.13em', textTransform:'uppercase', fontWeight:600, color:C.bg, background:C.textPrimary, border:'none', borderRadius:2, padding:'6px 14px', cursor:'pointer' }}>+ Nouvel ordre</button>
      </div>

      {/* Master-detail layout */}
      <div style={{ display:'grid', gridTemplateColumns: selectedOrder ? '1fr 340px' : '1fr', border:`1px solid ${C.border}`, borderTop:'none' }}>

        {/* ── LEFT: List ── */}
        <div style={{ minWidth:0 }}>
          {/* Column headers */}
          <div style={{ height:30, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'grid', gridTemplateColumns: selectedOrder ? '80px 1fr 92px 108px 72px' : '96px 1fr 96px 112px 110px 72px', alignItems:'center' }}>
            {(selectedOrder
              ? ['Référence','Équipement','Type','Statut','Temps']
              : ['Référence','Équipement','Type','Statut','Technicien','Temps']
            ).map(col=>(
              <div key={col} style={{ padding:'0 12px' }}>
                <Mono size={9} color={C.textTertiary}>{col}</Mono>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div>
            {visible.length===0 && (
              <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Mono size={9} color={C.textTertiary}>Aucun ordre pour ce filtre</Mono>
              </div>
            )}
            {visible.map(order => {
              const isActive = selected === order.id;
              return (
                <div
                  key={order.id}
                  onClick={() => handleSelect(order.id)}
                  style={{
                    height: ROW_H,
                    borderBottom:`1px solid ${C.border}`,
                    borderLeft:`3px solid ${PC[order.priority]}`,
                    background: isActive ? C.sActiveBg : 'transparent',
                    display:'grid',
                    gridTemplateColumns: selectedOrder ? '80px 1fr 92px 108px 72px' : '96px 1fr 96px 112px 110px 72px',
                    alignItems:'center',
                    cursor:'pointer',
                    outline: isActive ? `1px solid ${C.borderStrong}` : 'none',
                    outlineOffset: -1,
                  }}
                  onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=C.surface; }}
                  onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent'; }}
                >
                  <div style={{ padding:'0 12px' }}>
                    <div style={{ fontFamily:'ui-monospace,monospace', fontSize:11, fontWeight:700, color: isActive ? C.textPrimary : C.textPrimary, letterSpacing:'0.04em', lineHeight:1.2 }}>
                      {order.id}{order.overdue&&<span style={{ marginLeft:4, color:C.pCrit, fontSize:8 }}>▲</span>}
                    </div>
                    <Mono size={8} color={C.textTertiary}>{order.zone}</Mono>
                  </div>
                  <div style={{ padding:'0 12px', minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:C.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{order.asset}</div>
                  </div>
                  <div style={{ padding:'0 12px' }}><TypeBadge type={order.type} /></div>
                  <div style={{ padding:'0 12px' }}><StatusPill status={order.status} /></div>
                  {!selectedOrder && (
                    <div style={{ padding:'0 12px' }}>
                      <span style={{ fontSize:12, color:order.assignee==='—'?C.textTertiary:C.textSecondary, fontWeight:order.assignee==='—'?400:500 }}>{order.assignee}</span>
                    </div>
                  )}
                  <div style={{ padding:'0 12px' }}>
                    <span style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:C.textSecondary, letterSpacing:'0.03em' }}>{order.elapsed}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ height:34, background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 16px', gap:16 }}>
            {(['CRITIQUE','HAUTE','NORMALE','BASSE'] as Priority[]).map(p=>(
              <span key={p} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ display:'inline-block', width:8, height:8, borderLeft:`3px solid ${PC[p]}` }} />
                <Mono size={8} color={C.textTertiary}>{p}</Mono>
              </span>
            ))}
            <div style={{ flex:1 }} />
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ background:'transparent', border:'none', cursor:page===1?'default':'pointer', color:page===1?C.textTertiary:C.textSecondary, fontSize:14, padding:'0 4px' }}>‹</button>
            <Mono size={9} color={C.textTertiary}>{page} / {Math.max(totalPages,1)}</Mono>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} style={{ background:'transparent', border:'none', cursor:page>=totalPages?'default':'pointer', color:page>=totalPages?C.textTertiary:C.textSecondary, fontSize:14, padding:'0 4px' }}>›</button>
          </div>
        </div>

        {/* ── RIGHT: Detail panel ── */}
        {selectedOrder && (
          <div style={{ borderLeft:`1px solid ${C.border}`, display:'flex', flexDirection:'column', background:C.bg, minHeight: ROW_H * 6 + 64 }}>

            {/* Panel header */}
            <div style={{ padding:'12px 16px 10px', borderBottom:`1px solid ${C.border}`, background:C.surface }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:'ui-monospace,monospace', fontSize:12, fontWeight:700, color:C.textPrimary, letterSpacing:'0.04em', marginBottom:2 }}>
                    {selectedOrder.id}{selectedOrder.overdue&&<span style={{ marginLeft:5, color:C.pCrit, fontSize:8 }}>▲ EN RETARD</span>}
                  </div>
                  <div style={{ fontSize:13, fontWeight:500, color:C.textSecondary }}>{selectedOrder.asset}</div>
                </div>
                <button
                  onClick={() => { setSelected(null); setActionView(null); }}
                  style={{ background:'transparent', border:`1px solid ${C.border}`, padding:'2px 7px', cursor:'pointer', flexShrink:0 }}
                >
                  <Mono size={8} color={C.textTertiary}>✕</Mono>
                </button>
              </div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                <PriorityChip priority={selectedOrder.priority} />
                <TypeBadge type={selectedOrder.type} />
                <StatusPill status={selectedOrder.status} />
              </div>
            </div>

            {/* Action navigation pills */}
            {detailActions.length > 0 && (
              <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${C.border}`, background:C.surface, overflowX:'auto' }}>
                <button
                  onClick={() => setActionView(null)}
                  style={{
                    fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.10em', textTransform:'uppercase',
                    padding:'8px 14px', border:'none', borderBottom:`2px solid ${!actionView ? C.textPrimary : 'transparent'}`,
                    background:'transparent', cursor:'pointer', color: !actionView ? C.textPrimary : C.textTertiary,
                    fontWeight: !actionView ? 600 : 400, flexShrink:0,
                  }}
                >Détail</button>
                {detailActions.filter(a => a.key !== 'detail').map(action => (
                  <button
                    key={action.key}
                    onClick={() => setActionView(action.key)}
                    style={{
                      fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.10em', textTransform:'uppercase',
                      padding:'8px 14px', border:'none', borderBottom:`2px solid ${actionView===action.key ? action.color : 'transparent'}`,
                      background:'transparent', cursor:'pointer',
                      color: actionView===action.key ? action.color : C.textTertiary,
                      fontWeight: actionView===action.key ? 600 : 400, flexShrink:0,
                    }}
                  >{action.label}</button>
                ))}
              </div>
            )}

            {/* Panel body */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {!actionView ? (
                // Detail view
                <div style={{ padding:'14px 16px' }}>
                  <p style={{ fontSize:13, color:C.textPrimary, lineHeight:1.7, margin:'0 0 14px', borderLeft:`2px solid ${C.border}`, paddingLeft:10 }}>
                    {selectedOrder.description}
                  </p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border }}>
                    {[
                      ['Technicien', selectedOrder.assignee, false],
                      ['Zone',       selectedOrder.zone,     false],
                      ['Créé le',    selectedOrder.created_at, true],
                      ['Temps',      selectedOrder.elapsed,  true],
                    ].map(([l, v, m]) => (
                      <div key={l as string} style={{ background:C.bg, padding:'9px 12px' }}>
                        <Mono size={8} color={C.textTertiary} block style={{ marginBottom:3 }}>{l as string}</Mono>
                        <span style={{ fontSize:12, fontFamily: m ? 'ui-monospace,monospace' : 'inherit', color:C.textPrimary, fontWeight:500 }}>{v as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                detailActions.find(a => a.key === actionView)?.content ?? null
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 03 — ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

function AnalyticsSection() {
  return (
    <div>
      <SectionHeader num="03" title="Analytique"
        desc="Le vocabulaire visuel analytique dépasse les barres et lignes. Selon le type de donnée et la décision à prendre, le format change : jauges pour les taux, heatmap pour les patterns temporels, scatter pour les corrélations, radar pour les comparaisons multi-dimensionnelles, barres de durée pour le temps opérationnel." />

      <div style={{ marginBottom:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <Mono size={9} color={C.textTertiary}>Métriques clés + taux visuels</Mono>
          <div style={{ flex:1, height:1, background:C.border }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr) auto auto auto', gap:1, background:C.border, border:`1px solid ${C.border}`, marginBottom:24 }}>
          {[{v:'81',l:'Total ordres'},{v:'21',l:'Ouverts',alert:true},{v:'52',l:'Terminés / 30j'},{v:'3h 22m',l:'MTTR moyen'}].map(({v,l,alert})=>(
            <div key={l} style={{ background:C.bg, padding:'14px 20px' }}>
              <Mono size={9} color={C.textTertiary} block style={{ marginBottom:5 }}>{l}</Mono>
              <div style={{ fontSize:36, fontWeight:800, color:alert?C.pCrit:C.textPrimary, letterSpacing:'-0.03em', lineHeight:1 }}>{v}</div>
            </div>
          ))}
          {[
            {v:94,label:'Résolution',color:C.sDone},
            {v:83,label:'1er passage',color:C.sActive},
            {v:78,label:'Conformité',color:C.pNorm},
          ].map(({v,label,color})=>(
            <div key={label} style={{ background:C.bg, padding:'10px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <GaugeRing value={v} color={color} size={76} unit="%" />
              <Mono size={8} color={C.textTertiary}>{label}</Mono>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border, marginBottom:1 }}>
        <ChartBox title="MTTR · Tendance 12 mois (h)">
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={MTTR_DATA} margin={{left:-10,right:16,top:4,bottom:0}}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.sActive} stopOpacity={0.18}/><stop offset="95%" stopColor={C.sActive} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="m" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis domain={[2,6]} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={4} stroke={C.pCrit} strokeDasharray="4 3" strokeWidth={1} />
              <Area type="monotone" dataKey="v" name="MTTR" stroke={C.sActive} strokeWidth={2} fill="url(#g1)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartBox>
        <ChartBox title="Clôtures mensuelles">
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={CLOSURE_DATA} margin={{left:-10,right:16,top:4,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="m" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="v" name="Clôturés" stroke={C.sDone} strokeWidth={2} dot={{fill:C.sDone,r:3}} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border, marginBottom:1 }}>
        <ChartBox title="Distribution par statut">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={STATUS_DIST} layout="vertical" margin={{left:8,right:20,top:4,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="v" name="Ordres" radius={0} maxBarSize={13}>
                {STATUS_DIST.map((d,i)=><Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
        <ChartBox title="Distribution par priorité">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={PRIORITY_DIST} margin={{left:-10,right:16,top:4,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="v" name="Ordres" radius={0} maxBarSize={32}>
                {PRIORITY_DIST.map((d,i)=><Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border, marginBottom:1 }}>
        <ChartBox title="Fiabilité équipements · Pannes/an × MTTR (h)">
          <ResponsiveContainer width="100%" height={180}>
            <ScatterChart margin={{left:-10,right:16,top:4,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" dataKey="x" name="Pannes/an" tick={AXIS_STYLE} axisLine={false} tickLine={false} label={{value:'Pannes / an',position:'insideBottom',offset:-2,style:{...AXIS_STYLE,fontSize:8}}} />
              <YAxis type="number" dataKey="y" name="MTTR (h)" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <ZAxis type="number" dataKey="z" range={[40,200]} />
              <Tooltip content={({ active, payload }: any) => {
                if (!active||!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background:C.rail, border:'1px solid #2A2825', padding:'8px 12px' }}>
                    <div style={{ fontSize:11, color:C.textOnRail, marginBottom:4, fontWeight:600 }}>{d.name}</div>
                    <Mono size={8} color={C.textDimRail} block>{d.x} pannes · MTTR {d.y}h</Mono>
                  </div>
                );
              }} />
              <Scatter name="Équipements" data={ASSET_SCATTER} fill={C.pNorm} opacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartBox>
        <ChartBox title="Performance techniciens · Comparaison multi-critères">
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={RADAR_DATA} margin={{left:10,right:10,top:8,bottom:8}}>
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="s" tick={{...AXIS_STYLE,fontSize:9}} />
              <Radar name="M. Benali"  dataKey="MB" stroke={C.sActive} fill={C.sActive} fillOpacity={0.12} strokeWidth={2} />
              <Radar name="K. Driss"   dataKey="KD" stroke={C.pNorm}   fill={C.pNorm}   fillOpacity={0.10} strokeWidth={2} />
              <Radar name="A. Khelifi" dataKey="AK" stroke={C.sDone}   fill={C.sDone}   fillOpacity={0.10} strokeWidth={2} />
              <Tooltip content={<ChartTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:16, padding:'0 16px 4px' }}>
            {[['M. Benali',C.sActive],['K. Driss',C.pNorm],['A. Khelifi',C.sDone]].map(([n,c])=>(
              <span key={n} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:16, height:2, background:c, display:'inline-block' }} />
                <Mono size={8} color={C.textTertiary}>{n}</Mono>
              </span>
            ))}
          </div>
        </ChartBox>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border }}>
        <ChartBox title="Fréquence des pannes · Jour × Heure">
          <FailureHeatmap />
        </ChartBox>
        <ChartBox title="Durée des ordres actifs · Barres temporelles">
          <DurationTimeline />
        </ChartBox>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 04 — FORMS
// ─────────────────────────────────────────────────────────────────────────────

function FormsSection() {
  const [type,  setType]  = useState('');
  const [prio,  setPrio]  = useState('');
  const [asset, setAsset] = useState('');
  const [desc,  setDesc]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);

  const assetError = asset.trim()==='' && desc.trim()!=='';

  const submit = (e:React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(()=>{ setSubmitting(false); setDone(true); setTimeout(()=>setDone(false),2500); },1400);
  };

  const inputBase: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'8px 10px', border:`1px solid ${C.border}`, borderRadius:2, background:C.bg, color:C.textPrimary, fontSize:13, fontFamily:'system-ui,sans-serif', outline:'none' };

  const Field = ({label,req,err,hint,children}:{label:string;req?:boolean;err?:string;hint?:string;children:React.ReactNode}) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <label style={{ fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.13em', textTransform:'uppercase', color:C.textSecondary, fontWeight:500 }}>
          {label}{req&&<span style={{ color:C.pCrit, marginLeft:3 }}>*</span>}
        </label>
        {hint&&<span style={{ fontSize:10, color:C.textTertiary }}>{hint}</span>}
      </div>
      {children}
      {err&&<div style={{ marginTop:4, fontSize:11, color:C.pCrit }}>{err}</div>}
    </div>
  );

  return (
    <div>
      <SectionHeader num="04" title="Formulaires"
        desc="Structure invariante : label monospace au-dessus, champ, message d'erreur dessous. Les champs requis sont marqués. Le bouton de soumission reflète l'état (inactif → chargement → succès / erreur). Tous les champs suivent le même vocabulaire visuel indépendamment de leur type." />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
        <div>
          <Mono size={9} color={C.textTertiary} block style={{ marginBottom:14 }}>Formulaire — Nouvel ordre de travail</Mono>
          <form onSubmit={submit} style={{ border:`1px solid ${C.border}`, padding:20 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:0 }}>
              <Field label="Type" req><select value={type} onChange={e=>setType(e.target.value)} style={inputBase}><option value="">Sélectionner…</option><option>CORRECTIF</option><option>PRÉVENTIF</option><option>AMÉLIORATION</option></select></Field>
              <Field label="Priorité" req><select value={prio} onChange={e=>setPrio(e.target.value)} style={inputBase}><option value="">Sélectionner…</option><option>CRITIQUE</option><option>HAUTE</option><option>NORMALE</option><option>BASSE</option></select></Field>
            </div>
            <Field label="Équipement" req err={assetError?'Équipement requis':undefined}>
              <input value={asset} onChange={e=>setAsset(e.target.value)} placeholder="Rechercher un équipement…" style={{ ...inputBase, borderColor:assetError?C.pCrit:C.border }} />
            </Field>
            <Field label="Description" req hint={`${desc.length}/500`}>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Décrire la panne ou l'intervention…" style={{ ...inputBase, resize:'none' }} />
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <Field label="Technicien principal"><select style={{ ...inputBase, color:C.textTertiary }}><option value="">Non assigné</option><option>M. Benali</option><option>K. Driss</option><option>A. Khelifi</option></select></Field>
              <Field label="Durée estimée" hint="minutes"><input type="number" min={0} placeholder="ex: 90" style={inputBase} /></Field>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button type="submit" disabled={submitting} style={{ flex:1, background:done?C.sDone:C.textPrimary, color:C.bg, border:'none', borderRadius:2, padding:'10px 0', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.13em', textTransform:'uppercase', fontWeight:700, cursor:submitting?'default':'pointer', opacity:submitting?.75:1, transition:'background 0.2s' }}>
                {submitting?'⟳ Enregistrement…':done?'✓ Enregistré':'Créer et assigner'}
              </button>
              <button type="button" style={{ padding:'10px 14px', background:'transparent', color:C.textSecondary, border:`1px solid ${C.border}`, borderRadius:2, fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer' }}>Brouillon</button>
            </div>
          </form>
        </div>

        <div>
          <Mono size={9} color={C.textTertiary} block style={{ marginBottom:14 }}>États de champs</Mono>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              {l:'Par défaut', el:<input disabled placeholder="Champ vide" style={{ ...inputBase, color:C.textTertiary }} />},
              {l:'Rempli',     el:<input defaultValue="Compresseur C-12" style={inputBase} />},
              {l:'Erreur',     el:<div><input placeholder="Requis" style={{ ...inputBase, borderColor:C.pCrit }} /><div style={{ marginTop:4, fontSize:11, color:C.pCrit }}>Ce champ est requis</div></div>},
              {l:'Désactivé',  el:<input disabled value="Non modifiable" style={{ ...inputBase, opacity:.45, cursor:'not-allowed' }} />},
              {l:'Sélection',  el:<select style={inputBase}><option>CORRECTIF</option><option>PRÉVENTIF</option></select>},
              {l:'Textarea',   el:<textarea rows={2} defaultValue="Description de l'intervention…" style={{ ...inputBase, resize:'none' }} />},
            ].map(({l,el})=>(
              <div key={l}>
                <Mono size={8} color={C.textTertiary} block style={{ marginBottom:4 }}>{l}</Mono>
                {el}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 05 — STATES & FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────

function StatesSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const notifs = [
    {id:1, text:'OT-2401 assigné à M. Benali',         time:'Il y a 3 min',  unread:true},
    {id:2, text:'Validation requise — OT-2395',         time:'Il y a 12 min', unread:true},
    {id:3, text:'Rapport #RPT-142 soumis par K. Driss', time:'Il y a 1h',     unread:false},
  ];

  return (
    <div>
      <SectionHeader num="05" title="États & Retours"
        desc="Chaque état du système — chargement, vide, erreur, confirmation, notification, toast — suit le même vocabulaire visuel. Les indicateurs de notification sont intégrés à la barre de navigation (co-localisés), pas dans une cloche globale décontextualisée." />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
        <div>
          <Mono size={9} color={C.textTertiary} block style={{ marginBottom:14 }}>États de tableau</Mono>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <Mono size={8} color={C.textTertiary} block style={{ marginBottom:6 }}>Chargement</Mono>
              <div style={{ border:`1px solid ${C.border}` }}>
                <div style={{ height:30, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 16px' }}><Mono size={9} color={C.textTertiary}>Ordres de travail</Mono></div>
                <div style={{ height:60, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span style={{ width:14, height:14, border:`2px solid ${C.border}`, borderTopColor:C.textSecondary, borderRadius:'50%', display:'inline-block', animation:'sb-spin 0.8s linear infinite' }} />
                  <Mono size={9} color={C.textTertiary}>Chargement…</Mono>
                </div>
              </div>
            </div>
            <div>
              <Mono size={8} color={C.textTertiary} block style={{ marginBottom:6 }}>Résultats vides</Mono>
              <div style={{ border:`1px solid ${C.border}` }}>
                <div style={{ height:30, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 16px' }}><Mono size={9} color={C.textTertiary}>Ordres de travail</Mono></div>
                <div style={{ height:72, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                  <Mono size={9} color={C.textTertiary}>Aucun résultat</Mono>
                  <div style={{ fontSize:11, color:C.textTertiary }}>Ajuster les filtres ou créer un ordre</div>
                </div>
              </div>
            </div>
            <div>
              <Mono size={8} color={C.textTertiary} block style={{ marginBottom:6 }}>Erreur</Mono>
              <div style={{ border:`1px solid ${C.pCrit}44`, background:C.pCritBg, padding:'10px 14px', display:'flex', gap:10 }}>
                <span style={{ color:C.pCrit, fontSize:14, lineHeight:1, marginTop:1 }}>⚠</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:C.pCrit, marginBottom:2 }}>Impossible de charger les données</div>
                  <div style={{ fontSize:11, color:C.pHigh }}>Vérifiez votre connexion ou actualisez.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <Mono size={9} color={C.textTertiary} block style={{ marginBottom:14 }}>Retours & Notifications</Mono>
          <Mono size={8} color={C.textTertiary} block style={{ marginBottom:8 }}>Toasts</Mono>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
            {[
              {bg:C.sDoneBg, bc:C.sDone, icon:'✓', l:'Succès',       t:'Ordre OT-2401 créé et assigné.'},
              {bg:C.pCritBg, bc:C.pCrit, icon:'✕', l:'Erreur',        t:'Sauvegarde impossible. Réessayez.'},
              {bg:C.sWaitBg, bc:C.sWait, icon:'⚠', l:'Avertissement', t:'Doublon détecté pour cet équipement.'},
            ].map(({bg,bc,icon,l,t}) => (
              <div key={l} style={{ display:'flex', gap:10, background:bg, border:`1px solid ${bc}44`, padding:'8px 12px' }}>
                <span style={{ color:bc, fontSize:12, marginTop:1 }}>{icon}</span>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:C.textPrimary, marginBottom:1 }}>{l}</div>
                  <div style={{ fontSize:11, color:C.textSecondary }}>{t}</div>
                </div>
              </div>
            ))}
          </div>

          <Mono size={8} color={C.textTertiary} block style={{ marginBottom:8 }}>Indicateur de notification — redesigné</Mono>
          <div style={{ marginBottom:12, padding:'8px 12px', background:C.surface, border:`1px solid ${C.border}` }}>
            <Mono size={8} color={C.textTertiary} block style={{ marginBottom:6 }}>Dans le rail système (ancrage) :</Mono>
            <div style={{ display:'flex', gap:16, alignItems:'center', background:C.rail, padding:'6px 12px', height:28 }}>
              <Mono size={9} color={C.textDimRail}>14:22:07</Mono>
              <span style={{ display:'flex', alignItems:'center', gap:4, border:'1px solid #2E2C28', padding:'1px 6px' }}>
                <Mono size={8} color={C.textDimRail} tracking='0.10em'>ALERTES</Mono>
                <span style={{ background:C.pCrit, padding:'0 4px', minWidth:14, height:13, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Mono size={7} color='#fff' weight={700}>2</Mono>
                </span>
              </span>
            </div>
            <Mono size={8} color={C.textTertiary} block style={{ marginTop:6 }}>Aucune icône cloche. Texte monospace + compteur carré. Cohérent avec le rail sombre.</Mono>
          </div>

          <Mono size={8} color={C.textTertiary} block style={{ marginBottom:8 }}>Panneau de notifications</Mono>
          <div style={{ position:'relative', display:'inline-block', width:'100%' }}>
            <button onClick={()=>setNotifOpen(o=>!o)} style={{
              background:notifOpen?C.surface:'transparent', border:`1px solid ${C.border}`,
              padding:'6px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:8,
              fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em',
              textTransform:'uppercase', color:C.textSecondary, borderRadius:2,
            }}>
              <Mono size={9} color={C.textSecondary}>ALERTES</Mono>
              <span style={{ background:C.pCrit, padding:'0 5px', minWidth:16, height:14, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Mono size={7} color='#fff' weight={700}>2</Mono>
              </span>
              <Mono size={8} color={C.textTertiary}>{notifOpen?'▲':'▾'}</Mono>
            </button>
            {notifOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:C.bg, border:`1px solid ${C.border}`, zIndex:100 }}>
                <div style={{ height:36, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px' }}>
                  <Mono size={9} color={C.textSecondary}>Notifications</Mono>
                  <span style={{ cursor:'pointer' }}><Mono size={8} color={C.sOpen}>Tout marquer lu</Mono></span>
                </div>
                {notifs.map(n=>(
                  <div key={n.id} style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}`, background:n.unread?C.sOpenBg:C.bg, display:'flex', gap:8, cursor:'pointer' }}>
                    {n.unread&&<span style={{ width:5, height:5, borderRadius:'50%', background:C.sOpen, marginTop:5, flexShrink:0 }} />}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color:C.textPrimary, marginBottom:2 }}>{n.text}</div>
                      <Mono size={8} color={C.textTertiary}>{n.time}</Mono>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop:28 }}>
        <Mono size={9} color={C.textTertiary} block style={{ marginBottom:12 }}>Dialogue de confirmation</Mono>
        <button onClick={()=>setConfirmOpen(true)} style={{ background:'transparent', border:`1px solid ${C.pCrit}`, color:C.pCrit, padding:'7px 16px', borderRadius:2, cursor:'pointer', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase' }}>
          Annuler l'ordre ▸
        </button>
      </div>
      {confirmOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:10001, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:C.bg, border:`1px solid ${C.border}`, padding:24, width:360 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.textPrimary, marginBottom:8 }}>Annuler l'ordre de travail</div>
            <div style={{ fontSize:13, color:C.textSecondary, lineHeight:1.55, marginBottom:20 }}>Cette action est irréversible. L'ordre sera archivé et les techniciens notifiés.</div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={()=>setConfirmOpen(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.textSecondary, padding:'8px 14px', borderRadius:2, cursor:'pointer', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase' }}>Annuler</button>
              <button onClick={()=>setConfirmOpen(false)} style={{ background:C.pCrit, border:'none', color:C.bg, padding:'8px 16px', borderRadius:2, cursor:'pointer', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', fontWeight:700 }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <Mono size={9} color={C.textTertiary}>Cycle de vie d'un ordre de travail</Mono>
          <div style={{ flex:1, height:1, background:C.border }} />
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:0 }}>
          {([['BROUILLON',C.textTertiary,C.surface],['OUVERT',C.sOpen,C.sOpenBg],['EN COURS',C.sActive,C.sActiveBg],['EN ATTENTE',C.sWait,C.sWaitBg]] as [string,string,string][]).map(([l,c,bg],i,arr)=>(
            <div key={l} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ background:bg, borderLeft:`2px solid ${c}`, padding:'5px 12px' }}><Mono size={9} color={c}>{l}</Mono></div>
              {i<arr.length-1&&<Mono size={10} color={C.textTertiary} style={{ padding:'0 4px' }}>→</Mono>}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:0, marginTop:6, paddingLeft:152 }}>
          {([['→'],['VALIDATION EN ATTENTE',C.sWait,C.sWaitBg],['→'],['TERMINÉ',C.sDone,C.sDoneBg]] as any[]).map((item,i)=>(
            typeof item[0]==='string'&&item[0]==='→'
              ? <Mono key={i} size={10} color={C.textTertiary} style={{ padding:'0 4px' }}>→</Mono>
              : <div key={item[0]} style={{ background:item[2], borderLeft:`2px solid ${item[1]}`, padding:'5px 12px' }}><Mono size={9} color={item[1]}>{item[0]}</Mono></div>
          ))}
          <Mono size={10} color={C.textTertiary} style={{ padding:'0 8px' }}>ou</Mono>
          <div style={{ background:C.sCancelBg, borderLeft:`2px solid ${C.sCancel}`, padding:'5px 12px' }}><Mono size={9} color={C.sCancel}>ANNULÉ</Mono></div>
        </div>
      </div>

      <style>{`@keyframes sb-spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 06 — ROLES & SESSION (NEW)
// ─────────────────────────────────────────────────────────────────────────────

function RolesSection({ user, onSwitchRole }: { user: User; onSwitchRole: (r: Role) => void }) {
  const [demoUser, setDemoUser] = useState<User>({ id:'demo-1', name:'Samira H.', email:'samira@gmao.local', roles:['SUPERVISEUR','STOREKEEPER'], activeRole:'SUPERVISEUR' });

  const multiRoleScenarios: { name:string; email:string; roles:Role[]; note:string }[] = [
    { name:'Samira H.',   email:'samira@gmao.local',  roles:['SUPERVISEUR','STOREKEEPER'], note:'Supervise les OT et gère le stock simultanément' },
    { name:'Karim D.',    email:'karim@gmao.local',   roles:['TECHNICIEN','VALIDATEUR'],   note:'Intervient sur le terrain et valide les rapports' },
    { name:'Lina A.',     email:'lina@gmao.local',    roles:['SUPERVISEUR','VALIDATEUR'],  note:'Double responsabilité validation + supervision' },
    { name:'Omar B.',     email:'omar@gmao.local',    roles:['TECHNICIEN'],                note:'Rôle unique — interface simplifiée' },
  ];

  return (
    <div>
      <SectionHeader num="06" title="Rôles & Session"
        desc="Un utilisateur peut détenir plusieurs rôles simultanément. Ce n'est pas un basculement d'identité — les deux rôles sont actifs en même temps. L'interface s'adapte en exposant les actions et données correspondant au rôle contextuel choisi, sans recréer de session." />

      {/* Multi-role model diagram */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <Mono size={9} color={C.textTertiary}>Modèle de rôles multiples</Mono>
          <div style={{ flex:1, height:1, background:C.border }} />
        </div>

        {/* User → Roles → Permissions diagram */}
        <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:1, background:C.border, border:`1px solid ${C.border}` }}>
          {/* Left: user entity */}
          <div style={{ background:C.bg, padding:'20px 20px' }}>
            <Mono size={8} color={C.textTertiary} block style={{ marginBottom:10 }}>Entité utilisateur</Mono>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <span style={{ width:36, height:36, background:ROLE_COLORS[demoUser.activeRole].color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontFamily:'ui-monospace,monospace', fontSize:13, fontWeight:800, color:'#fff' }}>
                  {demoUser.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                </span>
              </span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.textPrimary }}>{demoUser.name}</div>
                <div style={{ fontSize:10, color:C.textTertiary, fontFamily:'ui-monospace,monospace' }}>{demoUser.email}</div>
              </div>
            </div>
            <div style={{ padding:'8px 10px', background:C.surface, border:`1px solid ${C.border}`, marginBottom:8 }}>
              <Mono size={8} color={C.textTertiary} block style={{ marginBottom:4 }}>Rôles assignés</Mono>
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                {demoUser.roles.map(r => (
                  <RoleBadge key={r} role={r} active={r === demoUser.activeRole} />
                ))}
              </div>
            </div>
            <div style={{ padding:'8px 10px', background:C.surface, border:`1px solid ${C.border}` }}>
              <Mono size={8} color={C.textTertiary} block style={{ marginBottom:4 }}>Rôle contextuel actif</Mono>
              <RoleBadge role={demoUser.activeRole} active />
            </div>
          </div>

          {/* Right: permissions per active role */}
          <div style={{ background:C.bg, padding:'20px 20px' }}>
            <Mono size={8} color={C.textTertiary} block style={{ marginBottom:10 }}>Permissions accordées par rôle actif</Mono>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border, marginBottom:14 }}>
              {demoUser.roles.map(role => {
                const rc = ROLE_COLORS[role];
                const isActive = role === demoUser.activeRole;
                return (
                  <div key={role} style={{ background: isActive ? rc.bg : C.surface, padding:'12px 14px', border: isActive ? `1px solid ${rc.color}33` : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                      {isActive && <span style={{ width:6, height:6, borderRadius:'50%', background:rc.color }} />}
                      <Mono size={8} color={isActive?rc.color:C.textTertiary} weight={isActive?700:500}>{role}</Mono>
                      {isActive && <Mono size={7} color={rc.color} style={{ marginLeft:'auto' }}>● ACTIF</Mono>}
                    </div>
                    {ROLE_PERMISSIONS[role].map(p => (
                      <div key={p} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3, opacity: isActive ? 1 : 0.45 }}>
                        <span style={{ fontSize:8, color:isActive?rc.color:C.textTertiary }}>{isActive?'✓':'○'}</span>
                        <span style={{ fontSize:11, color:isActive?C.textPrimary:C.textTertiary }}>{p}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Role switch controls */}
            <Mono size={8} color={C.textTertiary} block style={{ marginBottom:6 }}>Commuter le contexte actif :</Mono>
            <div style={{ display:'flex', gap:6 }}>
              {demoUser.roles.map(r => {
                const rc = ROLE_COLORS[r];
                const isActive = r === demoUser.activeRole;
                return (
                  <button key={r} onClick={() => setDemoUser(u => ({...u, activeRole: r}))} style={{
                    padding:'6px 12px',
                    background: isActive ? rc.bg : 'transparent',
                    color: isActive ? rc.color : C.textSecondary,
                    border:`1px solid ${isActive ? rc.color+'55' : C.border}`,
                    borderRadius:2, cursor:'pointer',
                    fontFamily:'ui-monospace,monospace', fontSize:9,
                    letterSpacing:'0.10em', textTransform:'uppercase',
                    fontWeight: isActive ? 700 : 400,
                    transition:'all 0.12s',
                  }}>{isActive ? '● ' : ''}{r}</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Multi-role user scenarios */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <Mono size={9} color={C.textTertiary}>Scénarios utilisateurs réels</Mono>
          <div style={{ flex:1, height:1, background:C.border }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:1, background:C.border, border:`1px solid ${C.border}` }}>
          {multiRoleScenarios.map(scenario => (
            <div key={scenario.name} style={{ background:C.bg, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ width:28, height:28, background:ROLE_COLORS[scenario.roles[0]].color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontFamily:'ui-monospace,monospace', fontSize:10, fontWeight:800, color:'#fff' }}>
                    {scenario.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </span>
                </span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary }}>{scenario.name}</div>
                  <div style={{ fontSize:10, color:C.textTertiary, fontFamily:'ui-monospace,monospace' }}>{scenario.email}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
                {scenario.roles.map(r => <RoleBadge key={r} role={r} active />)}
              </div>
              <div style={{ fontSize:11, color:C.textTertiary, lineHeight:1.5, borderLeft:`2px solid ${C.border}`, paddingLeft:8 }}>{scenario.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* UI adaptation per role */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <Mono size={9} color={C.textTertiary}>Adaptation de l'interface selon le rôle actif</Mono>
          <div style={{ flex:1, height:1, background:C.border }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:C.border, border:`1px solid ${C.border}` }}>
          {(Object.keys(ROLE_PERMISSIONS) as Role[]).map(role => {
            const rc = ROLE_COLORS[role];
            const isCurrentActive = role === user.activeRole;
            return (
              <div key={role} style={{ background: isCurrentActive ? rc.bg : C.bg, padding:'14px 14px', position:'relative' }}>
                {isCurrentActive && (
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:rc.color }} />
                )}
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:10 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:rc.color }} />
                  <Mono size={9} color={rc.color} weight={700}>{role}</Mono>
                  {isCurrentActive && <Mono size={7} color={rc.color} style={{ marginLeft:'auto' }}>Session</Mono>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {ROLE_PERMISSIONS[role].slice(0,3).map(p => (
                    <div key={p} style={{ fontSize:10, color:isCurrentActive?C.textPrimary:C.textTertiary, lineHeight:1.4 }}>· {p}</div>
                  ))}
                  {ROLE_PERMISSIONS[role].length > 3 && (
                    <Mono size={8} color={C.textTertiary}>+{ROLE_PERMISSIONS[role].length-3} autres</Mono>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop:8 }}>
          <Mono size={8} color={C.textTertiary}>↑ Rôle actif dans cette session : <span style={{ color:ROLE_COLORS[user.activeRole].color, fontWeight:700 }}>{user.activeRole}</span> — commutable via le menu profil en haut à droite</Mono>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 07 — AUTHENTICATION FLOW (NEW)
// ─────────────────────────────────────────────────────────────────────────────

function AuthSection({ isAuthenticated, user, onLogin, onLogout }: {
  isAuthenticated: boolean;
  user: User | null;
  onLogin: (u: User) => void;
  onLogout: () => void;
}) {
  const [demoEmail, setDemoEmail] = useState('');
  const [demoPass,  setDemoPass]  = useState('');
  const [logging,   setLogging]   = useState(false);
  const [loginDone, setLoginDone] = useState(false);
  const [loginErr,  setLoginErr]  = useState('');

  const DEMO_ACCOUNTS: (User & { password: string })[] = [
    { id:'u-1', name:'Samira H.',  email:'samira@gmao.local',  password:'demo1', roles:['SUPERVISEUR','STOREKEEPER'], activeRole:'SUPERVISEUR' },
    { id:'u-2', name:'Karim D.',   email:'karim@gmao.local',   password:'demo2', roles:['TECHNICIEN','VALIDATEUR'],   activeRole:'TECHNICIEN' },
    { id:'u-3', name:'Lina A.',    email:'lina@gmao.local',    password:'demo3', roles:['SUPERVISEUR','VALIDATEUR'],  activeRole:'SUPERVISEUR' },
    { id:'u-4', name:'Omar B.',    email:'omar@gmao.local',    password:'demo4', roles:['TECHNICIEN'],                activeRole:'TECHNICIEN' },
  ];

  const handleDemoLogin = (account: typeof DEMO_ACCOUNTS[0]) => {
    setLogging(true); setLoginErr('');
    setTimeout(() => {
      setLogging(false); setLoginDone(true);
      const { password:_, ...userObj } = account;
      onLogin(userObj);
      setTimeout(() => setLoginDone(false), 2000);
    }, 900);
  };

  const handleFormLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const found = DEMO_ACCOUNTS.find(a => a.email===demoEmail && a.password===demoPass);
    if (!found) { setLoginErr('Identifiants invalides. Essayez un compte de démonstration.'); return; }
    handleDemoLogin(found);
  };

  const inputBase: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'9px 12px', border:`1px solid ${C.border}`, background:C.bg, color:C.textPrimary, fontSize:13, fontFamily:'system-ui,sans-serif', outline:'none', borderRadius:2 };

  return (
    <div>
      <SectionHeader num="07" title="Authentification"
        desc="Le flux d'authentification est le point d'entrée du système. Il définit l'état de session, les rôles disponibles et l'identité affichée dans l'interface. La structure de login est intentionnellement simple : identifiants → vérification → état authentifié avec rôles chargés." />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, marginBottom:32 }}>

        {/* Login page wireframe */}
        <div>
          <Mono size={9} color={C.textTertiary} block style={{ marginBottom:12 }}>Structure de la page de connexion</Mono>
          <div style={{ border:`1px solid ${C.border}`, overflow:'hidden' }}>
            {/* Minimal rail on login page */}
            <div style={{ height:34, background:C.rail, display:'flex', alignItems:'center', padding:'0 20px' }}>
              <Mono size={11} color={C.textOnRail} tracking='0.10em' weight={700}>GMAO</Mono>
              <div style={{ flex:1 }} />
              <Mono size={8} color={C.textDimRail}>Système de gestion de maintenance</Mono>
            </div>

            {/* Login form area */}
            <div style={{ background:C.bg, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center' }}>
              <div style={{ width:'100%', maxWidth:360 }}>
                <div style={{ marginBottom:20, textAlign:'center' }}>
                  <Mono size={9} color={C.textTertiary} block style={{ marginBottom:6 }}>Authentification</Mono>
                  <div style={{ fontSize:18, fontWeight:800, color:C.textPrimary, letterSpacing:'-0.02em' }}>Connexion au système</div>
                </div>

                <form onSubmit={handleFormLogin}>
                  <div style={{ marginBottom:12 }}>
                    <Mono size={8} color={C.textSecondary} block style={{ marginBottom:5 }}>Adresse e-mail *</Mono>
                    <input
                      value={demoEmail} onChange={e=>{ setDemoEmail(e.target.value); setLoginErr(''); }}
                      placeholder="utilisateur@gmao.local"
                      style={{ ...inputBase, borderColor: loginErr ? C.pCrit : C.border }}
                    />
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <Mono size={8} color={C.textSecondary}>Mot de passe *</Mono>
                      <Mono size={8} color={C.sOpen} style={{ cursor:'pointer' }}>Mot de passe oublié ?</Mono>
                    </div>
                    <input
                      type="password" value={demoPass} onChange={e=>{ setDemoPass(e.target.value); setLoginErr(''); }}
                      placeholder="••••••••"
                      style={{ ...inputBase, borderColor: loginErr ? C.pCrit : C.border }}
                    />
                    {loginErr && <div style={{ marginTop:5, fontSize:11, color:C.pCrit }}>{loginErr}</div>}
                  </div>
                  <button type="submit" disabled={logging} style={{
                    width:'100%', background:loginDone?C.sDone:C.textPrimary, color:C.bg,
                    border:'none', padding:'11px 0', cursor:logging?'default':'pointer',
                    fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.13em',
                    textTransform:'uppercase', fontWeight:700, opacity:logging?.8:1, borderRadius:2,
                    transition:'background 0.2s',
                  }}>
                    {logging?'⟳ Vérification…':loginDone?'✓ Connecté':'Se connecter'}
                  </button>
                </form>

                {/* Visual separator */}
                <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0' }}>
                  <div style={{ flex:1, height:1, background:C.border }} />
                  <Mono size={8} color={C.textTertiary}>ou</Mono>
                  <div style={{ flex:1, height:1, background:C.border }} />
                </div>

                {/* Quick demo login */}
                <Mono size={8} color={C.textTertiary} block style={{ marginBottom:8 }}>Comptes de démonstration :</Mono>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {DEMO_ACCOUNTS.map(acct => {
                    const rc = ROLE_COLORS[acct.roles[0]];
                    return (
                      <button key={acct.id} onClick={() => handleDemoLogin(acct)} disabled={logging} style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'8px 10px', background:C.surface, border:`1px solid ${C.border}`,
                        cursor:'pointer', borderRadius:2, textAlign:'left',
                        opacity: logging ? 0.6 : 1,
                      }}
                        onMouseEnter={e=>(e.currentTarget.style.background=C.hover)}
                        onMouseLeave={e=>(e.currentTarget.style.background=C.surface)}
                      >
                        <span style={{ width:26, height:26, background:rc.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <Mono size={8} color='#fff' weight={800}>{acct.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</Mono>
                        </span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:C.textPrimary }}>{acct.name}</div>
                          <div style={{ fontSize:10, color:C.textTertiary, fontFamily:'ui-monospace,monospace' }}>{acct.email}</div>
                        </div>
                        <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'flex-end' }}>
                          {acct.roles.map(r => (
                            <span key={r} style={{ padding:'1px 5px', background:ROLE_COLORS[r].bg, border:`1px solid ${ROLE_COLORS[r].color}44`, borderRadius:2 }}>
                              <Mono size={7} color={ROLE_COLORS[r].color}>{r}</Mono>
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ height:28, background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Mono size={8} color={C.textTertiary}>Session sécurisée · Authentification interne</Mono>
            </div>
          </div>
        </div>

        {/* Auth state diagram */}
        <div>
          <Mono size={9} color={C.textTertiary} block style={{ marginBottom:12 }}>Relation état d'authentification → interface</Mono>

          {/* State machine */}
          <div style={{ display:'flex', flexDirection:'column', gap:1, marginBottom:20 }}>
            {[
              { state:'NON AUTHENTIFIÉ', color:C.pCrit, bg:C.pCritBg, desc:'Accès bloqué à toutes les vues protégées. Redirection vers la page de connexion.', ui:'Page de connexion uniquement' },
              { state:'EN COURS DE VÉRIFICATION', color:C.sWait, bg:C.sWaitBg, desc:'Credentials en cours de validation. UI bloquée avec spinner.', ui:'Bouton → état chargement' },
              { state:'AUTHENTIFIÉ', color:C.sDone, bg:C.sDoneBg, desc:'Session active. Rôles chargés. Interface complète disponible selon les permissions.', ui:'App complète + profil + rôles' },
            ].map((s,i,arr) => (
              <div key={s.state}>
                <div style={{ background:s.bg, border:`1px solid ${s.color}44`, padding:'12px 16px', display:'flex', gap:12 }}>
                  <div style={{ flexShrink:0, marginTop:2 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, display:'block' }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <Mono size={8} color={s.color} weight={700} block style={{ marginBottom:4 }}>{s.state}</Mono>
                    <div style={{ fontSize:11, color:C.textPrimary, marginBottom:4 }}>{s.desc}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <Mono size={7} color={C.textTertiary}>Interface :</Mono>
                      <Mono size={8} color={s.color}>{s.ui}</Mono>
                    </div>
                  </div>
                </div>
                {i<arr.length-1 && (
                  <div style={{ height:20, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Mono size={10} color={C.textTertiary}>↓</Mono>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Current session status */}
          <div style={{ border:`1px solid ${C.border}`, padding:'16px', marginBottom:16 }}>
            <Mono size={9} color={C.textTertiary} block style={{ marginBottom:10 }}>État de session courant (sandbox)</Mono>
            {isAuthenticated && user ? (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'10px', background:C.sDoneBg, border:`1px solid ${C.sDone}44` }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:C.sDone }} />
                  <Mono size={8} color={C.sDone} weight={700}>Session active</Mono>
                  <div style={{ flex:1 }} />
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#4AC174', display:'inline-block', animation:'sb-live 2.5s ease-in-out infinite' }} />
                  <Mono size={8} color='#4AC174'>En ligne</Mono>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border, marginBottom:12 }}>
                  {[['Utilisateur',user.name],['Email',user.email??'—'],['ID',user.id],['Rôle actif',user.activeRole]].map(([l,v])=>(
                    <div key={l} style={{ background:C.bg, padding:'8px 12px' }}>
                      <Mono size={8} color={C.textTertiary} block style={{ marginBottom:2 }}>{l}</Mono>
                      <span style={{ fontSize:11, fontFamily:'ui-monospace,monospace', color:C.textPrimary, fontWeight:500 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:10 }}>
                  <Mono size={8} color={C.textTertiary} block style={{ marginBottom:5 }}>Tous les rôles de cet utilisateur :</Mono>
                  <div style={{ display:'flex', gap:4 }}>
                    {user.roles.map(r => <RoleBadge key={r} role={r} active={r===user.activeRole} />)}
                  </div>
                </div>
                <button onClick={onLogout} style={{ width:'100%', padding:'8px', background:'transparent', border:`1px solid ${C.pCrit}55`, color:C.pCrit, cursor:'pointer', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', borderRadius:2 }}>
                  Déconnecter la session
                </button>
              </div>
            ) : (
              <div style={{ padding:'16px', background:C.pCritBg, border:`1px solid ${C.pCrit}44`, textAlign:'center' }}>
                <Mono size={9} color={C.pCrit} block style={{ marginBottom:4 }}>Non authentifié</Mono>
                <div style={{ fontSize:11, color:C.textSecondary }}>Utilisez le formulaire de connexion pour démarrer une session.</div>
              </div>
            )}
          </div>

          {/* What changes after login */}
          <div>
            <Mono size={8} color={C.textTertiary} block style={{ marginBottom:8 }}>Ce qui change après connexion :</Mono>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:C.border }}>
              {[
                ['Avant', [['Rail', 'Login uniquement'],['Sections', 'Bloquées'],['Onglets', 'Désactivés'],['Profil', 'Absent']]],
                ['Après', [['Rail', 'Profil + alertes'],['Sections', 'Toutes visibles'],['Onglets', 'Actifs'],['Profil', 'Visible + rôles']]],
              ].map(([label, rows]) => (
                <div key={label as string} style={{ background:C.bg, padding:'10px 14px' }}>
                  <Mono size={8} color={label==='Après'?C.sDone:C.pCrit} block style={{ marginBottom:6 }}>{label as string}</Mono>
                  {(rows as [string,string][]).map(([k,v])=>(
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <Mono size={8} color={C.textTertiary}>{k}</Mono>
                      <Mono size={8} color={label==='Après'?C.textPrimary:C.textTertiary} weight={label==='Après'?600:400}>{v}</Mono>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes sb-live{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [time, setTime]       = useState('——:——:——');
  const [active, setActive]   = useState('nav');
  const [notifOpen, setNotif] = useState(false);

  const [user, setUser] = useState<User | null>({
    id:'u-1', name:'Samira H.', email:'samira@gmao.local',
    roles:['SUPERVISEUR','STOREKEEPER'], activeRole:'SUPERVISEUR',
  });
  const isAuthenticated = !!user;

  const [tabs, setTabs]           = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = (t: Tab) => {
    setTabs(prev => {
      const exists = prev.find(x => x.id === t.id || (t.orderId && x.orderId === t.orderId && x.title===t.title));
      if (exists) { setActiveTabId(exists.id); return prev; }
      return [...prev, t];
    });
    setActiveTabId(t.id);
  };

  const closeTab = (id: string) => {
    setTabs(prev => {
      const next = prev.filter(t=>t.id!==id);
      if (activeTabId===id) setActiveTabId(next.length?next[next.length-1].id:null);
      return next;
    });
  };

  const switchRole = (r: Role) => {
    setUser(u => u ? { ...u, activeRole: r } : u);
    // When switching role, close tabs opened under old role context
    setTabs([]);
    setActiveTabId(null);
  };

  const logout = () => {
    setUser(null);
    setTabs([]);
    setActiveTabId(null);
    setActive('nav');
  };

  const login = (as?: User) => setUser(as ?? { id:'u-guest', name:'Invité', roles:['TECHNICIEN'], activeRole:'TECHNICIEN' });

  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0,8));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <style>{`
        @keyframes sb-live{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes sb-spin{ to { transform:rotate(360deg); } }
        * { box-sizing:border-box; }
      `}</style>
      <div style={{ position:'fixed', inset:0, background:C.bg, color:C.textPrimary, display:'flex', flexDirection:'column', fontFamily:'system-ui,-apple-system,"Segoe UI",sans-serif', overflow:'hidden', zIndex:9999 }}>

        {/* ── ANCHOR RAIL ── */}
        <div style={{ height:36, background:C.rail, display:'flex', alignItems:'center', padding:'0 24px', gap:20, flexShrink:0 }}>
          <Mono size={11} color={C.textOnRail} tracking='0.10em' weight={700}>GMAO · Sandbox</Mono>
          <div style={{ flex:1, height:1, background:'#2E2C28' }} />
          <Mono size={9} color={C.textDimRail} tracking='0.08em'>{time}</Mono>

          {/* Live indicator */}
          <span style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#4AC174', display:'inline-block', animation:'sb-live 2.5s ease-in-out infinite' }} />
            <Mono size={9} color='#4AC174'>EN LIGNE</Mono>
          </span>

          {/* Notifications */}
          <div style={{ position:'relative' }}>
            <button onClick={()=>setNotif(o=>!o)} style={{
              display:'flex', alignItems:'center', gap:5,
              border:'1px solid #2E2C28', padding:'2px 8px',
              background:notifOpen?'#2A2825':'transparent', cursor:'pointer',
            }}>
              <Mono size={8} color={C.textDimRail} tracking='0.10em'>ALERTES</Mono>
              <span style={{ background:C.pCrit, padding:'0 4px', height:14, display:'flex', alignItems:'center', justifyContent:'center', minWidth:16 }}>
                <Mono size={7} color='#fff' weight={700}>2</Mono>
              </span>
            </button>
            {notifOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, width:288, background:C.bg, border:`1px solid ${C.border}`, zIndex:10002, boxShadow:'0 4px 20px rgba(0,0,0,0.10)' }}>
                <div style={{ height:36, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px' }}>
                  <Mono size={9} color={C.textSecondary}>Notifications</Mono>
                  <span style={{ cursor:'pointer' }}><Mono size={8} color={C.sOpen}>Tout marquer lu</Mono></span>
                </div>
                {[
                  {text:'OT-2401 assigné à M. Benali',  time:'3 min',  unread:true},
                  {text:'Validation requise — OT-2395',  time:'12 min', unread:true},
                  {text:'Rapport #RPT-142 soumis',       time:'1h',     unread:false},
                ].map((n,i)=>(
                  <div key={i} style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}`, background:n.unread?C.sOpenBg:C.bg, display:'flex', gap:8, cursor:'pointer' }}
                    onClick={()=>setNotif(false)}>
                    {n.unread&&<span style={{ width:5, height:5, borderRadius:'50%', background:C.sOpen, marginTop:5, flexShrink:0 }} />}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color:C.textPrimary, marginBottom:2 }}>{n.text}</div>
                      <Mono size={8} color={C.textTertiary}>Il y a {n.time}</Mono>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ width:1, height:16, background:'#2E2C28' }} />

          {/* Profile dropdown (only when authenticated) */}
          {isAuthenticated && user ? (
            <ProfileDropdown user={user} onSwitchRole={switchRole} onLogout={logout} />
          ) : (
            <Mono size={9} color={C.textDimRail}>Non connecté</Mono>
          )}

          <div style={{ width:1, height:16, background:'#2E2C28' }} />
          <a href="/" style={{ textDecoration:'none' }}><Mono size={9} color={C.textDimRail}>← Retour</Mono></a>
        </div>

        {/* ── SECTION TABS ── */}
        <div style={{ height:42, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'stretch', flexShrink:0 }}>
          {SECTIONS.map(s => {
            const isActive = active === s.id;
            return (
              <button key={s.id} onClick={()=>{ if(isAuthenticated || s.id==='auth') setActive(s.id); }} style={{
                display:'flex', alignItems:'center', gap:7,
                padding:'0 20px',
                borderRight:`1px solid ${C.border}`,
                borderBottom:`2px solid ${isActive ? C.textPrimary : 'transparent'}`,
                borderLeft:'none', borderTop:'none',
                background: isActive ? C.bg : 'transparent',
                cursor: isAuthenticated || s.id==='auth' ? 'pointer' : 'default',
                outline:'none',
                opacity: !isAuthenticated && s.id!=='auth' ? 0.4 : 1,
              }}>
                <Mono size={8} color={C.textTertiary} tracking='0.10em'>{s.num}</Mono>
                <Mono size={9} color={isActive ? C.textPrimary : C.textSecondary} weight={isActive ? 600 : 400} tracking='0.06em'>{s.label}</Mono>
              </button>
            );
          })}
        </div>

        {/* ── CONTEXTUAL TABS (opened by list actions) ── */}
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'6px 24px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{ display:'flex', gap:6, alignItems:'center', overflowX:'auto', paddingBottom:2 }}>
            {tabs.length===0 && <Mono size={9} color={C.textTertiary}>Aucun onglet contextuel ouvert</Mono>}
            {tabs.map(t => (
              <div key={t.id} onClick={()=>setActiveTabId(t.id)} style={{
                display:'flex', alignItems:'center', gap:8, padding:'5px 10px',
                background: activeTabId===t.id ? C.bg : 'transparent',
                border:`1px solid ${activeTabId===t.id ? C.borderStrong : C.border}`,
                cursor:'pointer', flexShrink:0,
              }}>
                {t.roleContext && (
                  <span style={{ width:6, height:6, borderRadius:'50%', background:ROLE_COLORS[t.roleContext].color, flexShrink:0 }} />
                )}
                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>
                  <Mono size={9} color={activeTabId===t.id?C.textPrimary:C.textSecondary}>{t.title}</Mono>
                </div>
                <button onClick={(e)=>{ e.stopPropagation(); closeTab(t.id); }} style={{ background:'transparent', border:'none', cursor:'pointer', marginLeft:2 }}>
                  <Mono size={8} color={C.textTertiary}>✕</Mono>
                </button>
              </div>
            ))}
          </div>
          <div style={{ flex:1 }} />
          {isAuthenticated && user && (
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <Mono size={8} color={C.textTertiary}>Rôle actif :</Mono>
              <RoleBadge role={user.activeRole} active />
            </div>
          )}
        </div>

        {/* Active tab preview */}
        {activeTabId && (
          <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, padding:'8px 24px', minHeight:64, maxHeight:160, overflowY:'auto' }}>
            <div style={{ maxWidth:1100 }}>{tabs.find(t=>t.id===activeTabId)?.content ?? <Mono size={9} color={C.textTertiary}>Onglet vide</Mono>}</div>
          </div>
        )}

        {/* ── CONTENT ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'36px 40px' }}>
          {!isAuthenticated && active !== 'auth' ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
              <div style={{ width:480, border:`1px solid ${C.border}`, background:C.bg, padding:32, textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12, color:C.textTertiary }}>🔒</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.textPrimary, marginBottom:8 }}>Accès restreint</div>
                <div style={{ fontSize:13, color:C.textSecondary, lineHeight:1.6, marginBottom:20 }}>
                  Cette section nécessite une authentification. Connectez-vous pour accéder à l'interface complète.
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                  <button onClick={()=>setActive('auth')} style={{ padding:'9px 20px', background:C.textPrimary, color:C.bg, border:'none', cursor:'pointer', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', fontWeight:700, borderRadius:2 }}>
                    Aller à la connexion
                  </button>
                  <button onClick={()=>login({ id:'u-1', name:'Samira H.', email:'samira@gmao.local', roles:['SUPERVISEUR','STOREKEEPER'], activeRole:'SUPERVISEUR' })} style={{ padding:'9px 20px', background:'transparent', color:C.textPrimary, border:`1px solid ${C.border}`, cursor:'pointer', fontFamily:'ui-monospace,monospace', fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', borderRadius:2 }}>
                    Connexion rapide (démo)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {active==='nav'       && <NavSection />}
              {active==='data'      && <DataSection activeRole={user?.activeRole} />}
              {active==='analytics' && <AnalyticsSection />}
              {active==='forms'     && <FormsSection />}
              {active==='states'    && <StatesSection />}
              {active==='roles'     && user && <RolesSection user={user} onSwitchRole={switchRole} />}
              {active==='auth'      && <AuthSection isAuthenticated={isAuthenticated} user={user} onLogin={login} onLogout={logout} />}
            </>
          )}
        </div>

      </div>
    </>
  );
}