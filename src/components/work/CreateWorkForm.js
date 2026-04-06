import React, { useState, useMemo } from 'react';
import './CreateWorkForm.css';
import Loading from '../loading/loading';
import { showToast } from '../ToastContainer';

const toFloat = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toInt = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.floor(parsed);
};

const formatWithThousandPoints = (amount) => {
  const parsed = Number(amount);
  if (Number.isNaN(parsed)) {
    return '0';
  }
  return Math.floor(parsed).toLocaleString('es-CO');
};

const getNocturnalRange = (start, end) => {
  if (!start || !end) return '';
  if (start === end) return '24 horas nocturnas';
  if (start < end) {
    return `${end} - ${start}`;
  }
  return `${end} - ${start}`;
};

const CreateWorkForm = ({ onCreate, onCancel, editingJob, onDelete }) => {
  const [workName, setWorkName] = useState(editingJob?.workName?.toUpperCase() || '');
  const [baseHourly, setBaseHourly] = useState(editingJob?.baseHourly ? editingJob.baseHourly.toLocaleString('es-CO') : '');
  const [auxilioTransporteDiario, setAuxilioTransporteDiario] = useState(editingJob?.auxilioTransporteDiario ? editingJob.auxilioTransporteDiario.toLocaleString('es-CO') : '');
  const [diurnalStart, setDiurnalStart] = useState(editingJob?.diurnalStart || '06:00');
  const [diurnalEnd, setDiurnalEnd] = useState(editingJob?.diurnalEnd || '19:00');
  const [nocturnoPct, setNocturnoPct] = useState(editingJob?.nocturnoPct || 35);
  const [dominicalPct, setDominicalPct] = useState(editingJob?.dominicalPct || 90);
  const [extraDiurnaPct, setExtraDiurnaPct] = useState(editingJob?.extraDiurnaPct || 25);
  const [extraNocturnaPct, setExtraNocturnaPct] = useState(editingJob?.extraNocturnaPct || 75);
  const [extraDominicalDiurnaPct, setExtraDominicalDiurnaPct] = useState(editingJob?.extraDominicalDiurnaPct || 115);
  const [extraDominicalNocturnaPct, setExtraDominicalNocturnaPct] = useState(editingJob?.extraDominicalNocturnaPct || 165);
  const [incapacidadComunPct, setIncapacidadComunPct] = useState(editingJob?.incapacidadComunPct || 66.67);
  const [incapacidadLaboralPct, setIncapacidadLaboralPct] = useState(editingJob?.incapacidadLaboralPct || 100);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showLocalToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async () => {
    if (!editingJob) return;

    const confirmDelete = window.confirm('¿Estás seguro de que quieres eliminar este trabajo? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    setIsLoading(true);
    try {
      await onDelete(editingJob.id);
      showToast('Trabajo eliminado exitosamente', 'success');
      onCancel();
    } catch (error) {
      console.error('Error al eliminar el trabajo:', error);
      showToast('Error al eliminar el trabajo', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBaseHourlyChange = (e) => {
    const value = e.target.value.replace(/[^\d]/g, ''); // Solo números
    if (value === '') {
      setBaseHourly('');
      return;
    }
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue)) {
      setBaseHourly(numericValue.toLocaleString('es-CO'));
    }
  };

  const handleAuxilioTransporteChange = (e) => {
    const value = e.target.value.replace(/[^\d]/g, '');
    if (value === '') {
      setAuxilioTransporteDiario('');
      return;
    }
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue)) {
      setAuxilioTransporteDiario(numericValue.toLocaleString('es-CO'));
    }
  };

  const base = toFloat(baseHourly.replace(/\./g, ''));
  const auxilioTransporte = toFloat(auxilioTransporteDiario.replace(/\./g, ''));

  const values = useMemo(() => ({
    nocturna: toInt(base * (1 + toFloat(nocturnoPct) / 100)),
    dominical: toInt(base * (1 + toFloat(dominicalPct) / 100)),
    extraDiurna: toInt(base * (1 + toFloat(extraDiurnaPct) / 100)),
    extraNocturna: toInt(base * (1 + toFloat(extraNocturnaPct) / 100)),
    extraDominicalDiurna: toInt(base * (1 + toFloat(extraDominicalDiurnaPct) / 100)),
    extraDominicalNocturna: toInt(base * (1 + toFloat(extraDominicalNocturnaPct) / 100)),
    incapacidadComun: toInt(base * (toFloat(incapacidadComunPct) / 100)),
    incapacidadLaboral: toInt(base * (toFloat(incapacidadLaboralPct) / 100)),
  }), [base, nocturnoPct, dominicalPct, extraDiurnaPct, extraNocturnaPct, extraDominicalDiurnaPct, extraDominicalNocturnaPct, incapacidadComunPct, incapacidadLaboralPct]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!workName.trim() || base <= 0) {
      showToast('Por favor complete todos los campos correctamente', 'error');
      return;
    }

    setIsLoading(true);
    try {
      await onCreate({
        workName: workName.trim().toUpperCase(),
        baseHourly: toInt(base),
        auxilioTransporteDiario: toInt(auxilioTransporte),
        diurnalStart,
        diurnalEnd,
        nocturnalRange: getNocturnalRange(diurnalStart, diurnalEnd),
        nocturnoPct: toFloat(nocturnoPct),
        dominicalPct: toFloat(dominicalPct),
        extraDiurnaPct: toFloat(extraDiurnaPct),
        extraNocturnaPct: toFloat(extraNocturnaPct),
        extraDominicalDiurnaPct: toFloat(extraDominicalDiurnaPct),
        extraDominicalNocturnaPct: toFloat(extraDominicalNocturnaPct),
        incapacidadComunPct: toFloat(incapacidadComunPct),
        incapacidadLaboralPct: toFloat(incapacidadLaboralPct),
        values,
      });
      showToast(editingJob ? 'Trabajo actualizado exitosamente' : 'Trabajo guardado exitosamente');
      setWorkName('');
    } catch (error) {
      console.error('Error:', error);
      showToast('Error al guardar el trabajo', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      {isLoading ? (
        <Loading text="Guardando trabajo..." />
      ) : (
        <form className="trabajo-form create-work-modal" onSubmit={handleSubmit}>
          <h3>{editingJob ? 'Editar Cálculo' : 'Calcular Hora'}</h3>

        <div className="form-group">
          <label>Nombre del Trabajo</label>
          <input
            type="text"
            value={workName}
            onChange={(e) => setWorkName(e.target.value.toUpperCase())}
            placeholder="Ej: Electricista, Plomería, Consultoría"
            required
          />
        </div>

        <div className="form-group">
          <label>Hora Base (Diurna)</label>
          <input
            type="text"
            value={baseHourly}
            onChange={handleBaseHourlyChange}
            placeholder="Ingrese el valor base"
            required
          />
        </div>

        <div className="form-group">
          <label>Auxilio de transporte diario</label>
          <input
            type="text"
            value={auxilioTransporteDiario}
            onChange={handleAuxilioTransporteChange}
            placeholder="Ingrese auxilio de transporte"
          />
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Rango Diurno Inicio</label>
            <input
              type="time"
              value={diurnalStart}
              onChange={(e) => setDiurnalStart(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Rango Diurno Fin</label>
            <input
              type="time"
              value={diurnalEnd}
              onChange={(e) => setDiurnalEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Rango Nocturno</label>
          <input type="text" value={getNocturnalRange(diurnalStart, diurnalEnd)} readOnly />
        </div>

        <div className="form-group">
          <label>Hora Nocturna (%)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={nocturnoPct}
            onChange={(e) => setNocturnoPct(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Hora Dominical/Festiva (%)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={dominicalPct}
            onChange={(e) => setDominicalPct(e.target.value)}
          />
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Extra Diurna (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={extraDiurnaPct}
              onChange={(e) => setExtraDiurnaPct(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Extra Nocturna (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={extraNocturnaPct}
              onChange={(e) => setExtraNocturnaPct(e.target.value)}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Extra Dominical Diurna (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={extraDominicalDiurnaPct}
              onChange={(e) => setExtraDominicalDiurnaPct(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Extra Dominical Nocturna (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={extraDominicalNocturnaPct}
              onChange={(e) => setExtraDominicalNocturnaPct(e.target.value)}
            />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Incapacidad Común (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={incapacidadComunPct}
              onChange={(e) => setIncapacidadComunPct(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Incapacidad Laboral (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={incapacidadLaboralPct}
              onChange={(e) => setIncapacidadLaboralPct(e.target.value)}
            />
          </div>
        </div>

        <div className="values-grid">
          <div className="value-card">
            <span>Hora Nocturna</span>
            <strong>${formatWithThousandPoints(values.nocturna)}</strong>
          </div>
          <div className="value-card">
            <span>Hora Dominical/Festiva</span>
            <strong>${formatWithThousandPoints(values.dominical)}</strong>
          </div>
          <div className="value-card">
            <span>Extra Diurna</span>
            <strong>${formatWithThousandPoints(values.extraDiurna)}</strong>
          </div>
          <div className="value-card">
            <span>Extra Nocturna</span>
            <strong>${formatWithThousandPoints(values.extraNocturna)}</strong>
          </div>
          <div className="value-card">
            <span>Extra Dominical Diurna</span>
            <strong>${formatWithThousandPoints(values.extraDominicalDiurna)}</strong>
          </div>
          <div className="value-card">
            <span>Extra Dominical Nocturna</span>
            <strong>${formatWithThousandPoints(values.extraDominicalNocturna)}</strong>
          </div>
          <div className="value-card">
            <span>Incapacidad Común</span>
            <strong>${formatWithThousandPoints(values.incapacidadComun)}</strong>
          </div>
          <div className="value-card">
            <span>Incapacidad Laboral</span>
            <strong>${formatWithThousandPoints(values.incapacidadLaboral)}</strong>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="trabajo-button" disabled={isLoading}>
            {isLoading ? (
              <span>Cargando...</span>
            ) : (
              editingJob ? 'Actualizar cálculo' : 'Guardar cálculo'
            )}
          </button>
          <button type="button" className="trabajo-button cancelar" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </button>
          {editingJob && (
            <button type="button" className="trabajo-button eliminar" onClick={handleDelete} disabled={isLoading}>
              Eliminar trabajo
            </button>
          )}
        </div>
      </form>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default CreateWorkForm;
