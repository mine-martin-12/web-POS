import React from "react";

interface PageHeaderProps {
  title: React.ReactNode;
  /** The page's main action(s), e.g. "Add product". */
  actions?: React.ReactNode;
  /** An optional filter row under the title. */
  children?: React.ReactNode;
}

/** The one compact page header: a small title, the page's main action, an optional filter row. */
export function PageHeader({ title, actions, children }: PageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
