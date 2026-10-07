import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, ConfirmDialog, DataTable, FormField, Input } from '.';

describe('Input / FormField', () => {
  it('asocia label y anuncia el error', () => {
    render(<Input label="Nombre" error="Obligatorio" />);
    const input = screen.getByLabelText('Nombre');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Obligatorio');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });
  it('FormField acepta controles personalizados', () => {
    render(<FormField label="X">{({ id }) => <input id={id} />}</FormField>);
    expect(screen.getByLabelText('X')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('se deshabilita y marca aria-busy al cargar', () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('ConfirmDialog', () => {
  it('es un diálogo modal accesible y se cierra con Escape', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Borrar" message="¿Seguro?" onConfirm={() => undefined} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: 'Borrar' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('DataTable', () => {
  const base = { page: 1, pageSize: 20, onPage: vi.fn(), onPageSize: vi.fn(), caption: 'Test', columns: [{ key: 'n', header: 'Nombre', render: (r: { id: string; n: string }) => r.n }] };
  it('muestra estado vacío', () => {
    render(<DataTable {...base} isLoading={false} result={{ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }} />);
    expect(screen.getByText(/No hay registros/)).toBeInTheDocument();
  });
  it('muestra filas y pagina', () => {
    const onPage = vi.fn();
    render(<DataTable {...base} onPage={onPage} isLoading={false} result={{ data: [{ id: '1', n: 'Ana' }], meta: { page: 1, pageSize: 20, total: 45, totalPages: 3 } }} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Siguiente'));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it('muestra error con reintento', () => {
    const retry = vi.fn();
    render(<DataTable {...base} isLoading={false} error={new Error('boom')} onRetry={retry} />);
    fireEvent.click(screen.getByText('Reintentar'));
    expect(retry).toHaveBeenCalled();
  });
});
