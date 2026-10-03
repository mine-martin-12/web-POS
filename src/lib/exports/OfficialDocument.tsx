import React from "react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/currency";
import { columnTotals, type AnySheet, type ExportMeta } from "./table";

/** Branded A4 document. Rendered by React, so every user-supplied string is HTML-escaped. */
export function OfficialDocument({ meta, sheets, summary }: { meta: ExportMeta; sheets: AnySheet[]; summary?: Array<[string, string]> }) {
  return (
    <div className="doc">
      <header>
        <div>
          <h1>{meta.businessName}</h1>
          {meta.businessDetails?.filter(Boolean).map((line) => (
            <p key={line} className="muted">
              {line}
            </p>
          ))}
        </div>
        <div className="right">
          <h2>{meta.title}</h2>
          {meta.subtitle && <p>{meta.subtitle}</p>}
          <p className="muted">Generated {format(new Date(), "d MMM yyyy, HH:mm")}</p>
        </div>
      </header>

      {summary && summary.length > 0 && (
        <table className="summary">
          <tbody>
            {summary.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td className="num">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sheets.map((sheet) => {
        const totals = sheet.total ? columnTotals(sheet) : null;
        return (
          <section key={sheet.name}>
            <h3>{sheet.name}</h3>
            {sheet.rows.length === 0 ? (
              <p className="muted">No entries.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    {sheet.columns.map((c) => (
                      <th key={c.header} className={c.money ? "num" : undefined}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((row, r) => (
                    <tr key={r}>
                      {sheet.columns.map((c) => {
                        const v = c.value(row, r);
                        return (
                          <td key={c.header} className={c.money ? "num" : undefined}>
                            {c.money && v !== null && v !== "" ? formatMoney(Number(v), meta.currency) : (v ?? "")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr>
                      {sheet.columns.map((c, i) => (
                        <td key={c.header} className={c.money ? "num" : undefined}>
                          {i === 0 ? "TOTAL" : totals.has(i) ? formatMoney(totals.get(i)! / 100, meta.currency) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </section>
        );
      })}

      <footer>This is a system-generated document from Smart POS and is valid without a signature.</footer>
    </div>
  );
}
