import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { WorkOrderStatus } from '@gmao/db';
import { calculateWorkOrderCostSummary, roundCurrency } from './work-order-costs';

@Injectable()
export class ReportGenerationService {
  private readonly logger = new Logger(ReportGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: WorkOrdersRepository,
  ) {}

  /**
   * Generates a PDF report for a closed work order.
   */
  async generateReport(woId: string): Promise<Buffer> {
    const wo = await this.repo.findById(woId);
    if (wo.status !== WorkOrderStatus.CLOSED) {
      throw new Error(`Work order ${woId} is not closed; status: ${wo.status}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        this.renderHeader(doc, wo);
        this.renderAssetInfo(doc, wo);
        this.renderWorkOrderDetails(doc, wo);
        this.renderTechnicianInfo(doc, wo);
        this.renderChecklistSection(doc, wo);
        this.renderInterventionLogs(doc, wo);
        this.renderPartRequests(doc, wo);
        this.renderCostSection(doc, wo);
        this.renderValidation(doc, wo);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private renderHeader(doc: any, wo: any): void {
    doc.fontSize(24).font('Helvetica-Bold').text('RAPPORT DE TRAVAUX', { align: 'center' }).moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(`Demande: ${wo.referenceNumber}`, { align: 'center' }).moveDown(1);
    doc.fontSize(11);
    doc.text(`Statut: ${wo.status} | Type: ${wo.type} | Priorité: ${wo.priority}`);
    doc.text(`Créé: ${this.formatDate(wo.createdAt)} | Fermé: ${this.formatDate(wo.closedAt)}`);
    doc.moveDown(0.5);
  }

  private renderAssetInfo(doc: any, wo: any): void {
    doc.moveDown(1).fontSize(12).font('Helvetica-Bold').text('ACTIF');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Nom: ${wo.asset?.name || 'N/A'}`);
    doc.text(`Code QR: ${wo.asset?.qrCodeIdentifier || 'N/A'}`);
    doc.text(`Catégorie: ${wo.asset?.category?.name || 'N/A'}`);
    doc.text(`Localisation: ${wo.asset?.location?.fullPath || 'N/A'}`);
    doc.moveDown(0.5);
  }

  private renderWorkOrderDetails(doc: any, wo: any): void {
    doc.fontSize(12).font('Helvetica-Bold').text('DÉTAILS');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Description: ${wo.description}`);
    if (wo.internalNotes) doc.text(`Notes: ${wo.internalNotes}`);
    if (wo.estimatedDurationMinutes) doc.text(`Durée estimée: ${wo.estimatedDurationMinutes} min`);
    doc.moveDown(0.5);
  }

  private renderTechnicianInfo(doc: any, wo: any): void {
    doc.fontSize(12).font('Helvetica-Bold').text('TECHNICIEN');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Technicien: ${wo.principalTechnician?.name || 'N/A'}`);
    doc.text(`Validé par: ${wo.validatedBy?.name || 'N/A'}`);
    doc.moveDown(0.5);
  }

  private renderChecklistSection(doc: any, wo: any): void {
    if (!wo.checklistItems?.length) return;
    doc.fontSize(12).font('Helvetica-Bold').text('CHECKLIST');
    doc.fontSize(11).font('Helvetica');
    for (const item of wo.checklistItems) {
      const status = item.completedAt ? '✓' : '✗';
      doc.text(`${status} ${item.label}`);
    }
    doc.moveDown(0.5);
  }

  private renderInterventionLogs(doc: any, wo: any): void {
    if (!wo.interventionLogs?.length) return;
    doc.fontSize(12).font('Helvetica-Bold').text('INTERVENTIONS');
    doc.fontSize(11).font('Helvetica');
    for (const log of wo.interventionLogs) {
      doc.text(`Technicien: ${log.technician?.name || 'N/A'} | Début: ${this.formatDate(log.startedAt)}`);
      if (log.result) doc.text(`Résultat: ${log.result}`);
      if (log.resultExplanation) doc.text(`Explication: ${log.resultExplanation}`);
    }
    doc.moveDown(0.5);
  }

  private renderPartRequests(doc: any, wo: any): void {
    if (!wo.partRequests?.length) return;
    doc.fontSize(12).font('Helvetica-Bold').text('PIÈCES');
    doc.fontSize(11).font('Helvetica');
    for (const pr of wo.partRequests) {
      doc.text(`${pr.part?.referenceCode || 'N/A'} | ${pr.part?.name || 'N/A'} | Qty: ${pr.quantityRequested} | ${pr.status}`);
    }
    doc.moveDown(0.5);
  }

  private renderCostSection(doc: any, wo: any): void {
    const costSummary = calculateWorkOrderCostSummary(wo);

    doc.fontSize(12).font('Helvetica-Bold').text('COÛTS');
    doc.fontSize(11).font('Helvetica');
    doc.text(`Pièces: ${this.formatCurrency(costSummary.partsCost)}`);
    doc.text(`Main d'oeuvre: ${this.formatCurrency(costSummary.laborCost)}`);
    doc.text(`Sous-traitance: ${this.formatCurrency(costSummary.contractorCost)}`);
    doc.text(`Total: ${this.formatCurrency(costSummary.totalCost)}`);
    doc.moveDown(0.5);
  }

  private renderValidation(doc: any, wo: any): void {
    doc.fontSize(12).font('Helvetica-Bold').text('VALIDATION');
    doc.fontSize(11).font('Helvetica');
    if (wo.validationActions?.length > 0) {
      const val = wo.validationActions[0];
      doc.text(`Action: ${val.action}`);
      if (val.rejectionReason) doc.text(`Raison: ${val.rejectionReason}`);
      doc.text(`Par: ${val.validator?.name || 'N/A'}`);
    }
  }

  private formatDate(date: Date | null | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(roundCurrency(value));
  }
}
