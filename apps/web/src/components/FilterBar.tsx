import { ReactNode, useEffect, useState } from 'react';
import { exportUrl, Params } from '../api/client';
import { Can } from '../auth/AuthContext';
import { Input } from './ui';
import { useDebounced } from '../lib/hooks';

interface Props {
  search: string;
  onSearch: (v: string) => void;
  children?: ReactNode;
  exportPath?: string;
  exportParams?: Params;
}

export function ExportMenu({ path, params }: { path: string; params: Params }) {
  return (
    <Can permission="reports.export">
      <div className="row" role="group" aria-label="Exportar resultados">
        {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
          <a key={f} className="btn secondary sm" href={exportUrl(path, params, f)} download>
            Exportar {f.toUpperCase()}
          </a>
        ))}
      </div>
    </Can>
  );
}

export function FilterBar({ search, onSearch, children, exportPath, exportParams }: Props) {
  const [text, setText] = useState(search);
  const debounced = useDebounced(text);
  useEffect(() => { if (debounced !== search) onSearch(debounced); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="filters" role="search">
      <Input label="Buscar" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar…" />
      {children}
      {exportPath && exportParams && <ExportMenu path={exportPath} params={exportParams} />}
    </div>
  );
}

export function PageHead({ title, crumbs, actions }: { title: string; crumbs?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>{crumbs && <nav className="breadcrumb" aria-label="Ruta de navegación">{crumbs}</nav>}<h1>{title}</h1></div>
      <div className="row">{actions}</div>
    </div>
  );
}
