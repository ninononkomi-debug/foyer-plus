import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import { X, ChevronLeft, ChevronRight, Camera, Trash2, Image as ImageIcon } from 'lucide-react';
import { money, monthLabel, monthShort, addMonths, num, today } from '../lib/format.js';
import { useStore } from '../lib/store.js';
import { categoriesMap, catInfo } from '../lib/compute.js';
import { WALLET_TYPES } from '../lib/defaults.js';

// ---------- Toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = (m, kind = 'ok') => {
    setMsg({ m, kind });
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2600);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className={`toast toast-${msg.kind}`} role="status">{msg.m}</div>}
    </ToastCtx.Provider>
  );
}

// ---------- Bottom sheet ----------
export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    window.__sheetClose = onClose;
    return () => { window.removeEventListener('keydown', h); window.__sheetClose = null; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={22} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ text, onYes, onNo, yes = 'Supprimer' }) {
  return (
    <div className="sheet-backdrop center" onClick={onNo}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="row gap end">
          <button className="btn ghost" onClick={onNo}>Annuler</button>
          <button className="btn danger" onClick={onYes}>{yes}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Éléments ----------
export const Money = ({ v, sign, className = '' }) => {
  const n = num(v);
  const cls = sign ? (n < 0 ? 'neg' : n > 0 ? 'pos' : '') : '';
  return <span className={`money ${cls} ${className}`}>{sign && n > 0 ? '+' : ''}{money(n)}</span>;
};

export function Progress({ value, color, danger }) {
  const p = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="progress"><div style={{ width: `${p * 100}%`, background: danger && value > 1 ? 'var(--danger)' : color || 'var(--grad)' }} /></div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function MonthNav({ value, onChange }) {
  return (
    <div className="monthnav">
      <button className="icon-btn" onClick={() => onChange(addMonths(value, -1))} aria-label="Mois précédent"><ChevronLeft size={20} /></button>
      <span>{monthLabel(value)}</span>
      <button className="icon-btn" onClick={() => onChange(addMonths(value, 1))} aria-label="Mois suivant"><ChevronRight size={20} /></button>
    </div>
  );
}

export const Empty = ({ icon = '✨', title, text, action }) => (
  <div className="empty">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    {action}
  </div>
);

export function Donut({ data, size = 150, label, sub }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 56, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" className="donut" role="img" aria-label={label}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--track)" strokeWidth="16" />
      {total > 0 && data.map((d, i) => {
        const len = (d.value / total) * c;
        const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="16"
          strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
        acc += len;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" className="donut-l">{label}</text>
      <text x="70" y="86" textAnchor="middle" className="donut-s">{sub}</text>
    </svg>
  );
}

export function Bars({ months }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.revenus, m.depenses]));
  return (
    <div className="bars">
      {months.map((m) => (
        <div className="bar-col" key={m.mk}>
          <div className="bar-pair">
            <div className="bar rev" style={{ height: `${(m.revenus / max) * 100}%` }} title={`Revenus ${money(m.revenus)}`} />
            <div className="bar dep" style={{ height: `${(m.depenses / max) * 100}%` }} title={`Dépenses ${money(m.depenses)}`} />
          </div>
          <span>{monthShort(m.mk)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Champs de formulaire ----------
export function Field({ label, children, help, error }) {
  return (
    <label className="field">
      <span className="field-l">{label}</span>
      {children}
      {help && <small className="help">{help}</small>}
      {error && <small className="err">{error}</small>}
    </label>
  );
}

export function MoneyInput({ value, onChange, autoFocus, placeholder = '0' }) {
  const fmt = (v) => (v === '' || v === undefined || v === null ? '' : new Intl.NumberFormat('fr-FR').format(num(v)).replace(/ | /g, ' '));
  return (
    <div className="money-input">
      <input inputMode="decimal" autoFocus={autoFocus} placeholder={placeholder} value={fmt(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d,.]/g, '');
          onChange(raw === '' ? '' : num(raw));
        }} />
      <span>FCFA</span>
    </div>
  );
}

export function WalletSelect({ value, onChange, shared, allowEmpty, label = 'Porte-monnaie' }) {
  const s = useStore();
  const ws = s.list('portefeuille').filter((w) => w.data.actif !== false).sort((a, b) => (a.household_id ? 1 : 0) - (b.household_id ? 1 : 0) || a.data.nom.localeCompare(b.data.nom));
  return (
    <Field label={label}>
      <div className="chips">
        {allowEmpty && <button type="button" className={`chip ${!value ? 'on' : ''}`} onClick={() => onChange('')}>Aucun</button>}
        {ws.map((w) => {
          const t = WALLET_TYPES.find((x) => x[0] === w.data.type) || WALLET_TYPES[4];
          return (
            <button type="button" key={w.id} className={`chip ${value === w.id ? 'on' : ''}`} onClick={() => onChange(w.id)}>
              {t[2]} {w.data.nom}{w.household_id ? ' · foyer' : ''}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function CategorySelect({ value, onChange, type = 'depense' }) {
  const s = useStore();
  const map = categoriesMap(s);
  let cats = Object.values(map).filter((c) => c.type === type);
  return (
    <Field label={type === 'revenu' ? 'Source' : 'Catégorie'}>
      <div className="cat-grid">
        {cats.map((c) => (
          <button type="button" key={c.nom} className={`cat ${value === c.nom ? 'on' : ''}`} onClick={() => onChange(c.nom)} style={{ '--c': c.couleur }}>
            <span className="cat-i">{c.icone}</span>
            <span className="cat-n">{c.nom}</span>
          </button>
        ))}
      </div>
    </Field>
  );
}

export function SpaceSelect({ value, onChange, disabled }) {
  const s = useStore();
  if (!s.householdId) return null;
  return (
    <Field label="Visible par" help={value ? 'Votre conjoint verra et pourra modifier cette ligne.' : 'Visible par vous seule.'}>
      <Segmented value={value ? 'f' : 'p'} onChange={(v) => !disabled && onChange(v === 'f')} options={[['p', '🔒 Moi seule'], ['f', '🏠 Foyer']]} />
    </Field>
  );
}

export function PhotoInput({ value, pending, onChange }) {
  const s = useStore();
  const ref = useRef();
  const ref2 = useRef();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (pending) setUrl(pending);
    else if (value && s.user && !s.user.local) {
      import('../lib/supabase.js').then(({ supabase }) =>
        supabase?.storage.from('recus').createSignedUrl(value, 3600).then(({ data }) => alive && setUrl(data?.signedUrl || null)));
    } else setUrl(null);
    return () => { alive = false; };
  }, [value, pending]);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    onChange({ pending: await compressImage(f) });
  };
  return (
    <Field label="Photo du reçu">
      {url ? (
        <div className="photo">
          <img src={url} alt="Reçu" onClick={() => window.open(url, '_blank')} />
          <button type="button" className="icon-btn danger" onClick={() => onChange({ remove: true })} aria-label="Retirer la photo"><Trash2 size={18} /></button>
        </div>
      ) : (
        <div className="row gap">
          <button type="button" className="btn ghost grow" onClick={() => ref.current.click()}><Camera size={18} /> Photo</button>
          <button type="button" className="btn ghost grow" onClick={() => ref2.current.click()}><ImageIcon size={18} /> Galerie</button>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={ref2} type="file" accept="image/*" hidden onChange={pick} />
    </Field>
  );
}

export function compressImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    fr.onerror = reject;
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// ---------- Formulaire générique ----------
// fields: [{k, label, type, options, required, help, show(d), placeholder, def}]
export function RecordForm({ title, module, fields, rec, defaults = {}, onClose, sharedDefault = false, lockShared, onSaved, extraDelete = true, validate }) {
  const s = useStore();
  const toast = useToast();
  const [d, setD] = useState(() => {
    const base = {};
    fields.forEach((f) => { if (f.def !== undefined) base[f.k] = typeof f.def === 'function' ? f.def() : f.def; });
    return { ...base, ...defaults, ...(rec?.data || {}) };
  });
  const [shared, setShared] = useState(rec ? !!rec.household_id : (lockShared !== undefined ? lockShared : sharedDefault && !!s.householdId));
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState(null);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    for (const f of fields) {
      if (f.show && !f.show(d)) continue;
      if (f.required && (d[f.k] === undefined || d[f.k] === '' || d[f.k] === null)) { setErr(`« ${f.label} » est obligatoire`); return; }
    }
    if (validate) { const m = validate(d); if (m) { setErr(m); return; } }
    const saved = s.save(module, d, { id: rec?.id, shared: lockShared !== undefined ? lockShared : shared });
    toast(rec ? 'Modifié ✓' : 'Enregistré ✓');
    onSaved && onSaved(saved);
    onClose();
  };

  return (
    <Sheet title={title} onClose={onClose}
      footer={
        <div className="row gap">
          {rec && extraDelete && <button className="btn ghost danger-t" onClick={() => setConfirm(true)}><Trash2 size={18} /></button>}
          <button className="btn primary grow" onClick={submit}>{rec ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      }>
      {fields.map((f) => (f.show && !f.show(d) ? null : <FieldRenderer key={f.k} f={f} d={d} up={up} />))}
      {lockShared === undefined && <SpaceSelect value={shared} onChange={setShared} />}
      {err && <div className="alert danger">{err}</div>}
      {confirm && <Confirm text="Supprimer cette ligne ?" onNo={() => setConfirm(false)} onYes={() => { s.remove(rec.id); toast('Supprimé'); onClose(); }} />}
    </Sheet>
  );
}

function FieldRenderer({ f, d, up }) {
  const v = d[f.k];
  switch (f.type) {
    case 'money':
      return <Field label={f.label} help={f.help}><MoneyInput value={v} onChange={(x) => up(f.k, x)} autoFocus={f.autoFocus} /></Field>;
    case 'number':
      return <Field label={f.label} help={f.help}><input type="number" inputMode="decimal" value={v ?? ''} onChange={(e) => up(f.k, e.target.value === '' ? '' : Number(e.target.value))} placeholder={f.placeholder} /></Field>;
    case 'date':
      return <Field label={f.label} help={f.help}><input type="date" value={v || ''} onChange={(e) => up(f.k, e.target.value)} /></Field>;
    case 'month':
      return <Field label={f.label} help={f.help}><input type="month" value={v || ''} onChange={(e) => up(f.k, e.target.value)} /></Field>;
    case 'textarea':
      return <Field label={f.label} help={f.help}><textarea rows={3} value={v || ''} onChange={(e) => up(f.k, e.target.value)} placeholder={f.placeholder} /></Field>;
    case 'select':
      return (
        <Field label={f.label} help={f.help}>
          {f.chips ? (
            <div className="chips">
              {f.options.map(([ov, ol]) => <button type="button" key={ov} className={`chip ${v === ov ? 'on' : ''}`} onClick={() => up(f.k, ov)}>{ol}</button>)}
            </div>
          ) : (
            <select value={v ?? ''} onChange={(e) => up(f.k, e.target.value)}>
              {!f.required && <option value="">—</option>}
              {f.options.map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
            </select>
          )}
        </Field>
      );
    case 'toggle':
      return (
        <label className="toggle-row">
          <span>{f.label}{f.help && <small>{f.help}</small>}</span>
          <input type="checkbox" className="switch" checked={v !== false && !!(v ?? f.defOn)} onChange={(e) => up(f.k, e.target.checked)} />
        </label>
      );
    case 'wallet':
      return <WalletSelect value={v} onChange={(x) => up(f.k, x)} allowEmpty={!f.required} label={f.label} />;
    case 'category':
      return <CategorySelect value={v} onChange={(x) => up(f.k, x)} type={f.catType || 'depense'} />;
    case 'photo':
      return <PhotoInput value={d.photo} pending={d._photo_pending} onChange={(r) => {
        if (r.pending) up('_photo_pending', r.pending);
        if (r.remove) { up('_photo_pending', undefined); up('photo', undefined); }
      }} />;
    case 'custom':
      return f.render(d, up);
    default:
      return <Field label={f.label} help={f.help}><input type="text" value={v || ''} onChange={(e) => up(f.k, e.target.value)} placeholder={f.placeholder} autoFocus={f.autoFocus} /></Field>;
  }
}

export function CatBadge({ name }) {
  const s = useStore();
  const c = catInfo(categoriesMap(s), name);
  return <span className="cat-badge" style={{ '--c': c.couleur }}>{c.icone}</span>;
}

export function ScreenHead({ title, onBack, right, sub }) {
  return (
    <header className="screen-head">
      {onBack && <button className="icon-btn" onClick={onBack} aria-label="Retour"><ChevronLeft size={24} /></button>}
      <div className="grow"><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {right}
    </header>
  );
}

export const Fab = ({ onClick, label = 'Ajouter', icon }) => (
  <button className="fab" onClick={onClick} aria-label={label}>{icon || '+'}</button>
);

export const SharedTag = ({ rec }) => {
  const s = useStore();
  if (!rec.household_id) return null;
  const who = rec.owner_id !== s.user?.id ? ` · ${s.nameOf(rec.owner_id)}` : '';
  return <span className="tag">🏠 Foyer{who}</span>;
};

export { today };
