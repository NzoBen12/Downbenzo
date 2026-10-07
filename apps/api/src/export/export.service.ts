import { Global, Injectable, Module } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

export const exportFormatSchema = z.enum(['csv', 'xlsx', 'pdf']).default('csv');
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export interface ExportColumn {
  header: string;
  key: string;
}
export type ExportRow = Record<string, string | number | boolean | Date | null | undefined>;

/** Neutraliza inyección de fórmulas al abrir CSV/Excel. */
export function safeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const esc = (s: string) => (/[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(safeCell(r[c.key]))).join(','));
  return '﻿' + lines.join('\r\n');
}

@Injectable()
export class ExportService {
  async send(
    res: Response,
    format: ExportFormat,
    name: string,
    columns: ExportColumn[],
    rows: ExportRow[],
  ): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 10);
    const file = `${name}-${stamp}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(toCsv(columns, rows));
      return;
    }
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(name.slice(0, 30));
      ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 22 }));
      ws.getRow(1).font = { bold: true };
      for (const r of rows) {
        ws.addRow(Object.fromEntries(columns.map((c) => [c.key, safeCell(r[c.key])])));
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(Buffer.from(await wb.xlsx.writeBuffer()));
      return;
    }
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
    doc.fontSize(14).text(`BANGE · ${name}`, { underline: false });
    doc.fontSize(8).text(`Generado: ${new Date().toISOString()}`).moveDown();
    const width = (doc.page.width - 72) / Math.max(columns.length, 1);
    const drawRow = (vals: string[], bold: boolean) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
      vals.forEach((v, i) => doc.text(v, 36 + i * width, y, { width: width - 4, height: 10, ellipsis: true }));
      doc.y = y + 12;
      if (doc.y > doc.page.height - 50) doc.addPage();
    };
    drawRow(columns.map((c) => c.header), true);
    for (const r of rows) drawRow(columns.map((c) => safeCell(r[c.key])), false);
    doc.end();
    await done;
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.concat(chunks));
  }
}

@Global()
@Module({ providers: [ExportService], exports: [ExportService] })
export class ExportModule {}
