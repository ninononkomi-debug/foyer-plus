import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './security.js';
import { flows, inScope, monthStats, budgetStatus, detteReste, loyerMois, walletBalances, omStats } from './compute.js';
import { num, monthKey, monthLabel, dateFr, money, today } from './format.js';

function scopeLabel(r) { return r.household_id ? 'Foyer' : 'Perso'; }

async function deliver(base64, filename, mime) {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Enregistrer ou partager' });
    return;
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportExcel(store) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const w = (id) => store.getRec(id)?.data.nom || '';
  const add = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Aucune donnée' }]);
    const keys = Object.keys(rows[0] || { Info: 1 });
    ws['!cols'] = keys.map((k) => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const by = (m, f) => store.list(m).sort((a, b) => String(a.data.date || '').localeCompare(String(b.data.date || ''))).map(f);
  add('DEPENSES', by('depense', (r) => ({ Date: r.data.date, Catégorie: r.data.categorie, Description: r.data.description || '', Montant: num(r.data.montant), 'Porte-monnaie': w(r.data.portefeuille), Espace: scopeLabel(r), Saisi_par: store.nameOf(r.owner_id), Mois: monthKey(r.data.date), Année: String(r.data.date).slice(0, 4), Note: r.data.note || '' })));
  add('REVENUS', by('revenu', (r) => ({ Date: r.data.date, Source: r.data.categorie, Description: r.data.description || '', Montant: num(r.data.montant), 'Porte-monnaie': w(r.data.portefeuille), Espace: scopeLabel(r) })));
  add('TRANSFERTS', by('transfert', (r) => ({ Date: r.data.date, De: w(r.data.de), Vers: w(r.data.vers), Montant: num(r.data.montant) })));
  const bal = walletBalances(store);
  add('PORTE-MONNAIE', store.list('portefeuille').map((r) => ({ Nom: r.data.nom, Type: r.data.type, 'Solde de départ': num(r.data.solde_initial), 'Solde actuel': bal[r.id] || 0, Espace: scopeLabel(r) })));
  const mk = monthKey(today());
  add('BUDGET', budgetStatus(store, mk).map((b) => ({ Catégorie: b.categorie, Budget: b.montant, [`Dépensé ${monthLabel(mk)}`]: b.depense, Reste: b.reste, Espace: scopeLabel(b.rec) })));
  add('OBJECTIFS', store.list('objectif').map((o) => {
    const v = store.list('epargne').filter((e) => e.data.objectif === o.id).reduce((s, e) => s + num(e.data.montant), 0) + num(o.data.deja);
    return { Objectif: o.data.nom, Cible: num(o.data.cible), Épargné: v, Reste: num(o.data.cible) - v, Échéance: o.data.echeance || '' };
  }));
  add('EPARGNE', by('epargne', (r) => ({ Date: r.data.date, Origine: r.data.origine || '', Objectif: store.getRec(r.data.objectif)?.data.nom || '', Montant: num(r.data.montant) })));
  add('TONTINES', store.list('tontine').map((r) => ({ Nom: r.data.nom, Cotisation: num(r.data.cotisation), Fréquence: r.data.frequence, Prochaine: r.data.prochaine || '', 'Mon tour': r.data.mon_tour || '', 'À recevoir': num(r.data.a_recevoir), 'Total cotisé': (r.data.historique || []).reduce((s, h) => s + num(h.montant), 0) })));
  add('ABONNEMENTS', store.list('abonnement').map((r) => ({ Nom: r.data.nom, Montant: num(r.data.montant), Fréquence: r.data.frequence, 'Prochaine échéance': r.data.prochaine || '', Actif: r.data.actif === false ? 'Non' : 'Oui' })));
  if (store.list('om_vente').some((r) => r.owner_id === store.user.id)) {
    add('OrlyMarket ventes', by('om_vente', (r) => ({ Date: r.data.date, Client: r.data.client, Produit: r.data.produit, Quantité: num(r.data.quantite) || 1, 'Montant facturé': num(r.data.facture), 'Montant fournisseur': num(r.data.fournisseur), Frais: num(r.data.frais), Bénéfice: num(r.data.facture) - num(r.data.fournisseur) - num(r.data.frais), 'Statut paiement': { paye: 'Payé', partiel: 'Partiel', impaye: 'Non payé' }[r.data.statut] || '' })));
    const p = store.list('om_param')[0]?.data.pct || { epargne: 30, reinvest: 40, perso: 20, tontine: 10 };
    add('OrlyMarket repartition', by('om_vente', (r) => {
      const b = num(r.data.facture) - num(r.data.fournisseur) - num(r.data.frais);
      const part = (k) => Math.round((b * num(p[k])) / 100);
      return { Date: r.data.date, Client: r.data.client, Bénéfice: b, Épargne: part('epargne'), Réinvestissement: part('reinvest'), 'Dépenses perso': part('perso'), Tontine: part('tontine') };
    }));
  }
  const rows = [];
  for (const l of store.list('locataire')) {
    const months = [...new Set(store.list('loyer').filter((p) => p.data.locataire === l.id).map((p) => p.data.mois).concat([mk]))].sort();
    for (const m of months) {
      const s = loyerMois(store, l, m);
      const last = store.list('loyer').filter((p) => p.data.locataire === l.id && p.data.mois === m).sort((a, b) => b.data.date.localeCompare(a.data.date))[0];
      rows.push({ Mois: m, Locataire: l.data.nom, Logement: l.data.logement || '', 'Loyer attendu': s.attendu, 'Montant payé': s.paye, Reste: s.reste, 'Date paiement': last?.data.date || '' });
    }
  }
  add('SUIVI_LOCATAIRE', rows);
  add('PATRIMOINE', store.list('patrimoine').map((r) => ({ Actif: r.data.actif, 'Valeur actuelle': num(r.data.valeur), 'Date mise à jour': r.data.date || '' })));
  add('DETTES_CREANCES', store.list('dette').map((r) => ({ Personne: r.data.personne, Type: r.data.type === 'creance' ? 'Créance' : 'Dette', Montant: num(r.data.montant), Reste: detteReste(r), Date: r.data.date || '', Échéance: r.data.echeance || '', Motif: r.data.motif || '' })));
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await deliver(b64, `Foyer+_export_${today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function exportPdf(store, mk, scope = 'tout') {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = (v) => money(v).replace(/ | /g, ' ');
  const violet = [124, 58, 237], rose = [236, 72, 153];
  doc.setFillColor(...violet);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setFillColor(...rose);
  doc.rect(140, 0, 70, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('Foyer+', 14, 14);
  doc.setFontSize(11);
  doc.text(`Relevé de ${monthLabel(mk)}${scope === 'perso' ? ' · Personnel' : scope === 'foyer' ? ' · Foyer' : ''}`, 14, 22);
  doc.text(`Édité le ${dateFr(today())}`, 196, 22, { align: 'right' });
  doc.setTextColor(30, 30, 46);
  const st = monthStats(store, mk, scope);
  autoTable(doc, {
    startY: 38, theme: 'grid', head: [['Revenus', 'Dépenses', 'Solde']],
    body: [[M(st.revenus), M(st.depenses), M(st.solde)]],
    headStyles: { fillColor: violet }, styles: { halign: 'center', fontSize: 12 },
  });
  const cats = Object.entries(st.parCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8, head: [['Catégorie', 'Montant', '%']],
      body: cats.map(([c, v]) => [c, M(v), `${st.depenses ? Math.round((v / st.depenses) * 100) : 0} %`]),
      headStyles: { fillColor: rose }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
  }
  const bs = budgetStatus(store, mk, scope);
  if (bs.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8, head: [['Budget', 'Plafond', 'Dépensé', 'Reste']],
      body: bs.map((b) => [b.categorie, M(b.montant), M(b.depense), M(b.reste)]),
      headStyles: { fillColor: violet }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (d) => { if (d.section === 'body' && d.column.index === 3 && bs[d.row.index].reste < 0) d.cell.styles.textColor = [220, 38, 38]; },
    });
  }
  const w = (id) => store.getRec(id)?.data.nom || '';
  const ops = flows(store).filter((f) => f.date && monthKey(f.date) === mk && inScope(f.rec, scope) && (f.kind === 'depense' || f.kind === 'revenu' || f.kind === 'loyer'))
    .sort((a, b) => a.date.localeCompare(b.date));
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8, head: [['Date', 'Libellé', 'Catégorie', 'Porte-monnaie', 'Montant']],
    body: ops.map((f) => [dateFr(f.date), f.label || '', f.categorie || '', w(f.wallet), M(f.montant)]),
    headStyles: { fillColor: violet }, styles: { fontSize: 9 }, columnStyles: { 4: { halign: 'right' } },
    didParseCell: (d) => { if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = ops[d.row.index].montant < 0 ? [220, 38, 38] : [5, 150, 105]; },
  });
  if (scope !== 'foyer') {
    const om = omStats(store, mk);
    if (om.nb) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8, head: [['OrlyMarket', 'Ventes', "Chiffre d'affaires", 'Bénéfice', 'Impayés']],
        body: [[monthLabel(mk), om.nb, M(om.ca), M(om.benefice), M(om.impaye)]], headStyles: { fillColor: rose },
      });
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Foyer+ · page ${i}/${pages}`, 105, 290, { align: 'center' });
  }
  const b64 = doc.output('datauristring').split(',')[1];
  await deliver(b64, `Foyer+_releve_${mk}.pdf`, 'application/pdf');
}
