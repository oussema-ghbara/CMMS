import PDFDocument = require('pdfkit');

type Analytics = {
  periodDays: number;
  categoryId: string | null;
  summary: {
    total: number;
    open: number;
    overdue: number;
    closedThisPeriod: number;
    cancelledThisPeriod: number;
    resolutionRate: number | null;
  };
  avgResolutionDays: number | null;
  costSummary: { laborCost: number; partsCost: number; contractorCost: number; totalCost: number };
  assetKpis: {
    globalMtbfDays: number | null;
    globalMttrHours: number | null;
    topByFailureFrequency: Array<{ assetName: string; failureCount: number; lastFailureDate: string }>;
    topByCost: Array<{ assetName: string; totalCost: number }>;
  };
  technicianKpis: Array<{
    technicianName: string;
    closedWoCount: number;
    firstPassRate: number | null;
    avgDurationMinutes: number | null;
  }>;
  requesterAnalytics: {
    totalReportsSubmitted: number;
    conversionRate: number | null;
    reportToActionAvgDays: number | null;
    reportAccuracyRate: number | null;
  };
  preventivePlanEfficiency: {
    complianceRate: number | null;
    anomalyRate: number | null;
    postPreventiveCorrectiveRate: number | null;
    postPreventiveCorrectiveWindowDays: number;
    totalPreventiveWOs: number;
    closedPreventiveWOs: number;
  };
  operationalOverview: {
    reassignmentCount: number;
    avgHoldPeriodsPerWo: number | null;
    sourceDistribution: Record<string, number>;
  };
};

function cur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

function pct(value: number | null): string {
  if (value === null) return 'N/A';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value * 100)} %`;
}

function num(value: number | null, unit = ''): string {
  if (value === null) return 'N/A';
  const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

function heading(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.moveDown(0.8);
  doc.fontSize(12).font('Helvetica-Bold').text(title);
  doc.font('Helvetica').moveDown(0.3);
}

function kv(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  doc.fontSize(10).text(`${label} : ${value}`);
}

export function buildAnalyticsPdf(analytics: Analytics): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('Synthèse analytique maintenance');
    doc.font('Helvetica').moveDown(0.5);
    doc.fontSize(10).fillColor('#555555')
      .text(`Période : ${analytics.periodDays} jours`)
      .text(`Catégorie : ${analytics.categoryId ?? 'Toutes'}`)
      .text(`Généré le : ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })}`);
    doc.fillColor('#000000');

    heading(doc, 'Indicateurs globaux');
    doc.fontSize(10)
      .text(`Total OT : ${analytics.summary.total}`)
      .text(`OT ouverts : ${analytics.summary.open}`)
      .text(`OT en retard : ${analytics.summary.overdue}`)
      .text(`OT clôturés (période) : ${analytics.summary.closedThisPeriod}`)
      .text(`OT annulés (période) : ${analytics.summary.cancelledThisPeriod}`)
      .text(`Taux de clôture : ${pct(analytics.summary.resolutionRate)}`)
      .text(`Durée moy. de résolution : ${num(analytics.avgResolutionDays, 'jour(s)')}`)
      .text(`MTBF moyen : ${num(analytics.assetKpis.globalMtbfDays, 'jour(s)')}`)
      .text(`MTTR moyen : ${num(analytics.assetKpis.globalMttrHours, 'heure(s)')}`);

    heading(doc, 'Coûts de maintenance');
    kv(doc, 'Main-d\'œuvre', cur(analytics.costSummary.laborCost));
    kv(doc, 'Pièces', cur(analytics.costSummary.partsCost));
    kv(doc, 'Sous-traitance', cur(analytics.costSummary.contractorCost));
    doc.fontSize(10).font('Helvetica-Bold').text(`Total : ${cur(analytics.costSummary.totalCost)}`);
    doc.font('Helvetica');

    heading(doc, 'Top équipements – pannes (max 10)');
    if (analytics.assetKpis.topByFailureFrequency.length === 0) {
      doc.fontSize(10).text('Aucune donnée sur la période.');
    } else {
      analytics.assetKpis.topByFailureFrequency.slice(0, 10).forEach((item, i) => {
        doc.fontSize(10).text(
          `${i + 1}. ${item.assetName} — pannes : ${item.failureCount} — dernière panne : ${localDate(item.lastFailureDate)}`,
        );
      });
    }

    heading(doc, 'Top équipements – coût (max 10)');
    if (analytics.assetKpis.topByCost.length === 0) {
      doc.fontSize(10).text('Aucune donnée sur la période.');
    } else {
      analytics.assetKpis.topByCost.slice(0, 10).forEach((item, i) => {
        doc.fontSize(10).text(`${i + 1}. ${item.assetName} — ${cur(item.totalCost)}`);
      });
    }

    heading(doc, 'Performance techniciens (max 10)');
    if (analytics.technicianKpis.length === 0) {
      doc.fontSize(10).text('Aucune donnée sur la période.');
    } else {
      analytics.technicianKpis.slice(0, 10).forEach((tech) => {
        doc.fontSize(10).text(
          `${tech.technicianName} — OT clôturés : ${tech.closedWoCount}` +
          ` | 1er passage : ${pct(tech.firstPassRate)}` +
          ` | Durée moy. : ${num(tech.avgDurationMinutes !== null ? tech.avgDurationMinutes / 60 : null, 'h')}`,
        );
      });
    }

    heading(doc, 'Analytiques signalements');
    kv(doc, 'Signalements soumis', String(analytics.requesterAnalytics.totalReportsSubmitted));
    kv(doc, 'Taux de conversion', pct(analytics.requesterAnalytics.conversionRate));
    kv(doc, 'Délai moy. de traitement', num(analytics.requesterAnalytics.reportToActionAvgDays, 'jour(s)'));
    kv(doc, 'Précision des signalements', pct(analytics.requesterAnalytics.reportAccuracyRate));

    heading(doc, 'Efficacité plans préventifs');
    kv(doc, 'Taux de conformité', pct(analytics.preventivePlanEfficiency.complianceRate));
    kv(doc, 'Taux d\'anomalies', pct(analytics.preventivePlanEfficiency.anomalyRate));
    kv(doc, 'OT préventifs créés / clôturés',
      `${analytics.preventivePlanEfficiency.totalPreventiveWOs} / ${analytics.preventivePlanEfficiency.closedPreventiveWOs}`);
    kv(doc, `Correctifs post-préventifs (${analytics.preventivePlanEfficiency.postPreventiveCorrectiveWindowDays} j)`,
      pct(analytics.preventivePlanEfficiency.postPreventiveCorrectiveRate));

    heading(doc, 'Vue opérationnelle');
    kv(doc, 'Réaffectations', String(analytics.operationalOverview.reassignmentCount));
    kv(doc, 'Arrêts moy. par OT', num(analytics.operationalOverview.avgHoldPeriodsPerWo));
    const sources = Object.entries(analytics.operationalOverview.sourceDistribution);
    if (sources.length > 0) {
      doc.fontSize(10).text('Répartition par source :');
      sources.forEach(([source, count]) => {
        doc.fontSize(10).text(`  • ${source} : ${count}`);
      });
    }

    doc.end();
  });
}
