import React, { useState, useMemo, useEffect } from 'react';
import { FaEdit } from 'react-icons/fa';
import '../../colors.css';
import './MisTrabajos.css';
import CreateWorkForm from '../work/CreateWorkForm';
import Loading from '../loading/loading';
import { showToast } from '../ToastContainer';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../server/api';

const MisTrabajos = ({ user }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const handleCancel = () => {
    setShowForm(false);
    setEditingJob(null);
  };

  return (
    <>
      {loading && <Loading text="Cargando trabajos..." />}
      <div className="trabajos-container">
        <h2>Mis Trabajos</h2>
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
              <p>Rango Diurno: {job.diurnalStart} - {job.diurnalEnd}</p>
              <p>Hora Nocturna: ${Math.floor(job.values?.nocturna || 0).toLocaleString('es-CO')}</p>
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
};

export default MisTrabajos;
