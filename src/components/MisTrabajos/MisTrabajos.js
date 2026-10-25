import React, { useState, useMemo, useEffect } from 'react';
import { FaEdit } from 'react-icons/fa';
import '../../colors.css';
import './MisTrabajos.css';
import CreateWorkForm from '../work/CreateWorkForm';
import Loading from '../loading/loading';
import { showToast } from '../ToastContainer';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../server/api';
import { DEFAULT_BASIC_HOURS } from '../work/hoursBasic';

const MisTrabajos = ({ user }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [basicHours, setBasicHours] = useState(String(DEFAULT_BASIC_HOURS));
  const [savingBasicHours, setSavingBasicHours] = useState(false);

  const currentUserId = user?.uid || 'user1';

  // Cargar trabajos de Firestore en tiempo real
  useEffect(() => {
    if (!currentUserId) return;

    const q = query(collection(db, 'trabajos'), where('userId', '==', currentUserId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedJobs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setJobs(loadedJobs);
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUserId]);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = onSnapshot(
      doc(db, 'usuarios', user.uid),
      (snapshot) => {
        const configuredHours = snapshot.data()?.basicHours;
        setBasicHours(String(Number.isInteger(configuredHours) && configuredHours >= 1 && configuredHours <= 24
          ? configuredHours
          : DEFAULT_BASIC_HOURS));
      },
      (error) => {
        console.error('Error cargando horas básicas:', error);
        showToast('No se pudieron cargar las horas básicas.', 'error');
      }
    );

    return unsubscribe;
  }, [user]);

  const userJobs = useMemo(() => {
    return jobs;
  }, [jobs]);

  const handleCreateJob = async (newJob) => {
    try {
      await addDoc(collection(db, 'trabajos'), {
        ...newJob,
        userId: currentUserId,
        createdAt: new Date(),
      });
      setShowForm(false);
      showToast('Trabajo creado exitosamente', 'success');
    } catch (error) {
      console.error('Error al guardar el trabajo:', error);
      showToast('Error al crear el trabajo', 'error');
    }
  };

  const handleEditJob = (job) => {
    setEditingJob(job);
    setShowForm(true);
  };

  const handleUpdateJob = async (updatedJob) => {
    try {
      const jobRef = doc(db, 'trabajos', editingJob.id);
      await updateDoc(jobRef, updatedJob);
      setShowForm(false);
      setEditingJob(null);
      showToast('Trabajo actualizado exitosamente', 'success');
    } catch (error) {
      console.error('Error al actualizar el trabajo:', error);
      showToast('Error al actualizar el trabajo', 'error');
    }
  };

  const handleDeleteJob = async (jobId) => {
    try {
      await deleteDoc(doc(db, 'trabajos', jobId));
    } catch (error) {
      console.error('Error al eliminar el trabajo:', error);
      throw error; // Re-throw para que CreateWorkForm maneje el error
    }
  };

  const handleSaveBasicHours = async (event) => {
    event.preventDefault();
    const hours = Number(basicHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      showToast('Las horas básicas deben ser un número entero entre 1 y 24.', 'error');
      return;
    }

    setSavingBasicHours(true);
    try {
      await setDoc(doc(db, 'usuarios', user.uid), { basicHours: hours }, { merge: true });
      showToast('Horas básicas actualizadas.', 'success');
    } catch (error) {
      console.error('Error guardando horas básicas:', error);
      showToast('No se pudieron guardar las horas básicas.', 'error');
    } finally {
      setSavingBasicHours(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingJob(null);
  };

  return (
    <>
      {loading && <Loading text="Cargando trabajos..." />}
      <div className="trabajos-container">
        <h2>Mis Trabajos</h2>
      <form className="basic-hours-setting" onSubmit={handleSaveBasicHours}>
        <div>
          <label htmlFor="basic-hours">Horas básicas por turno</label>
          <p>Mínimo de horas que debe durar tu turno. Se usa para sugerir la salida en Registro y Calendario.</p>
        </div>
        <input
          id="basic-hours"
          type="number"
          min="1"
          max="24"
          step="1"
          value={basicHours}
          onChange={(event) => setBasicHours(event.target.value)}
          required
        />
        <button type="submit" className="edit-button" disabled={savingBasicHours}>
          {savingBasicHours ? 'Guardando...' : 'Guardar horas'}
        </button>
      </form>
      <div className="trabajos-list">
        <div className="trabajo-card create-card" onClick={() => setShowForm(true)}>
          <h3>+ Crear nuevo trabajo</h3>
          <p>Presiona aquí para agregar un trabajo nuevo.</p>
        </div>
      </div>

      {showForm && (
        <div className="trabajos-list">
          <CreateWorkForm 
            onCreate={editingJob ? handleUpdateJob : handleCreateJob}
            onCancel={handleCancel}
            editingJob={editingJob}
            onDelete={handleDeleteJob}
          />
        </div>
      )}

      <div className="trabajos-list">
        {userJobs.length === 0 ? (
          <div className="trabajo-card">
            <p>No tienes trabajos registrados todavía.</p>
          </div>
        ) : (
          userJobs.map((job) => (
            <div key={job.id} className="trabajo-card">
              <div className="trabajo-header">
                <h3>{job.workName || 'Sin nombre'}</h3>
                <button 
                  className="edit-button" 
                  onClick={() => handleEditJob(job)}
                  title="Editar trabajo"
                >
                  <FaEdit />
                </button>
              </div>
              <p>Hora Base: ${Math.floor(job.baseHourly || 0).toLocaleString('es-CO')}</p>
              <p>Horas básicas: {basicHours}h (configuración general)</p>
              <p>Rango Diurno: {job.diurnalStart} - {job.diurnalEnd}</p>
              <p>Hora Nocturna: ${Math.floor(job.values?.nocturna || 0).toLocaleString('es-CO')}</p>
              {job.discounts?.length > 0 && (
                <p>
                  Descuentos:{' '}
                  {job.discounts.map((discount, index) => (
                    <span key={`${discount.name}-${index}`}>
                      {discount.name} {discount.value > 0 ? `-$${Math.floor(discount.value).toLocaleString('es-CO')}` : ''} ({discount.quincena === 'ambos' ? '15/30' : discount.quincena}){index < job.discounts.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
};

export default MisTrabajos;
